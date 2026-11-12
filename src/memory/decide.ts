import { findDimension } from "@/domain/categories";
import { validateConditionInput } from "@/domain/conditions";
import type {
  Category,
  ConditionInput,
  MemoryItem,
} from "@/domain/types";
import type { MemoryWritePlan } from "@/repository/types";

/**
 * 节点 persist_memory 的规则决策（规格 3.4 / 4.2 / PRD 6.4）。
 *
 * 顺序：先规则校验，再考虑模型建议；模型建议不能突破词表、来源和权限限制。
 * 这里以确定性规则为准 —— 只接受用户明确自述/点选、命中品类词表的值，
 * 不做行为推断，不写他人情况，不写否定表述不明确的条件。
 * Agent 无权自行删除记忆，删除权只在用户手里。
 *
 * 扩展点：若接入模型建议，可在返回前调用 applyModelSuggestion(plan, suggestion)；
 * suggestion 只允许 NOOP / ADD，且 ADD 的 key/value 必须再次通过本函数的校验。
 */
export function decideMemoryPlan(args: {
  userId: string;
  turnId: string;
  category: Category;
  query: string;
  statedConditions: ConditionInput[];
  activeMemories: MemoryItem[];
  usedIds: string[];
  memoryDisabled: boolean;
  unsupported: boolean;
  now?: Date;
}): MemoryWritePlan | null {
  const now = args.now ?? new Date();
  // 超范围查询：不写入任何长期记忆（规格 7.3 / AC-02）
  if (args.unsupported) return null;
  // "本次不按我的条件"期间不新增记忆，避免用户以为停用却被写入
  if (args.memoryDisabled) return null;

  const items: MemoryWritePlan["items"] = [];
  const seenKeys = new Set<string>();

  for (const input of args.statedConditions) {
    if (seenKeys.has(input.key)) continue;
    const dim = findDimension(args.category, input.key);
    if (!dim) continue;
    const normalized = validateConditionInput(args.category, input, now);
    if (!normalized) continue; // 词表外 / 非法值一律丢弃
    seenKeys.add(input.key);

    items.push({
      key: normalized.key,
      value: normalized.value,
      isCore: dim.core,
      category: args.category,
      source: {
        query: args.query,
        turnId: args.turnId,
        channel: input.source,
        // 敏感原文按展示需要最小化，日志只保留用户点选/自述的受控片段
        ...(input.raw ? { userQuote: input.raw.slice(0, 60) } : {}),
      },
    });
  }

  if (items.length === 0) {
    // 即使没有新条件，也要为实际采用的记忆追加 used 事件
    return {
      userId: args.userId,
      turnId: args.turnId,
      category: args.category,
      items: [],
      usedIds: args.usedIds,
      now: now.toISOString(),
    };
  }

  return {
    userId: args.userId,
    turnId: args.turnId,
    category: args.category,
    items,
    usedIds: args.usedIds,
    now: now.toISOString(),
  };
}

/** 供模型建议接入时使用：只放行 NOOP / 已在规则计划内的 ADD。 */
export function applyModelSuggestion(
  plan: MemoryWritePlan | null,
  suggestion: Array<{ key: string; action: "ADD" | "NOOP" }>,
): MemoryWritePlan | null {
  if (!plan || suggestion.length === 0) return plan;
  const allowed = new Map(plan.items.map((i) => [i.key, i]));
  for (const s of suggestion) {
    if (s.action === "ADD" && !allowed.has(s.key)) {
      // 模型建议突破词表/来源限制 → 忽略，不落库
      continue;
    }
  }
  return plan;
}

/** 判断本次写入是否需要向用户展示"已记住，可撤销"轻提示。 */
export function memoryChangeSummary(created: MemoryItem[]): string {
  if (created.length === 0) return "";
  return `已记住 ${created.length} 条条件，下次同类搜索自动参考`;
}
