import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentGraph } from "@/agent/graph";
import type { ModelGateway } from "@/agent/model";
import { emptyAgentState } from "@/agent/state";
import { validateAnswerPayload } from "@/agent/validate";
import type { AgentState, AnswerDraft, Persona, StreamEvent, ToolBundle } from "@/domain/types";
import { createMemoryRepository } from "@/repository/memoryRepository";
import type { Repository } from "@/repository/types";

const FIXTURE = resolve(process.cwd(), "data/fixtures.json");
const NOW = new Date("2026-11-12T12:00:00+08:00");

/** 未配置模型：所有模型节点返回 null，链路必须靠确定性理解 + 模板兜底跑通。 */
class NullGateway implements ModelGateway {
  readonly configured = false;
  async understandQuery() { return null; }
  async composeAnswer() { return null; }
  async composeGeneralAdvice() { return null; }
}

function draftFrom(bundle: ToolBundle, overrides: Partial<AnswerDraft> = {}): AnswerDraft {
  return {
    headline: "和你情况相似的人里，先看结论",
    similarAuthorCount: bundle.similarSummary?.authorCount,
    ...(bundle.similarSummary?.recommendRate !== undefined
      ? { similarRecommendRate: bundle.similarSummary.recommendRate }
      : {}),
    quoteIds: bundle.quotes.slice(0, 3).map((q) => q.id),
    reasonIds: bundle.reasons.map((r) => r.reasonId),
    alternativeProductIds: bundle.alternatives.map((p) => p.productId),
    ...overrides,
  };
}

/** 模型正常：只组织文案，如实抄写工具结果里的 ID 与数字。 */
class GoodGateway implements ModelGateway {
  readonly configured = true;
  async understandQuery() { return null; }
  async composeGeneralAdvice({ query }: { query: string }) {
    return { text: `关于「${query}」的通用选购建议：先看需求场景与成分，再小样试用。` };
  }
  async composeAnswer({ bundle }: { bundle: ToolBundle }) {
    return draftFrom(bundle);
  }
}

class FastPathGateway extends GoodGateway {
  readonly deterministicFastPath = true;
  understandCalls = 0;
  composeCalls = 0;
  override async understandQuery() {
    this.understandCalls += 1;
    return null;
  }
  override async composeAnswer({ bundle }: { bundle: ToolBundle }) {
    this.composeCalls += 1;
    return draftFrom(bundle);
  }
}

class FollowupMisclassifyingGateway implements ModelGateway {
  readonly configured = true;
  async understandQuery() {
    return { intent: "unsupported" as const, productIds: [], statedConditions: [] };
  }
  async composeGeneralAdvice() { return null; }
  async composeAnswer({ bundle }: { bundle: ToolBundle }) {
    return draftFrom(bundle);
  }
}

/** 第一次校验失败、第二次通过：验证"重试一次"分支。 */
class RetryThenGoodGateway implements ModelGateway {
  readonly configured = true;
  calls = 0;
  async understandQuery() { return null; }
  async composeGeneralAdvice() { return null; }
  async composeAnswer({ bundle }: { bundle: ToolBundle }) {
    this.calls += 1;
    return this.calls === 1
      ? draftFrom(bundle, { similarAuthorCount: 999 })
      : draftFrom(bundle);
  }
}

/** 连续两次校验失败：验证模板兜底。 */
class AlwaysBadGateway implements ModelGateway {
  readonly configured = true;
  calls = 0;
  async understandQuery() { return null; }
  async composeGeneralAdvice() { return null; }
  async composeAnswer({ bundle }: { bundle: ToolBundle }) {
    this.calls += 1;
    return draftFrom(bundle, { reasonIds: ["fake_reason"] });
  }
}

interface RunArgs {
  repo?: Repository;
  persona?: Persona;
  query: string;
  followupSelection?: Array<{ key: string; value: string }>;
  model?: ModelGateway;
  memoryDisabled?: boolean;
  userId?: string;
  sessionId?: string;
}

async function run(args: RunArgs) {
  const repo = args.repo ?? createMemoryRepository(FIXTURE);
  let userId = args.userId;
  let sessionId = args.sessionId;
  if (!userId || !sessionId) {
    const user = await repo.createUser(args.persona ?? "xiaob");
    const session = await repo.createSession(user.id);
    userId = user.id;
    sessionId = session.id;
  }
  if (args.memoryDisabled) await repo.setMemoryDisabled(sessionId, true);

  const events: StreamEvent[] = [];
  const graph = buildAgentGraph({
    repo,
    model: args.model ?? new NullGateway(),
    emit: (e) => events.push(e),
    now: () => NOW,
  });
  const result = await graph.invoke({
    state: emptyAgentState({
      turnId: `t_${Math.random().toString(36).slice(2)}`,
      userId,
      sessionId,
      query: args.query,
      memoryDisabledForSession: args.memoryDisabled ?? false,
      ...(args.followupSelection ? { followupSelection: args.followupSelection } : {}),
    }),
  });
  return {
    state: (result as { state: AgentState }).state,
    events,
    repo,
    userId,
    sessionId,
  };
}

const nodeNames = (events: StreamEvent[]) =>
  events.filter((e) => e.type === "node.status").map((e) => (e as { node: string }).node);

describe("Agent 状态图端到端链路", () => {
  it("已知商品查询走确定性极速路径，不等待模型理解或润色", async () => {
    const model = new FastPathGateway();
    const { state } = await run({
      persona: "xiaolin",
      query: "DW粉底",
      model,
    });

    expect(model.understandCalls).toBe(0);
    expect(model.composeCalls).toBe(0);
    expect(state.answer?.mode).toBe("similar");
    expect(state.answer?.similarSummary?.authorCount).toBe(6);
  });

  it("AC-03 小林有记忆标准路径：同类人答案、替代品、追踪完整", async () => {
    const { state, events, repo } = await run({
      persona: "xiaolin",
      query: "DW粉底",
      model: new GoodGateway(),
    });
    expect(state.unsupported).toBe(false);
    expect(state.answer?.mode).toBe("similar");
    expect(state.answer?.similarSummary?.authorCount).toBe(6);
    expect(state.answer?.similarSummary?.recommendRate).toBeDefined();
    expect(state.answer?.appliedConditions.find((c) => c.key === "skin_issue")?.source).toBe("memory");
    expect(state.answer?.alternatives.map((p) => p.productId)).toContain("p_alt_foundation");
    expect(state.answer?.disclaimers.join("")).toContain("医生");
    expect(validateAnswerPayload(state.answer!, state.toolResult!).ok).toBe(true);
    expect(state.degraded).toBe(false);

    const names = nodeNames(events);
    expect(names).toContain("run_tools");
    expect(names).toContain("compose_answer");
    expect(names).toContain("validate_answer");
    expect(names).toContain("persist_memory");
    expect(names).toContain("persist_trace");
    expect(names.filter((n) => n === "render_template")).toHaveLength(0);
    expect(events.some((e) => e.type === "answer.delta")).toBe(true);
    expect(events.some((e) => e.type === "memory.changed")).toBe(false);

    const traces = await repo.listTraces(state.turnId);
    expect(traces.length).toBeGreaterThan(5);
    expect(traces.every((t) => t.durationMs >= 0)).toBe(true);
  });

  it("AC-04 小B 冷启动：全站答案 + 追问卡片，不写记忆", async () => {
    const { state, repo, userId } = await run({
      persona: "xiaob",
      query: "婴儿米粉推荐",
      model: new GoodGateway(),
    });
    expect(state.answer?.mode).toBe("global");
    expect(state.answer?.products.map((product) => product.productId)).toEqual([
      "p_rice_02",
      "p_rice_01",
    ]);
    expect(state.answer?.similarSummary?.recommendRate).toBeUndefined();
    expect(state.answer?.followup?.dimensions.map((d) => d.key)).toEqual(
      expect.arrayContaining(["allergy", "diarrhea", "age_month"]),
    );
    expect(await repo.listMemories(userId)).toHaveLength(0);
  });

  it("AC-04 追问点选后写入记忆、返回同类人答案，下次自动读取", async () => {
    const first = await run({
      persona: "xiaob",
      query: "确认",
      followupSelection: [
        { key: "allergy", value: "有过敏" },
        { key: "diarrhea", value: "有腹泻" },
      ],
      model: new GoodGateway(),
    });
    expect(first.state.answer?.mode).toBe("similar");
    expect(first.state.answer?.similarSummary?.authorCount).toBe(5);
    expect(first.state.answer?.products.map((product) => product.productId)).toEqual([
      "p_rice_02",
      "p_rice_01",
    ]);
    const changed = first.events.find((e) => e.type === "memory.changed");
    expect(changed).toBeDefined();
    expect((changed as { undoable: boolean }).undoable).toBe(true);
    const memories = await first.repo.listActiveMemories(first.userId, "baby_food");
    expect(memories.map((m) => m.key).sort()).toEqual(["allergy", "diarrhea"]);

    const second = await run({
      repo: first.repo,
      userId: first.userId,
      sessionId: first.sessionId,
      query: "婴儿米粉推荐",
      model: new GoodGateway(),
    });
    expect(second.state.answer?.appliedConditions.some((c) => c.source === "memory")).toBe(true);
    const events = await second.repo.listMemoryEvents(second.userId);
    expect(events.some((e) => e.action === "used")).toBe(true);
  });

  it("追问卡片使用受控意图，不受模型误判影响", async () => {
    const { state } = await run({
      persona: "xiaob",
      query: "补充条件：有过敏、有腹泻、7个月",
      followupSelection: [
        { key: "allergy", value: "有过敏" },
        { key: "diarrhea", value: "有腹泻" },
        { key: "age_month", value: "7个月" },
      ],
      model: new FollowupMisclassifyingGateway(),
    });
    expect(state.unsupported).toBe(false);
    expect(state.answer?.products).toHaveLength(2);
  });

  it("AC-02 超范围查询：闲聊气泡建议，不调用统计工具、不写记忆", async () => {
    const { state, repo, userId } = await run({
      persona: "xiaolin",
      query: "给我推荐一款手机",
      model: new GoodGateway(),
    });
    expect(state.unsupported).toBe(true);
    expect(state.toolResult).toBeUndefined();
    expect(state.answer?.mode).toBe("general");
    expect(state.answer?.adviceText).toContain("手机");
    expect(state.answer?.notice).toBeUndefined();
    expect(state.answer?.products).toEqual([]);
    expect(state.answer?.globalSummary.recommendRate).toBe(0);
    expect(await repo.listMemories(userId)).toHaveLength(2); // 仅预置记忆，无新增
    const nodes = nodeNames(awaitTraceEvents(state));
    expect(nodes).not.toContain("run_tools");
    expect(nodes).toContain("build_general_answer");
  });

  it("问候语闲聊：固定气泡回复，不跑模型与统计工具", async () => {
    const { state } = await run({
      persona: "xiaolin",
      query: "你好",
      model: new GoodGateway(),
    });
    expect(state.unsupported).toBe(true);
    expect(state.answer?.mode).toBe("general");
    expect(state.answer?.adviceText).toBe("你好呀，有什么想聊的或者需要帮忙的，随时说～");
    expect(state.answer?.notice).toBeUndefined();
    expect(nodeNames(awaitTraceEvents(state))).not.toContain("run_tools");
  });

  it("会话 Continuity：上轮 DW 后「那混油皮呢」继承品类并抽取肤质", async () => {
    const first = await run({
      persona: "xiaolin",
      query: "DW粉底",
      model: new GoodGateway(),
    });
    expect(first.state.answer?.mode).toBe("similar");

    const second = await run({
      repo: first.repo,
      userId: first.userId,
      sessionId: first.sessionId,
      query: "那混油皮呢",
      model: new GoodGateway(),
    });
    expect(second.state.unsupported).toBe(false);
    expect(second.state.queryUnderstanding?.category).toBe("beauty");
    expect(second.state.queryUnderstanding?.productIds).toContain("p_dw_foundation");
    expect(
      second.state.queryUnderstanding?.statedConditions.some(
        (c) => c.key === "skin_type" && c.value === "混油",
      ),
    ).toBe(true);
  });

  it("会话 Continuity：上轮后「替代那款呢」继承产品并走工具链", async () => {
    const first = await run({
      persona: "xiaolin",
      query: "DW粉底",
      model: new GoodGateway(),
    });
    const second = await run({
      repo: first.repo,
      userId: first.userId,
      sessionId: first.sessionId,
      query: "替代那款呢",
      model: new GoodGateway(),
    });
    expect(second.state.unsupported).toBe(false);
    expect(second.state.queryUnderstanding?.productIds).toContain("p_dw_foundation");
    expect(second.state.toolResult).toBeDefined();
    expect(second.state.answer?.alternatives.map((p) => p.productId)).toContain(
      "p_alt_foundation",
    );
  });

  it("会话 Continuity：米粉补充条件无需前端拼接前缀", async () => {
    const first = await run({
      persona: "xiaob",
      query: "婴儿米粉推荐",
      model: new GoodGateway(),
    });
    const second = await run({
      repo: first.repo,
      userId: first.userId,
      sessionId: first.sessionId,
      query: "宝宝7个月，吃蛋黄过敏过",
      model: new GoodGateway(),
    });
    expect(second.state.unsupported).toBe(false);
    expect(second.state.queryUnderstanding?.category).toBe("baby_food");
    expect(
      second.state.queryUnderstanding?.statedConditions.some((c) => c.key === "allergy"),
    ).toBe(true);
  });

  it("AC-06 小样本：不出比例、全站结论优先、原话仍可见", async () => {
    const { state } = await run({
      persona: "xiaolin",
      query: "DW粉底",
      model: new GoodGateway(),
    });
    // 通过直接构造同一工具结果的小样本场景在 tools.test.ts 覆盖；
    // 此处确认答案结构与门槛一致
    expect(state.answer?.globalSummary.authorCount).toBe(10);
    expect(state.answer?.datasetNote).toContain("条内容");
  });

  it("AC-10 模型失败/未配置：模板兜底，答案数字仍与工具结果一致", async () => {
    const { state, events } = await run({ persona: "xiaolin", query: "DW粉底" });
    expect(state.degraded).toBe(true);
    expect(state.fallbackReason).toBe("model_error");
    expect(state.answer).toBeDefined();
    expect(validateAnswerPayload(state.answer!, state.toolResult!).ok).toBe(true);
    expect(state.answer?.alternatives.length).toBeGreaterThan(0);
    expect(nodeNames(events)).toContain("render_template");
    expect(nodeNames(events)).toContain("persist_memory");
  });

  it("AC-10 首次校验失败重试一次后通过，不得重新计算人数", async () => {
    const gateway = new RetryThenGoodGateway();
    const { state, events } = await run({
      persona: "xiaolin",
      query: "DW粉底",
      model: gateway,
    });
    expect(gateway.calls).toBe(2);
    expect(state.degraded).toBe(false);
    expect(state.answer?.similarSummary?.authorCount).toBe(6);
    expect(nodeNames(events).filter((n) => n === "compose_answer")).toHaveLength(2);
    expect(nodeNames(events)).not.toContain("render_template");
  });

  it("AC-10 重试仍失败 → 模板答案，降级状态与追踪照常完成", async () => {
    const gateway = new AlwaysBadGateway();
    const { state, events } = await run({
      persona: "xiaolin",
      query: "DW粉底",
      model: gateway,
    });
    expect(gateway.calls).toBe(2);
    expect(state.degraded).toBe(true);
    expect(state.fallbackReason).toBe("validation_failed");
    expect(validateAnswerPayload(state.answer!, state.toolResult!).ok).toBe(true);
    expect(nodeNames(events)).toContain("render_template");
    expect(nodeNames(events)).toContain("persist_trace");
  });

  it("AC-05 本次停用只屏蔽读取，数据库中的 active 条目不被删除", async () => {
    const { state, repo, userId } = await run({
      persona: "xiaolin",
      query: "DW粉底",
      memoryDisabled: true,
      model: new GoodGateway(),
    });
    expect(state.answer?.appliedConditions.some((c) => c.source === "memory")).toBe(false);
    expect(state.answer?.mode).toBe("global");
    expect(await repo.listActiveMemories(userId)).toHaveLength(2);
    const events = await repo.listMemoryEvents(userId);
    expect(events.some((e) => e.action === "disabled_for_session")).toBe(true);
  });
});

/** 把 state.trace 转成与 SSE 一致的 node.status 事件形状，便于断言。 */
function awaitTraceEvents(state: AgentState): StreamEvent[] {
  return state.trace.map((t) => ({
    type: "node.status" as const,
    node: t.node,
    status: t.status,
    durationMs: t.durationMs,
  }));
}
