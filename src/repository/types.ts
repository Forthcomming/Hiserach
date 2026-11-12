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

export interface MemoryWriteItem {
  key: string;
  value: ConditionValue;
  isCore: boolean;
  category: Category;
  source: MemorySource;
}

/**
 * 一次记忆写入计划。规格 3.4 / 5.1：新增与取代必须在同一事务中完成，
 * 避免"旧值已失效但新值未落库"的中间状态。
 */
export interface MemoryWritePlan {
  userId: string;
  turnId: string;
  category: Category;
  items: MemoryWriteItem[];
  usedIds: string[];
  now: string;
}

export interface MemoryWriteResult {
  created: MemoryItem[];
  supersededIds: string[];
  usedIds: string[];
  undoToken?: string;
  undoable: boolean;
}

export interface Repository {
  // ── 身份与会话 ────────────────────────────────────────────────────────
  createUser(persona: Persona): Promise<AnonymousUser>;
  getUser(userId: string): Promise<AnonymousUser | null>;
  createSession(userId: string): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  setMemoryDisabled(sessionId: string, disabled: boolean): Promise<Session>;
  /** 清空该匿名 ID 下会话、消息、记忆、事件、追踪，并按 persona 恢复预置状态。 */
  resetUser(userId: string, persona: Persona): Promise<void>;

  // ── 对话 ──────────────────────────────────────────────────────────────
  appendMessage(message: MessageRow): Promise<void>;
  listMessages(sessionId: string): Promise<MessageRow[]>;
  /** 最近一轮可恢复摘要，供多轮 Continuity；无则 null。 */
  getSessionTurnSnapshot(sessionId: string): Promise<SessionTurnSnapshot | null>;
  setSessionTurnSnapshot(sessionId: string, snapshot: SessionTurnSnapshot): Promise<void>;

  // ── 经验数据（只读，离线管线入库） ─────────────────────────────────────
  listProducts(category?: Category): Promise<Product[]>;
  getProduct(productId: string): Promise<Product | null>;
  listExperiences(filter?: { productIds?: string[]; category?: Category }): Promise<ExperienceRecord[]>;

  // ── 记忆 ──────────────────────────────────────────────────────────────
  listActiveMemories(userId: string, category?: Category): Promise<MemoryItem[]>;
  listMemories(userId: string): Promise<MemoryItem[]>;
  getMemory(userId: string, memoryId: string): Promise<MemoryItem | null>;
  listMemoryEvents(userId: string, memoryId?: string): Promise<MemoryEvent[]>;
  /** 事务性写入：同维度旧 active → superseded，插入新 active，追加事件。 */
  applyMemoryWrite(plan: MemoryWritePlan): Promise<MemoryWriteResult>;
  /** 用户修改条件：等价于一次单条写入，但强制校验归属。 */
  updateMemory(
    userId: string,
    memoryId: string,
    patch: { value: ConditionValue; isCore: boolean; source: MemorySource },
    turnId: string,
  ): Promise<MemoryWriteResult>;
  /** 用户删除：软删除 + 值清除，日志只保留删除事实。 */
  deleteMemory(userId: string, memoryId: string, turnId: string): Promise<void>;
  appendMemoryEvents(events: MemoryEvent[]): Promise<void>;
  /** 撤销最近一次写入，恢复写入前有效状态，不丢失历史关系。 */
  undoMemoryWrite(userId: string, undoToken: string, turnId: string): Promise<boolean>;

  // ── Agent 追踪 ────────────────────────────────────────────────────────
  appendTraces(turnId: string, nodes: TraceNode[]): Promise<void>;
  listTraces(turnId: string): Promise<TraceRow[]>;
}
