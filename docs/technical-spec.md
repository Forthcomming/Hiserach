# 小红书 AI 搜「同类人口碑」MVP 技术规格

| 项目 | 内容 |
| --- | --- |
| 文档状态 | 开发基线（待样本数据补齐后锁定演示数字） |
| 对应需求 | `prd.md` v1.0（MVP） |
| 目标交付 | 移动端 H5 可访问链接，基准宽度 375px |
| 计划周期 | 24h |
| 技术基线 | Next.js App Router + TypeScript + Tailwind + LangGraph.js + Vercel AI SDK + Supabase |

## 1. 文档目的与需求基线

本文把产品需求转换为可实施、可测试、可验收的技术约束，作为开发、联调和演示验收的共同基线。

需求文件存在一处版本差异：`prd-draft.md` 的早期方案是“静态 JSON + 浏览器本地记忆，不依赖线上大模型”，最终 `prd.md` 已明确为“Agent 链路和记忆层在线真实运行，经验数据离线处理后入库”。实现以最终 `prd.md` 为准：

- Agent 查询理解、条件抽取、答案组织和记忆决策在线运行。
- 人数、比例、原因聚合和替代品选择必须由确定性代码工具计算。
- 笔记和评论不实时抓取，只允许离线采集、结构化、校验后写入数据库。
- 模型不可直接生成事实数字或原话；模型失败时由模板答案兜底。

## 2. 产品目标与功能边界

### 2.1 MVP 目标

面向“适不适合我”型消费决策，在两个受控查询中证明以下闭环：

1. 识别用户明确给出的个人条件，或读取同品类已保存条件。
2. 将符合核心条件的作者与全站作者分开统计。
3. 输出可追溯的同类人结论、风险原因、替代品和正反原话。
4. 让用户能查看、停用、修改、删除记忆，并追溯记忆操作。
5. 让用户能展开 Agent 过程，确认本轮读取了什么记忆、调用了什么工具。

### 2.2 支持范围

| 能力 | MVP 范围 |
| --- | --- |
| 身份 | 小林（预置“脂溢性皮炎、油皮”）、小B（冷启动）；匿名会话隔离 |
| 查询 | `DW粉底`、`婴儿米粉推荐` 及可归一到这两类意图的自然语言变体 |
| 品类 | 护肤彩妆、母婴辅食 |
| 输入 | 文本输入、快捷标签、追问卡片多选 |
| 输出 | 全站答案、同类人答案、小样本答案、原话、替代品、医学提示、数据来源说明 |
| 记忆 | 按品类保存用户明确自述/点选的条件；支持来源、修改、删除、停用和操作记录 |
| 可观测性 | 节点顺序、耗时、记忆读写、工具入参与摘要结果 |

### 2.3 明确不做

- 不实时抓取或实时结构化小红书内容。
- 不支持两个目标查询之外的数据与答案生成。
- 不做登录、真实账号、购买链路、商品跳转、语音或图片输入。
- 不根据浏览、发布或其他行为推断用户条件。
- 不做条件定期确认、埋点采集或样本负向偏差提示。
- 不将模型输出作为统计、人数、比例、原话或替代品排序的事实来源。

### 2.4 工期优先级

出现工期冲突时按以下顺序取舍，但不得牺牲事实可追溯与隐私控制：

1. 两条标准路径与降级链路完整跑通。
2. 记忆的正确读取、写入、停用、修改和删除。
3. 数字/原话校验和模板兜底。
4. Agent 追踪面板。
5. 视觉细节与非关键动效。

## 3. 关键业务规则

### 3.1 条件规则

- 条件只来源于用户本轮明确自述、追问卡片点选或该用户的长期记忆。
- 条件必须命中当前品类的预设维度和合法取值；他人情况、否定表达不明确或词表外条件不得写入。
- 每个品类最多使用 1–2 个核心条件参与同类人筛选；次要条件仅参与排序和高亮。
- 本轮自述条件优先于长期记忆；相同维度的新值替代旧值，不允许两个值同时生效。
- 月龄长期保存为出生月份，读取时根据当前月份动态换算。
- “本次不按我的条件”只影响当前会话/本轮搜索，不删除长期记忆。

建议 MVP 条件配置：

```ts
type CategoryConfig = {
  category: 'beauty' | 'baby_food';
  dimensions: Array<{
    key: string;
    label: string;
    core: boolean;
    type: 'enum' | 'month';
    options?: string[];
  }>;
};
```

### 3.2 同类人及统计规则

- 只有作者本人明确自述的条件可进入 `author_conditions` 并参与匹配。
- 同类人记录要求所有生效核心条件一致；次要条件不得过滤记录。
- 所有人数均按 `author_id` 去重，同一作者的多条笔记/评论只计一人。
- 同类作者数 `>= 5` 时可输出推荐/不推荐比例。
- 同类作者数 `< 5` 时只显示人数与正反原话，不显示同类人比例，首屏改为全站结论优先。
- 全站共识始终独立计算并显示，同时展示不分人群的关键风险。
- 原因行一次只表达一个具体现象，人数按该原因下去重作者数计算。
- 原因的出现时机或后续结果，仅在该原因下超过半数作者给出同一归一化取值时展示。

### 3.3 替代品规则

候选产品必须同时满足：

1. 与当前产品同品类且不是当前产品。
2. 被符合核心条件的同类作者明确提到。
3. 同类作者中推荐人数不少于 5。
4. 推荐人数大于不推荐人数。

达标候选按同类人推荐人数降序排列；没有达标候选时整个替代品模块不渲染，不显示空状态占位。

### 3.4 记忆规则

| 操作 | 触发方 | 技术行为 |
| --- | --- | --- |
| 新增 | Agent 决策 + 规则校验 | 创建 `active` 条目并追加 `created` 事件 |
| 更新 | Agent 决策 + 规则校验 | 新建条目，旧条目标记 `superseded`，双方建立取代关系并追加事件 |
| 使用 | 系统 | 每轮对实际采用的条目追加 `used` 事件 |
| 本次停用 | 用户 | 不改条目状态，追加 `disabled_for_session` 事件 |
| 删除 | 仅用户 | 条目置为 `deleted`，清除条件值及派生缓存，日志只保留删除事实 |
| 撤销写入 | 用户点击轻提示 | 恢复写入前有效状态并追加对应审计事件；不得丢失历史关系 |

Agent 无权自行删除记忆。重置身份时清空对应匿名 ID 的会话、记忆、事件和追踪；小林随后恢复产品规定的预置记忆，小B保持无记忆。

## 4. 系统设计

### 4.1 组件边界

```text
Mobile H5 (Next.js)
  ├─ 身份/对话/记忆页面
  ├─ 答案、条件、原话、追问、追踪组件
  └─ 流式事件消费与会话状态
          │ HTTPS / SSE
Next.js Server / Agent Service
  ├─ 请求校验、匿名身份、限流
  ├─ LangGraph 状态图
  ├─ 确定性统计工具
  ├─ 答案一致性校验与模板兜底
  └─ Supabase Repository
          │
Supabase Postgres + pgvector
  ├─ 产品、经验记录、原话向量
  ├─ 用户记忆、记忆事件
  └─ 对话、轮次、Agent 追踪
```

部署建议采用单个 Next.js 应用：UI、Route Handlers、LangGraph 和工具代码同仓部署到 Vercel；Supabase 作为唯一持久化服务。24h MVP 不拆独立微服务。

### 4.2 Agent 状态图

```text
START
  → understand_query
  → load_memory
  → decide_followup
      ├─ 缺核心条件 → build_global_answer → persist_trace → END
      └─ 条件充足 → run_tools → compose_answer → validate_answer
                                            ├─ 通过 → persist_memory → persist_trace → END
                                            └─ 失败 → 重试一次
                                                       ├─ 通过 → persist_memory → persist_trace → END
                                                       └─ 失败 → render_template → persist_memory → persist_trace → END
```

节点硬约束：

- `understand_query` 只能输出受控 schema，不直接生成答案。
- `load_memory`、`decide_followup`、所有工具与校验器均为确定性代码。
- `compose_answer` 只接收工具结果及其引用 ID，不允许访问原始数据库连接。
- `persist_memory` 先执行规则校验，再执行模型建议；模型建议不能突破词表、来源和权限限制。
- 每个节点无论成功、失败或降级都写入耗时和状态。

### 4.3 结构化状态

```ts
type AgentState = {
  turnId: string;
  userId: string;
  sessionId: string;
  query: string;
  queryUnderstanding?: {
    intent: 'supported' | 'unsupported';
    category?: 'beauty' | 'baby_food';
    productIds: string[];
    statedConditions: ConditionInput[];
  };
  memoryDisabledForSession: boolean;
  loadedMemories: MemoryItem[];
  workingConditions: WorkingCondition[];
  toolResult?: ToolBundle;
  answer?: AnswerPayload;
  memoryMutation?: MemoryMutation;
  trace: TraceNode[];
  fallbackReason?: 'model_timeout' | 'model_error' | 'validation_failed';
};
```

### 4.4 流式协议

对话接口使用 SSE 或 Vercel AI SDK data stream。前端至少处理以下事件：

| 事件 | 载荷 | 用途 |
| --- | --- | --- |
| `turn.started` | `turnId` | 创建答案占位 |
| `node.status` | 节点、状态、耗时 | 追踪面板实时更新 |
| `answer.delta` | 文本片段 | 流式文案 |
| `answer.data` | 完整结构化答案 | 渲染统计、产品、原因、引用 |
| `memory.changed` | 变更摘要、可撤销标志 | 轻提示与撤销入口 |
| `turn.completed` | 状态、是否降级 | 完成态 |
| `turn.failed` | 安全错误码、可重试标志 | 失败态，不下发密钥或内部堆栈 |

数字、引用和产品卡以 `answer.data` 为准；`answer.delta` 只用于提升感知速度，不能单独成为最终事实 UI。

## 5. 数据设计

### 5.1 核心表

| 表 | 关键字段 | 约束 |
| --- | --- | --- |
| `anonymous_users` | `id`, `persona`, `created_at` | persona 仅 `xiaolin` / `xiaob` |
| `sessions` | `id`, `user_id`, `memory_disabled`, `created_at` | 匿名身份隔离 |
| `messages` | `id`, `session_id`, `turn_id`, `role`, `content`, `created_at` | 保存可重放对话 |
| `products` | `id`, `category`, `name`, `image_url` | 产品 ID 稳定唯一 |
| `experience_records` | `id`, `author_id`, `product_id`, `stance`, `author_conditions`, `reasons`, `quote`, `source_type`, `source_url`, `published_at`, `embedding` | quote 必须通过原文逐字校验；结构字段受词表约束 |
| `memory_items` | `id`, `user_id`, `category`, `key`, `value`, `is_core`, `source`, `status`, `supersedes`, `created_at` | 每用户/品类/维度最多一个 active 条目 |
| `memory_events` | `id`, `memory_id`, `action`, `turn_id`, `reason`, `at` | 只追加；删除后不得保留敏感条件值 |
| `agent_traces` | `id`, `turn_id`, `node`, `status`, `duration_ms`, `input_summary`, `output_summary`, `created_at` | 入参与结果需脱敏、截断 |

建议数据库约束：

```sql
create unique index one_active_memory_per_dimension
on memory_items (user_id, category, key)
where status = 'active';
```

记忆更新应在同一数据库事务中完成，避免旧值已失效但新值未落库的中间状态。

### 5.2 答案数据契约

```ts
type AnswerPayload = {
  mode: 'global' | 'similar' | 'small_sample';
  appliedConditions: Array<{
    key: string;
    label: string;
    valueLabel: string;
    source: 'memory' | 'user_input' | 'followup_card';
    memoryId?: string;
  }>;
  similarSummary?: {
    authorCount: number;
    recommendCount: number;
    notRecommendCount: number;
    recommendRate?: number; // authorCount < 5 时必须缺省
  };
  globalSummary: {
    authorCount: number;
    recommendCount: number;
    notRecommendCount: number;
    recommendRate: number;
    keyRisk?: string;
  };
  products: ProductAnswer[];
  alternatives: ProductAnswer[];
  followup?: FollowupCard;
  disclaimers: string[];
  datasetNote: string;
  traceId: string;
};
```

每个原因必须携带 `reasonId`、去重作者数、条件范围和 `quoteIds`；每条原话必须携带来源类型、作者自述条件、发布时间及受控跳转 URL。

## 6. 接口设计

| 方法与路径 | 作用 | 关键输入/输出 |
| --- | --- | --- |
| `POST /api/sessions` | 选择/初始化身份 | persona → session、预置记忆摘要 |
| `DELETE /api/sessions/:id/reset` | 重置当前身份 | 清理并按 persona 恢复初始状态 |
| `POST /api/chat` | 发起搜索或追问 | sessionId、message、followupSelection? → 流式事件 |
| `GET /api/turns/:id/trace` | 展开 Agent 过程 | 节点、耗时、记忆与工具摘要 |
| `GET /api/quotes` | 获取原话列表 | productId、reasonId、stance、conditionContext → 原话列表 |
| `GET /api/memories` | 获取记忆管理数据 | session/user → 按品类分组的 active 条目与事件 |
| `PATCH /api/memories/:id` | 修改条件 | 合法新值 → 新条目、取代关系、事件 |
| `DELETE /api/memories/:id` | 删除条件 | 软删除、值清除、缓存失效 |
| `POST /api/memory-changes/:id/undo` | 撤销最近写入 | 恢复写入前状态 |
| `PATCH /api/sessions/:id/preferences` | 本次停用/启用记忆 | `memoryDisabled` |

通用接口要求：

- 所有写接口使用 schema 校验，并校验资源属于当前匿名会话。
- 对话接口按匿名会话与 IP 双重限流；模型调用设置 15 秒超时和费用上限。
- `source_url` 只允许 `https` 且域名命中允许列表，防止开放重定向。
- 客户端永远不接收模型 API Key、Supabase service role key 或数据库内部错误。

## 7. 页面与交互实现

### 7.1 路由建议

| 路由 | 对应页面 |
| --- | --- |
| `/` | P1 身份选择页 |
| `/chat` | P2 对话页及答案、追问、条件/原话底部弹层 |
| `/memories` | P5 记忆管理页 |

P3、P4 使用带焦点锁定的底部弹层；P6 是答案卡内折叠区。移动端弹层关闭后焦点返回触发元素，支持 Esc 和遮罩关闭。

### 7.2 页面状态要求

每个关键模块必须实现：加载中、成功、空数据、可恢复失败四种状态。对话流额外支持模型超时后的模板答案，原话跳转失败不能影响弹层内完整原话展示。

### 7.3 超范围查询

无法归一到两个目标意图时：

- 不调用统计工具和答案生成模型。
- 不写入任何长期记忆。
- 返回“Demo 目前只覆盖以下查询”，并展示两个可点击快捷标签。
- 仍记录最小追踪信息，但不得记录不必要的敏感输入摘要。

## 8. 验收标准

以下条目均为发布前必须通过的验收用例。

### AC-01 身份选择与隔离

- Given 首次打开链接，When 页面加载完成，Then 显示小林、小B两张身份卡及各自说明。
- When 选择小林，Then 进入对话页且仅加载小林的预置护肤条件。
- When 切换到小B，Then 不得看到小林的对话、记忆或追踪数据。
- When 重置小林，Then 清空其新增数据后恢复预置条件；重置小B后保持无记忆状态。

### AC-02 查询识别与范围控制

- Given 任一身份，When 输入 `DW粉底`、`婴儿米粉推荐` 或语义等价变体，Then 正确识别品类和目标产品。
- When 输入超范围查询，Then 返回受限提示和两个快捷标签，不产生答案统计、不写记忆。
- When 输入包含明确自述条件的支持查询，Then 条件仅在合法品类维度内被抽取。

### AC-03 小林有记忆标准路径

- Given 小林预置“脂溢性皮炎、油皮”，When 搜索 `DW粉底`，Then 条件栏显示已使用条件，脂溢性皮炎参与筛选，油皮仅参与排序/高亮。
- Then 首屏优先展示同类人数、推荐/不推荐及主要原因，同时保留一行全站共识和关键风险。
- Then 产品卡原因符合“单一现象 + 同类人数 + 条件范围”，并可分别打开正反原话。
- Then 满足门槛时显示同类人替代品；不满足时不显示替代品模块。
- Then 答案包含皮肤问题就医提示和“基于本次收集的 N 条内容”。

### AC-04 小B 冷启动与追问

- Given 小B 母婴品类无记忆，When 搜索 `婴儿米粉推荐`，Then 先返回全站答案，末尾显示只包含有数据维度的追问卡片。
- When 点选月龄和过敏史并确认，Then 以新一轮消息返回同类人答案，并出现可撤销的记忆写入轻提示。
- When 改为直接输入“宝宝 7 个月，吃蛋黄过敏过”，Then 抽取出等价条件并走相同统计链路。
- Then 月龄以出生月份存储；下次母婴查询自动读取并按当前月换算。
- Then 答案包含母婴就医提示和数据来源说明。

### AC-05 条件栏与本次停用

- When 点击条件栏，Then 底部弹层展示条件值、来源查询/卡片、写入时间和修改入口。
- When 打开“本次不按我的条件”，Then 当前会话后续搜索不读取长期记忆，但数据库中的 active 条目不被删除。
- When 再次启用，Then 后续搜索恢复读取；每次停用被记录为 `disabled_for_session`。

### AC-06 小样本降级

- Given 某产品同类作者为 1–4 人，When 生成答案，Then `mode=small_sample`，首屏为全站结论。
- Then 页面显示“仅 N 位和你情况相似的人提到过”，直接列出正反原话。
- Then API 与 UI 均不得出现同类人推荐比例字段或由小样本推导的百分比。

### AC-07 原话可验证性

- When 点击原因行或同类好评/吐槽，Then 原话按对应产品、原因和立场过滤。
- Then 每条展示笔记/评论、作者自述条件、时间及原文链接，且弹层内展示完整入库原话。
- Then 页面展示人数必须等于原话集合按 `author_id` 去重后的作者数。
- When 原文链接无法打开，Then 弹层原话仍可阅读且主答案不受影响。

### AC-08 记忆管理

- Given 存在记忆，When 打开记忆页，Then 按品类展示 active 条件、来源、时间及操作记录。
- When 修改同一维度，Then 新条目成为唯一 active 值，旧条目标记 `superseded` 并可在记录中追溯。
- When 删除条件，Then 条目状态变为 `deleted`，条件值和派生排序/高亮缓存被清除，Agent 不得自行触发删除。
- When 删除最后一个核心条件后重新搜索，Then 返回全站答案和追问卡片。
- When 点击写入轻提示的撤销，Then 恢复写入前状态并刷新条件栏和记忆页。

### AC-09 Agent 追踪

- When 展开“查看 Agent 过程”，Then 显示本轮节点顺序、每节点状态和耗时。
- Then 显示读取/写入的记忆及同类匹配、原因聚合、替代品挑选等工具调用摘要。
- Then 展示内容与实际执行记录一致，不暴露模型密钥、数据库凭据、完整系统提示词或不必要的敏感原文。

### AC-10 答案一致性与兜底

- Given 模型正常返回，Then 所有数字与工具结果逐项一致，所有引用 ID 均存在且属于对应产品/原因。
- Given 首次校验失败，When 系统重试一次，Then 使用同一工具事实重新生成，不得重新随机计算人数。
- Given 重试仍失败、模型报错或超过 15 秒，Then 返回工具结果的模板答案，记忆读写和追踪继续完成。
- Then 降级答案仍满足条件栏、统计门槛、原话、提示和数据来源要求。

### AC-11 移动端与基本质量

- 在 375px 宽度下无横向滚动，主要按钮和原因行可正常点击，底部弹层不被软键盘永久遮挡。
- 页面刷新后匿名身份及已持久化记忆可恢复；进行中的流式请求中断时允许用户重试。
- TypeScript 类型检查、Lint、单元测试和关键 E2E 用例全部通过后方可发布。
- 首屏不得直接暴露具体健康条件，只显示“和你情况相似的人”；具体值仅在用户主动展开条件详情后出现。

## 9. 测试方案

### 9.1 单元测试

重点覆盖纯函数和边界值：

- 条件抽取结果的 schema/词表校验与条件合并优先级。
- `match_similar` 的核心条件全匹配和次要条件不筛选。
- 全站/同类人数按作者去重。
- 4 人不出比例、5 人开始出比例的边界。
- 原因多数规则：恰好 50% 不展示，超过 50% 才展示。
- 替代品 4/5 人门槛、推荐与不推荐相等时不入选、排序稳定性。
- 月龄与出生月份换算，覆盖跨年场景。
- 记忆新增、同值忽略、更新取代、停用、删除与撤销状态机。
- 答案数字和引用一致性校验器。

### 9.2 集成测试

- 使用固定 seed 数据验证五个确定性工具及数据库查询结果。
- 验证记忆更新事务和唯一 active 索引在并发请求下不产生双 active。
- 模拟模型成功、格式错误、超时和服务异常，验证重试与模板兜底。
- 验证跨身份和跨品类无法读取对方记忆。
- 验证删除后敏感值不再出现在记忆接口、追踪摘要或缓存中。

### 9.3 E2E 测试

至少自动化以下路径：

1. 小林选择身份 → 搜 DW → 展开原因原话 → 查看条件来源 → 展开 Agent 过程。
2. 小B选择身份 → 搜米粉 → 点选追问 → 查看写入提示 → 再次搜索命中记忆 → 撤销/删除记忆。
3. 触发小样本 → 确认无比例、全站优先、原话可见。
4. 输入超范围查询 → 确认只显示覆盖提示且无记忆变更。
5. 注入模型超时 → 确认 15 秒后模板答案可用。

## 10. 数据准备与质量门禁

经验数据上线前必须完成：

1. 两个查询分别收集全站样本、同类人定向样本和替代品样本。
2. 模型离线结构化为受控 schema。
3. 自动检查原话可在原文中逐字找到、条件/原因命中词表、产品 ID 有效。
4. 人工逐条复核作者条件为本人自述、态度、原话、产品和原因归属。
5. 使用固定 seed 生成统计快照，并由产品侧确认 Demo 文案中的所有 N、人数和产品名。

未完成以上门禁的记录不得进入演示统计。当前 PRD 尚未提供真实样本、具体人数、产品与替代品结果，因此这些内容是发布前唯一显式待定项，代码与 UI 不得硬编码虚构数字。

## 11. 安全、隐私与合规

- 健康、皮肤和婴儿过敏条件按敏感信息处理，日志默认不记录原始完整输入。
- 只保存完成产品功能所需的明确条件；不做行为推断或跨品类复用。
- Supabase service role key 和模型 Key 只存在服务端环境变量中。
- 匿名 ID 使用不可预测随机值，不使用姓名、手机号等真实身份标识。
- Agent 追踪中的输入、输出只保存受控摘要；敏感值按展示需要最小化。
- 数据库使用行级访问策略或服务端 repository 强制 `user_id` 过滤。
- 删除时清除条件值与派生缓存；操作日志仅保留发生过删除的审计事实。
- 小红书作者昵称脱敏，原文链接仅用于验证；页面注明数据样本范围和非医疗建议。

## 12. 可观测性与发布门禁

### 12.1 运行观测

服务端至少记录以下不含敏感值的指标：

- 每个 Agent 节点耗时、成功/失败状态。
- 模型超时率、格式校验失败率、模板兜底率。
- 工具查询耗时与结果数量。
- 记忆写入、更新、删除失败数。
- 对话接口总耗时和限流命中数。

产品指标埋点不在 MVP 范围内，以上仅为运行稳定性日志。

### 12.2 发布检查

- 两条标准路径、超范围、小样本和模型兜底路径均通过。
- 数据统计快照与页面数字逐项一致。
- 无双 active 记忆、无跨身份数据泄露。
- 生产环境密钥未进入客户端 bundle 或仓库。
- Vercel 部署可通过移动网络访问，375px 真机或等效模拟验收通过。
- 数据样本、原话和跳转链接已完成产品/人工校对。

## 13. 实施拆分（24h 建议）

| 阶段 | 产出 |
| --- | --- |
| 0–2h | 初始化工程、schema、seed 数据格式、两条标准路径的固定统计快照 |
| 2–7h | 身份/对话/答案/弹层 UI 与移动端布局 |
| 7–12h | Supabase 表、repository、五个确定性工具及单元测试 |
| 12–17h | LangGraph、模型结构化输出、流式协议、一致性校验与兜底 |
| 17–20h | 记忆管理、操作日志、撤销、Agent 追踪面板 |
| 20–23h | 集成/E2E、隐私检查、移动端修复、数据校对 |
| 23–24h | Vercel 发布、生产冒烟、演示路径复核 |

数据采集与人工校对应与开发并行；若真实数据在第 12 小时仍无法满足 5 人门槛，应按小样本规则验收，不得人为编造达标样本或比例。

## 14. 待确认事项

以下事项不阻塞工程骨架，但会阻塞最终 Demo 内容锁定：

1. 两个查询最终入库的真实记录数、去重作者数及来源链接。
2. DW 粉底与米粉场景的具体原因词表和条件范围单位。
3. 实际达到替代品门槛的产品名称及统计结果。
4. 最终选择的模型供应商、模型名、超时与调用额度。
5. Supabase/Vercel 项目及生产环境变量的归属。

