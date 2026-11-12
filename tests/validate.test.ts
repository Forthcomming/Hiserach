import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assembleAnswer, validateAnswerDraft, validateAnswerPayload } from "@/agent/validate";
import type { AnswerDraft, ToolBundle } from "@/domain/types";
import { createMemoryRepository } from "@/repository/memoryRepository";
import { runTools } from "@/tools/runTools";

const FIXTURE = resolve(process.cwd(), "data/fixtures.json");

async function beautyBundle(productId = "p_dw_foundation"): Promise<ToolBundle> {
  const repo = createMemoryRepository(FIXTURE);
  const [products, records] = await Promise.all([
    repo.listProducts("beauty"),
    repo.listExperiences({ category: "beauty" }),
  ]);
  return runTools({
    category: "beauty",
    productIds: [productId],
    conditions: [
      {
        key: "skin_issue",
        label: "皮肤状况",
        valueLabel: "脂溢性皮炎",
        value: "脂溢性皮炎",
        isCore: true,
        source: "memory",
      },
    ],
    records,
    products,
  });
}

function validDraft(bundle: ToolBundle): AnswerDraft {
  return {
    headline: "和你情况相似的人里，先看结论",
    similarAuthorCount: bundle.similarSummary?.authorCount,
    ...(bundle.similarSummary?.recommendRate !== undefined
      ? { similarRecommendRate: bundle.similarSummary.recommendRate }
      : {}),
    quoteIds: bundle.quotes.slice(0, 3).map((q) => q.id),
    reasonIds: bundle.reasons.map((r) => r.reasonId),
    alternativeProductIds: bundle.alternatives.map((p) => p.productId),
  };
}

describe("答案一致性校验（规格 4.2 / AC-10）", () => {
  it("合法草稿通过校验", async () => {
    const bundle = await beautyBundle();
    expect(validateAnswerDraft(validDraft(bundle), bundle).ok).toBe(true);
  });

  it("模型编造人数、比例、引用 ID 一律判失败", async () => {
    const bundle = await beautyBundle();
    const draft = validDraft(bundle);
    expect(validateAnswerDraft({ ...draft, similarAuthorCount: 999 }, bundle).errors).toContain(
      "similar_author_count_mismatch",
    );
    expect(validateAnswerDraft({ ...draft, similarRecommendRate: 0.99 }, bundle).errors).toContain(
      "similar_recommend_rate_mismatch",
    );
    expect(validateAnswerDraft({ ...draft, quoteIds: ["fake_quote"] }, bundle).errors).toContain(
      "unknown_quote:fake_quote",
    );
    expect(validateAnswerDraft({ ...draft, reasonIds: ["fake_reason"] }, bundle).errors).toContain(
      "unknown_reason:fake_reason",
    );
    expect(
      validateAnswerDraft({ ...draft, alternativeProductIds: ["fake_product"] }, bundle).errors,
    ).toContain("unknown_alternative:fake_product");
    expect(validateAnswerDraft(undefined, bundle).ok).toBe(false);
  });

  it("小样本模式禁止出现同类人比例", async () => {
    const bundle = await beautyBundle("p_bb_cushion");
    expect(bundle.similarSummary?.recommendRate).toBeUndefined();
    const draft = { ...validDraft(bundle), similarRecommendRate: 0.5 };
    expect(validateAnswerDraft(draft, bundle).errors).toContain("rate_forbidden_in_small_sample");
    const answer = assembleAnswer({
      bundle,
      category: "beauty",
      turnId: "t1",
      appliedConditions: [],
    });
    expect(answer.mode).toBe("small_sample");
    expect(answer.similarSummary?.recommendRate).toBeUndefined();
    expect(validateAnswerPayload(answer, bundle).ok).toBe(true);
  });

  it("最终答案所有数字、引用 ID 与工具结果逐项一致", async () => {
    const bundle = await beautyBundle();
    const answer = assembleAnswer({
      bundle,
      category: "beauty",
      turnId: "t1",
      appliedConditions: [],
    });
    const check = validateAnswerPayload(answer, bundle);
    expect(check).toEqual({ ok: true, errors: [] });
    expect(answer.globalSummary.authorCount).toBe(bundle.globalSummary.authorCount);
    expect(answer.similarSummary?.authorCount).toBe(bundle.similarSummary?.authorCount);
    expect(answer.products[0].reasons.map((r) => r.authorCount)).toEqual(
      bundle.reasons.map((r) => r.authorCount),
    );
  });

  it("篡改答案数字或泄露比例会被校验器发现", async () => {
    const bundle = await beautyBundle();
    const answer = assembleAnswer({
      bundle,
      category: "beauty",
      turnId: "t1",
      appliedConditions: [],
    });
    const tampered = {
      ...answer,
      globalSummary: { ...answer.globalSummary, authorCount: 999 },
    };
    expect(validateAnswerPayload(tampered, bundle).errors).toContain("global_summary_mismatch");
    const wrongMode = { ...answer, mode: "global" as const };
    expect(validateAnswerPayload(wrongMode, bundle).errors).toContain("mode_mismatch");
  });
});
