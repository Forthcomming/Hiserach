import { notFound } from "@/domain/errors";
import { newId } from "@/lib/ids";
import { getRepository } from "@/repository";
import { requireSession } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import { UndoBodySchema, parseBody } from "@/server/schemas";

export const runtime = "nodejs";

/** POST /api/memory-changes/:id/undo —— 撤销最近一次写入（AC-08）。 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await parseBody(request, UndoBodySchema);
    const repo = getRepository();
    const session = await requireSession(repo, body.sessionId);
    const ok = await repo.undoMemoryWrite(session.userId, id, newId("t"));
    if (!ok) throw notFound("撤销记录不存在或已使用");
    return jsonOk({ undone: true });
  } catch (error) {
    return jsonError(error);
  }
}
