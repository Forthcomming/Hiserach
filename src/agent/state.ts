import { Annotation } from "@langchain/langgraph";
import type { AgentState, Persona } from "@/domain/types";

/** 构造一轮完整初始状态；所有事实字段由节点填充，不预置任何统计数字。 */
export function emptyAgentState(args: {
  turnId: string;
  userId: string;
  sessionId: string;
  query: string;
  memoryDisabledForSession: boolean;
  followupSelection?: Array<{ key: string; value: string }>;
  persona?: Persona;
}): AgentState {
  return {
    turnId: args.turnId,
    userId: args.userId,
    sessionId: args.sessionId,
    query: args.query,
    ...(args.followupSelection ? { followupSelection: args.followupSelection } : {}),
    memoryDisabledForSession: args.memoryDisabledForSession,
    loadedMemories: [],
    workingConditions: [],
    usedMemoryIds: [],
    trace: [],
    retryCount: 0,
    validationErrors: [],
    degraded: false,
    unsupported: false,
    composeFailed: false,
  };
}

/**
 * LangGraph 状态：用单个 state channel + merge reducer，
 * 节点始终返回完整 AgentState，避免字段级 reducer 带来的类型歧义。
 */
export const AgentAnnotation = Annotation.Root({
  state: Annotation<AgentState, Partial<AgentState>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () =>
      emptyAgentState({
        turnId: "",
        userId: "",
        sessionId: "",
        query: "",
        memoryDisabledForSession: false,
      }),
  }),
});

export type GraphState = typeof AgentAnnotation.State;
