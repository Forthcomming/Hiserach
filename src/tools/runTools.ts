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
  const categoryProductIds = products
    .filter((p) => p.category === category)
    .map((p) => p.id);

  // 同类人集合在品类范围内匹配：符合核心条件的作者，与全站作者分开统计
  const { authorIds: similarAuthorIds, records: similarRecords } = matchSimilar({
    records,
    productIds: categoryProductIds,
    conditions,
  });

  const rankedProducts: ProductAnswer[] = productIds
    .flatMap((productId): ProductAnswer[] => {
      const product = products.find((item) => item.id === productId);
      if (!product) return [];
      const summary = summarizeProduct({ records, productId, similarAuthorIds });
      const keyRisk = pickGlobalKeyRisk({ records, productId });
      const globalSummary = {
        ...summary.global,
        ...(keyRisk ? { keyRisk } : {}),
      };
      const reasons = aggregateReasons({
        records,
        productId,
        similarAuthorIds,
        category,
      });
      const productQuotes = getQuotes({
        records: similarRecords,
        products,
        category,
        filter: { productId },
      });
      return [{
        productId: product.id,
        name: product.name,
        ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
        reasons,
        similarQuoteIds: productQuotes.map((q) => q.id),
        globalSummary,
        ...(summary.similar ? { similarSummary: summary.similar } : {}),
      }];
    })
    .sort((a, b) => {
      const aSimilar = a.similarSummary?.recommendRate;
      const bSimilar = b.similarSummary?.recommendRate;
      if (aSimilar !== undefined || bSimilar !== undefined) {
        const rate = (bSimilar ?? -1) - (aSimilar ?? -1);
        if (rate) return rate;
        const count = (b.similarSummary?.recommendCount ?? 0) -
          (a.similarSummary?.recommendCount ?? 0);
        if (count) return count;
      }
      const globalRate = (b.globalSummary?.recommendRate ?? 0) -
        (a.globalSummary?.recommendRate ?? 0);
      if (globalRate) return globalRate;
      const globalCount = (b.globalSummary?.recommendCount ?? 0) -
        (a.globalSummary?.recommendCount ?? 0);
      return globalCount || a.productId.localeCompare(b.productId);
    });
  const primaryProduct = rankedProducts[0];
  const globalSummary = primaryProduct?.globalSummary ?? {
    authorCount: 0,
    recommendCount: 0,
    notRecommendCount: 0,
    recommendRate: 0,
  };
  const similarSummary = primaryProduct?.similarSummary;
  const reasons = rankedProducts.flatMap((product) => product.reasons);
  const alternatives = pickAlternatives({
    records,
    products,
    category,
    currentProductIds: productIds,
    similarAuthorIds,
  });

  // 冷启动 / 同类为 0 人：追问卡片只放"有同类人数据"的维度（AC-04）
  const coveredKeys = new Set<string>();
  for (const r of records) {
    for (const key of Object.keys(r.authorConditions)) coveredKeys.add(key);
  }
  const needsFollowup = (similarSummary?.authorCount ?? 0) === 0;
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
    similarSummary,
    globalSummary,
    reasons,
    ...(primaryProduct ? { primaryProduct, rankedProducts } : {}),
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
