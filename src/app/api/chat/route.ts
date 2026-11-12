import type { NextRequest } from "next/server";
import { buildAgentGraph } from "@/agent/graph";
import { getModelGateway } from "@/agent/model";
import { emptyAgentState } from "@/agent/state";
import type { AgentState } from "@/domain/types";
import { newId } from "@/lib/ids";
import { getRepository } from "@/repository";
import { requireSession } from "@/server/auth";
import { clientIp, jsonError } from "@/server/http";
import { checkChatRateLimit } from "@/server/ratelimit";
import { ChatSchema, parseBody } from "@/server/schemas";
import { sseResponse } from "@/server/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/chat —— 发起搜索或追问，返回 SSE 事件流（规格 4.4 / 6）。 */
export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, ChatSchema);
    const repo = getRepository();
    const session = await requireSession(repo, body.sessionId);
    checkChatRateLimit(session.id, clientIp(request));

    return sseResponse(async (emit) => {
      const turnId = newId("t");
      emit({ type: "turn.started", turnId });

      const graph = buildAgentGraph({
        repo,
        model: getModelGateway(),
        emit,
        now: () => new Date(),
      });

      const result = await graph.invoke({
        state: emptyAgentState({
          turnId,
          userId: session.userId,
          sessionId: session.id,
          query: body.message,
          memoryDisabledForSession: session.memoryDisabled,
          ...(body.followupSelection ? { followupSelection: body.followupSelection } : {}),
        }),
      });
      const state = (result as { state: AgentState }).state;
      if (!state.answer) throw new Error("answer_missing");

      // 事实字段只在 answer.data 下发；answer.delta 不单独成为最终事实 UI
      emit({ type: "answer.data", answer: state.answer });
      emit({
        type: "turn.completed",
        status: state.degraded ? "degraded" : "success",
        degraded: state.degraded,
      });
    });
  } catch (error) {
    return jsonError(error);
  }
}
