import { getRepository } from "@/repository";
import { requireSession, requireTurnOwner } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import { SessionQuerySchema, parseQuery } from "@/server/schemas";

export const runtime = "nodejs";

/** GET /api/turns/:id/trace —— 展开 Agent 过程（AC-09）。 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { sessionId } = parseQuery(new URL(request.url), SessionQuerySchema);
    const repo = getRepository();
    const session = await requireSession(repo, sessionId);
    await requireTurnOwner(repo, session, id);
    const nodes = await repo.listTraces(id);
    return jsonOk({
      turnId: id,
      nodes: nodes.map((n) => ({
        node: n.node,
        status: n.status,
        durationMs: n.durationMs,
        inputSummary: n.inputSummary ?? null,
        outputSummary: n.outputSummary ?? null,
        at: n.at,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
