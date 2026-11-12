import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";
import { getCategoryConfig } from "@/domain/categories";
import { serverEnv } from "@/lib/env";
import type {
  AnswerDraft,
  Category,
  QueryUnderstanding,
  SessionContext,
  ToolBundle,
} from "@/domain/types";
import { sessionHintText } from "./sessionContext";

/**
 * json_object 是非严格模式，模型常省略空数组字段。给这些字段兜底空数组，
 * 避免整份结果因缺字段被判解析失败而降级；事实仍由 validate_answer 逐项校验。
 */
const UnderstandSchema = z.object({
  intent: z.enum(["supported", "unsupported"]),
  category: z.enum(["beauty", "baby_food"]).optional(),
  productIds: z.array(z.string()).default([]),
  statedConditions: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
      raw: z.string().optional(),
    }),
  ).default([]),
  normalizedQuery: z.string().optional(),
});

const DraftSchema = z.object({
  headline: z.string().default(""),
  similarAuthorCount: z.number().optional(),
  similarRecommendRate: z.number().optional(),
  quoteIds: z.array(z.string()).default([]),
  reasonIds: z.array(z.string()).default([]),
  alternativeProductIds: z.array(z.string()).default([]),
});

export interface GeneralAdviceDraft {
  text: string;
}

export interface ModelGateway {
  readonly configured: boolean;
  /** 已知商品查询可直接使用工具结果组装答案，不等待模型润色。 */
  readonly deterministicFastPath?: boolean;
  /** 只能输出受控 QueryUnderstanding，不直接生成答案（规格 4.2）。 */
  understandQuery(args: {
    query: string;
    products: Array<{ id: string; category: Category; name: string }>;
    sessionContext?: SessionContext;
  }): Promise<QueryUnderstanding | null>;
  /** 只产出文案与引用声明；任何数字/ID 都要被 validate_answer 逐项校验。 */
  composeAnswer(args: { bundle: ToolBundle; conditionsText: string }): Promise<AnswerDraft | null>;
  /**
   * 超范围话题的常识/选购建议。禁止输出同类人人数、比例、原话或虚构产品口碑统计。
   */
  composeGeneralAdvice(args: {
    query: string;
    sessionHint?: string;
  }): Promise<GeneralAdviceDraft | null>;
}

/** 未配置模型 / 超时 / 格式错误 / 服务异常时统一返回 null，由节点走确定性兜底。 */
class NullModelGateway implements ModelGateway {
  readonly configured = false;
  readonly deterministicFastPath = true;
  async understandQuery(): Promise<QueryUnderstanding | null> {
    return null;
  }
  async composeAnswer(): Promise<AnswerDraft | null> {
    return null;
  }
  async composeGeneralAdvice(): Promise<GeneralAdviceDraft | null> {
    return null;
  }
}

const GeneralAdviceSchema = z.object({
  text: z.string().min(1),
});

/**
 * DeepSeek 等 OpenAI 兼容服务只保证 response_format=json_object 的 JSON 输出，
 * 不支持 generateObject 默认的严格 json_schema。改为 generateText + 手动 Zod 解析，
 * 解析失败统一返回 null，由 Agent 节点走确定性模板兜底。
 */
function parseStructured<T>(text: string, schema: z.ZodType<T>): T | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const parsed = schema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) {
      console.warn(
        "[model] 结构化结果校验失败:",
        parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "),
        "| raw:", cleaned.slice(0, 200),
      );
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.warn(
      "[model] 结构化结果解析失败:",
      error instanceof Error ? error.message : String(error),
      "| raw:", cleaned.slice(0, 200),
    );
    return null;
  }
}

function vocabularyText(): string {
  return (["beauty", "baby_food"] as Category[])
    .map((c) => {
      const cfg = getCategoryConfig(c);
      const dims = cfg.dimensions
        .map((d) => `${d.key}(${d.label}): ${d.options?.join(" / ") ?? "月龄"}`)
        .join("; ");
      const aliases = cfg.intentAliases.map((a) => a.phrase).join(" / ");
      return `${c}: 维度[${dims}]; 可覆盖查询[${aliases}]`;
    })
    .join("\n");
}

class OpenAiCompatibleGateway implements ModelGateway {
  readonly configured = true;
  readonly deterministicFastPath = true;

  private async call<T>(
    schema: z.ZodType<T>,
    system: string,
    prompt: string,
  ): Promise<T | null> {
    const provider = createOpenAI({
      apiKey: serverEnv.llmApiKey,
      ...(serverEnv.llmBaseUrl ? { baseURL: serverEnv.llmBaseUrl } : {}),
      // DeepSeek 只支持 response_format=json_object；AI SDK 的 generateObject 会走严格
      // json_schema，因此改用 generateText，并在请求发出前强制写入 json_object。
      fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (init?.body && typeof init.body === "string") {
          try {
            const body = JSON.parse(init.body);
            body.response_format = { type: "json_object" };
            return fetch(input, { ...init, body: JSON.stringify(body) });
          } catch {
            // 非 JSON 请求体，原样发出
          }
        }
        return fetch(input, init);
      },
    });
    const model = provider.chat(
      serverEnv.llmModel as Parameters<typeof provider.chat>[0],
    );

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), serverEnv.llmTimeoutMs);
    });
    // json_object 不携带字段结构，必须在提示词里给出 schema，否则模型会自由发挥。
    let shapeHint = "";
    try {
      shapeHint = JSON.stringify(z.toJSONSchema(schema));
    } catch {
      // 无法转换时退化为纯提示，解析失败会走确定性兜底
    }
    const request = generateText({
      model,
      system: [
        system,
        "只输出一个 JSON 对象，不要解释、不要 markdown 代码块，不要输出 schema 之外的字段。",
        `必须严格符合以下 JSON Schema：\n${shapeHint}`,
      ].join("\n"),
      prompt,
    })
      .then((r) => parseStructured<T>(r.text, schema))
      .catch(() => null);

    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async understandQuery(args: {
    query: string;
    products: Array<{ id: string; category: Category; name: string }>;
    sessionContext?: SessionContext;
  }): Promise<QueryUnderstanding | null> {
    const hint = sessionHintText(args.sessionContext);
    const system = [
      "你是查询理解器，只输出受控 JSON，不生成任何答案或统计数字。",
      "规则：",
      "1. 只有能归一到以下两个目标查询的意图才判为 supported；其余一律 unsupported。",
      "2. 条件只抽取用户明确自述的本人情况，且必须命中当前品类的维度与合法取值；他人情况、否定不明确或词表外条件不要输出。",
      "3. productIds 只能取给定产品列表中的 ID。",
      "4. 容忍错别字、口语、省略主语；能合理归一到词表取值时要归一（如「混油皮」→「混油」）。",
      "5. 若提供了会话上下文，短追问（如「那混油皮呢」「替代那款呢」）应继承品类与 productIds，并抽取本轮新条件。",
      `词表与查询别名：\n${vocabularyText()}`,
      `产品列表：${JSON.stringify(args.products)}`,
      hint ? `会话上下文：${hint}` : "会话上下文：无",
    ].join("\n");

    const raw = await this.call(UnderstandSchema, system, args.query);
    if (!raw) return null;
    return {
      intent: raw.intent,
      ...(raw.category ? { category: raw.category } : {}),
      productIds: raw.productIds,
      statedConditions: raw.statedConditions.map((c) => ({
        key: c.key,
        value: c.value,
        source: "user_input",
        ...(c.raw ? { raw: c.raw } : {}),
      })),
      ...(raw.normalizedQuery ? { normalizedQuery: raw.normalizedQuery } : {}),
    };
  }

  async composeAnswer(args: {
    bundle: ToolBundle;
    conditionsText: string;
  }): Promise<AnswerDraft | null> {
    const { bundle } = args;
    const system = [
      "你是答案文案组织器。你只能使用给定的工具结果，不得生成、推算或改写任何人数、比例、原因人数、原话或产品。",
      "输出 headline 为非事实性引导文案；其余字段必须如实抄自工具结果中的 ID / 数字，不得新增。",
      "小样本模式下禁止输出 similarRecommendRate。",
      "不要输出任何原文引用之外的 quoteIds / reasonIds / alternativeProductIds。",
    ].join("\n");
    const prompt = [
      `用户条件：${args.conditionsText}`,
      `模式：${bundle.similarSummary?.authorCount ?? 0} 位同类作者`,
      `同类统计：${JSON.stringify(bundle.similarSummary ?? null)}`,
      `全站统计：${JSON.stringify(bundle.globalSummary)}`,
      `原因：${JSON.stringify(bundle.reasons.map((r) => ({ id: r.reasonId, tag: r.tag, n: r.authorCount })))}`,
      `合法 quoteIds：${JSON.stringify(bundle.quotes.map((q) => q.id))}`,
      `合法 reasonIds：${JSON.stringify(bundle.reasons.map((r) => r.reasonId))}`,
      `合法 alternatives：${JSON.stringify(bundle.alternatives.map((p) => p.productId))}`,
    ].join("\n");

    return this.call(DraftSchema, system, prompt);
  }

  async composeGeneralAdvice(args: {
    query: string;
    sessionHint?: string;
  }): Promise<GeneralAdviceDraft | null> {
    const system = [
      "你是消费选购助手，用简洁中文给出常识性建议。",
      "硬性禁止：不得编造或声称任何「同类人」人数、推荐比例、用户原话、样本统计。",
      "可以给通用选购要点；结尾不要假装有口碑数据。",
      "输出 JSON：{ \"text\": \"建议正文\" }。",
    ].join("\n");
    const prompt = [
      `用户问题：${args.query}`,
      args.sessionHint ? `会话提示：${args.sessionHint}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return this.call(GeneralAdviceSchema, system, prompt);
  }
}

let cached: ModelGateway | null = null;

export function getModelGateway(): ModelGateway {
  if (cached) return cached;
  cached = serverEnv.isModelConfigured
    ? new OpenAiCompatibleGateway()
    : new NullModelGateway();
  return cached;
}

/** 测试注入用：替换进程内网关。 */
export function setModelGateway(gateway: ModelGateway): void {
  cached = gateway;
}
