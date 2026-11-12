import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { serverEnv } from "@/lib/env";
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
  TraceNode,
  TraceRow,
} from "@/domain/types";
import { findDimension } from "@/domain/categories";
import type {
  MemoryWritePlan,
  MemoryWriteResult,
  Repository,
} from "./types";

interface Snapshot {
  userId: string;
  token: string;
  before: MemoryItem[];
  createdIds: string[];
  at: string;
}

interface Store {
  users: Map<string, AnonymousUser>;
  sessions: Map<string, Session>;
  messages: MessageRow[];
  memories: Map<string, MemoryItem>;
  memoryEvents: MemoryEvent[];
  traces: TraceRow[];
  products: Product[];
  experiences: ExperienceRecord[];
  undoSnapshots: Map<string, Snapshot>;
}

interface FixtureFile {
  products: Product[];
  experience_records: Array<Record<string, unknown>>;
}

function loadFixture(path: string): { products: Product[]; experiences: ExperienceRecord[] } {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as FixtureFile;
  const productIds = new Set(raw.products.map((p) => p.id));

  const experiences = raw.experience_records.map((r) => {
    const quote = String(r.quote ?? "");
    const sourceText = r.source_text ? String(r.source_text) : undefined;
    // 质量门禁（规格 6.6 / 10）：原话必须能在原文中逐字找到。
    if (sourceText && !sourceText.includes(quote)) {
      throw new Error(`[fixture gate] quote not verbatim in source_text: ${r.id}`);
    }
    if (!quote || !productIds.has(String(r.product_id))) {
      throw new Error(`[fixture gate] invalid quote or product_id: ${r.id}`);
    }
    if (r.stance !== "recommend" && r.stance !== "not_recommend") {
      throw new Error(`[fixture gate] invalid stance: ${r.id}`);
    }
    const conditions = (r.author_conditions ?? {}) as Record<string, string | number>;
    for (const key of Object.keys(conditions)) {
      // 词表校验仅对当前品类执行；夹具跨品类，故按 key 在任一词表命中即可。
      const known = (["beauty", "baby_food"] as Category[]).some((c) =>
        Boolean(findDimension(c, key)),
      );
      if (!known) throw new Error(`[fixture gate] condition outside vocabulary: ${key}`);
    }
    return {
      id: String(r.id),
      authorId: String(r.author_id),
      productId: String(r.product_id),
      stance: r.stance as ExperienceRecord["stance"],
      authorConditions: conditions,
      reasons: (r.reasons ?? []) as ExperienceRecord["reasons"],
      quote,
      ...(sourceText ? { sourceText } : {}),
      sourceType: r.source_type as ExperienceRecord["sourceType"],
      // 测试夹具中的 fixture 链接并非真实原文，不能作为可验证来源开放。
      sourceUrl: undefined,
      publishedAt: String(r.published_at ?? ""),
    } satisfies ExperienceRecord;
  });

  return { products: raw.products, experiences };
}

function emptyStore(fixturePath: string): Store {
  const fixture = loadFixture(fixturePath);
  return {
    users: new Map(),
    sessions: new Map(),
    messages: [],
    memories: new Map(),
    memoryEvents: [],
    traces: [],
    products: fixture.products,
    experiences: fixture.experiences,
    undoSnapshots: new Map(),
  };
}

/** 小林预置记忆：脂溢性皮炎（核心，参与筛选）、油皮（次要，仅排序/高亮）。 */
function presetMemories(userId: string, persona: Persona, at: string): MemoryItem[] {
  if (persona === "xiaob") return [];
  const build = (
    key: string,
    value: ConditionValue,
    isCore: boolean,
  ): MemoryItem => ({
    id: newId("m"),
    userId,
    category: "beauty",
    key,
    value,
    isCore,
    source: { channel: "preset" },
    status: "active",
    createdAt: at,
  });
  return [build("skin_issue", "脂溢性皮炎", true), build("skin_type", "油皮", false)];
}

function pushEvent(
  store: Store,
  memoryId: string,
  action: MemoryEvent["action"],
  turnId?: string,
  reason?: string,
): void {
  store.memoryEvents.push({
    id: newId("me"),
    memoryId,
    action,
    ...(turnId ? { turnId } : {}),
    ...(reason ? { reason } : {}),
    at: nowIso(),
  });
}

export function createMemoryRepository(fixturePath = serverEnv.seedFixturePath): Repository {
  const store = emptyStore(fixturePath);

  const activeOf = (userId: string, category?: Category) =>
    [...store.memories.values()].filter(
      (m) =>
        m.userId === userId &&
        m.status === "active" &&
        (category === undefined || m.category === category),
    );

  const repo: Repository = {
    async createUser(persona) {
      const user: AnonymousUser = {
        id: newAnonId("anon"),
        persona,
        createdAt: nowIso(),
      };
      store.users.set(user.id, user);
      for (const mem of presetMemories(user.id, persona, user.createdAt)) {
        store.memories.set(mem.id, mem);
        pushEvent(store, mem.id, "created", undefined, "预置记忆");
      }
      return structuredClone(user);
    },

    async getUser(userId) {
      const user = store.users.get(userId);
      return user ? structuredClone(user) : null;
    },

    async createSession(userId) {
      const session: Session = {
        id: newAnonId("sess"),
        userId,
        memoryDisabled: false,
        createdAt: nowIso(),
      };
      store.sessions.set(session.id, session);
      return structuredClone(session);
    },

    async getSession(sessionId) {
      const s = store.sessions.get(sessionId);
      return s ? structuredClone(s) : null;
    },

    async setMemoryDisabled(sessionId, disabled) {
      const s = store.sessions.get(sessionId);
      if (!s) throw new Error("session not found");
      const next = { ...s, memoryDisabled: disabled };
      store.sessions.set(sessionId, next);
      // 停用只影响当前会话，不改条目状态（规格 3.4）
      for (const mem of activeOf(next.userId)) {
        pushEvent(store, mem.id, disabled ? "disabled_for_session" : "enabled_for_session");
      }
      return structuredClone(next);
    },

    async resetUser(userId, persona) {
      const sessionIds = new Set(
        [...store.sessions.values()]
          .filter((s) => s.userId === userId)
          .map((s) => s.id),
      );
      for (const id of sessionIds) store.sessions.delete(id);
      store.messages = store.messages.filter((m) => !sessionIds.has(m.sessionId));
      const memoryIds = new Set(
        [...store.memories.values()].filter((m) => m.userId === userId).map((m) => m.id),
      );
      for (const id of memoryIds) store.memories.delete(id);
      store.memoryEvents = store.memoryEvents.filter((e) => !memoryIds.has(e.memoryId));
      store.traces = store.traces.filter((t) => !sessionIds.has(t.turnId));
      for (const [token, snap] of store.undoSnapshots) {
        if (snap.userId === userId) store.undoSnapshots.delete(token);
      }
      const at = nowIso();
      for (const mem of presetMemories(userId, persona, at)) {
        store.memories.set(mem.id, mem);
        pushEvent(store, mem.id, "created", undefined, "重置后恢复预置记忆");
      }
    },

    async appendMessage(message) {
      store.messages.push(structuredClone(message));
    },

    async listMessages(sessionId) {
      return structuredClone(store.messages.filter((m) => m.sessionId === sessionId));
    },

    async listProducts(category) {
      return structuredClone(
        store.products.filter((p) => category === undefined || p.category === category),
      );
    },

    async getProduct(productId) {
      const p = store.products.find((x) => x.id === productId);
      return p ? structuredClone(p) : null;
    },

    async listExperiences(filter) {
      const ids = filter?.productIds ? new Set(filter.productIds) : undefined;
      return structuredClone(
        store.experiences.filter(
          (r) =>
            (!ids || ids.has(r.productId)) &&
            (!filter?.category ||
              store.products.find((p) => p.id === r.productId)?.category === filter.category),
        ),
      );
    },

    async listActiveMemories(userId, category) {
      return structuredClone(activeOf(userId, category));
    },

    async listMemories(userId) {
      return structuredClone(
        [...store.memories.values()].filter((m) => m.userId === userId),
      );
    },

    async getMemory(userId, memoryId) {
      const m = store.memories.get(memoryId);
      return m && m.userId === userId ? structuredClone(m) : null;
    },

    async listMemoryEvents(userId, memoryId) {
      const owned = new Set(
        [...store.memories.values()].filter((m) => m.userId === userId).map((m) => m.id),
      );
      return structuredClone(
        store.memoryEvents.filter(
          (e) => owned.has(e.memoryId) && (memoryId === undefined || e.memoryId === memoryId),
        ),
      );
    },

    async applyMemoryWrite(plan: MemoryWritePlan) {
      // ── 事务边界开始（内存实现为同步原子段，Supabase 实现走 RPC 事务） ──
      const before = activeOf(plan.userId, plan.category);
      const createdIds: string[] = [];
      const supersededIds: string[] = [];

      for (const item of plan.items) {
        const existing = before.find(
          (m) => m.key === item.key && m.category === item.category,
        );
        // 同值忽略：不写入、不产生事件（PRD 6.4）
        if (existing && JSON.stringify(existing.value) === JSON.stringify(item.value)) continue;

        if (existing) {
          const old = store.memories.get(existing.id)!;
          store.memories.set(old.id, { ...old, status: "superseded" });
          supersededIds.push(old.id);
          pushEvent(store, old.id, "superseded", plan.turnId, "同维度新值取代");
        }

        const created: MemoryItem = {
          id: newId("m"),
          userId: plan.userId,
          category: item.category,
          key: item.key,
          value: item.value,
          isCore: item.isCore,
          source: item.source,
          status: "active",
          ...(existing ? { supersedes: existing.id } : {}),
          createdAt: plan.now,
        };
        store.memories.set(created.id, created);
        createdIds.push(created.id);
        pushEvent(store, created.id, "created", plan.turnId, "用户明确自述或点选");
      }

      for (const id of plan.usedIds) {
        const m = store.memories.get(id);
        if (m && m.userId === plan.userId && m.status === "active") {
          pushEvent(store, id, "used", plan.turnId, "本轮工作记忆实际采用");
        }
      }
      // ── 事务边界结束 ──

      const writable = createdIds.length > 0;
      const token = writable ? newId("undo") : undefined;
      if (token) {
        store.undoSnapshots.set(token, {
          userId: plan.userId,
          token,
          before: structuredClone(before),
          createdIds,
          at: plan.now,
        });
      }

      const result: MemoryWriteResult = {
        created: createdIds.map((id) => structuredClone(store.memories.get(id)!)),
        supersededIds,
        usedIds: plan.usedIds,
        ...(token ? { undoToken: token } : {}),
        undoable: writable,
      };
      return result;
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
      // 软删除：清除条件值；日志只保留删除事实，不保留敏感值
      store.memories.set(memoryId, {
        ...target,
        value: "",
        status: "deleted",
      });
      pushEvent(store, memoryId, "deleted", turnId, "用户在记忆管理页删除");
      // 派生排序/高亮缓存随 workingConditions 重算而失效，无需额外缓存层。
    },

    async appendMemoryEvents(events) {
      for (const e of events) store.memoryEvents.push(structuredClone(e));
    },

    async undoMemoryWrite(userId, undoToken, turnId) {
      const snap = store.undoSnapshots.get(undoToken);
      if (!snap || snap.userId !== userId) return false;
      // 本次创建的条目转为 superseded，保留历史取代关系，不物理删除
      for (const id of snap.createdIds) {
        const m = store.memories.get(id);
        if (m) store.memories.set(id, { ...m, status: "superseded" });
        pushEvent(store, id, "undo", turnId, "撤销写入，恢复写入前状态");
      }
      // 恢复写入前有效状态（唯一 active 索引不会被破坏）
      for (const m of snap.before) {
        store.memories.set(m.id, { ...m, status: "active" });
      }
      store.undoSnapshots.delete(undoToken);
      return true;
    },

    async appendTraces(turnId, nodes: TraceNode[]) {
      for (const node of nodes) {
        store.traces.push({ ...structuredClone(node), id: newId("tr"), turnId });
      }
    },

    async listTraces(turnId) {
      return structuredClone(store.traces.filter((t) => t.turnId === turnId));
    },
  };

  return repo;
}

const memoryRepositoryGlobal = globalThis as typeof globalThis & {
  __hisearchMemoryRepository?: Repository;
};

export function getDefaultMemoryRepository(): Repository {
  // Next.js 开发热更新会重新执行模块；挂到 globalThis 后，浏览器中仍在使用的
  // 匿名会话不会因为一次代码保存就从内存仓库消失。
  if (!memoryRepositoryGlobal.__hisearchMemoryRepository) {
    memoryRepositoryGlobal.__hisearchMemoryRepository = createMemoryRepository();
  }
  return memoryRepositoryGlobal.__hisearchMemoryRepository;
}

/** 仅供测试重置进程内单例状态。 */
export function resetDefaultMemoryRepository(): void {
  delete memoryRepositoryGlobal.__hisearchMemoryRepository;
}
