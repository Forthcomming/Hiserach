import { findDimension } from "@/domain/categories";
import { mergeWorkingConditions, validateConditionInput } from "@/domain/conditions";
import type {
  AgentState,
  AppliedCondition,
  Category,
  QueryUnderstanding,
  StreamEvent,
  ToolBundle,
  TraceStatus,
  WorkingCondition,
} from "@/domain/types";
import { newId, nowIso } from "@/lib/ids";
import { serverEnv } from "@/lib/env";
import type { Repository } from "@/repository/types";
import { runTools } from "@/tools/runTools";
import { decideMemoryPlan, memoryChangeSummary } from "@/memory/decide";
import type { ModelGateway } from "./model";
import { productVocabulary, understandQueryDeterministic } from "./understand";
import { assembleAnswer, validateAnswerDraft, validateAnswerPayload } from "./validate";
import { renderTemplateAnswer, templateHeadline, unsupportedAnswer } from "./template";
import { recordNode, safeSummary, type AgentContext } from "./trace";
import type { GraphState } from "./state";

export interface GraphContext extends AgentContext {
  repo: Repository;
  model: ModelGateway;
}

type Patch = Partial<AgentState>;
type NodeResult = { state: AgentState };

function finish(
  ctx: GraphContext,
  s: AgentState,
  patch: Patch,
  node: string,
  started: number,
  status: TraceStatus = "success",
  input?: string,
  output?: string,
): NodeResult {
  const t = recordNode(ctx, node, status, Date.now() - started, input, output);
  return { state: { ...s, ...patch, trace: [...s.trace, t] } };
}

function appliedConditionsOf(s: AgentState): AppliedCondition[] {
  return s.workingConditions.map((c) => ({
    key: c.key,
    label: c.label,
    valueLabel: c.valueLabel,
    source: c.source,
    ...(c.memoryId ? { memoryId: c.memoryId } : {}),
  }));
}

function categoryOf(s: AgentState): Category {
  return s.queryUnderstanding!.category!;
}

async function computeBundle(ctx: GraphContext, s: AgentState): Promise<ToolBundle> {
  const category = categoryOf(s);
  const [products, records] = await Promise.all([
    ctx.repo.listProducts(category),
    ctx.repo.listExperiences({ category }),
  ]);
  const bundle = runTools({
    category,
    productIds: s.queryUnderstanding!.productIds,
    conditions: s.workingConditions,
    records,
    products,
  });
  if (serverEnv.dataBackend === "memory") {
    bundle.datasetNote = `本地联调夹具：基于 ${records.length} 条内容（模拟记录，非真实用户评价）`;
  }
  return bundle;
}

function emitDelta(ctx: GraphContext, text: string): void {
  ctx.emit({ type: "answer.delta", text });
}

interface NodeOptions {
  statusOf?: (s: AgentState, patch: Patch) => TraceStatus;
  /** 入参与结果摘要：脱敏、截断，不含健康/母婴原始输入（规格 4.4 / 11 / AC-09）。 */
  summaryOf?: (s: AgentState, patch: Patch) => { input?: string; output?: string };
}

export function makeNodes(ctx: GraphContext) {
  const node = (
    name: string,
    handler: (s: AgentState) => Promise<Patch> | Patch,
    options: NodeOptions = {},
  ) => async (graphState: GraphState): Promise<NodeResult> => {
    const s = graphState.state;
    const started = Date.now();
    try {
      const patch = await handler(s);
      const status = options.statusOf?.(s, patch) ?? "success";
      const summary = options.summaryOf?.(s, patch);
      return finish(ctx, s, patch, name, started, status, summary?.input, summary?.output);
    } catch (error) {
      // 节点失败不抛出：写入失败状态并继续走降级链路（规格 4.2 / 12.2）
      const message = error instanceof Error ? error.message : "unknown";
      return finish(
        ctx,
        s,
        { degraded: true, composeFailed: true, fallbackReason: "model_error" },
        name,
        started,
        "failed",
        undefined,
        `node_error:${message.slice(0, 60)}`,
      );
    }
  };

  return {
    /** ① 只输出受控 QueryUnderstanding，不生成答案。 */
    understand_query: node(
      "understand_query",
      async (s) => {
        const products = await ctx.repo.listProducts();
        let understanding: QueryUnderstanding | null = null;
        if (ctx.model.configured) {
          understanding = await ctx.model.understandQuery({
            query: s.query,
            products: productVocabulary(products),
          });
        }
        if (!understanding) {
          understanding = understandQueryDeterministic({
            query: s.query,
            followupSelection: s.followupSelection,
          });
        }

        // 规则校验优先于模型建议：模型不能突破品类词表、产品 ID 或条件来源限制
        const category = understanding.category;
        if (category && understanding.intent === "supported") {
          understanding.statedConditions = understanding.statedConditions.filter(
            (c) =>
              Boolean(findDimension(category, c.key)) &&
              validateConditionInput(category, c, ctx.now()) !== null,
          );
          understanding.productIds = understanding.productIds.filter((id) =>
            products.some((p) => p.id === id && p.category === category),
          );
          if (understanding.productIds.length === 0) {
            understanding.intent = "unsupported";
          }
        }
        const unsupported = understanding.intent !== "supported";
        return {
          queryUnderstanding: understanding,
          unsupported,
          ...(unsupported ? { workingConditions: [] as WorkingCondition[] } : {}),
        };
      },
      {
        summaryOf: (s, patch) => ({
          // 超范围查询不记录不必要的敏感输入摘要（规格 7.3）
          input: patch.unsupported ? undefined : safeSummary(`query_len=${s.query.length}`),
          output: `intent=${patch.queryUnderstanding?.intent}; category=${
            patch.queryUnderstanding?.category ?? "-"
          }; conditions=${patch.queryUnderstanding?.statedConditions.length ?? 0}`,
        }),
      },
    ),

    /** ② 确定性：读取记忆、合并工作条件、应用"本次不按我的条件"。 */
    load_memory: node(
      "load_memory",
      async (s) => {
        if (s.unsupported || !s.queryUnderstanding?.category) {
          return { loadedMemories: [], workingConditions: [], usedMemoryIds: [] };
        }
        const category = s.queryUnderstanding.category;
        const memories = await ctx.repo.listActiveMemories(s.userId, category);
        const merged = mergeWorkingConditions({
          category,
          memories,
          stated: s.queryUnderstanding.statedConditions,
          memoryDisabled: s.memoryDisabledForSession,
          now: ctx.now(),
        });
        return {
          loadedMemories: memories,
          workingConditions: merged.conditions,
          usedMemoryIds: merged.usedMemoryIds,
        };
      },
      {
        statusOf: (_s, patch) => (patch.workingConditions?.length ? "success" : "skipped"),
        summaryOf: (_s, patch) => ({
          output: `memories=${patch.loadedMemories?.length ?? 0}; working=${
            patch.workingConditions?.length ?? 0
          }; core=${patch.workingConditions?.filter((c) => c.isCore).length ?? 0}; used=${
            patch.usedMemoryIds?.length ?? 0
          }`,
        }),
      },
    ),

    /** ③ 确定性：缺核心条件或超范围时走全站答案分支。 */
    decide_followup: node(
      "decide_followup",
      () => ({}),
      {
        summaryOf: (s) => ({ output: `route=${routeAfterFollowup(s)}` }),
      },
    ),

    /** 缺核心条件 / 超范围：全站答案 + 追问卡片，或受限提示。 */
    build_global_answer: node(
      "build_global_answer",
      async (s) => {
        if (s.unsupported) {
          const answer = unsupportedAnswer({ turnId: s.turnId });
          emitDelta(ctx, answer.notice!.text);
          return { answer };
        }
        const bundle = await computeBundle(ctx, s);
        const answer = assembleAnswer({
          bundle,
          category: categoryOf(s),
          turnId: s.turnId,
          appliedConditions: appliedConditionsOf(s),
        });
        emitDelta(ctx, templateHeadline(bundle));
        return { toolResult: bundle, answer };
      },
      {
        summaryOf: (_s, patch) => ({
          output: patch.answer?.notice
            ? "unsupported_notice"
            : `mode=${patch.answer?.mode}; global_authors=${patch.answer?.globalSummary.authorCount}`,
        }),
      },
    ),

    /** ④ 五个确定性工具一次性算完全部事实。 */
    run_tools: node(
      "run_tools",
      async (s) => ({ toolResult: await computeBundle(ctx, s) }),
      {
        summaryOf: (s, patch) => ({
          input: `productIds=${s.queryUnderstanding?.productIds.join(",")}; conditions=${
            s.workingConditions.length
          }; core=${s.workingConditions.filter((c) => c.isCore).length}`,
          output: `similar=${patch.toolResult?.similarSummary?.authorCount ?? 0}; global=${
            patch.toolResult?.globalSummary.authorCount ?? 0
          }; reasons=${patch.toolResult?.reasons.length ?? 0}; alternatives=${
            patch.toolResult?.alternatives.length ?? 0
          }; quotes=${patch.toolResult?.quotes.length ?? 0}`,
        }),
      },
    ),

    /** ⑤ 模型只组织文案并声明引用；失败返回空草稿，进入校验失败分支。 */
    compose_answer: node(
      "compose_answer",
      async (s) => {
        const bundle = s.toolResult!;
        const conditionsText = s.workingConditions
          .map((c) => `${c.label}=${c.valueLabel}`)
          .join("、");
        const draft = await ctx.model.composeAnswer({ bundle, conditionsText });
        if (!draft) {
          return {
            answerDraft: undefined,
            composeFailed: true,
            fallbackReason: "model_error",
          };
        }
        emitDelta(ctx, draft.headline);
        return { answerDraft: draft, composeFailed: false };
      },
      {
        summaryOf: (_s, patch) => ({
          output: patch.answerDraft
            ? `draft=true; quoteRefs=${patch.answerDraft.quoteIds.length}`
            : "draft=false; fallback_to_template",
        }),
      },
    ),

    /** ⑥ 一致性校验：数字与引用逐项比对；失败重试一次，仍失败走模板。 */
    validate_answer: node(
      "validate_answer",
      (s) => {
        const bundle = s.toolResult!;
        const check = validateAnswerDraft(s.answerDraft, bundle);
        if (!check.ok) {
          return {
            validationErrors: check.errors,
            retryCount: s.retryCount + 1,
            ...(!s.answerDraft ? { fallbackReason: "model_error" as const } : {}),
          };
        }
        const answer = assembleAnswer({
          bundle,
          category: categoryOf(s),
          turnId: s.turnId,
          appliedConditions: appliedConditionsOf(s),
        });
        const payloadCheck = validateAnswerPayload(answer, bundle);
        if (!payloadCheck.ok) {
          return {
            validationErrors: payloadCheck.errors,
            retryCount: s.retryCount + 1,
          };
        }
        return { answer, validationErrors: [] };
      },
      {
        summaryOf: (_s, patch) => ({
          output: patch.answer
            ? `ok=true; mode=${patch.answer.mode}`
            : `ok=false; errors=${patch.validationErrors?.join("|") ?? ""}`,
        }),
      },
    ),

    /** 模板兜底：事实仍全部来自同一份工具结果。 */
    render_template: node(
      "render_template",
      (s) => {
        const bundle = s.toolResult!;
        const answer = renderTemplateAnswer({
          bundle,
          category: categoryOf(s),
          turnId: s.turnId,
          appliedConditions: appliedConditionsOf(s),
        });
        emitDelta(ctx, templateHeadline(bundle));
        return {
          answer,
          degraded: true,
          fallbackReason: s.fallbackReason ?? "validation_failed",
        };
      },
      {
        statusOf: () => "degraded",
        summaryOf: (_s, patch) => ({ output: `degraded=true; mode=${patch.answer?.mode}` }),
      },
    ),

    /** ⑦ 先规则校验再落库；Agent 无权删除记忆。 */
    persist_memory: node(
      "persist_memory",
      async (s) => {
        const emptyMutation = {
          created: [],
          supersededIds: [],
          usedIds: [],
          undoable: false,
          summary: "",
        };
        if (s.unsupported) return { memoryMutation: emptyMutation };

        const category = categoryOf(s);
        const plan = decideMemoryPlan({
          userId: s.userId,
          turnId: s.turnId,
          category,
          query: s.query,
          statedConditions: s.queryUnderstanding!.statedConditions,
          activeMemories: s.loadedMemories,
          // used 事件统一在 persist_trace 追加，避免重复
          usedIds: [],
          memoryDisabled: s.memoryDisabledForSession,
          unsupported: false,
          now: ctx.now(),
        });
        if (!plan) return { memoryMutation: emptyMutation };

        const result = await ctx.repo.applyMemoryWrite(plan);
        const mutation = {
          created: result.created,
          supersededIds: result.supersededIds,
          usedIds: s.usedMemoryIds,
          ...(result.undoToken ? { undoToken: result.undoToken } : {}),
          undoable: result.undoable,
          summary: result.undoable ? memoryChangeSummary(result.created) : "",
        };
        if (result.undoable) {
          const event: StreamEvent = {
            type: "memory.changed",
            summary: mutation.summary,
            undoable: true,
            ...(result.undoToken ? { undoToken: result.undoToken } : {}),
          };
          ctx.emit(event);
        }
        return { memoryMutation: mutation };
      },
      {
        summaryOf: (_s, patch) => ({
          output: `created=${patch.memoryMutation?.created.length ?? 0}; superseded=${
            patch.memoryMutation?.supersededIds.length ?? 0
          }; undoable=${patch.memoryMutation?.undoable ?? false}`,
        }),
      },
    ),

    /** ⑧ 落追踪、used 事件与可重放对话；所有分支的必经终点。 */
    persist_trace: async (graphState: GraphState): Promise<NodeResult> => {
      const s = graphState.state;
      const started = Date.now();

      // 实际采用的记忆追加 used 事件（规格 3.4），只追加不修改
      if (s.usedMemoryIds.length > 0) {
        await ctx.repo.appendMemoryEvents(
          s.usedMemoryIds.map((id) => ({
            id: newId("me"),
            memoryId: id,
            action: "used" as const,
            turnId: s.turnId,
            reason: "本轮工作记忆实际采用",
            at: nowIso(),
          })),
        );
      }

      // 可重放对话：user 原文与 assistant 摘要（生产环境应按敏感信息处理）
      await ctx.repo.appendMessage({
        id: newId("msg"),
        sessionId: s.sessionId,
        turnId: s.turnId,
        role: "user",
        content: s.query,
        createdAt: nowIso(),
      });
      await ctx.repo.appendMessage({
        id: newId("msg"),
        sessionId: s.sessionId,
        turnId: s.turnId,
        role: "assistant",
        content:
          s.answer?.notice?.text ??
          (s.toolResult ? templateHeadline(s.toolResult) : "Demo 目前只覆盖以下查询"),
        createdAt: nowIso(),
      });

      const t = recordNode(
        ctx,
        "persist_trace",
        "success",
        Date.now() - started,
        undefined,
        `nodes=${s.trace.length + 1}`,
      );
      await ctx.repo.appendTraces(s.turnId, [...s.trace, t]);
      return { state: { ...s, trace: [...s.trace, t] } };
    },
  };
}

/** 条件边：是否进入工具链路。 */
export function routeAfterFollowup(s: AgentState): "global" | "tools" {
  if (s.unsupported) return "global";
  return s.workingConditions.some((c) => c.isCore) ? "tools" : "global";
}

/** 条件边：校验通过 → 写记忆；模型失败/重试耗尽 → 模板；否则重试一次。 */
export function routeAfterValidation(s: AgentState): "pass" | "retry" | "template" {
  if (s.answer) return "pass";
  if (s.composeFailed || s.fallbackReason === "model_error") return "template";
  // 第一次校验失败时 retryCount=1 → 重试一次；第二次仍失败 → 模板兜底
  if (s.retryCount >= 2) return "template";
  return "retry";
}
