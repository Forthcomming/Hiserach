import { forbidden } from "@/domain/errors";
import { getRepository } from "@/repository";
import { requireSession } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import { PreferencesSchema, parseBody } from "@/server/schemas";

export const runtime = "nodejs";

/** PATCH /api/sessions/:id/preferences —— 本次停用/启用长期记忆（AC-05）。 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await parseBody(request, PreferencesSchema);
    if (body.sessionId !== id) throw forbidden("会话标识不一致");
    const repo = getRepository();
    await requireSession(repo, id);
    const updated = await repo.setMemoryDisabled(id, body.memoryDisabled);
    return jsonOk({
      sessionId: updated.id,
      memoryDisabled: updated.memoryDisabled,
    });
  } catch (error) {
    return jsonError(error);
  }
}
