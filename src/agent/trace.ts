import { nowIso } from "@/lib/ids";
import type { AgentState, StreamEvent, TraceStatus } from "@/domain/types";

/** 节点内注入的运行时上下文；不进入 AgentState，避免被序列化下发。 */
export interface AgentContext {
  emit: (event: StreamEvent) => void;
  now: () => Date;
}

/** 每个节点无论成功、失败或降级都写入耗时和状态（规格 4.2 / 12.1）。 */
export function recordNode(
  ctx: AgentContext,
  node: string,
  status: TraceStatus,
  durationMs: number,
  inputSummary?: string,
  outputSummary?: string,
) {
  const trace = {
    node,
    status,
    durationMs,
    ...(inputSummary ? { inputSummary: inputSummary.slice(0, 200) } : {}),
    ...(outputSummary ? { outputSummary: outputSummary.slice(0, 200) } : {}),
    at: nowIso(),
  };
  ctx.emit({ type: "node.status", node, status, durationMs });
  return trace;
}

/** 脱敏摘要：健康/母婴条件不落原始完整输入（规格 11）。 */
export function safeSummary(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const trimmed = text.replace(/\s+/g, " ").slice(0, 80);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function appendTrace(state: AgentState, node: ReturnType<typeof recordNode>) {
  return [...state.trace, node];
}
