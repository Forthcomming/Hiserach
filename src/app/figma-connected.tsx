"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AnswerPayload,
  FollowupCard,
  MemoryEvent,
  Persona,
  ProductAnswer,
  QuoteItem,
  ReasonAnswer,
  StreamEvent,
} from "@/domain/types";
import {
  ChatHeader,
  Composer,
  DotsLogo,
  Icon,
  IdentityPage,
  ProductVisual,
  Reason,
  StatusBar,
  Welcome,
} from "./figma-app";

type SessionInfo = { sessionId: string; userId: string; persona: Persona };
type Turn = {
  id: string;
  text: string;
  request: string;
  selection?: Array<{ key: string; value: string }>;
  answer: AnswerPayload;
  turnId: string;
};
type MemoryRecord = {
  id: string;
  key: string;
  category: string;
  isCore: boolean;
  value?: string | { birthMonth: string };
  createdAt: string;
  source: { channel: string; query?: string; userQuote?: string };
};
type MemoryGroup = {
  category: "beauty" | "baby_food";
  active: MemoryRecord[];
  history: MemoryRecord[];
};
type QuoteTarget = {
  productId: string;
  title: string;
  allowedIds: string[];
  reasonId?: string;
  stance?: "recommend" | "not_recommend";
};

const storageKey = "hisearch-figma-sessions-v1";
const conditionNames: Record<string, string> = {
  skin_issue: "皮肤状态",
  skin_type: "肤质",
  allergy: "过敏史",
  diarrhea: "腹泻",
  age_month: "月龄",
};
const changeOptions: Record<string, string[]> = {
  skin_issue: ["脂溢性皮炎", "敏感肌", "痘痘肌", "无特殊皮肤问题"],
  skin_type: ["油皮", "干皮", "混油", "混干", "中性"],
  allergy: ["有过敏", "无过敏"],
  diarrhea: ["有腹泻", "无腹泻"],
  age_month: ["6个月", "7个月", "8个月", "9个月"],
};
const traceLabels: Record<string, string> = {
  understand_query: "理解查询",
  load_memory: "读取记忆",
  decide_followup: "判断是否追问",
  build_global_answer: "生成全站答案",
  run_tools: "调用工具",
  compose_answer: "生成答案",
  validate_answer: "校验数字与原话",
  render_template: "模板兜底",
  persist_memory: "写入记忆",
  persist_trace: "记录执行过程",
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "请求失败，请重试");
  return data as T;
}

function valueOf(memory: MemoryRecord) {
  if (typeof memory.value === "string") return memory.value;
  if (!memory.value) return "已删除";
  const [year, month] = memory.value.birthMonth.split("-").map(Number);
  const now = new Date();
  return `${Math.max(0, (now.getFullYear() - year) * 12 + now.getMonth() + 1 - month)} 个月`;
}

function percent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}
function quoteTarget(
  product: ProductAnswer,
  title: string,
  reason?: ReasonAnswer,
  stance?: "recommend" | "not_recommend",
): QuoteTarget {
  return {
    productId: product.productId,
    title,
    allowedIds: reason?.quoteIds || product.similarQuoteIds,
    ...(reason ? { reasonId: reason.reasonId, stance: reason.stance } : stance ? { stance } : {}),
  };
}

function DynamicTrace({ turnId, sessionId }: { turnId: string; sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState<
    Array<{ node: string; durationMs: number; status: string; outputSummary?: string }>
  >([]);
  const [error, setError] = useState("");
  async function toggle() {
    if (!open && !nodes.length) {
      try {
        const data = await json<{ nodes: typeof nodes }>(
          `/api/turns/${turnId}/trace?sessionId=${encodeURIComponent(sessionId)}`,
        );
        setNodes(data.nodes);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "读取失败");
      }
    }
    setOpen(!open);
  }
  return (
    <section className={`agent-trace ${open ? "open" : ""}`}>
      <button className="agent-trace-toggle" onClick={() => void toggle()} aria-expanded={open}>
        查看 Agent 过程 <Icon name="chevron" size={13} />
      </button>
      {open && (
        <ol className="agent-steps">
          {error && <li>{error}</li>}
          {nodes.map((node, index) => (
            <li key={`${node.node}-${index}`}>
              <i />
              <div>
                <b>
                  {index + 1}. {traceLabels[node.node] || node.node}
                </b>
                <p>{node.outputSummary || node.status}</p>
              </div>
              <time>{node.durationMs}ms</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DynamicActions({ answer, onRetry }: { answer: AnswerPayload; onRetry: () => void }) {
  const [copied, setCopied] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [disliked, setDisliked] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(
      `${answer.products.map((item) => item.name).join("、")}：${answer.similarSummary ? `${answer.similarSummary.authorCount} 位同类作者，${answer.similarSummary.recommendCount} 位推荐` : `全站 ${percent(answer.globalSummary.recommendRate)} 推荐`}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div className="answer-actions">
      <div>
        <button onClick={() => void copy()} aria-label="复制答案">
          <Icon name={copied ? "check" : "copy"} size={18} />
        </button>
        <button
          onClick={() => setFavorite(!favorite)}
          className={favorite ? "active" : ""}
          aria-label="收藏答案"
        >
          <Icon name="star" size={19} />
        </button>
        <button
          onClick={() => {
            if (navigator.share) void navigator.share({ title: "点点 AI 搜", url: location.href });
            else void copy();
          }}
          aria-label="分享答案"
        >
          <Icon name="share" size={19} />
        </button>
      </div>
      <div>
        <button
          onClick={() => setDisliked(!disliked)}
          className={disliked ? "active" : ""}
          aria-label="不喜欢此答案"
        >
          <Icon name="dislike" size={18} />
        </button>
        <button onClick={onRetry} aria-label="重新生成">
          <Icon name="retry" size={19} />
        </button>
      </div>
    </div>
  );
}

function DynamicFollowup({
  card,
  onSubmit,
}: {
  card: FollowupCard;
  onSubmit: (items: Array<{ key: string; value: string }>) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  return (
    <section className="followup-card">
      <div className="followup-title">
        <DotsLogo small />
        <div>
          <b>找和你家情况相似的经验</b>
        </div>
      </div>
      {card.dimensions.map((dimension) => (
        <div className="followup-dimension" key={dimension.key}>
          <label>{dimension.label === "月龄" ? "宝宝月龄" : dimension.label}</label>
          <div className="option-row">
            {(dimension.type === "month"
              ? ["6个月", "7个月", "8个月", "9个月"]
              : dimension.options || []
            ).map((option) => (
              <button
                key={option}
                className={selected[dimension.key] === option ? "active" : ""}
                onClick={() => setSelected((prev) => ({ ...prev, [dimension.key]: option }))}
              >
                {selected[dimension.key] === option && <Icon name="check" size={13} />}
                {option}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        className="primary-button"
        disabled={!Object.keys(selected).length}
        onClick={() => onSubmit(Object.entries(selected).map(([key, value]) => ({ key, value })))}
      >
        看看同类家长怎么说
      </button>
    </section>
  );
}

function DynamicAnswer({
  answer,
  turnId,
  sessionId,
  onConditions,
  onQuotes,
  onFollowup,
  onRetry,
  onSearch,
}: {
  answer: AnswerPayload;
  turnId: string;
  sessionId: string;
  onConditions: (answer: AnswerPayload) => void;
  onQuotes: (target: QuoteTarget) => void;
  onFollowup: (items: Array<{ key: string; value: string }>) => void;
  onRetry: () => void;
  onSearch: (message: string) => void;
}) {
  if (answer.notice)
    return (
      <article className="answer-card unsupported-card">
        <p>{answer.notice.text}</p>
        <div className="unsupported-options">
          {answer.notice.quickTags.map((tag) => (
            <button key={tag} onClick={() => onSearch(tag)}>
              {tag}
            </button>
          ))}
        </div>
      </article>
    );
  const product = answer.products[0];
  if (!product) return null;
  const rice = product.productId.startsWith("p_rice");
  const similar = answer.similarSummary;
  const similarMode = answer.mode !== "global" && !!similar;
  const reasons = product.reasons;
  return (
    <>
      <article className="answer-card">
        {!!answer.appliedConditions.length && (
          <button className="condition-bar" onClick={() => onConditions(answer)}>
            <Icon name="shield" size={20} />
            <span>
              <b>已按你的情况筛选</b>
            </span>
            <Icon name="chevron" size={17} />
          </button>
        )}
        {!rice && (
          <img
            className="mt-3 block w-full rounded-[16px]"
            src="/assets/dw-product-gallery.png"
            alt="雅诗兰黛 DW 粉底液三张商品展示"
          />
        )}
        {rice && !similarMode ? (
          <>
            <div className="source-line">
              <Icon name="shield" size={20} />
              参考 {answer.globalSummary.authorCount} 位作者经验
            </div>
            <p className="answer-lead">
              给宝宝选第一口米粉，配料干净和高铁好消化是关键，先看看这款的整体反馈：
            </p>
            <section className="ranking">
              <div>
                <span>1</span>
                <ProductVisual kind="rice" compact />
                <b>{product.name}</b>
                <em>{percent(answer.globalSummary.recommendRate)} 人推荐</em>
              </div>
            </section>
            <section className="mini-product">
              <div>
                <b>1. {product.name}</b>
                <span>{percent(answer.globalSummary.recommendRate)} 人推荐</span>
              </div>
              {answer.globalSummary.keyRisk && (
                <Reason tone="bad" title="全站风险：" text={answer.globalSummary.keyRisk} />
              )}
            </section>
          </>
        ) : (
          <>
            {rice && <p className="answer-lead">结合你家宝宝的情况，结论和全站反馈可能不一样：</p>}
            {!rice && (
              <h2 className="m-0 mb-3 text-[18px] leading-[1.35] font-semibold">{product.name}</h2>
            )}
            {similarMode && (
              <section
                className={
                  rice ? "similar-summary rice-summary" : "rounded-[16px] bg-[#f8f8f8] p-[15px]"
                }
              >
                {rice && (
                  <div className="summary-kicker">参考 {similar.authorCount} 位同类家长经验</div>
                )}
                {rice ? (
                  <div className="summary-main">
                    <strong>
                      {similar.authorCount}
                      <small> 人中 </small>
                      {similar.recommendCount}
                      <small> 人推荐{product.name}</small>
                    </strong>
                    <span>
                      {answer.mode === "small_sample"
                        ? "样本较少"
                        : similar.recommendCount > similar.notRecommendCount
                          ? "多数推荐"
                          : "多数不推荐"}
                    </span>
                  </div>
                ) : (
                  <p className="m-0 text-[15px] leading-[1.45]">
                    和你情况相似的 <b className="text-[18px] text-[#222]">{similar.authorCount}</b>{" "}
                    人中，<b className="text-[18px] text-[#222]">{similar.recommendCount}</b> 人推荐
                  </p>
                )}
                {answer.mode === "similar" && (
                  <div className={rice ? "meter" : "meter mt-2 mb-2.5"}>
                    <i
                      style={{
                        width: `${similar.recommendRate ? similar.recommendRate * 100 : 0}%`,
                        ...(rice ? {} : { background: "#222" }),
                      }}
                    />
                  </div>
                )}
                {answer.mode === "small_sample" && (
                  <p className="small-sample-note">
                    仅 {similar.authorCount} 位同类作者提到，先看整体结论，不计算同类比例。
                  </p>
                )}
                <div className={rice ? "" : "border-t border-[#e9e9e9]"}>
                  {reasons.map((reason) =>
                    rice ? (
                      <button
                        key={reason.reasonId}
                        onClick={() => onQuotes(quoteTarget(product, reason.tag, reason))}
                      >
                        <span>{reason.tag}</span>
                        <b>{reason.authorCount} 人</b>
                        <small>
                          {reason.conditionRange
                            ? `${reason.conditionRange.min}–${reason.conditionRange.max}${reason.conditionRange.unit || ""}`
                            : reason.onset || "查看原话"}
                        </small>
                        <Icon name="chevron" size={15} />
                      </button>
                    ) : (
                      <button
                        key={reason.reasonId}
                        className="flex w-full items-center gap-2.5 border-b border-[#e9e9e9] py-3 text-left text-[12px] leading-[1.6]"
                        onClick={() => onQuotes(quoteTarget(product, reason.tag, reason))}
                      >
                        <span
                          className={
                            reason.stance === "recommend" ? "text-[#555]" : "text-[#ff2e4d]"
                          }
                        >
                          <Icon
                            name={reason.stance === "recommend" ? "thumb" : "alert"}
                            size={17}
                          />
                        </span>
                        <span className="flex-1">
                          <b>{reason.tag}：</b>
                          {reason.authorCount} 人提到{reason.onset ? `，${reason.onset}` : ""}
                        </span>
                        <Icon name="chevron" size={14} />
                      </button>
                    ),
                  )}
                </div>
              </section>
            )}
            {rice ? (
              <div className="consensus">
                <b>全站共识</b>
                <span>整体 {percent(answer.globalSummary.recommendRate)} 推荐</span>
                <i />
                {answer.globalSummary.keyRisk || "同类反馈供参考"}
              </div>
            ) : (
              <p className="mt-3 mb-0 border-b border-[#eee] pb-3 text-[11px] text-[#999]">
                全站 {percent(answer.globalSummary.recommendRate)} 推荐
                {answer.globalSummary.keyRisk ? ` · ${answer.globalSummary.keyRisk}` : ""}
              </p>
            )}
            {rice && (
              <section className="product-card">
                <div className="product-head">
                  <ProductVisual kind="rice" />
                  <div>
                    <span className="rank">1</span>
                    <h2>{product.name}</h2>
                    <p>婴幼儿米粉</p>
                    <em>
                      {similar?.recommendRate !== undefined
                        ? `${percent(similar.recommendRate)} 同类人推荐`
                        : `${similar?.authorCount || 0} 位同类作者`}
                    </em>
                  </div>
                </div>
                {reasons.map((reason) => (
                  <Reason
                    key={reason.reasonId}
                    tone={reason.stance === "recommend" ? "good" : "bad"}
                    title={`${reason.tag}：`}
                    text={`${reason.authorCount} 位同类作者提到。`}
                    count={`${reason.authorCount} 人`}
                    onClick={() => onQuotes(quoteTarget(product, reason.tag, reason))}
                  />
                ))}
                <div className="sentiment-buttons">
                  <button
                    onClick={() =>
                      onQuotes(quoteTarget(product, "同类好评", undefined, "recommend"))
                    }
                  >
                    同类好评 <Icon name="chevron" size={14} />
                  </button>
                  <button
                    onClick={() =>
                      onQuotes(quoteTarget(product, "同类吐槽", undefined, "not_recommend"))
                    }
                  >
                    同类吐槽 <Icon name="chevron" size={14} />
                  </button>
                </div>
              </section>
            )}
          </>
        )}
        {!!answer.alternatives.length && (
          <section className="alternative">
            <div className="section-title">
              <Icon name="sparkle" size={18} />
              <b>{rice ? "同类家长更推荐" : "同类人更推荐"}</b>
            </div>
            {answer.alternatives.map((alt) => (
              <div className={`alternative-card ${rice ? "rice-alt" : ""}`} key={alt.productId}>
                <ProductVisual kind={rice ? "engnice" : "lancome"} compact />
                <div>
                  <h3>{alt.name}</h3>
                  <p>同品类替代 · 查看同类作者原话</p>
                  <button
                    onClick={() => onQuotes(quoteTarget(alt, "替代品好评", undefined, "recommend"))}
                  >
                    查看原话 <Icon name="chevron" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
        {answer.disclaimers
          .filter((note) => !note.includes("面试演示"))
          .map((note) => (
            <div className="safety-note" key={note}>
              <Icon name="alert" size={18} />
              <span>
                <b>健康提示</b>
                {note}
              </span>
            </div>
          ))}
        <DynamicTrace turnId={turnId} sessionId={sessionId} />
        <div className="data-note">
          {answer.datasetNote}
          {answer.disclaimers.some((note) => note.includes("面试演示"))
            ? " · 仅供演示，非医疗建议"
            : ""}
        </div>
        <DynamicActions answer={answer} onRetry={onRetry} />
      </article>
      {answer.followup && <DynamicFollowup card={answer.followup} onSubmit={onFollowup} />}
    </>
  );
}

function ConnectedSheet({
  answer,
  target,
  sessionId,
  memoryDisabled,
  onToggle,
  onClose,
  onMemory,
}: {
  answer: AnswerPayload | null;
  target: QuoteTarget | null;
  sessionId: string;
  memoryDisabled: boolean;
  onToggle: (disabled: boolean) => void;
  onClose: () => void;
  onMemory: () => void;
}) {
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!target) return;
    const params = new URLSearchParams({ sessionId, productId: target.productId });
    if (target.reasonId) params.set("reasonId", target.reasonId);
    if (target.stance) params.set("stance", target.stance);
    setStatus("正在读取原话...");
    json<{ quotes: QuoteItem[] }>(`/api/quotes?${params}`)
      .then((data) => {
        setQuotes(data.quotes.filter((item) => target.allowedIds.includes(item.id)));
        setStatus("");
      })
      .catch((cause) => setStatus(cause instanceof Error ? cause.message : "读取失败"));
  }, [target, sessionId]);
  if (!answer && !target) return null;
  return (
    <div
      className="sheet-layer"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={`bottom-sheet ${target ? "quote-sheet" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <h2>{target ? target.title : "本次参考的条件"}</h2>
          </div>
          <button onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
        {answer && (
          <>
            <div className="condition-detail">
              {answer.appliedConditions.map((condition) => (
                <div className="condition-item" key={condition.key}>
                  <span>{condition.valueLabel}</span>
                  <b
                    className={
                      condition.key === "age_month" || condition.key === "skin_type"
                        ? "secondary"
                        : ""
                    }
                  >
                    {condition.key === "age_month" || condition.key === "skin_type"
                      ? "辅助条件"
                      : "核心条件"}
                  </b>
                  <p>
                    {condition.source === "memory" || condition.source === "preset"
                      ? "来自已保存的记忆"
                      : "来自本轮主动补充"}
                  </p>
                </div>
              ))}
            </div>
            <div className="sheet-switch">
              <div>
                <b>本次不按我的条件</b>
                <span>关闭后将显示全站综合结论</span>
              </div>
              <button
                className={memoryDisabled ? "on" : ""}
                onClick={() => onToggle(!memoryDisabled)}
                aria-label="本次不按我的条件"
              >
                <i />
              </button>
            </div>
            <button className="text-button" onClick={onMemory}>
              管理已记住的条件 <Icon name="chevron" size={15} />
            </button>
          </>
        )}
        {target && (
          <>
            <div className="quote-tabs">
              <button className="active">相关原话 {quotes.length}</button>
            </div>
            <div className="quote-list">
              {status && <p>{status}</p>}
              {!status && !quotes.length && <p>暂无匹配原话</p>}
              {quotes.map((quote) => (
                <div className="quote-item" key={quote.id}>
                  <div>
                    <span>{quote.sourceType === "note" ? "笔记" : "评论"}</span>
                    <b>
                      {quote.authorConditions.map((item) => item.valueLabel).join(" · ") ||
                        "作者未补充条件"}
                    </b>
                    <time>{quote.publishedAt}</time>
                  </div>
                  <p>“{quote.text}”</p>
                  {quote.sourceUrl && (
                    <a href={quote.sourceUrl} target="_blank" rel="noreferrer">
                      查看小红书原文 <Icon name="external" size={14} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ConnectedMemory({
  session,
  disabled,
  onBack,
  onToggle,
  onReset,
  onNotice,
}: {
  session: SessionInfo;
  disabled: boolean;
  onBack: () => void;
  onToggle: (value: boolean) => void;
  onReset: () => void;
  onNotice: (text: string) => void;
}) {
  const [groups, setGroups] = useState<MemoryGroup[]>([]);
  const [events, setEvents] = useState<MemoryEvent[]>([]);
  const [selected, setSelected] = useState<MemoryRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    try {
      const data = await json<{ groups: MemoryGroup[]; events: MemoryEvent[] }>(
        `/api/memories?sessionId=${encodeURIComponent(session.sessionId)}`,
      );
      setGroups(data.groups);
      setEvents(data.events);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取失败");
    }
  }
  useEffect(() => {
    void load();
  }, [session.sessionId]);
  async function change(value: string) {
    if (!selected) return;
    try {
      await json(`/api/memories/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId, value }),
      });
      setSelected(null);
      setEditing(false);
      onNotice("条件已更新");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "修改失败");
    }
  }
  async function remove() {
    if (!selected || !window.confirm("删除后，相关的筛选和排序将不再生效")) return;
    try {
      await json(
        `/api/memories/${selected.id}?sessionId=${encodeURIComponent(session.sessionId)}`,
        { method: "DELETE" },
      );
      setSelected(null);
      onNotice("条件已删除");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败");
    }
  }
  if (selected)
    return (
      <main className="phone memory-page condition-detail-page">
        <StatusBar />
        <header className="memory-header">
          <button
            onClick={() => {
              setSelected(null);
              setEditing(false);
            }}
            aria-label="返回"
          >
            <Icon name="back" size={27} />
          </button>
          <h1>条件详情</h1>
          <span />
        </header>
        <section className="condition-hero">
          <span>{conditionNames[selected.key] || selected.key}</span>
          <h2>{valueOf(selected)}</h2>
          <p>
            来源：
            <b>
              “
              {selected.source.userQuote ||
                selected.source.query ||
                (selected.source.channel === "preset" ? "预置体验身份" : "主动补充")}
              ”
            </b>
          </p>
        </section>
        <section className="history-card">
          <h3>操作记录</h3>
          <ol>
            {events
              .filter((event) => event.memoryId === selected.id)
              .slice()
              .reverse()
              .map((event) => (
                <li key={event.id}>
                  <i />
                  <div>
                    <b>
                      {event.action === "used"
                        ? "被搜索使用"
                        : event.action === "created"
                          ? "写入"
                          : event.action === "superseded"
                            ? "被新值取代"
                            : event.action === "deleted"
                              ? "删除"
                              : event.action}
                    </b>
                    <time>{new Date(event.at).toLocaleString("zh-CN")}</time>
                  </div>
                </li>
              ))}
          </ol>
        </section>
        {editing && (
          <div className="memory-edit-options">
            {(changeOptions[selected.key] || []).map((value) => (
              <button key={value} onClick={() => void change(value)}>
                {value}
              </button>
            ))}
          </div>
        )}
        {error && <p className="memory-error">{error}</p>}
        <div className="condition-actions">
          <button onClick={() => setEditing(!editing)}>修改</button>
          <button onClick={() => void remove()}>删除</button>
        </div>
      </main>
    );
  const active =
    groups.find(
      (group) => group.category === (session.persona === "xiaolin" ? "beauty" : "baby_food"),
    )?.active || [];
  return (
    <main className="phone memory-page">
      <StatusBar />
      <header className="memory-header">
        <button onClick={onBack} aria-label="返回">
          <Icon name="back" size={27} />
        </button>
        <h1>我的记忆</h1>
        <button className="info-button" aria-label="记忆说明">
          <Icon name="info" size={18} />
        </button>
      </header>
      {error && <p className="memory-error">{error}</p>}
      {active.length ? (
        <section className="memory-group">
          <div className="memory-group-title">
            <span
              className={`category-icon ${session.persona === "xiaolin" ? "beauty" : "baby"}`}
            />
            <div>
              <b>{session.persona === "xiaolin" ? "护肤彩妆" : "母婴辅食"}</b>
            </div>
          </div>
          {active.map((memory) => (
            <button className="memory-row" key={memory.id} onClick={() => setSelected(memory)}>
              <div className="memory-row-top">
                <div>
                  <b>{valueOf(memory)}</b>
                  <span>{memory.isCore ? "核心条件" : "辅助条件"}</span>
                </div>
                <Icon name="chevron" size={18} />
              </div>
              <p>
                {memory.source.query
                  ? `来自搜索“${memory.source.query}”时的补充`
                  : memory.source.channel === "preset"
                    ? "来自预置身份"
                    : "来自你的主动补充"}
              </p>
              <time>更新于 {new Date(memory.createdAt).toLocaleDateString("zh-CN")}</time>
            </button>
          ))}
        </section>
      ) : (
        <div className="empty-state">
          <span>
            <Icon name="memory" size={30} />
          </span>
          <h2>还没有记住的条件</h2>
          <p>完成一次搜索追问后，你主动选择的条件会出现在这里。</p>
        </div>
      )}
      <div className="sheet-switch memory-toggle">
        <div>
          <b>本次不按我的条件</b>
          <span>只影响当前对话</span>
        </div>
        <button
          className={disabled ? "on" : ""}
          onClick={() => onToggle(!disabled)}
          aria-label="本次不按我的条件"
        >
          <i />
        </button>
      </div>
      <button className="reset-button" onClick={onReset} disabled={!active.length}>
        清除全部记忆
      </button>
    </main>
  );
}

export default function FigmaConnectedApp({ fixtureMode }: { fixtureMode: boolean }) {
  const [sessions, setSessions] = useState<Partial<Record<Persona, SessionInfo>>>({});
  const [identity, setIdentity] = useState<Persona | null>(null);
  const [screen, setScreen] = useState<"identity" | "chat" | "memory">("identity");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; undoToken?: string } | null>(null);
  const [conditionAnswer, setConditionAnswer] = useState<AnswerPayload | null>(null);
  const [quote, setQuote] = useState<QuoteTarget | null>(null);
  const [memoryDisabled, setMemoryDisabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const session = identity ? sessions[identity] : undefined;
  useEffect(() => {
    try {
      setSessions(JSON.parse(localStorage.getItem(storageKey) || "{}"));
    } catch {
      /* ignore corrupt browser state */
    }
  }, []);
  useEffect(() => {
    if (notice) {
      const timer = window.setTimeout(() => setNotice(null), notice.undoToken ? 5000 : 3000);
      return () => window.clearTimeout(timer);
    }
  }, [notice]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [turns]);
  function save(next: Partial<Record<Persona, SessionInfo>>) {
    setSessions(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }
  async function choose(persona: Persona) {
    setBusy(true);
    try {
      let next = sessions[persona];
      if (next) {
        try {
          await json(`/api/memories?sessionId=${encodeURIComponent(next.sessionId)}`);
        } catch {
          next = undefined;
        }
      }
      if (!next) {
        next = await json<SessionInfo>("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona }),
        });
        save({ ...sessions, [persona]: next });
      }
      setIdentity(persona);
      setTurns([]);
      setMemoryDisabled(false);
      setScreen("chat");
      setNotice(null);
    } catch (cause) {
      setNotice({ text: cause instanceof Error ? cause.message : "进入失败" });
    } finally {
      setBusy(false);
    }
  }
  async function reset(persona: Persona) {
    const current = sessions[persona];
    if (!current) return;
    const data = await json<{ sessionId: string }>(`/api/sessions/${current.sessionId}/reset`, {
      method: "DELETE",
    });
    const latest = JSON.parse(localStorage.getItem(storageKey) || "{}") as Partial<
      Record<Persona, SessionInfo>
    >;
    save({ ...latest, [persona]: { ...current, sessionId: data.sessionId } });
    if (persona === identity) {
      setTurns([]);
      setMemoryDisabled(false);
    }
  }
  async function search(
    message: string,
    selection?: Array<{ key: string; value: string }>,
    replaceLast = false,
  ) {
    if (!session || busy || !message.trim()) return;
    setBusy(true);
    setDraft("");
    const shown = selection ? selection.map((item) => item.value).join("、") : message.trim();
    const previousProduct = turns.at(-1)?.answer.products[0]?.productId;
    const contextualMessage =
      !selection &&
      previousProduct?.startsWith("p_rice") &&
      !message.includes("米粉") &&
      /(宝宝|个月|月龄|过敏|湿疹|腹泻)/.test(message)
        ? `婴儿米粉推荐，${message}`
        : message;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          message: contextualMessage,
          followupSelection: selection,
        }),
      });
      if (!response.ok || !response.body) throw new Error("暂时无法生成答案");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let turnId = "";
      let answer: AnswerPayload | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((part) => part.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as StreamEvent;
          if (event.type === "turn.started") turnId = event.turnId;
          if (event.type === "answer.data") answer = event.answer;
          if (event.type === "memory.changed")
            setNotice({ text: event.summary, undoToken: event.undoToken });
          if (event.type === "turn.failed") throw new Error("生成失败，请稍后重试");
        }
      }
      if (!answer) throw new Error("没有收到答案，请重试");
      setTurns((prev) => {
        const next = replaceLast ? prev.slice(0, -1) : prev;
        return [
          ...next,
          {
            id: crypto.randomUUID(),
            text: shown,
            request: contextualMessage,
            selection,
            answer,
            turnId: turnId || answer.traceId,
          },
        ];
      });
    } catch (cause) {
      setNotice({ text: cause instanceof Error ? cause.message : "搜索失败" });
    } finally {
      setBusy(false);
    }
  }
  async function toggleMemory(disabled: boolean) {
    if (!session) return;
    try {
      await json(`/api/sessions/${session.sessionId}/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId, memoryDisabled: disabled }),
      });
      setMemoryDisabled(disabled);
      setNotice({ text: disabled ? "本次已切换为全站综合结论" : "已恢复使用你的条件" });
      setConditionAnswer(null);
      const lastProduct = turns.at(-1)?.answer.products[0]?.productId;
      if (lastProduct)
        await search(lastProduct.startsWith("p_rice") ? "婴儿米粉推荐" : "DW粉底", undefined, true);
    } catch (cause) {
      setNotice({ text: cause instanceof Error ? cause.message : "设置失败" });
    }
  }
  async function undo(token: string) {
    if (!session) return;
    try {
      await json(`/api/memory-changes/${token}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      setNotice({ text: "已撤销" });
    } catch (cause) {
      setNotice({ text: cause instanceof Error ? cause.message : "撤销失败" });
    }
  }
  if (screen === "identity" || !identity || !session)
    return (
      <>
        <IdentityPage
          onSelect={(persona) => void choose(persona)}
          onReset={() => {
            if (!window.confirm("恢复初始演示状态？已保存的条件将被清除。")) return;
            void Promise.all((Object.keys(sessions) as Persona[]).map(reset))
              .then(() => setNotice({ text: "已重置演示记忆" }))
              .catch((cause) =>
                setNotice({ text: cause instanceof Error ? cause.message : "重置失败" }),
              );
          }}
        />
        {notice && (
          <div className="toast">
            <Icon name="check" size={17} />
            <span>{notice.text}</span>
          </div>
        )}
      </>
    );
  if (screen === "memory")
    return (
      <>
        <ConnectedMemory
          session={session}
          disabled={memoryDisabled}
          onBack={() => setScreen("chat")}
          onToggle={(value) => void toggleMemory(value)}
          onReset={() => {
            if (window.confirm("清除当前身份的全部记忆？"))
              void reset(identity)
                .then(() => setScreen("chat"))
                .catch((cause) =>
                  setNotice({ text: cause instanceof Error ? cause.message : "重置失败" }),
                );
          }}
          onNotice={(text) => setNotice({ text })}
        />
        {notice && (
          <div className="toast">
            <Icon name="check" size={17} />
            <span>{notice.text}</span>
          </div>
        )}
      </>
    );
  return (
    <main className="phone chat-page">
      <ChatHeader onBack={() => setScreen("identity")} onMemory={() => setScreen("memory")} />
      <div className="chat-scroll" ref={scrollRef}>
        {!turns.length && !busy ? (
          <Welcome onQuery={(query) => void search(query)} />
        ) : (
          <>
            {turns.map((turn) => (
              <div key={turn.id}>
                <div className="user-bubble">{turn.text}</div>
                <DynamicAnswer
                  answer={turn.answer}
                  turnId={turn.turnId}
                  sessionId={session.sessionId}
                  onConditions={setConditionAnswer}
                  onQuotes={setQuote}
                  onFollowup={(items) =>
                    void search(`补充条件：${items.map((item) => item.value).join("、")}`, items)
                  }
                  onRetry={() => void search(turn.request, turn.selection)}
                  onSearch={(message) => void search(message)}
                />
              </div>
            ))}
            {busy && (
              <div className="figma-thinking">
                <DotsLogo small />
                <span>正在查找同类作者的经验...</span>
              </div>
            )}
          </>
        )}
      </div>
      <Composer draft={draft} setDraft={setDraft} onSubmit={() => void search(draft)} />
      {notice && (
        <div className="toast">
          <Icon name="check" size={17} />
          <span>{notice.text}</span>
          {notice.undoToken && <button onClick={() => void undo(notice.undoToken!)}>撤销</button>}
        </div>
      )}
      {fixtureMode && (
        <span className="fixture-watermark" aria-label="本地联调模拟数据">
          联调样本
        </span>
      )}
      <ConnectedSheet
        answer={conditionAnswer}
        target={quote}
        sessionId={session.sessionId}
        memoryDisabled={memoryDisabled}
        onToggle={(value) => void toggleMemory(value)}
        onClose={() => {
          setConditionAnswer(null);
          setQuote(null);
        }}
        onMemory={() => {
          setConditionAnswer(null);
          setScreen("memory");
        }}
      />
    </main>
  );
}
