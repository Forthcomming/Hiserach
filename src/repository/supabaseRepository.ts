import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sanitizeSourceUrl, serverEnv } from "@/lib/env";
import { newAnonId, newId, nowIso } from "@/lib/ids";
import type {
  AnonymousUser,
  Category,
  ConditionValue,
  ExperienceRecord,
  MemoryEvent,
  MemoryItem,
  MemorySource,
  MessageRow,
  Persona,
  Product,
  Session,
  SessionTurnSnapshot,
  TraceNode,
  TraceRow,
} from "@/domain/types";
import type { MemoryWritePlan, MemoryWriteResult, Repository } from "./types";

type Row = Record<string, unknown>;

/** 进程内兜底：迁移未上线或列缺失时仍可 Continuity（同进程内）。 */
const turnSnapshotFallback = new Map<string, SessionTurnSnapshot>();

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!client) {
    client = createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  // 不带 select 的写操作 data 为 null，调用方不消费返回值；此处仅统一做错误检查。
  return result.data as T;
}

const toUser = (r: Row): AnonymousUser => ({
  id: String(r.id),
  persona: r.persona as Persona,
  createdAt: String(r.created_at),
});
const toSession = (r: Row): Session => ({
  id: String(r.id),
  userId: String(r.user_id),
  memoryDisabled: Boolean(r.memory_disabled),
  createdAt: String(r.created_at),
});
const toProduct = (r: Row): Product => ({
  id: String(r.id),
  category: r.category as Category,
  name: String(r.name),
  ...(r.image_url ? { imageUrl: String(r.image_url) } : {}),
});
const toExperience = (r: Row): ExperienceRecord => ({
  id: String(r.id),
  authorId: String(r.author_id),
  productId: String(r.product_id),
  stance: r.stance as ExperienceRecord["stance"],
  authorConditions: (r.author_conditions ?? {}) as Record<string, string | number>,
  reasons: (r.reasons ?? []) as ExperienceRecord["reasons"],
  quote: String(r.quote),
  ...(r.source_text ? { sourceText: String(r.source_text) } : {}),
  sourceType: r.source_type as ExperienceRecord["sourceType"],
  sourceUrl: sanitizeSourceUrl(r.source_url ? String(r.source_url) : undefined),
  publishedAt: String(r.published_at),
});
const toMemory = (r: Row): MemoryItem => ({
  id: String(r.id),
  userId: String(r.user_id),
  category: r.category as Category,
  key: String(r.key),
  value: r.value as ConditionValue,
  isCore: Boolean(r.is_core),
  source: (r.source ?? {}) as MemorySource,
  status: r.status as MemoryItem["status"],
  ...(r.supersedes ? { supersedes: String(r.supersedes) } : {}),
  createdAt: String(r.created_at),
});
const toEvent = (r: Row): MemoryEvent => ({
  id: String(r.id),
  memoryId: String(r.memory_id),
  action: r.action as MemoryEvent["action"],
  ...(r.turn_id ? { turnId: String(r.turn_id) } : {}),
  ...(r.reason ? { reason: String(r.reason) } : {}),
  at: String(r.at),
});
const toTrace = (r: Row): TraceRow => ({
  id: String(r.id),
  turnId: String(r.turn_id),
  node: String(r.node),
  status: r.status as TraceRow["status"],
  durationMs: Number(r.duration_ms ?? 0),
  ...(r.input_summary ? { inputSummary: String(r.input_summary) } : {}),
  ...(r.output_summary ? { outputSummary: String(r.output_summary) } : {}),
  at: String(r.created_at),
});

function presetItems(): Row[] {
  return [
    {
      key: "skin_issue",
      value: "脂溢性皮炎",
      is_core: true,
      source: { channel: "preset" },
    },
    {
      key: "skin_type",
      value: "油皮",
      is_core: false,
      source: { channel: "preset" },
    },
  ];
}

async function seedPresets(userId: string, turnId: string): Promise<void> {
  unwrap(
    await db().rpc("apply_memory_write", {
      p_user_id: userId,
      p_category: "beauty",
      p_turn_id: turnId,
      p_items: presetItems(),
      p_used_ids: [],
    }),
  );
}

export function createSupabaseRepository(): Repository {
  const activeOf = async (userId: string, category?: Category): Promise<MemoryItem[]> => {
    let q = db()
      .from("memory_items")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active");
    if (category) q = q.eq("category", category);
    return unwrap(await q).map(toMemory);
  };

  const repo: Repository = {
    async createUser(persona) {
      const row = {
        id: newAnonId("anon"),
        persona,
        created_at: nowIso(),
      };
      unwrap(await db().from("anonymous_users").insert(row).select().single());
      if (persona === "xiaolin") await seedPresets(row.id, newId("t"));
      return toUser(row);
    },

    async getUser(userId) {
      const { data } = await db()
        .from("anonymous_users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      return data ? toUser(data as Row) : null;
    },

    async createSession(userId) {
      const row = {
        id: newAnonId("sess"),
        user_id: userId,
        memory_disabled: false,
        created_at: nowIso(),
      };
      unwrap(await db().from("sessions").insert(row).select().single());
      return toSession(row);
    },

    async getSession(sessionId) {
      const { data } = await db()
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      return data ? toSession(data as Row) : null;
    },

    async setMemoryDisabled(sessionId, disabled) {
      const rows = unwrap(
        await db()
          .from("sessions")
          .update({ memory_disabled: disabled })
          .eq("id", sessionId)
          .select(),
      );
      const session = toSession(rows[0] as Row);
      const memories = await activeOf(session.userId);
      // 停用只影响当前会话，不改条目状态（规格 3.4）
      unwrap(
        await db().from("memory_events").insert(
          memories.map((m) => ({
            id: newId("me"),
            memory_id: m.id,
            action: disabled ? "disabled_for_session" : "enabled_for_session",
            reason: "当前会话偏好变更",
          })),
        ),
      );
      return session;
    },

    async resetUser(userId, persona) {
      const sessions = unwrap(
        await db().from("sessions").select("id").eq("user_id", userId),
      ) as Row[];
      const sessionIds = sessions.map((s) => String(s.id));
      for (const id of sessionIds) turnSnapshotFallback.delete(id);
      const turns = unwrap(
        await db().from("messages").select("turn_id").in("session_id", sessionIds),
      ) as Row[];
      const turnIds = [...new Set(turns.map((t) => String(t.turn_id)))];

      if (turnIds.length > 0) {
        unwrap(await db().from("agent_traces").delete().in("turn_id", turnIds));
      }
      unwrap(await db().from("memory_undo_snapshots").delete().eq("user_id", userId));
      // memory_events 由外键级联清除
      unwrap(await db().from("memory_items").delete().eq("user_id", userId));
      unwrap(await db().from("sessions").delete().eq("user_id", userId));
      if (persona === "xiaolin") await seedPresets(userId, newId("t"));
    },

    async appendMessage(message) {
      unwrap(
        await db().from("messages").insert({
          id: message.id,
          session_id: message.sessionId,
          turn_id: message.turnId,
          role: message.role,
          content: message.content,
          created_at: message.createdAt,
        }),
      );
    },

    async getSessionTurnSnapshot(sessionId) {
      try {
        const { data, error } = await db()
          .from("sessions")
          .select("turn_snapshot")
          .eq("id", sessionId)
          .maybeSingle();
        if (error) throw error;
        const raw = (data as Row | null)?.turn_snapshot;
        if (raw && typeof raw === "object") {
          return structuredClone(raw as SessionTurnSnapshot);
        }
      } catch {
        // 列未迁移时走进程内兜底
      }
      const local = turnSnapshotFallback.get(sessionId);
      return local ? structuredClone(local) : null;
    },

    async setSessionTurnSnapshot(sessionId, snapshot) {
      turnSnapshotFallback.set(sessionId, structuredClone(snapshot));
      try {
        await db()
          .from("sessions")
          .update({ turn_snapshot: snapshot })
          .eq("id", sessionId);
      } catch {
        // 列未迁移时仅保留进程内快照
      }
    },

    async listMessages(sessionId) {
      const rows = unwrap(
        await db()
          .from("messages")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true }),
      ) as Row[];
      return rows.map((r) => ({
        id: String(r.id),
        sessionId: String(r.session_id),
        turnId: String(r.turn_id),
        role: r.role as MessageRow["role"],
        content: String(r.content),
        createdAt: String(r.created_at),
      }));
    },

    async listProducts(category) {
      let q = db().from("products").select("*");
      if (category) q = q.eq("category", category);
      return (unwrap(await q) as Row[]).map(toProduct);
    },

    async getProduct(productId) {
      const { data } = await db()
        .from("products")
        .select("*")
        .eq("id", productId)
        .maybeSingle();
      return data ? toProduct(data as Row) : null;
    },

    async listExperiences(filter) {
      let q = db().from("experience_records").select("*");
      if (filter?.productIds) q = q.in("product_id", filter.productIds);
      const rows = (unwrap(await q) as Row[]).map(toExperience);
      if (!filter?.category) return rows;
      const products = await repo.listProducts(filter.category);
      const ids = new Set(products.map((p) => p.id));
      return rows.filter((r) => ids.has(r.productId));
    },

    async listActiveMemories(userId, category) {
      return activeOf(userId, category);
    },

    async listMemories(userId) {
      const rows = unwrap(
        await db()
          .from("memory_items")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
      ) as Row[];
      return rows.map(toMemory);
    },

    async getMemory(userId, memoryId) {
      const { data } = await db()
        .from("memory_items")
        .select("*")
        .eq("id", memoryId)
        .eq("user_id", userId)
        .maybeSingle();
      return data ? toMemory(data as Row) : null;
    },

    async listMemoryEvents(userId, memoryId) {
      const memories = await repo.listMemories(userId);
      const ids = memories.map((m) => m.id);
      if (ids.length === 0) return [];
      let q = db()
        .from("memory_events")
        .select("*")
        .in("memory_id", memoryId ? [memoryId] : ids)
        .order("at", { ascending: true });
      if (memoryId && !ids.includes(memoryId)) return [];
      const rows = unwrap(await q) as Row[];
      return rows.map(toEvent);
    },

    async applyMemoryWrite(plan: MemoryWritePlan) {
      const before = await activeOf(plan.userId, plan.category);
      const result = unwrap(
        await db().rpc("apply_memory_write", {
          p_user_id: plan.userId,
          p_category: plan.category,
          p_turn_id: plan.turnId,
          p_items: plan.items.map((i) => ({
            key: i.key,
            value: i.value,
            is_core: i.isCore,
            source: i.source,
          })),
          p_used_ids: plan.usedIds,
        }),
      ) as { created: Row[]; supersededIds: string[] };

      const created = (result.created ?? []).map(toMemory);
      let undoToken: string | undefined;
      if (created.length > 0) {
        undoToken = newId("undo");
        unwrap(
          await db().from("memory_undo_snapshots").insert({
            token: undoToken,
            user_id: plan.userId,
            before_state: before,
            created_ids: created.map((m) => m.id),
          }),
        );
      }

      const out: MemoryWriteResult = {
        created,
        supersededIds: result.supersededIds ?? [],
        usedIds: plan.usedIds,
        undoable: created.length > 0,
        ...(undoToken ? { undoToken } : {}),
      };
      return out;
    },

    async updateMemory(userId, memoryId, patch, turnId) {
      const target = await repo.getMemory(userId, memoryId);
      if (!target) throw new Error("memory not found");
      if (target.status !== "active") throw new Error("memory not active");
      return repo.applyMemoryWrite({
        userId,
        turnId,
        category: target.category,
        items: [
          {
            key: target.key,
            value: patch.value,
            isCore: patch.isCore,
            category: target.category,
            source: patch.source,
          },
        ],
        usedIds: [],
        now: nowIso(),
      });
    },

    async deleteMemory(userId, memoryId, turnId) {
      const target = await repo.getMemory(userId, memoryId);
      if (!target) throw new Error("memory not found");
      // 软删除：清除条件值；日志只保留删除事实
      unwrap(
        await db()
          .from("memory_items")
          .update({ value: "", status: "deleted" })
          .eq("id", memoryId)
          .eq("user_id", userId),
      );
      unwrap(
        await db().from("memory_events").insert({
          id: newId("me"),
          memory_id: memoryId,
          action: "deleted",
          turn_id: turnId,
          reason: "用户在记忆管理页删除",
        }),
      );
    },

    async appendMemoryEvents(events) {
      if (events.length === 0) return;
      unwrap(
        await db().from("memory_events").insert(
          events.map((e) => ({
            id: e.id,
            memory_id: e.memoryId,
            action: e.action,
            turn_id: e.turnId ?? null,
            reason: e.reason ?? null,
            at: e.at,
          })),
        ),
      );
    },

    async undoMemoryWrite(userId, undoToken, turnId) {
      const { data } = await db()
        .from("memory_undo_snapshots")
        .select("*")
        .eq("token", undoToken)
        .eq("user_id", userId)
        .maybeSingle();
      if (!data) return false;
      const snap = data as Row;
      const before = (snap.before_state ?? []) as Row[];
      const createdIds = (snap.created_ids ?? []) as string[];

      if (createdIds.length > 0) {
        unwrap(
          await db()
            .from("memory_items")
            .update({ status: "superseded" })
            .in("id", createdIds),
        );
      }
      // 先让相关维度当前 active 失效，避免唯一 active 索引冲突
      const keys = [...new Set(before.map((m) => String(m.key)))];
      if (keys.length > 0) {
        unwrap(
          await db()
            .from("memory_items")
            .update({ status: "superseded" })
            .eq("user_id", userId)
            .eq("status", "active")
            .in("key", keys),
        );
      }
      for (const row of before) {
        const mem = toMemory(row);
        unwrap(
          await db()
            .from("memory_items")
            .upsert({
              id: mem.id,
              user_id: userId,
              category: mem.category,
              key: mem.key,
              value: mem.value,
              is_core: mem.isCore,
              source: mem.source,
              status: "active",
              created_at: mem.createdAt,
            }),
        );
      }
      await repo.appendMemoryEvents(
        [...createdIds, ...before.map((m) => String(m.id))].map((id) => ({
          id: newId("me"),
          memoryId: id,
          action: "undo" as const,
          turnId,
          reason: "撤销写入，恢复写入前状态",
          at: nowIso(),
        })),
      );
      unwrap(
        await db().from("memory_undo_snapshots").delete().eq("token", undoToken),
      );
      return true;
    },

    async appendTraces(turnId, nodes: TraceNode[]) {
      if (nodes.length === 0) return;
      unwrap(
        await db().from("agent_traces").insert(
          nodes.map((n) => ({
            id: newId("tr"),
            turn_id: turnId,
            node: n.node,
            status: n.status,
            duration_ms: n.durationMs,
            input_summary: n.inputSummary ?? null,
            output_summary: n.outputSummary ?? null,
            created_at: n.at,
          })),
        ),
      );
    },

    async listTraces(turnId) {
      const rows = unwrap(
        await db()
          .from("agent_traces")
          .select("*")
          .eq("turn_id", turnId)
          .order("created_at", { ascending: true }),
      ) as Row[];
      return rows.map(toTrace);
    },
  };

  return repo;
}
