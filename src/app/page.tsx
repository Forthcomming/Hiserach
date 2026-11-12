const endpoints = [
  ["POST", "/api/sessions", "选择/初始化身份"],
  ["DELETE", "/api/sessions/:id/reset", "重置身份并恢复预置记忆"],
  ["PATCH", "/api/sessions/:id/preferences", "本次停用/启用记忆"],
  ["POST", "/api/chat", "搜索或追问（SSE 事件流）"],
  ["GET", "/api/turns/:id/trace", "Agent 过程追踪"],
  ["GET", "/api/quotes", "按产品/原因/立场取原话"],
  ["GET", "/api/memories", "记忆与操作记录"],
  ["PATCH", "/api/memories/:id", "修改条件"],
  ["DELETE", "/api/memories/:id", "删除条件"],
  ["POST", "/api/memory-changes/:id/undo", "撤销最近写入"],
];

export default function Home() {
  return (
    <main
      style={{
        maxWidth: 420,
        margin: "0 auto",
        padding: "24px 16px 48px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>同类人口碑 · 后端链路</h1>
      <p style={{ fontSize: 13, color: "#666", marginTop: 0 }}>
        按 technical-spec.md 搭建：Next.js Route Handlers → LangGraph 状态图 →
        确定性统计工具 → 一致性校验 / 模板兜底 → Supabase Repository。
        本页是后端联调占位，移动端 H5 页面（P1–P6）尚未接入。
      </p>

      <h2 style={{ fontSize: 15, marginTop: 28 }}>接口清单</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {endpoints.map(([method, path, desc]) => (
          <li
            key={path}
            style={{
              borderBottom: "1px solid #f0f0f0",
              padding: "10px 0",
              fontSize: 13,
            }}
          >
            <span
              style={{
                display: "inline-block",
                minWidth: 52,
                color: method === "GET" ? "#0a7" : "#d33",
                fontWeight: 600,
              }}
            >
              {method}
            </span>
            <code style={{ fontSize: 12 }}>{path}</code>
            <div style={{ color: "#888", marginLeft: 52 }}>{desc}</div>
          </li>
        ))}
      </ul>

      <p style={{ fontSize: 12, color: "#999", marginTop: 28 }}>
        默认使用本地夹具适配器（DATA_BACKEND=memory）即可跑通全链路；
        配置 Supabase 与模型 Key 后切换 DATA_BACKEND=supabase 走生产路径。
      </p>
    </main>
  );
}
