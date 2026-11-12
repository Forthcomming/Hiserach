import { getCategoryConfig } from "@/domain/categories";
import type {
  AnswerPayload,
  AppliedCondition,
  Category,
  ToolBundle,
} from "@/domain/types";
import { modeOf } from "@/tools/runTools";
import { assembleAnswer } from "./validate";

/**
 * 模板兜底（规格 6.8 / AC-10）：模型超时、报错或两次校验失败时，
 * 用同一份工具结果渲染答案。数字、原因、原话、门槛与提示全部照常满足。
 */
export function templateHeadline(bundle: ToolBundle): string {
  const mode = modeOf(bundle);
  const s = bundle.similarSummary;
  const g = bundle.globalSummary;
  if (mode === "similar" && s) {
    return `和你情况相似的 ${s.authorCount} 人中 ${s.recommendCount} 人推荐，${s.notRecommendCount} 人不推荐`;
  }
  if (mode === "small_sample" && s) {
    return `仅 ${s.authorCount} 位和你情况相似的人提到过，先看整体结论`;
  }
  return `整体 ${Math.round(g.recommendRate * 100)}% 推荐（${g.authorCount} 人）`;
}

export function renderTemplateAnswer(args: {
  bundle: ToolBundle;
  category: Category;
  turnId: string;
  appliedConditions: AppliedCondition[];
}): AnswerPayload {
  return assembleAnswer(args);
}

/** 超范围查询：不跑统计工具、不写记忆，只返回受限提示与两个快捷标签。 */
export function unsupportedAnswer(args: {
  turnId: string;
  category?: Category;
}): AnswerPayload {
  return {
    mode: "global",
    appliedConditions: [],
    globalSummary: {
      authorCount: 0,
      recommendCount: 0,
      notRecommendCount: 0,
      recommendRate: 0,
    },
    products: [],
    alternatives: [],
    notice: {
      text: "Demo 目前只覆盖以下查询",
      quickTags: ["DW粉底", "婴儿米粉推荐"],
    },
    disclaimers: [
      "内容仅用于面试演示，基于本次收集的样本，非医疗建议",
      ...(args.category ? [getCategoryConfig(args.category).medicalDisclaimer] : []),
    ],
    datasetNote: "本次未使用样本数据",
    traceId: args.turnId,
  };
}
