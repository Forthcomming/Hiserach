import {
  ALTERNATIVE_RECOMMEND_THRESHOLD,
  SIMILAR_AUTHOR_THRESHOLD,
  findDimension,
  getCategoryConfig,
} from "@/domain/categories";
import type {
  AnswerMode,
  Category,
  ExperienceRecord,
  GlobalSummary,
  Product,
  ProductAnswer,
  QuoteItem,
  ReasonAnswer,
  SimilarSummary,
  Stance,
  WorkingCondition,
} from "@/domain/types";

/**
 * 五个确定性工具（规格 6.5）。全部为纯函数：不访问数据库、不调用模型。
 * 人数一律按 author_id 去重；模型不得生成任何统计数字或原话。
 */

const unique = <T>(xs: T[]): T[] => Array.from(new Set(xs));

function conditionEquals(raw: string | number | undefined, c: WorkingCondition): boolean {
  if (raw === undefined) return false;
  if (typeof c.value === "string") return String(raw) === c.value;
  // month 类型：作者自述月龄须与换算后的当前月龄一致
  return typeof raw === "number" && c.numericValue !== undefined && raw === c.numericValue;
}

/** ① match_similar —— 所有生效核心条件必须一致；次要条件绝不过滤。 */
export function matchSimilar(args: {
  records: ExperienceRecord[];
  productIds: string[];
  conditions: WorkingCondition[];
}): { authorIds: string[]; records: ExperienceRecord[] } {
  const core = args.conditions.filter((c) => c.isCore);
  if (core.length === 0) return { authorIds: [], records: [] };
  const pool = new Set(args.productIds);
  const matched = args.records.filter(
    (r) =>
      pool.has(r.productId) &&
      // 只有作者本人明确自述的条件才参与匹配：缺字段即不匹配
      core.every((c) => conditionEquals(r.authorConditions[c.key], c)),
  );
  return { authorIds: unique(matched.map((r) => r.authorId)), records: matched };
}

function tallyStances(records: ExperienceRecord[], authorFilter?: Set<string>) {
  const byAuthor = new Map<string, Stance>();
  for (const r of records) {
    if (authorFilter && !authorFilter.has(r.authorId)) continue;
    // 同一作者多条记录只计一人；冲突时以 not_recommend 为准（保守口径）
    const prev = byAuthor.get(r.authorId);
    if (!prev || (prev === "recommend" && r.stance === "not_recommend")) {
      byAuthor.set(r.authorId, r.stance);
    }
  }
  let recommendCount = 0;
  for (const stance of byAuthor.values()) if (stance === "recommend") recommendCount += 1;
  return {
    authorCount: byAuthor.size,
    recommendCount,
    notRecommendCount: byAuthor.size - recommendCount,
  };
}

/** ② summarize_product —— 全站与同类分别统计；不足 5 人不出比例。 */
export function summarizeProduct(args: {
  records: ExperienceRecord[];
  productId: string;
  similarAuthorIds: string[];
}): {
  global: GlobalSummary;
  similar?: SimilarSummary;
  mode: AnswerMode;
} {
  const productRecords = args.records.filter((r) => r.productId === args.productId);
  const globalTally = tallyStances(productRecords);
  const global: GlobalSummary = {
    ...globalTally,
    recommendRate:
      globalTally.authorCount === 0
        ? 0
        : Number((globalTally.recommendCount / globalTally.authorCount).toFixed(4)),
  };

  const similarTally = tallyStances(productRecords, new Set(args.similarAuthorIds));
  const similar: SimilarSummary = {
    authorCount: similarTally.authorCount,
    recommendCount: similarTally.recommendCount,
    notRecommendCount: similarTally.notRecommendCount,
  };
  if (similar.authorCount >= SIMILAR_AUTHOR_THRESHOLD) {
    similar.recommendRate = Number(
      (similar.recommendCount / similar.authorCount).toFixed(4),
    );
  }

  const mode: AnswerMode =
    similar.authorCount === 0
      ? "global"
      : similar.authorCount < SIMILAR_AUTHOR_THRESHOLD
        ? "small_sample"
        : "similar";

  return { global, similar, mode };
}

/** 原因行内按作者去重后的"超过半数"取值，恰好 50% 不展示（规格 9.1）。 */
function majorityValue(values: Array<string | undefined>, authorIds: string[]): string | undefined {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    const author = authorIds[i];
    if (!v || !author || seen.has(`${author}::${v}`)) continue;
    seen.add(`${author}::${v}`);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const threshold = unique(authorIds).length / 2;
  let best: string | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > threshold && count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** ③ aggregate_reasons —— 单一现象 + 去重人数 + 条件范围 + quoteIds。 */
export function aggregateReasons(args: {
  records: ExperienceRecord[];
  productId: string;
  similarAuthorIds: string[];
  category: Category;
}): ReasonAnswer[] {
  const similar = new Set(args.similarAuthorIds);
  const rows = args.records.filter(
    (r) => r.productId === args.productId && similar.has(r.authorId) && r.reasons.length > 0,
  );
  const groups = new Map<string, ExperienceRecord[]>();
  for (const r of rows) {
    for (const reason of r.reasons) {
      const list = groups.get(reason.tag) ?? [];
      list.push(r);
      groups.set(reason.tag, list);
    }
  }

  const config = getCategoryConfig(args.category);
  const numericDim = config.dimensions.find((d) => d.type === "month");

  const result: ReasonAnswer[] = [];
  for (const [tag, group] of groups) {
    const authorIds = unique(group.map((r) => r.authorId));
    // 一次只表达一个具体现象：同一作者同一 tag 只保留一条原话引用
    const quoteIds: string[] = [];
    const seenAuthor = new Set<string>();
    for (const r of group) {
      if (seenAuthor.has(r.authorId)) continue;
      seenAuthor.add(r.authorId);
      quoteIds.push(r.id);
    }

    const recVotes = group.filter((r) => r.stance === "recommend").length;
    const stance: Stance =
      recVotes > group.length - recVotes ? "recommend" : "not_recommend";

    const onset = majorityValue(
      group.map((r) => r.reasons.find((x) => x.tag === tag)?.onset),
      group.map((r) => r.authorId),
    );
    const outcome = majorityValue(
      group.map((r) => r.reasons.find((x) => x.tag === tag)?.outcome),
      group.map((r) => r.authorId),
    );

    let conditionRange: ReasonAnswer["conditionRange"];
    if (numericDim) {
      const values = group
        .map((r) => r.authorConditions[numericDim.key])
        .filter((v): v is number => typeof v === "number");
      if (values.length > 0) {
        conditionRange = {
          key: numericDim.key,
          label: numericDim.label,
          min: Math.min(...values),
          max: Math.max(...values),
          unit: numericDim.unit,
        };
      }
    }

    result.push({
      reasonId: `${args.productId}::${tag}`,
      tag,
      stance,
      authorCount: authorIds.length,
      quoteIds,
      ...(conditionRange ? { conditionRange } : {}),
      ...(onset ? { onset } : {}),
      ...(outcome ? { outcome } : {}),
    });
  }

  // 按去重人数降序，tag 作为稳定 tiebreaker，保证排序稳定（规格 9.1）
  return result.sort(
    (a, b) => b.authorCount - a.authorCount || a.reasonId.localeCompare(b.reasonId),
  );
}

/** ④ pick_alternatives —— 四道门槛全部满足才入选，无达标返回空数组。 */
export function pickAlternatives(args: {
  records: ExperienceRecord[];
  products: Product[];
  category: Category;
  currentProductIds: string[];
  similarAuthorIds: string[];
}): ProductAnswer[] {
  const similar = new Set(args.similarAuthorIds);
  const current = new Set(args.currentProductIds);
  const eligible = args.products.filter(
    (p) => p.category === args.category && !current.has(p.id),
  );

  const scored: Array<{ product: Product; recommendCount: number; notRecommendCount: number }> = [];
  for (const product of eligible) {
    const rows = args.records.filter(
      (r) => r.productId === product.id && similar.has(r.authorId),
    );
    const tally = tallyStances(rows);
    if (tally.recommendCount < ALTERNATIVE_RECOMMEND_THRESHOLD) continue;
    if (tally.recommendCount <= tally.notRecommendCount) continue;
    scored.push({
      product,
      recommendCount: tally.recommendCount,
      notRecommendCount: tally.notRecommendCount,
    });
  }

  scored.sort(
    (a, b) => b.recommendCount - a.recommendCount || a.product.id.localeCompare(b.product.id),
  );

  return scored.map(({ product }) => ({
    productId: product.id,
    name: product.name,
    imageUrl: product.imageUrl,
    reasons: [],
    similarQuoteIds: [],
  }));
}

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** ⑤ get_quotes —— 按产品/原因/立场/条件过滤；同原因内按相关度或发布时间排序。 */
export function getQuotes(args: {
  records: ExperienceRecord[];
  products: Product[];
  category: Category;
  filter: {
    productId?: string;
    reasonId?: string;
    stance?: Stance;
    conditionContext?: WorkingCondition[];
  };
  queryEmbedding?: number[];
}): QuoteItem[] {
  const tag = args.filter.reasonId?.split("::")[1];
  const rows = args.records.filter((r) => {
    if (args.filter.productId && r.productId !== args.filter.productId) return false;
    if (args.filter.stance && r.stance !== args.filter.stance) return false;
    if (tag && !r.reasons.some((x) => x.tag === tag)) return false;
    return true;
  });

  const config = getCategoryConfig(args.category);
  const items: QuoteItem[] = rows.map((r) => ({
    id: r.id,
    recordId: r.id,
    text: r.quote,
    stance: r.stance,
    sourceType: r.sourceType,
    sourceUrl: r.sourceUrl,
    publishedAt: r.publishedAt,
    productId: r.productId,
    reasonId: tag ? `${r.productId}::${tag}` : undefined,
    authorConditions: config.dimensions
      .filter((d) => r.authorConditions[d.key] !== undefined)
      .map((d) => ({
        key: d.key,
        label: d.label,
        valueLabel:
          typeof r.authorConditions[d.key] === "number"
            ? `${r.authorConditions[d.key]}${d.unit ?? ""}`
            : String(r.authorConditions[d.key]),
      })),
  }));

  if (args.queryEmbedding) {
    const embById = new Map(args.records.map((r) => [r.id, r.embedding ?? []]));
    return items.sort(
      (a, b) =>
        cosine(args.queryEmbedding!, embById.get(b.id) ?? []) -
          cosine(args.queryEmbedding!, embById.get(a.id) ?? []) ||
        b.publishedAt.localeCompare(a.publishedAt),
    );
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** 全站不分人群的关键风险：出现人数最多的不推荐原因（规格 3.2）。 */
export function pickGlobalKeyRisk(args: {
  records: ExperienceRecord[];
  productId: string;
}): string | undefined {
  const counts = new Map<string, number>();
  for (const r of args.records) {
    if (r.productId !== args.productId || r.stance !== "not_recommend") continue;
    for (const reason of r.reasons) {
      counts.set(reason.tag, (counts.get(reason.tag) ?? 0) + 1);
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [tag, count] of counts) {
    if (count > bestCount) {
      best = tag;
      bestCount = count;
    }
  }
  return best;
}

export { SIMILAR_AUTHOR_THRESHOLD, ALTERNATIVE_RECOMMEND_THRESHOLD };
