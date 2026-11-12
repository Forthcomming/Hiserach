import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeWorkingConditions } from "@/domain/conditions";
import type {
  ConditionInput,
  ExperienceRecord,
  WorkingCondition,
} from "@/domain/types";
import { createMemoryRepository } from "@/repository/memoryRepository";
import {
  aggregateReasons,
  getQuotes,
  matchSimilar,
  pickAlternatives,
  summarizeProduct,
} from "@/tools/deterministic";
import { modeOf, runTools } from "@/tools/runTools";

const FIXTURE = resolve(process.cwd(), "data/fixtures.json");

async function load() {
  const repo = createMemoryRepository(FIXTURE);
  const products = await repo.listProducts();
  const records = await repo.listExperiences();
  return { repo, products, records };
}

function beautyConditions(extra: ConditionInput[] = []): WorkingCondition[] {
  return mergeWorkingConditions({
    category: "beauty",
    memories: [],
    stated: [
      { key: "skin_issue", value: "脂溢性皮炎", source: "user_input" },
      ...extra,
    ],
    memoryDisabled: false,
  }).conditions;
}

describe("五个确定性工具", () => {
  it("match_similar：核心条件全匹配，次要条件不过滤，作者去重", async () => {
    const { products, records } = await load();
    const allIds = products.filter((p) => p.category === "beauty").map((p) => p.id);
    const coreOnly = matchSimilar({
      records,
      productIds: allIds,
      conditions: beautyConditions(),
    });
    const withMinor = matchSimilar({
      records,
      productIds: allIds,
      conditions: beautyConditions([
        { key: "skin_type", value: "干皮", source: "user_input" },
      ]),
    });
    expect(coreOnly.authorIds.sort()).toEqual(["a01", "a02", "a03", "a04", "a05", "a06"]);
    // skin_type 只用于排序/高亮，不改变同类人集合
    expect(withMinor.authorIds.sort()).toEqual(coreOnly.authorIds.sort());
    expect(new Set(coreOnly.authorIds).size).toBe(coreOnly.authorIds.length);
  });

  it("summarize_product：全站与同类分开统计，按 author_id 去重", async () => {
    const { records } = await load();
    const similar = ["a01", "a02", "a03", "a04", "a05", "a06"];
    const r = summarizeProduct({ records, productId: "p_dw_foundation", similarAuthorIds: similar });
    expect(r.global.authorCount).toBe(10);
    expect(r.global.recommendCount).toBe(6);
    expect(r.global.notRecommendCount).toBe(4);
    expect(r.global.recommendRate).toBeCloseTo(0.6, 4);
    expect(r.similar?.authorCount).toBe(6);
    expect(r.similar?.recommendCount).toBe(2);
    expect(r.similar?.recommendRate).toBeCloseTo(1 / 3, 4);
    expect(r.mode).toBe("similar");
  });

  it("4 人不出比例、5 人开始出比例的边界", async () => {
    const { records } = await load();
    const four = ["a01", "a02", "a03", "a04"];
    const five = [...four, "a05"];
    const r4 = summarizeProduct({ records, productId: "p_dw_foundation", similarAuthorIds: four });
    const r5 = summarizeProduct({ records, productId: "p_dw_foundation", similarAuthorIds: five });
    expect(r4.mode).toBe("small_sample");
    expect(r4.similar?.recommendRate).toBeUndefined();
    expect(r5.mode).toBe("similar");
    expect(r5.similar?.recommendRate).toBeDefined();
  });

  it("小样本：同类 3 人不出比例，首屏全站优先", async () => {
    const { products, records } = await load();
    const bundle = runTools({
      category: "beauty",
      productIds: ["p_bb_cushion"],
      conditions: beautyConditions(),
      records,
      products,
    });
    expect(bundle.similarSummary?.authorCount).toBe(3);
    expect(bundle.similarSummary?.recommendRate).toBeUndefined();
    expect(modeOf(bundle)).toBe("small_sample");
  });

  it("aggregate_reasons：单一现象、去重人数、条件范围、多数规则", async () => {
    const { records } = await load();
    const similar = ["a01", "a02", "a03", "a04", "a05", "a06"];
    const reasons = aggregateReasons({
      records,
      productId: "p_dw_foundation",
      similarAuthorIds: similar,
      category: "beauty",
    });
    const acne = reasons.find((r) => r.tag === "闷痘");
    expect(acne?.authorCount).toBe(3);
    expect(acne?.quoteIds).toHaveLength(3);
    expect(acne?.onset).toBe("上妆后 2 小时"); // 3/3 超过半数
    expect(acne?.outcome).toBe("卸妆后 1 天消退"); // 2/3 超过半数
    // 非同类作者的原因不得混入
    expect(reasons.find((r) => r.tag === "卡粉")).toBeUndefined();
  });

  it("原因多数规则：恰好 50% 不展示", async () => {
    const { records } = await load();
    const base = records.find((r) => r.id === "r01")!;
    const synthetic: ExperienceRecord[] = [
      { ...base, id: "x1", authorId: "x1", reasons: [{ tag: "测试", onset: "A" }] },
      { ...base, id: "x2", authorId: "x2", reasons: [{ tag: "测试", onset: "B" }] },
    ];
    const reasons = aggregateReasons({
      records: synthetic,
      productId: "p_dw_foundation",
      similarAuthorIds: ["x1", "x2"],
      category: "beauty",
    });
    expect(reasons[0].onset).toBeUndefined();
    expect(reasons[0].authorCount).toBe(2);
  });

  it("baby_food 原因带数值条件范围 min/max", async () => {
    const { products, records } = await load();
    const similar = ["b01", "b02", "b03", "b04", "b05"];
    const reasons = aggregateReasons({
      records,
      productId: "p_rice_01",
      similarAuthorIds: similar,
      category: "baby_food",
    });
    const rash = reasons.find((r) => r.tag === "起红疹");
    expect(rash?.conditionRange).toEqual({
      key: "age_month",
      label: "月龄",
      min: 6,
      max: 7,
      unit: "个月",
    });
    expect(products.length).toBeGreaterThan(0);
  });

  it("pick_alternatives：4/5 人门槛、推荐必须多于不推荐、排序稳定", async () => {
    const { products, records } = await load();
    const similar = ["a01", "a02", "a03", "a04", "a05", "a06"];
    const alts = pickAlternatives({
      records,
      products,
      category: "beauty",
      currentProductIds: ["p_dw_foundation"],
      similarAuthorIds: similar,
    });
    expect(alts.map((a) => a.productId)).toEqual(["p_alt_foundation"]);
    // p_alt_foundation_2 只有 4 个推荐作者，不入选
    expect(alts.find((a) => a.productId === "p_alt_foundation_2")).toBeUndefined();
  });

  it("替代品：推荐与不推荐相等时不入选；无达标返回空", async () => {
    const { products, records } = await load();
    const base = records.find((r) => r.id === "r11")!;
    const synthetic: ExperienceRecord[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        ...base,
        id: `eq_r_${i}`,
        authorId: `eq_a_${i}`,
        stance: "recommend" as const,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        ...base,
        id: `eq_n_${i}`,
        authorId: `eq_a_${i + 5}`,
        stance: "not_recommend" as const,
      })),
    ];
    const alts = pickAlternatives({
      records: synthetic,
      products,
      category: "beauty",
      currentProductIds: ["p_dw_foundation"],
      similarAuthorIds: Array.from({ length: 10 }, (_, i) => `eq_a_${i}`),
    });
    expect(alts).toEqual([]);
  });

  it("get_quotes：按产品、原因、立场过滤，来源链接均为安全的站内/白名单地址", async () => {
    const { products, records } = await load();
    const all = getQuotes({ records, products, category: "beauty", filter: {} });
    expect(
      all.every(
        (q) =>
          !q.sourceUrl ||
          /^\/evidence\/[A-Za-z0-9_-]+$/.test(q.sourceUrl) ||
          q.sourceUrl.startsWith("https://"),
      ),
    ).toBe(true);
    const byReason = getQuotes({
      records,
      products,
      category: "beauty",
      filter: { productId: "p_dw_foundation", reasonId: "p_dw_foundation::闷痘", stance: "not_recommend" },
    });
    expect(byReason).toHaveLength(3);
    expect(byReason.every((q) => q.stance === "not_recommend")).toBe(true);
    expect(byReason.every((q) => q.authorConditions.length > 0)).toBe(true);
  });

  it("runTools：全站共识与关键风险始终独立计算", async () => {
    const { products, records } = await load();
    const bundle = runTools({
      category: "beauty",
      productIds: ["p_dw_foundation"],
      conditions: beautyConditions(),
      records,
      products,
    });
    expect(bundle.globalSummary.authorCount).toBe(10);
    expect(bundle.globalSummary.keyRisk).toBe("闷痘");
    expect(bundle.primaryProduct?.similarQuoteIds.length).toBeGreaterThan(0);
    expect(bundle.datasetNote).toContain("条内容");
  });
});
