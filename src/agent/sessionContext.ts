import type {
  AgentState,
  Category,
  SessionContext,
  SessionTurnSnapshot,
} from "@/domain/types";
import type { Repository } from "@/repository/types";

/** 空会话 Context：无上轮摘要时可安全注入理解器。 */
export function emptySessionContext(): SessionContext {
  return {
    productIds: [],
    conditionSummary: [],
    recentTurnSummaries: [],
  };
}

/** 从持久化快照组装本轮 SessionContext（最小：最近 1 轮）。 */
export function sessionContextFromSnapshot(
  snapshot: SessionTurnSnapshot | null,
): SessionContext {
  if (!snapshot) return emptySessionContext();
  return {
    ...(snapshot.category ? { category: snapshot.category } : {}),
    productIds: [...snapshot.productIds],
    conditionSummary: snapshot.conditions.map((c) => ({ ...c })),
    lastTurnId: snapshot.turnId,
    recentTurnSummaries: [
      {
        turnId: snapshot.turnId,
        query: snapshot.query,
        intent: snapshot.intent,
      },
    ],
  };
}

/**
 * 二期 Context 组装器预留入口。
 * 本轮只返回会话层摘要；用户记忆 / 证据 Context 仍由既有节点合并。
 * 冲突询问、品类挂起恢复、6 轮截断等不在本期实现。
 */
export function assembleContextPacket(args: {
  sessionContext: SessionContext;
}): { session_context: SessionContext; degrade: null } {
  return {
    session_context: args.sessionContext,
    degrade: null,
  };
}

/** 从本轮 AgentState 写出可恢复快照（仅 supported 或带品类的续聊有意义）。 */
export function snapshotFromState(s: AgentState): SessionTurnSnapshot | null {
  const u = s.queryUnderstanding;
  if (!u) return null;
  const category = u.category;
  const productIds =
    u.productIds.length > 0
      ? u.productIds
      : (s.sessionContext?.productIds ?? []);
  if (!category && productIds.length === 0) {
    // 纯超范围通用答：不覆盖已有会话品类快照
    return null;
  }
  const conditions =
    s.workingConditions.length > 0
      ? s.workingConditions.map((c) => ({
          key: c.key,
          value: c.valueLabel,
        }))
      : (s.sessionContext?.conditionSummary ?? []);
  return {
    turnId: s.turnId,
    query: s.query,
    intent: u.intent,
    ...(category ? { category } : {}),
    productIds,
    conditions,
  };
}

export async function loadSessionContext(
  repo: Repository,
  sessionId: string,
): Promise<SessionContext> {
  const snapshot = await repo.getSessionTurnSnapshot(sessionId);
  return sessionContextFromSnapshot(snapshot);
}

export function sessionHintText(ctx: SessionContext | undefined): string {
  if (!ctx?.category && !ctx?.productIds.length) return "";
  const parts: string[] = [];
  if (ctx.category) parts.push(`品类=${ctx.category}`);
  if (ctx.productIds.length) parts.push(`产品=${ctx.productIds.join(",")}`);
  if (ctx.conditionSummary.length) {
    parts.push(
      `条件=${ctx.conditionSummary.map((c) => `${c.key}:${c.value}`).join("、")}`,
    );
  }
  return parts.join("; ");
}

export function hasSessionContinuity(ctx: SessionContext | undefined): boolean {
  return Boolean(ctx?.category && ctx.productIds.length > 0);
}

export type { Category };
