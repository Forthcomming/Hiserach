import { getCategoryConfig } from "@/domain/categories";
import type {
  AnswerPayload,
  AppliedCondition,
  Category,
  ToolBundle,
} from "@/domain/types";
import { modeOf } from "@/tools/runTools";
import { NO_PEER_DATA_NOTICE } from "./notices";
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

const DEMO_QUICK_TAGS = ["DW粉底", "婴儿米粉推荐"];

/** 超范围通用答：无工具统计、无原话；可附快捷标签引导回 Demo 查询。 */
export function generalAdviceAnswer(args: {
  turnId: string;
  adviceText: string;
  category?: Category;
}): AnswerPayload {
  return {
    mode: "general",
    appliedConditions: [],
    globalSummary: {
      authorCount: 0,
      recommendCount: 0,
      notRecommendCount: 0,
      recommendRate: 0,
    },
    products: [],
    alternatives: [],
    adviceText: args.adviceText,
    notice: {
      text: NO_PEER_DATA_NOTICE,
      quickTags: DEMO_QUICK_TAGS,
    },
    disclaimers: [
      "内容仅用于面试演示，基于常识建议，非医疗建议，未使用同类人样本数据",
      ...(args.category ? [getCategoryConfig(args.category).medicalDisclaimer] : []),
    ],
    datasetNote: "本次未使用样本数据",
    traceId: args.turnId,
  };
}

/** 模型失败时的通用答模板。 */
export function fallbackGeneralAdvice(query: string): string {
  return `关于「${query.slice(0, 40)}」，我可以先给一些通用选购思路，但当前没有可对齐的同类人样本，无法提供口碑比例或原话。你可以试试 Demo 已覆盖的「DW粉底」或「婴儿米粉推荐」。`;
}
