import type { Category, CategoryConfig, ConditionDimension } from "./types";

/**
 * 品类维度词表（规格 3.1 / PRD 6.7）。
 * 条件必须命中当前品类预设维度和合法取值，词表外条件一律不得写入。
 *
 * 注意：intentAliases 只是"查询 → 产品 ID"的归一化配置，不含人数、比例、
 * 原因结果或替代品结果。真实产品 ID 与统计结果按规格第 14 节待样本校定后替换。
 */
export const CATEGORY_CONFIGS: Record<Category, CategoryConfig> = {
  beauty: {
    category: "beauty",
    label: "护肤彩妆",
    dimensions: [
      {
        key: "skin_issue",
        label: "皮肤状况",
        core: true,
        type: "enum",
        options: ["脂溢性皮炎", "敏感肌", "痘痘肌", "无特殊皮肤问题"],
      },
      {
        key: "skin_type",
        label: "肤质",
        core: false,
        type: "enum",
        options: ["油皮", "干皮", "混油", "混干", "中性"],
      },
    ],
    intentAliases: [
      { phrase: "DW粉底", productIds: ["p_dw_foundation"] },
      { phrase: "dw粉底", productIds: ["p_dw_foundation"] },
      { phrase: "粉底液", productIds: ["p_dw_foundation"] },
    ],
    medicalDisclaimer: "个体差异大，皮肤问题严重或持续请咨询皮肤科医生。",
    followupDimensionKeys: ["skin_issue", "skin_type"],
  },
  baby_food: {
    category: "baby_food",
    label: "母婴辅食",
    dimensions: [
      {
        key: "allergy",
        label: "过敏史",
        core: true,
        type: "enum",
        options: ["有过敏", "无过敏"],
      },
      {
        key: "diarrhea",
        label: "腹泻",
        core: true,
        type: "enum",
        options: ["有腹泻", "无腹泻"],
      },
      { key: "age_month", label: "月龄", core: false, type: "month", unit: "个月" },
    ],
    intentAliases: [
      { phrase: "小皮有机高铁米粉", productIds: ["p_rice_01"] },
      { phrase: "小皮米粉", productIds: ["p_rice_01"] },
      { phrase: "婴儿米粉 A", productIds: ["p_rice_01"] },
      { phrase: "低敏米粉 B", productIds: ["p_rice_02"] },
      { phrase: "低敏米粉", productIds: ["p_rice_02"] },
      { phrase: "婴儿米粉推荐", productIds: ["p_rice_01", "p_rice_02"] },
      { phrase: "婴儿米粉", productIds: ["p_rice_01", "p_rice_02"] },
      { phrase: "米粉推荐", productIds: ["p_rice_01", "p_rice_02"] },
      { phrase: "宝宝米粉", productIds: ["p_rice_01", "p_rice_02"] },
    ],
    medicalDisclaimer: "个体差异大，宝宝出现过敏或不适请及时咨询儿科医生。",
    followupDimensionKeys: ["allergy", "diarrhea", "age_month"],
  },
};

export const SIMILAR_AUTHOR_THRESHOLD = 5;
export const ALTERNATIVE_RECOMMEND_THRESHOLD = 5;
export const MAX_CORE_CONDITIONS = 2;

export function getCategoryConfig(category: Category): CategoryConfig {
  return CATEGORY_CONFIGS[category];
}

export function findDimension(
  category: Category,
  key: string,
): ConditionDimension | undefined {
  return CATEGORY_CONFIGS[category].dimensions.find((d) => d.key === key);
}

/**
 * 归一化并校验条件取值。返回 null 表示词表外条件，调用方必须丢弃。
 * month 类型接受 "YYYY-MM" 出生月份，或 "N个月"/"N 个月" 这类当前月龄表述
 * （后者由调用方按当前月换算为出生月份，见 domain/conditions.ts）。
 */
export function normalizeConditionValue(
  category: Category,
  key: string,
  raw: string,
): string | null {
  const dim = findDimension(category, key);
  if (!dim) return null;
  const trimmed = raw.trim();
  if (dim.type === "month") {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) return trimmed;
    const m = trimmed.match(/^(\d{1,2})\s*(个月|月龄|月)$/);
    if (m) return `${Number(m[1])}__months_old`;
    return null;
  }
  return dim.options?.includes(trimmed) ? trimmed : null;
}

/** 把 "6个月左右" 之类表述映射为词表内的展示值。 */
export function canonicalEnumValue(
  category: Category,
  key: string,
  raw: string,
): string | null {
  const dim = findDimension(category, key);
  if (!dim || dim.type !== "enum" || !dim.options) return null;
  if (dim.options.includes(raw)) return raw;
  // 只接受明确同义表述，避免把"他人情况/否定表达"误写入记忆（规格 3.1）。
  const aliases: Record<string, string> = {
    无过敏史: "无过敏",
    不过敏: "无过敏",
    有过敏史: "有过敏",
    吃蛋黄过敏: "有过敏",
    过敏: "有过敏",
    有拉肚子: "有腹泻",
    拉肚子: "有腹泻",
    脂溢性皮炎: "脂溢性皮炎",
    油性皮肤: "油皮",
  };
  const hit = Object.entries(aliases).find(([alias]) => raw.includes(alias));
  if (!hit) return null;
  return dim.options.includes(hit[1]) ? hit[1] : null;
}
