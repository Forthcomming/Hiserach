/**
 * 领域契约 —— 对应 technical-spec.md 4.3 / 5.2 / 6.7。
 *
 * 硬约束：模型只产出本文件里的受控结构；人数、比例、原话、替代品排序
 * 全部由确定性工具计算，模型不得生成这些事实（规格 1 / 3.2 / 3.3）。
 */

export type Category = "beauty" | "baby_food";
export type Persona = "xiaolin" | "xiaob";
export type Stance = "recommend" | "not_recommend";
export type SourceType = "note" | "comment";
export type ConditionSource = "memory" | "user_input" | "followup_card" | "preset";
export type MemoryStatus = "active" | "superseded" | "deleted";
export type MemoryAction =
  | "created"
  | "superseded"
  | "used"
  | "disabled_for_session"
  | "enabled_for_session"
  | "deleted"
  | "undo";
export type AnswerMode = "global" | "similar" | "small_sample";
export type TraceStatus = "success" | "failed" | "degraded" | "skipped";
export type FallbackReason =
  | "model_timeout"
  | "model_error"
  | "validation_failed"
  | "model_unconfigured";

/** 词表值，或月龄基准（规格 3.1：月龄长期保存为出生月份）。 */
export type ConditionValue = string | { birthMonth: string };

export interface ConditionInput {
  key: string;
  /** 归一化后的词表值，或 "YYYY-MM" 形式的出生月份。 */
  value: string;
  source: "user_input" | "followup_card";
  /** 用户原话片段；写入日志时按敏感信息最小化处理。 */
  raw?: string;
}

export interface ConditionDimension {
  key: string;
  label: string;
  core: boolean;
  type: "enum" | "month";
  options?: string[];
  unit?: string;
}

export interface CategoryConfig {
  category: Category;
  label: string;
  dimensions: ConditionDimension[];
  /** 演示查询归一化表：仅配置，不含任何统计数字（规格 14 待确认项）。 */
  intentAliases: Array<{ phrase: string; productIds: string[] }>;
  medicalDisclaimer: string;
  /** 冷启动追问卡片只展示这些维度（要求"有同类人数据的维度"）。 */
  followupDimensionKeys: string[];
}

export interface WorkingCondition {
  key: string;
  label: string;
  valueLabel: string;
  value: ConditionValue;
  /** month 类型换算出的当前数值（月龄），供条件范围与匹配使用。 */
  numericValue?: number;
  isCore: boolean;
  source: ConditionSource;
  memoryId?: string;
}

export interface Product {
  id: string;
  category: Category;
  name: string;
  imageUrl?: string;
}

export interface ExperienceReason {
  tag: string;
  onset?: string;
  outcome?: string;
}

export interface ExperienceRecord {
  id: string;
  authorId: string;
  productId: string;
  stance: Stance;
  authorConditions: Record<string, string | number>;
  reasons: ExperienceReason[];
  quote: string;
  /** 离线原文，用于逐字校验 quote（规格 5.1 / 6.6）。正式入库记录必须提供。 */
  sourceText?: string;
  sourceType: SourceType;
  sourceUrl?: string;
  publishedAt: string;
  embedding?: number[];
}

export interface MemorySource {
  query?: string;
  turnId?: string;
  channel: ConditionSource;
  userQuote?: string;
}

export interface MemoryItem {
  id: string;
  userId: string;
  category: Category;
  key: string;
  value: ConditionValue;
  isCore: boolean;
  source: MemorySource;
  status: MemoryStatus;
  supersedes?: string;
  createdAt: string;
}

export interface MemoryEvent {
  id: string;
  memoryId: string;
  action: MemoryAction;
  turnId?: string;
  reason?: string;
  at: string;
}

export interface AnonymousUser {
  id: string;
  persona: Persona;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  memoryDisabled: boolean;
  createdAt: string;
}

export interface MessageRow {
  id: string;
  sessionId: string;
  turnId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface TraceNode {
  node: string;
  status: TraceStatus;
  durationMs: number;
  inputSummary?: string;
  outputSummary?: string;
  at: string;
}

export interface TraceRow extends TraceNode {
  id: string;
  turnId: string;
}

export interface QueryUnderstanding {
  intent: "supported" | "unsupported";
  category?: Category;
  productIds: string[];
  statedConditions: ConditionInput[];
  normalizedQuery?: string;
}

export interface QuoteItem {
  id: string;
  recordId: string;
  text: string;
  stance: Stance;
  sourceType: SourceType;
  /** 已经过域名白名单校验；弹层内始终展示完整原话，跳转仅作补充。 */
  sourceUrl?: string;
  publishedAt: string;
  authorConditions: Array<{ key: string; label: string; valueLabel: string }>;
  reasonId?: string;
  productId: string;
}

export interface ReasonAnswer {
  reasonId: string;
  tag: string;
  stance: Stance;
  authorCount: number;
  quoteIds: string[];
  conditionRange?: { key: string; label: string; min: number; max: number; unit?: string };
  onset?: string;
  outcome?: string;
}

export interface ProductAnswer {
  productId: string;
  name: string;
  imageUrl?: string;
  reasons: ReasonAnswer[];
  similarQuoteIds: string[];
}

export interface FollowupOption {
  key: string;
  label: string;
  options?: string[];
  type: "enum" | "month";
}

export interface FollowupCard {
  category: Category;
  dimensions: FollowupOption[];
}

export interface SimilarSummary {
  authorCount: number;
  recommendCount: number;
  notRecommendCount: number;
  /** authorCount < 5 时必须缺省（规格 3.2 / AC-06）。 */
  recommendRate?: number;
}

export interface GlobalSummary {
  authorCount: number;
  recommendCount: number;
  notRecommendCount: number;
  recommendRate: number;
  keyRisk?: string;
}

export interface AppliedCondition {
  key: string;
  label: string;
  valueLabel: string;
  source: ConditionSource;
  memoryId?: string;
}

export interface AnswerPayload {
  mode: AnswerMode;
  appliedConditions: AppliedCondition[];
  similarSummary?: SimilarSummary;
  globalSummary: GlobalSummary;
  products: ProductAnswer[];
  alternatives: ProductAnswer[];
  followup?: FollowupCard;
  /** 超范围查询的受限提示与两个可点击快捷标签（规格 7.3）。 */
  notice?: { text: string; quickTags: string[] };
  disclaimers: string[];
  datasetNote: string;
  traceId: string;
}

/**
 * 模型在 compose_answer 产出的"文案草稿 + 引用声明"。
 * 模型不得生成事实：所有数字与 ID 都会被 validate_answer 逐项比对工具结果；
 * 最终 AnswerPayload 由代码用工具结果组装，只取 headline 作为流式文案。
 */
export interface AnswerDraft {
  headline: string;
  similarAuthorCount?: number;
  similarRecommendRate?: number;
  quoteIds: string[];
  reasonIds: string[];
  alternativeProductIds: string[];
}

/** 五个确定性工具的汇总产物，是 compose_answer 唯一可用的事实来源。 */
export interface ToolBundle {
  category: Category;
  productIds: string[];
  conditions: WorkingCondition[];
  similarAuthorIds: string[];
  similarSummary?: SimilarSummary;
  globalSummary: GlobalSummary;
  reasons: ReasonAnswer[];
  primaryProduct?: ProductAnswer;
  alternatives: ProductAnswer[];
  quotes: QuoteItem[];
  datasetNote: string;
  followup?: FollowupCard;
}

export interface MemoryMutation {
  created: MemoryItem[];
  supersededIds: string[];
  usedIds: string[];
  /** 供"一键撤销"定位写入前快照。 */
  undoToken?: string;
  undoable: boolean;
  summary: string;
}

export interface AgentState {
  turnId: string;
  userId: string;
  sessionId: string;
  query: string;
  followupSelection?: Array<{ key: string; value: string }>;
  queryUnderstanding?: QueryUnderstanding;
  memoryDisabledForSession: boolean;
  loadedMemories: MemoryItem[];
  workingConditions: WorkingCondition[];
  usedMemoryIds: string[];
  toolResult?: ToolBundle;
  answerDraft?: AnswerDraft;
  answer?: AnswerPayload;
  memoryMutation?: MemoryMutation;
  trace: TraceNode[];
  fallbackReason?: FallbackReason;
  retryCount: number;
  validationErrors: string[];
  degraded: boolean;
  unsupported: boolean;
  /** compose_answer 阶段模型显式失败/超时，跳过无意义重试直接模板兜底。 */
  composeFailed: boolean;
}

/** SSE 事件协议（规格 4.4）。answer.delta 只用于提升感知速度，不承载事实。 */
export type StreamEvent =
  | { type: "turn.started"; turnId: string }
  | { type: "node.status"; node: string; status: TraceStatus; durationMs: number }
  | { type: "answer.delta"; text: string }
  | { type: "answer.data"; answer: AnswerPayload }
  | { type: "memory.changed"; summary: string; undoable: boolean; undoToken?: string }
  | { type: "turn.completed"; status: "success" | "degraded"; degraded: boolean }
  | { type: "turn.failed"; code: string; retryable: boolean };
