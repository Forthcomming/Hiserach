import { SIMILAR_AUTHOR_THRESHOLD, getCategoryConfig } from "@/domain/categories";
import type {
  AnswerDraft,
  AnswerPayload,
  AppliedCondition,
  Category,
  ToolBundle,
} from "@/domain/types";
import { modeOf, referenceIdsOf } from "@/tools/runTools";

const close = (a: number | undefined, b: number | undefined): boolean => {
  if (a === undefined || b === undefined) return a === b;
  return Math.abs(a - b) < 1e-6;
};

/**
 * 校验模型草稿（规格 4.2 / AC-10）：
 * 模型声明的每个数字、每个引用 ID 都必须与工具结果逐项一致，否则判定失败。
 */
export function validateAnswerDraft(
  draft: AnswerDraft | undefined,
  bundle: ToolBundle,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!draft) return { ok: false, errors: ["missing_answer_draft"] };
  if (!draft.headline.trim()) errors.push("empty_headline");

  const similar = bundle.similarSummary;
  if (draft.similarAuthorCount !== undefined && draft.similarAuthorCount !== similar?.authorCount) {
    errors.push("similar_author_count_mismatch");
  }
  if (draft.similarRecommendRate !== undefined) {
    if (similar?.recommendRate === undefined) {
      errors.push("rate_forbidden_in_small_sample");
    } else if (!close(draft.similarRecommendRate, similar.recommendRate)) {
      errors.push("similar_recommend_rate_mismatch");
    }
  }

  const refs = referenceIdsOf(bundle);
  for (const id of draft.quoteIds) {
    if (!refs.quoteIds.has(id)) errors.push(`unknown_quote:${id}`);
  }
  for (const id of draft.reasonIds) {
    if (!refs.reasonIds.has(id)) errors.push(`unknown_reason:${id}`);
  }
  for (const id of draft.alternativeProductIds) {
    if (!refs.alternativeIds.has(id)) errors.push(`unknown_alternative:${id}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * 最终答案只由工具结果组装。模型的 headline 仅作为流式文案，
 * 绝不进入 AnswerPayload 的事实字段（规格 1 / 4.4 / AC-10）。
 */
export function assembleAnswer(args: {
  bundle: ToolBundle;
  category: Category;
  turnId: string;
  appliedConditions: AppliedCondition[];
  notice?: AnswerPayload["notice"];
}): AnswerPayload {
  const { bundle, category, turnId } = args;
  const mode = modeOf(bundle);
  const cfg = getCategoryConfig(category);

  const similar = bundle.similarSummary
    ? {
        authorCount: bundle.similarSummary.authorCount,
        recommendCount: bundle.similarSummary.recommendCount,
        notRecommendCount: bundle.similarSummary.notRecommendCount,
        // 小样本、全局模式下绝不携带比例字段（AC-06）
        ...(mode === "similar" && bundle.similarSummary.recommendRate !== undefined
          ? { recommendRate: bundle.similarSummary.recommendRate }
          : {}),
      }
    : undefined;

  const disclaimers = [
    cfg.medicalDisclaimer,
    "内容仅用于面试演示，基于本次收集的样本，非医疗建议",
    ...(mode === "small_sample" ? ["同类人样本量较小，结论仅供参考"] : []),
  ];

  return {
    mode,
    appliedConditions: args.appliedConditions,
    ...(similar ? { similarSummary: similar } : {}),
    globalSummary: bundle.globalSummary,
    products: bundle.primaryProduct ? [bundle.primaryProduct] : [],
    alternatives: bundle.alternatives,
    ...(bundle.followup ? { followup: bundle.followup } : {}),
    ...(args.notice ? { notice: args.notice } : {}),
    disclaimers,
    datasetNote: bundle.datasetNote,
    traceId: turnId,
  };
}

/** 校验最终答案与工具结果逐项一致，供发布前门禁与集成测试使用。 */
export function validateAnswerPayload(
  answer: AnswerPayload,
  bundle: ToolBundle,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const g = bundle.globalSummary;
  const ag = answer.globalSummary;
  if (
    ag.authorCount !== g.authorCount ||
    ag.recommendCount !== g.recommendCount ||
    ag.notRecommendCount !== g.notRecommendCount ||
    !close(ag.recommendRate, g.recommendRate)
  ) {
    errors.push("global_summary_mismatch");
  }

  const s = bundle.similarSummary;
  const as = answer.similarSummary;
  if (s && as) {
    if (
      as.authorCount !== s.authorCount ||
      as.recommendCount !== s.recommendCount ||
      as.notRecommendCount !== s.notRecommendCount
    ) {
      errors.push("similar_summary_mismatch");
    }
    if (s.authorCount < SIMILAR_AUTHOR_THRESHOLD && as.recommendRate !== undefined) {
      errors.push("rate_leaked_in_small_sample");
    }
    if (s.authorCount >= SIMILAR_AUTHOR_THRESHOLD && !close(as.recommendRate, s.recommendRate)) {
      errors.push("similar_rate_mismatch");
    }
  }

  if (answer.mode !== modeOf(bundle)) errors.push("mode_mismatch");

  const refs = referenceIdsOf(bundle);
  for (const product of [...answer.products, ...answer.alternatives]) {
    for (const qid of product.similarQuoteIds) {
      if (!refs.quoteIds.has(qid)) errors.push(`unknown_quote:${qid}`);
    }
    for (const reason of product.reasons) {
      if (!refs.reasonIds.has(reason.reasonId)) errors.push(`unknown_reason:${reason.reasonId}`);
      const expected = bundle.reasons.find((r) => r.reasonId === reason.reasonId);
      if (!expected || expected.authorCount !== reason.authorCount) {
        errors.push(`reason_count_mismatch:${reason.reasonId}`);
      }
      for (const qid of reason.quoteIds) {
        if (!refs.quoteIds.has(qid)) errors.push(`unknown_quote:${qid}`);
      }
    }
  }
  for (const alt of answer.alternatives) {
    if (!refs.alternativeIds.has(alt.productId)) errors.push(`unknown_alternative:${alt.productId}`);
  }
  return { ok: errors.length === 0, errors };
}
