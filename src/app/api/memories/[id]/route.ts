import { findDimension } from "@/domain/categories";
import { validateConditionInput } from "@/domain/conditions";
import { badRequest } from "@/domain/errors";
import { newId } from "@/lib/ids";
import { getRepository } from "@/repository";
import { requireOwnedMemory, requireSession } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import {
  MemoryPatchSchema,
  SessionQuerySchema,
  parseBody,
  parseQuery,
} from "@/server/schemas";

export const runtime = "nodejs";

/** PATCH /api/memories/:id —— 修改条件：新建条目取代旧条目（AC-08）。 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await parseBody(request, MemoryPatchSchema);
    const repo = getRepository();
    const session = await requireSession(repo, body.sessionId);
    const memory = await requireOwnedMemory(repo, session, id);

    const normalized = validateConditionInput(
      memory.category,
      { key: memory.key, value: body.value, source: "user_input" },
      new Date(),
    );
    if (!normalized) throw badRequest("条件值不在当前品类词表内");

    const turnId = newId("t");
    const result = await repo.updateMemory(
      session.userId,
      id,
      {
        value: normalized.value,
        isCore: findDimension(memory.category, memory.key)?.core ?? memory.isCore,
        source: { channel: "user_input", turnId, query: "记忆管理页修改" },
      },
      turnId,
    );
    return jsonOk({
      active: result.created.map((m) => m.id),
      superseded: result.supersededIds,
      undoable: result.undoable,
      ...(result.undoToken ? { undoToken: result.undoToken } : {}),
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** DELETE /api/memories/:id —— 用户删除：软删除、值清除、缓存失效。 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { sessionId } = parseQuery(new URL(request.url), SessionQuerySchema);
    const repo = getRepository();
    const session = await requireSession(repo, sessionId);
    await requireOwnedMemory(repo, session, id);
    await repo.deleteMemory(session.userId, id, newId("t"));
    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
