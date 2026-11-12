import { availableFollowupDimensions } from "@/domain/conditions";
import { SIMILAR_AUTHOR_THRESHOLD } from "@/domain/categories";
import type {
  Category,
  ExperienceRecord,
  Product,
  ProductAnswer,
  ToolBundle,
  WorkingCondition,
} from "@/domain/types";
import {
  aggregateReasons,
  getQuotes,
  matchSimilar,
  pickAlternatives,
  pickGlobalKeyRisk,
  summarizeProduct,
} from "./deterministic";

export interface RunToolsArgs {
  category: Category;
  /** 当前查询命中的主产品（MVP 一次一个，保留数组以兼容变体）。 */
  productIds: string[];
  conditions: WorkingCondition[];
  records: ExperienceRecord[];
  products: Product[];
}

/**
 * 节点 run_tools 的唯一入口。规格 4.2：compose_answer 只接收本返回值及引用 ID，
 * 不允许访问原始数据库连接。所有事实在此处一次性算完，之后不再重算。
 */
export function runTools(args: RunToolsArgs): ToolBundle {
  const { category, productIds, conditions, records, products } = args;
  const primaryProductId = productIds[0];
  const categoryProductIds = products
    .filter((p) => p.category === category)
    .map((p) => p.id);

  // 同类人集合在品类范围内匹配：符合核心条件的作者，与全站作者分开统计
  const { authorIds: similarAuthorIds, records: similarRecords } = matchSimilar({
    records,
    productIds: categoryProductIds,
    conditions,
  });

  const summary = summarizeProduct({
    records,
    productId: primaryProductId,
    similarAuthorIds,
  });
  const keyRisk = pickGlobalKeyRisk({ records, productId: primaryProductId });
  const globalSummary = { ...summary.global, ...(keyRisk ? { keyRisk } : {}) };

  const reasons = aggregateReasons({
    records,
    productId: primaryProductId,
    similarAuthorIds,
    category,
  });
  const alternatives = pickAlternatives({
    records,
    products,
    category,
    currentProductIds: productIds,
    similarAuthorIds,
  });

  const primaryProduct = products.find((p) => p.id === primaryProductId);
  const primaryQuotes = getQuotes({
    records: similarRecords,
    products,
    category,
    filter: { productId: primaryProductId },
  });
  const productsAnswer: ProductAnswer[] = primaryProduct
    ? [
        {
          productId: primaryProduct.id,
          name: primaryProduct.name,
          imageUrl: primaryProduct.imageUrl,
          reasons,
          similarQuoteIds: primaryQuotes.map((q) => q.id),
        },
      ]
    : [];

  // 冷启动 / 同类为 0 人：追问卡片只放"有同类人数据"的维度（AC-04）
  const coveredKeys = new Set<string>();
  for (const r of records) {
    for (const key of Object.keys(r.authorConditions)) coveredKeys.add(key);
  }
  const needsFollowup = summary.mode === "global";
  const followupDimensions = availableFollowupDimensions(category, [...coveredKeys]);

  const quotes = getQuotes({ records: similarRecords, products, category, filter: {} });
  const datasetCount = records.filter((r) =>
    categoryProductIds.includes(r.productId),
  ).length;

  return {
    category,
    productIds,
    conditions,
    similarAuthorIds,
    similarSummary: summary.similar,
    globalSummary,
    reasons,
    ...(productsAnswer[0] ? { primaryProduct: productsAnswer[0] } : {}),
    alternatives: alternatives.map((alt) => ({
      ...alt,
      similarQuoteIds: getQuotes({
        records: similarRecords,
        products,
        category,
        filter: { productId: alt.productId },
      }).map((q) => q.id),
    })),
    quotes,
    datasetNote: `基于本次收集的 ${datasetCount} 条内容`,
    ...(needsFollowup && followupDimensions.length > 0
      ? { followup: { category, dimensions: followupDimensions } }
      : {}),
  };
}

/** 供 compose_answer / template 共用：从工具结果推导答案模式（不重新计算人数）。 */
export function modeOf(bundle: ToolBundle): "global" | "similar" | "small_sample" {
  const count = bundle.similarSummary?.authorCount ?? 0;
  if (count === 0) return "global";
  if (count < SIMILAR_AUTHOR_THRESHOLD) return "small_sample";
  return "similar";
}

/** 供答案一致性校验：工具结果里所有合法引用 ID。 */
export function referenceIdsOf(bundle: ToolBundle): {
  quoteIds: Set<string>;
  reasonIds: Set<string>;
  alternativeIds: Set<string>;
} {
  return {
    quoteIds: new Set(bundle.quotes.map((q) => q.id)),
    reasonIds: new Set(bundle.reasons.map((r) => r.reasonId)),
    alternativeIds: new Set(bundle.alternatives.map((p) => p.productId)),
  };
}
