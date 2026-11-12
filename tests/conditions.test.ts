import { describe, expect, it } from "vitest";
import {
  ageInMonths,
  birthMonthFromAge,
  mergeWorkingConditions,
  validateConditionInput,
} from "@/domain/conditions";
import type { ConditionInput, MemoryItem } from "@/domain/types";

const NOW = new Date("2026-11-12T12:00:00+08:00");

function memory(key: string, value: MemoryItem["value"], isCore = true): MemoryItem {
  return {
    id: `m_${key}`,
    userId: "u1",
    category: "baby_food",
    key,
    value,
    isCore,
    source: { channel: "preset" },
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("月龄换算（规格 3.1 / 9.1）", () => {
  it("跨年场景：出生月份换算为当前月龄", () => {
    expect(ageInMonths("2025-11", NOW)).toBe(12);
    expect(ageInMonths("2026-04", NOW)).toBe(7);
    expect(ageInMonths("2026-12", NOW)).toBe(0);
  });

  it("当前月龄反算出生月份，再读回一致", () => {
    const birth = birthMonthFromAge(7, NOW);
    expect(birth).toBe("2026-04");
    expect(ageInMonths(birth, NOW)).toBe(7);
  });

  it("月龄长期保存为出生月份，读取时动态换算", () => {
    const merged = mergeWorkingConditions({
      category: "baby_food",
      memories: [memory("age_month", { birthMonth: "2026-04" }, false)],
      stated: [],
      memoryDisabled: false,
      now: NOW,
    });
    expect(merged.conditions[0].value).toEqual({ birthMonth: "2026-04" });
    expect(merged.conditions[0].valueLabel).toBe("7个月");
    expect(merged.conditions[0].numericValue).toBe(7);
    expect(merged.conditions[0].isCore).toBe(false);
  });
});

describe("条件校验与合并优先级", () => {
  it("词表外条件、他人情况、非法值一律丢弃", () => {
    const bad: ConditionInput[] = [
      { key: "unknown_key", value: "有过敏", source: "user_input" },
      { key: "allergy", value: "随便写的值", source: "user_input" },
      { key: "age_month", value: "不是月份", source: "user_input" },
    ];
    for (const c of bad) {
      expect(validateConditionInput("baby_food", c, NOW)).toBeNull();
    }
    expect(
      validateConditionInput("baby_food", { key: "allergy", value: "有过敏", source: "followup_card" }, NOW),
    ).toEqual({ key: "allergy", value: "有过敏" });
  });

  it("本轮自述优先于长期记忆，相同维度新值替代旧值", () => {
    const merged = mergeWorkingConditions({
      category: "baby_food",
      memories: [memory("allergy", "有过敏")],
      stated: [{ key: "allergy", value: "无过敏", source: "user_input" }],
      memoryDisabled: false,
      now: NOW,
    });
    const allergy = merged.conditions.find((c) => c.key === "allergy")!;
    expect(allergy.value).toBe("无过敏");
    expect(allergy.source).toBe("user_input");
    expect(merged.conditions.filter((c) => c.key === "allergy")).toHaveLength(1);
    expect(merged.overriddenMemoryIds).toEqual(["m_allergy"]);
    expect(merged.usedMemoryIds).toEqual([]);
  });

  it("本次停用只屏蔽长期记忆，不影响本轮自述，且采用条目记 used", () => {
    const withMemory = mergeWorkingConditions({
      category: "baby_food",
      memories: [memory("allergy", "有过敏")],
      stated: [],
      memoryDisabled: false,
      now: NOW,
    });
    expect(withMemory.conditions[0].source).toBe("memory");
    expect(withMemory.usedMemoryIds).toEqual(["m_allergy"]);

    const disabled = mergeWorkingConditions({
      category: "baby_food",
      memories: [memory("allergy", "有过敏")],
      stated: [{ key: "diarrhea", value: "有腹泻", source: "followup_card" }],
      memoryDisabled: true,
      now: NOW,
    });
    expect(disabled.conditions.map((c) => c.key)).toEqual(["diarrhea"]);
    expect(disabled.conditions[0].source).toBe("followup_card");
    expect(disabled.usedMemoryIds).toEqual([]);
  });

  it("核心条件最多 2 个参与筛选，其余标为次要", () => {
    const merged = mergeWorkingConditions({
      category: "baby_food",
      memories: [],
      stated: [
        { key: "allergy", value: "有过敏", source: "user_input" },
        { key: "diarrhea", value: "有腹泻", source: "user_input" },
        { key: "age_month", value: "7个月", source: "user_input" },
      ],
      memoryDisabled: false,
      now: NOW,
    });
    expect(merged.conditions.filter((c) => c.isCore)).toHaveLength(2);
    expect(merged.conditions.find((c) => c.key === "age_month")?.isCore).toBe(false);
  });

  it("跨品类记忆不会被读取", () => {
    const beautyMemory: MemoryItem = { ...memory("skin_issue", "脂溢性皮炎"), category: "beauty" };
    const merged = mergeWorkingConditions({
      category: "baby_food",
      memories: [beautyMemory],
      stated: [],
      memoryDisabled: false,
      now: NOW,
    });
    expect(merged.conditions).toEqual([]);
  });
});
