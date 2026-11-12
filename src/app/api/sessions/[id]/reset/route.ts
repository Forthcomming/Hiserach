import { notFound } from "@/domain/errors";
import { getRepository } from "@/repository";
import { requireSession } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";

export const runtime = "nodejs";

/** DELETE /api/sessions/:id/reset —— 清空并按 persona 恢复初始状态（AC-01）。 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const repo = getRepository();
    const session = await requireSession(repo, id);
    const user = await repo.getUser(session.userId);
    if (!user) throw notFound("身份不存在");

    await repo.resetUser(session.userId, user.persona);
    // 重置会清除该身份下的会话，返回一个新的匿名会话 ID 供前端继续
    const fresh = await repo.createSession(session.userId);
    const memories = await repo.listActiveMemories(session.userId);
    return jsonOk({
      sessionId: fresh.id,
      persona: user.persona,
      presetMemoryCount: memories.length,
      reset: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}
