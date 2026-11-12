# Figma Make 前端接入说明

## 设计基线

- 来源：用户提供的「生成移动端 H5 交互原型.zip」。`src/app/figma-app.tsx` 保留包内原型组件作视觉参考；实际入口是 `src/app/figma-connected.tsx`。
- `src/app/figma.css` 源自包内 `src/index.css`，保留 430px 手机画布、状态栏、点点头部、卡片、弹层和记忆页的尺寸与色彩。
- `public/assets/dw-product-gallery.png` 与包内原件 SHA-256 一致；页面使用原始商品拼图而非重绘。
- Next.js 页面仍是 App Router Server Component，交互和 SSE 消费位于 Client Component；Tailwind CSS v4 通过 PostCSS 加载。

## 前后端映射

| 设计流程 | 实际数据来源 |
| --- | --- |
| 身份选择与重置 | `POST /api/sessions`、`DELETE /api/sessions/:id/reset` |
| 搜索、追问与答案 | `POST /api/chat` SSE；人数、比例、风险和替代品只取 `answer.data` |
| 条件弹层与本次停用 | `answer.data.appliedConditions`、`PATCH /api/sessions/:id/preferences` |
| 原话弹层 | `GET /api/quotes`，并按本轮答案的引用 ID 限定 |
| 记忆页、修改、删除、撤销 | `/api/memories`、`/api/memories/:id`、`/api/memory-changes/:id/undo` |
| Agent 过程 | `GET /api/turns/:id/trace` |

## 联调口径与待补数据

本地 `DATA_BACKEND=memory` 使用固定测试夹具，UI 明示“联调样本”，答案底部明示“模拟记录，非真实用户评价”。原型中固定的 17 人、72%、486 人、具体米粉品牌及替代品推荐人数没有搬入运行时答案。若要让演示内容也逐字逐数与原型一致，需提供经过离线采集、原话逐字校验和人工复核的真实记录，按 `prd.md` 第 6.6 节入库；不能用设计稿中的占位数字冒充可验证事实。

## 验证

- 浏览器对照：身份页、对话空态、DW 答案、条件弹层、原话弹层、记忆页布局与包内运行原型逐屏核对。
- 链路实测：小林 DW 搜索；小 B 米粉首轮、自然语言补充“宝宝7个月，吃蛋黄过敏过”、同类人答案；本次停用记忆切换全站答案。
- 构建与测试：`npm run typecheck`、`npm run build`、`npm test`。
