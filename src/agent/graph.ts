import { END, START, StateGraph } from "@langchain/langgraph";
import { AgentAnnotation } from "./state";
import {
  makeNodes,
  routeAfterFollowup,
  routeAfterValidation,
  type GraphContext,
} from "./nodes";

/**
 * Agent 状态图（规格 4.2 + 对话顺畅 Continuity）。
 *
 * START → assemble_session_context → understand_query → load_memory → decide_followup
 *   ├─ 超范围 → build_general_answer → persist_trace → END
 *   ├─ 缺核心条件 → build_global_answer → persist_trace → END
 *   └─ 条件充足 → run_tools → compose_answer → validate_answer
 *        ├─ 通过 → persist_memory → persist_trace → END
 *        └─ 失败 → 重试一次 ├ 通过 → persist_memory → persist_trace → END
 *                           └ 失败 → render_template → persist_memory → persist_trace → END
 *
 * 每次请求构建一张图：让节点闭包持有本轮 Repository / 模型网关 / SSE emitter，
 * 避免把运行时上下文塞进可序列化的 AgentState。
 */
export function buildAgentGraph(ctx: GraphContext) {
  const nodes = makeNodes(ctx);

  return new StateGraph(AgentAnnotation)
    .addNode("assemble_session_context", nodes.assemble_session_context)
    .addNode("understand_query", nodes.understand_query)
    .addNode("load_memory", nodes.load_memory)
    .addNode("decide_followup", nodes.decide_followup)
    .addNode("build_global_answer", nodes.build_global_answer)
    .addNode("build_general_answer", nodes.build_general_answer)
    .addNode("run_tools", nodes.run_tools)
    .addNode("compose_answer", nodes.compose_answer)
    .addNode("validate_answer", nodes.validate_answer)
    .addNode("render_template", nodes.render_template)
    .addNode("persist_memory", nodes.persist_memory)
    .addNode("persist_trace", nodes.persist_trace)
    .addEdge(START, "assemble_session_context")
    .addEdge("assemble_session_context", "understand_query")
    .addEdge("understand_query", "load_memory")
    .addEdge("load_memory", "decide_followup")
    .addConditionalEdges("decide_followup", (state) => routeAfterFollowup(state.state), {
      general: "build_general_answer",
      global: "build_global_answer",
      tools: "run_tools",
    })
    .addEdge("build_global_answer", "persist_trace")
    .addEdge("build_general_answer", "persist_trace")
    .addEdge("run_tools", "compose_answer")
    .addEdge("compose_answer", "validate_answer")
    .addConditionalEdges("validate_answer", (state) => routeAfterValidation(state.state), {
      pass: "persist_memory",
      retry: "compose_answer",
      template: "render_template",
    })
    .addEdge("render_template", "persist_memory")
    .addEdge("persist_memory", "persist_trace")
    .addEdge("persist_trace", END)
    .compile();
}
