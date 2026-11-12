"use client";

import { ArrowSquareOut, Brain, CaretDown, CaretRight, Check, CheckCircle, MagnifyingGlass, NotePencil, ShieldCheck, Sparkle, ThumbsDown, ThumbsUp, WarningCircle, X } from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import type { AnswerPayload, FollowupCard, ProductAnswer, QuoteItem, ReasonAnswer } from "@/domain/types";
import { readJson } from "./similar-voice-app";

export type QuoteTarget = {
  productId: string;
  title: string;
  reasonId?: string;
  stance?: "recommend" | "not_recommend";
  allowedIds: string[];
};

function percent(value: number) { return `${Math.round(value * 100)}%`; }

export function AnswerCard({ answer, turnId, sessionId, onConditions, onQuotes, onSearch }: {
  answer: AnswerPayload;
  turnId: string;
  sessionId: string;
  onConditions: () => void;
  onQuotes: (target: QuoteTarget) => void;
  onSearch: (message: string, selection?: Array<{ key: string; value: string }>) => void;
}) {
  const similar = answer.similarSummary;
  if (answer.notice) return <article className="notice-answer"><WarningCircle weight="fill" /><h2>{answer.notice.text}</h2><p>请选择一个已覆盖的问题，查看完整的同类人口碑。</p><div>{answer.notice.quickTags.map((tag) => <button key={tag} onClick={() => onSearch(tag)}>{tag}</button>)}</div></article>;
  const title = answer.mode === "similar" && similar
    ? `和你情况相似的 ${similar.authorCount} 人中，${similar.recommendCount} 人推荐`
    : answer.mode === "small_sample" && similar
      ? `仅 ${similar.authorCount} 位同类人提到过，先看整体结论`
      : `整体 ${percent(answer.globalSummary.recommendRate)} 的人推荐`;
  return <article className="answer-block">
    {!!answer.appliedConditions.length && <button className="condition-banner" onClick={onConditions}><span><Check weight="bold" />已按你的条件筛选</span><span>{answer.appliedConditions.map((item) => item.valueLabel).join(" · ")}<CaretDown /></span></button>}
    <div className={`insight ${answer.mode}`}><div className="eyebrow"><Sparkle weight="fill" /> 同类人口碑</div><h2>{title}</h2>
      {similar && answer.mode !== "global" && <div className="vote-summary"><div className="vote-track"><span style={{ width: `${similar.authorCount ? (similar.recommendCount / similar.authorCount) * 100 : 0}%` }} /></div><div className="vote-labels"><span><ThumbsUp weight="fill" />{similar.recommendCount} 人推荐</span><span><ThumbsDown weight="fill" />{similar.notRecommendCount} 人不推荐</span></div></div>}
      <p>只统计作者明确说过的自身条件，每个作者只计一次。</p>
    </div>
    <div className="global-consensus"><span>全站共识</span><strong>{percent(answer.globalSummary.recommendRate)} 推荐</strong><small>{answer.globalSummary.authorCount} 位作者</small></div>
    {answer.globalSummary.keyRisk && <p className="key-risk"><WarningCircle />{answer.globalSummary.keyRisk}</p>}
    {answer.products.map((product) => <ProductCard key={product.productId} product={product} onQuotes={onQuotes} />)}
    {!!answer.alternatives.length && <section className="alternatives"><div className="section-title"><CheckCircle weight="fill" /><div><small>同类人更常推荐</small><h3>可以看看这些替代品</h3></div></div>{answer.alternatives.map((product) => <ProductCard key={product.productId} product={product} onQuotes={onQuotes} compact />)}</section>}
    {answer.followup && <Followup card={answer.followup} onSearch={onSearch} />}
    <div className="answer-notes">{answer.disclaimers.map((note) => <p key={note}><WarningCircle />{note}</p>)}<p><ShieldCheck />{answer.datasetNote}</p></div>
    <Trace turnId={turnId} sessionId={sessionId} />
  </article>;
}

function ProductCard({ product, compact = false, onQuotes }: { product: ProductAnswer; compact?: boolean; onQuotes: (target: QuoteTarget) => void }) {
  function openReason(reason: ReasonAnswer) {
    onQuotes({ productId: product.productId, title: reason.tag, reasonId: reason.reasonId, stance: reason.stance, allowedIds: reason.quoteIds });
  }
  function openStance(stance: "recommend" | "not_recommend") {
    onQuotes({ productId: product.productId, title: stance === "recommend" ? "同类好评" : "同类吐槽", stance, allowedIds: product.similarQuoteIds });
  }
  return <section className={`product-card ${compact ? "compact" : ""}`}><div className="product-heading"><div className="product-icon">{product.name.slice(0, 2)}</div><div><small>{compact ? "同品类替代" : "本次分析产品"}</small><h3>{product.name}</h3></div></div>
    {!!product.reasons.length && <div className="reason-list">{product.reasons.map((reason) => <button key={reason.reasonId} onClick={() => openReason(reason)}><span className={reason.stance === "recommend" ? "positive" : "negative"}>{reason.stance === "recommend" ? <ThumbsUp weight="fill" /> : <ThumbsDown weight="fill" />}</span><span><b>{reason.tag}</b><small>{reason.authorCount} 位同类作者提到{reason.conditionRange ? ` · ${reason.conditionRange.min}–${reason.conditionRange.max}${reason.conditionRange.unit || ""}` : ""}</small></span><CaretRight /></button>)}</div>}
    <div className="stance-buttons"><button onClick={() => openStance("recommend")}><ThumbsUp />同类好评</button><button onClick={() => openStance("not_recommend")}><ThumbsDown />同类吐槽</button></div>
  </section>;
}

function Followup({ card, onSearch }: { card: FollowupCard; onSearch: (message: string, selection?: Array<{ key: string; value: string }>) => void }) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const entries = Object.entries(selected);
  return <section className="followup"><NotePencil weight="duotone" /><h3>再告诉我一点你的情况</h3><p>补充后，我会单独看相似作者的反馈。</p>
    {card.dimensions.map((dimension) => <div className="followup-group" key={dimension.key}><b>{dimension.label}</b><div>{(dimension.type === "month" ? ["6个月", "7个月", "8个月", "9个月"] : dimension.options || []).map((option) => <button className={selected[dimension.key] === option ? "selected" : ""} key={option} onClick={() => setSelected((current) => ({ ...current, [dimension.key]: option }))}>{selected[dimension.key] === option && <Check />}{option}</button>)}</div></div>)}
    <button className="main-button" disabled={!entries.length} onClick={() => onSearch(`补充条件：${entries.map(([, value]) => value).join("、")}`, entries.map(([key, value]) => ({ key, value })))}>按这些条件重新看看</button>
  </section>;
}

const traceLabels: Record<string, string> = { understand_query: "理解查询", load_memory: "读取记忆", decide_followup: "判断是否追问", build_global_answer: "生成全站答案", run_tools: "同类匹配与原因聚合", compose_answer: "组织答案", validate_answer: "校验数字与引用", render_template: "模板兜底", persist_memory: "写入记忆", persist_trace: "记录执行过程" };

function Trace({ turnId, sessionId }: { turnId: string; sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState<Array<{ node: string; status: string; durationMs: number; outputSummary?: string }>>([]);
  const [error, setError] = useState("");
  async function toggle() {
    if (!open && !nodes.length) {
      try { const data = await readJson<{ nodes: typeof nodes }>(`/api/turns/${turnId}/trace?sessionId=${encodeURIComponent(sessionId)}`); setNodes(data.nodes); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "读取失败"); }
    }
    setOpen(!open);
  }
  return <div className="trace"><button onClick={() => void toggle()}><Brain weight="duotone" /><span><b>查看 Agent 过程</b><small>记忆、工具和结果校验</small></span><CaretDown className={open ? "up" : ""} /></button>{open && <div className="trace-list">{error && <p>{error}</p>}{nodes.map((node, index) => <div key={`${node.node}-${index}`}><i>{index + 1}</i><span><b>{traceLabels[node.node] || node.node}</b><small>{node.outputSummary || node.status}</small></span><em>{node.durationMs}ms</em></div>)}</div>}</div>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet" role="dialog" aria-modal="true" aria-label={title}><div className="sheet-handle" /><header><h2>{title}</h2><button aria-label="关闭" onClick={onClose}><X /></button></header><div className="sheet-body">{children}</div></section></div>;
}

export function ConditionSheet({ answer, disabled, onToggle, onManage, onClose }: { answer: AnswerPayload; disabled: boolean; onToggle: (value: boolean) => void; onManage: () => void; onClose: () => void }) {
  return <Sheet title="本次生效的条件" onClose={onClose}><p className="sheet-intro">条件来自你的主动补充或已保存的记忆。</p><div className="condition-list">{answer.appliedConditions.map((condition) => <div key={condition.key}><CheckCircle weight="fill" /><span><small>{condition.label}</small><b>{condition.valueLabel}</b><em>来自{condition.source === "preset" ? "预置身份" : condition.source === "memory" ? "你的记忆" : "本轮补充"}</em></span></div>)}</div><label className="switch-row"><span><b>本次不按我的条件</b><small>不会删除已记住的内容</small></span><input type="checkbox" checked={disabled} onChange={(event) => onToggle(event.target.checked)} /></label><button className="main-button" onClick={onManage}>管理全部记忆</button></Sheet>;
}

export function QuoteSheet({ target, sessionId, onClose }: { target: QuoteTarget; sessionId: string; onClose: () => void }) {
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [status, setStatus] = useState("正在读取原话...");
  useEffect(() => {
    const query = new URLSearchParams({ sessionId, productId: target.productId });
    if (target.reasonId) query.set("reasonId", target.reasonId);
    if (target.stance) query.set("stance", target.stance);
    readJson<{ quotes: QuoteItem[] }>(`/api/quotes?${query}`)
      .then((data) => { setQuotes(data.quotes.filter((quote) => target.allowedIds.includes(quote.id))); setStatus(""); })
      .catch((error) => setStatus(error instanceof Error ? error.message : "读取失败"));
  }, [target, sessionId]);
  return <Sheet title={target.title} onClose={onClose}><div className="quote-count">同类作者原话 · {quotes.length} 条</div>{status && <p className="sheet-status">{status}</p>}{!status && !quotes.length && <div className="empty-quotes"><MagnifyingGlass /><b>暂无匹配原话</b></div>}<div className="quote-list">{quotes.map((quote) => <article key={quote.id}><div className="quote-meta"><span>{quote.sourceType === "note" ? "笔记" : "评论"}</span><time>{quote.publishedAt}</time></div><blockquote>“{quote.text}”</blockquote><p>{quote.authorConditions.map((condition) => `${condition.label}：${condition.valueLabel}`).join(" · ") || "作者未补充更多条件"}</p>{quote.sourceUrl && <a href={quote.sourceUrl} target="_blank" rel="noopener noreferrer">查看小红书原文 <ArrowSquareOut /></a>}</article>)}</div></Sheet>;
}
