import { forbidden, notFound } from "@/domain/errors";
import type { MemoryItem, Session } from "@/domain/types";
import type { Repository } from "@/repository/types";

/** 所有写/读接口都必须先确认资源属于当前匿名会话（规格 6 / 11）。 */
export async function requireSession(
  repo: Repository,
  sessionId: string,
): Promise<Session> {
  const session = await repo.getSession(sessionId);
  if (!session) throw notFound("会话不存在");
  return session;
}

export async function requireOwnedMemory(
  repo: Repository,
  session: Session,
  memoryId: string,
): Promise<MemoryItem> {
  const memory = await repo.getMemory(session.userId, memoryId);
  if (!memory) throw notFound("条件不存在");
  return memory;
}

/** 追踪按 turnId 查询，必须确认该 turn 属于当前会话，避免跨身份读取。 */
export async function requireTurnOwner(
  repo: Repository,
  session: Session,
  turnId: string,
): Promise<void> {
  const messages = await repo.listMessages(session.id);
  if (!messages.some((m) => m.turnId === turnId)) {
    throw forbidden("无权查看该轮追踪");
  }
}
