import {
  MAX_CORE_CONDITIONS,
  canonicalEnumValue,
  findDimension,
  getCategoryConfig,
  normalizeConditionValue,
} from "./categories";
import type {
  Category,
  ConditionInput,
  ConditionValue,
  MemoryItem,
  WorkingCondition,
} from "./types";

/** "YYYY-MM" → 截至 now 的月龄，跨年由年份差自然处理。 */
export function ageInMonths(birthMonth: string, now: Date = new Date()): number {
  const [y, m] = birthMonth.split("-").map(Number);
  const diff = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  return Math.max(0, diff);
}

/** 当前月龄 → 出生月份 "YYYY-MM"。 */
export function birthMonthFromAge(months: number, now: Date = new Date()): string {
  const total = now.getFullYear() * 12 + now.getMonth() - Math.max(0, Math.round(months));
  const y = Math.floor(total / 12);
  const m = total % 12 + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthValueOf(raw: string, now: Date): { value: ConditionValue; numeric: number } | null {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    return { value: { birthMonth: raw }, numeric: ageInMonths(raw, now) };
  }
  const m = raw.match(/^(\d{1,2})__months_old$/);
  if (m) {
    const months = Number(m[1]);
    if (months < 0 || months > 120) return null;
    const birth = birthMonthFromAge(months, now);
    return { value: { birthMonth: birth }, numeric: ageInMonths(birth, now) };
  }
  return null;
}

/**
 * 校验并归一化单条条件输入。
 * 规格 3.1：只接受当前品类预设维度、合法取值；他人情况、否定表述不明确、
 * 词表外条件一律拒绝。返回 null 表示丢弃，绝不写入记忆。
 */
export function validateConditionInput(
  category: Category,
  input: ConditionInput,
  now: Date = new Date(),
): { key: string; value: ConditionValue; numeric?: number } | null {
  const dim = findDimension(category, input.key);
  if (!dim) return null;

  if (dim.type === "month") {
    // 先归一化 "7个月" / "2026-04" 等表述，再换算为出生月份
    const normalized = normalizeConditionValue(category, input.key, input.value);
    if (!normalized) return null;
    const month = monthValueOf(normalized, now);
    return month ? { key: input.key, ...month } : null;
  }
  const canonical =
    canonicalEnumValue(category, input.key, input.value) ??
    (dim.options?.includes(input.value) ? input.value : null);
  if (!canonical) return null;
  return { key: input.key, value: canonical };
}

function labelOf(
  category: Category,
  key: string,
  value: ConditionValue,
  numeric?: number,
): string {
  const dim = findDimension(category, key);
  if (dim?.type === "month") {
    return `${numeric ?? 0}${dim.unit ?? "个月"}`;
  }
  return typeof value === "string" ? value : "";
}

export interface MergeResult {
  conditions: WorkingCondition[];
  /** 实际采用的记忆条目 ID，用于追加 used 事件。 */
  usedMemoryIds: string[];
  /** 被本轮自述覆盖而未采用的记忆 ID。 */
  overriddenMemoryIds: string[];
}

/**
 * 工作记忆合并（规格 3.1 / PRD 6.4 节点②）：
 * - 本轮自述优先于长期记忆；同维度新值替代旧值，不允许两个值同时生效。
 * - "本次不按我的条件"只屏蔽长期记忆，不删除条目，也不影响本轮自述。
 * - 核心条件最多 1–2 个参与筛选；其余标记为次要，只用于排序和高亮。
 */
export function mergeWorkingConditions(args: {
  category: Category;
  memories: MemoryItem[];
  stated: ConditionInput[];
  memoryDisabled: boolean;
  now?: Date;
}): MergeResult {
  const { category, memories, stated, memoryDisabled } = args;
  const now = args.now ?? new Date();
  const config = getCategoryConfig(category);

  type Slot = {
    key: string;
    value: ConditionValue;
    numeric?: number;
    source: WorkingCondition["source"];
    memoryId?: string;
  };
  const slots = new Map<string, Slot>();
  const usedMemoryIds: string[] = [];
  const overriddenMemoryIds: string[] = [];

  // 1) 长期记忆（active 且属于当前品类）
  if (!memoryDisabled) {
    for (const mem of memories) {
      if (mem.status !== "active" || mem.category !== category) continue;
      if (!findDimension(category, mem.key)) continue;
      const dim = findDimension(category, mem.key)!;
      const numeric =
        dim.type === "month" && typeof mem.value === "object"
          ? ageInMonths(mem.value.birthMonth, now)
          : undefined;
      slots.set(mem.key, {
        key: mem.key,
        value: mem.value,
        numeric,
        source: "memory",
        memoryId: mem.id,
      });
      usedMemoryIds.push(mem.id);
    }
  }

  // 2) 本轮自述覆盖（后出现的同维度输入覆盖先出现的）
  for (const input of stated) {
    const normalized = validateConditionInput(category, input, now);
    if (!normalized) continue;
    const previous = slots.get(normalized.key);
    if (previous?.source === "memory" && previous.memoryId) {
      overriddenMemoryIds.push(previous.memoryId);
    }
    slots.set(normalized.key, {
      key: normalized.key,
      value: normalized.value,
      numeric: normalized.numeric,
      source: input.source,
    });
  }

  // 覆盖掉的记忆不算"实际采用"
  const overridden = new Set(overriddenMemoryIds);

  // 3) 按品类配置顺序输出，核心条件截断到上限
  const conditions: WorkingCondition[] = [];
  let coreCount = 0;
  for (const dim of config.dimensions) {
    const slot = slots.get(dim.key);
    if (!slot) continue;
    const isCore = dim.core && coreCount < MAX_CORE_CONDITIONS;
    if (isCore) coreCount += 1;
    conditions.push({
      key: dim.key,
      label: dim.label,
      valueLabel: labelOf(category, dim.key, slot.value, slot.numeric),
      value: slot.value,
      numericValue: slot.numeric,
      isCore,
      source: slot.source,
      memoryId: slot.memoryId,
    });
  }

  return {
    conditions,
    usedMemoryIds: usedMemoryIds.filter((id) => !overridden.has(id)),
    overriddenMemoryIds,
  };
}

/** 用于追问卡片：只展示有同类人数据覆盖的维度（规格 7.3 / AC-04）。 */
export function availableFollowupDimensions(
  category: Category,
  coveredDimensionKeys: string[],
) {
  const covered = new Set(coveredDimensionKeys);
  return getCategoryConfig(category)
    .dimensions.filter((d) => covered.has(d.key))
    .map((d) => ({
      key: d.key,
      label: d.label,
      options: d.options,
      type: d.type,
    }));
}
