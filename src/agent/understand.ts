import {
  canonicalEnumValue,
  getCategoryConfig,
} from "@/domain/categories";
import type {
  Category,
  ConditionInput,
  Product,
  QueryUnderstanding,
  SessionContext,
} from "@/domain/types";
import { hasSessionContinuity } from "./sessionContext";

/** 明显在转述他人情况：不把这类条件当作用户本人自述（规格 3.1）。 */
const OTHER_SUBJECT = /(朋友|同事|别人|他人|闺蜜|听说|据说|有人说|我妈说)/;

/** 指代上轮产品 / 要替代品。 */
const PRODUCT_REF =
  /(那款|这个|这款|它|替代|换一款|有没有别的|有没有其他|同类更好)/;

/** 像在补充条件或短追问，而非新开话题。 */
const FOLLOWUP_LIKE =
  /(呢|那|还有|换成|如果|要是|我是|宝宝|个月|月龄|过敏|湿疹|腹泻|皮|肤质|替代)/;

function extractConditions(category: Category, query: string): ConditionInput[] {
  const statedConditions: ConditionInput[] = [];
  if (OTHER_SUBJECT.test(query)) return statedConditions;
  for (const dim of getCategoryConfig(category).dimensions) {
    if (dim.type === "month") {
      const m = query.match(/(\d{1,2})\s*(个月|月龄|月)/);
      if (m) {
        statedConditions.push({
          key: dim.key,
          value: `${Number(m[1])}个月`,
          source: "user_input",
          raw: m[0],
        });
      }
      continue;
    }
    const canonical = canonicalEnumValue(category, dim.key, query);
    if (canonical) {
      statedConditions.push({
        key: dim.key,
        value: canonical,
        source: "user_input",
        raw: canonical,
      });
    }
  }
  return statedConditions;
}

/**
 * understand_query 的确定性回退（模型未配置 / 超时 / 格式错误时启用）。
 * 只输出受控 QueryUnderstanding，不生成答案、不产生任何统计数字。
 * 有会话 Context 时支持短追问继承品类/产品（「那混油皮呢」「替代那款呢」）。
 */
export function understandQueryDeterministic(args: {
  query: string;
  followupSelection?: Array<{ key: string; value: string }>;
  sessionContext?: SessionContext;
}): QueryUnderstanding {
  const query = args.query.trim();
  const normalized = query.toLowerCase().replace(/\s+/g, "");
  const session = args.sessionContext;

  let category: Category | undefined;
  let productIds: string[] = [];
  for (const c of ["beauty", "baby_food"] as Category[]) {
    const cfg = getCategoryConfig(c);
    const hit = cfg.intentAliases.find((a) =>
      normalized.includes(a.phrase.toLowerCase().replace(/\s+/g, "")),
    );
    if (hit) {
      category = c;
      productIds = hit.productIds;
      break;
    }
  }

  // 追问卡片轮：query 可能只是确认语，用点选维度反推品类与目标产品
  if (!category && args.followupSelection?.length) {
    const keys = new Set(args.followupSelection.map((s) => s.key));
    category = keys.has("allergy") || keys.has("diarrhea") || keys.has("age_month")
      ? "baby_food"
      : "beauty";
    productIds = getCategoryConfig(category).intentAliases.reduce<string[]>(
      (best, alias) => (alias.productIds.length > best.length ? alias.productIds : best),
      [],
    );
  }

  // 会话 Continuity：无显式意图别名时，短追问 / 指代继承上轮品类与产品
  const canInherit =
    !category &&
    hasSessionContinuity(session) &&
    (PRODUCT_REF.test(query) ||
      FOLLOWUP_LIKE.test(query) ||
      extractConditions(session!.category!, query).length > 0);

  if (canInherit && session?.category) {
    category = session.category;
    productIds = [...session.productIds];
  }

  if (!category || productIds.length === 0) {
    return { intent: "unsupported", productIds: [], statedConditions: [] };
  }

  const statedConditions = extractConditions(category, query);

  for (const selection of args.followupSelection ?? []) {
    // 点选值优先于本轮文本抽取的同维度值
    const idx = statedConditions.findIndex((c) => c.key === selection.key);
    if (idx >= 0) statedConditions.splice(idx, 1);
    statedConditions.push({
      key: selection.key,
      value: selection.value,
      source: "followup_card",
    });
  }

  return {
    intent: "supported",
    category,
    productIds,
    statedConditions,
    normalizedQuery: query,
  };
}

/** 供模型网关构造提示词：把品类词表与产品列表暴露给模型。 */
export function productVocabulary(products: Product[]) {
  return products.map((p) => ({ id: p.id, category: p.category, name: p.name }));
}
