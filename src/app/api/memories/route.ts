import type { Category, MemoryItem } from "@/domain/types";
import { getRepository } from "@/repository";
import { requireSession } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import { SessionQuerySchema, parseQuery } from "@/server/schemas";

export const runtime = "nodejs";

/** 删除过的条目不再下发条件值（规格 11 / AC-08）。 */
function serialize(m: MemoryItem) {
  return {
    id: m.id,
    category: m.category,
    key: m.key,
    isCore: m.isCore,
    status: m.status,
    createdAt: m.createdAt,
    supersedes: m.supersedes ?? null,
    source: m.source,
    ...(m.status === "deleted" ? {} : { value: m.value }),
  };
}

/** GET /api/memories —— 按品类分组的条目与操作记录（P5 / AC-08）。 */
export async function GET(request: Request) {
  try {
    const { sessionId } = parseQuery(new URL(request.url), SessionQuerySchema);
    const repo = getRepository();
    const session = await requireSession(repo, sessionId);
    const [memories, events] = await Promise.all([
      repo.listMemories(session.userId),
      repo.listMemoryEvents(session.userId),
    ]);

    const categories: Category[] = ["beauty", "baby_food"];
    const groups = categories.map((category) => ({
      category,
      active: memories
        .filter((m) => m.category === category && m.status === "active")
        .map(serialize),
      history: memories
        .filter((m) => m.category === category && m.status !== "active")
        .map(serialize),
    }));

    return jsonOk({
      groups,
      events: events.map((e) => ({
        id: e.id,
        memoryId: e.memoryId,
        action: e.action,
        turnId: e.turnId ?? null,
        reason: e.reason ?? null,
        at: e.at,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
