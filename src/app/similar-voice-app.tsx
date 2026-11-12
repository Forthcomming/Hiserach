"use client";

import { Baby, Brain, CaretRight, Drop, MagnifyingGlass, PaperPlaneRight, Sparkle, UserSwitch, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AnswerPayload, Persona, StreamEvent } from "@/domain/types";
import { AnswerCard, ConditionSheet, QuoteSheet, type QuoteTarget } from "./voice-parts";
import { MemoryScreen } from "./voice-memory";

export type SessionInfo = { sessionId: string; userId: string; persona: Persona };
export type Turn = { id: string; kind: "user"; text: string } | { id: string; kind: "answer"; answer: AnswerPayload; turnId: string };

export async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "请求失败，请重试");
  return data as T;
}

const personaInfo = {
  xiaolin: { name: "小林", tagline: "已有专属记忆", intro: "油皮，曾有脂溢性皮炎", query: "DW粉底", Icon: Drop },
  xiaob: { name: "小B", tagline: "初次使用", intro: "职场妈妈，正在挑选宝宝米粉", query: "婴儿米粉推荐", Icon: Baby },
} as const;

const storeKey = "hisearch-persona-sessions-v1";

export default function SimilarVoiceApp({ fixtureMode }: { fixtureMode: boolean }) {
  const [sessions, setSessions] = useState<Partial<Record<Persona, SessionInfo>>>({});
  const [persona, setPersona] = useState<Persona | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"chat" | "memory">("chat");
  const [memoryDisabled, setMemoryDisabled] = useState(false);
  const [notice, setNotice] = useState<{ text: string; undoToken?: string } | null>(null);
  const [conditionAnswer, setConditionAnswer] = useState<AnswerPayload | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<QuoteTarget | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const session = persona ? sessions[persona] : undefined;

  useEffect(() => {
    try { setSessions(JSON.parse(localStorage.getItem(storeKey) || "{}")); } catch { /* ignore malformed local storage */ }
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy]);

  function saveSessions(next: Partial<Record<Persona, SessionInfo>>) {
    setSessions(next);
    localStorage.setItem(storeKey, JSON.stringify(next));
  }

  async function choosePersona(nextPersona: Persona) {
    setBusy(true);
    try {
      if (!sessions[nextPersona]) {
        const created = await readJson<SessionInfo>("/api/sessions", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ persona: nextPersona }),
        });
        saveSessions({ ...sessions, [nextPersona]: created });
      }
      setPersona(nextPersona);
      setTurns([]);
      setMemoryDisabled(false);
      setView("chat");
      setNotice(null);
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "进入失败" }); }
    finally { setBusy(false); }
  }

  async function reset() {
    if (!session) return;
    setBusy(true);
    try {
      const fresh = await readJson<{ sessionId: string }>(`/api/sessions/${session.sessionId}/reset`, { method: "DELETE" });
      saveSessions({ ...sessions, [session.persona]: { ...session, sessionId: fresh.sessionId } });
      setTurns([]);
      setMemoryDisabled(false);
      setNotice({ text: "已恢复这个身份的初始状态" });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "重置失败" }); }
    finally { setBusy(false); }
  }

  async function search(message: string, followupSelection?: Array<{ key: string; value: string }>) {
    if (!session || busy || !message.trim()) return;
    setBusy(true);
    setInput("");
    setTurns((previous) => [...previous, { id: crypto.randomUUID(), kind: "user", text: message.trim() }]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId, message, followupSelection }),
      });
      if (!response.ok || !response.body) throw new Error("暂时无法生成答案");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let turnId = "";
      let answered = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const packets = buffer.split("\n\n");
        buffer = packets.pop() || "";
        for (const packet of packets) {
          const line = packet.split("\n").find((part) => part.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as StreamEvent;
          if (event.type === "turn.started") turnId = event.turnId;
          if (event.type === "answer.data") {
            answered = true;
            setTurns((previous) => [...previous, { id: crypto.randomUUID(), kind: "answer", answer: event.answer, turnId: turnId || event.answer.traceId }]);
          }
          if (event.type === "memory.changed") setNotice({ text: event.summary, undoToken: event.undoToken });
          if (event.type === "turn.failed") throw new Error("生成失败，请稍后重试");
        }
      }
      if (!answered) throw new Error("未收到答案，请重试");
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "请求失败" }); }
    finally { setBusy(false); }
  }

  async function toggleMemory(disabled: boolean) {
    if (!session) return;
    try {
      await readJson(`/api/sessions/${session.sessionId}/preferences`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId, memoryDisabled: disabled }),
      });
      setMemoryDisabled(disabled);
      setNotice({ text: disabled ? "本次对话将不使用已记住的条件" : "已恢复使用你的条件" });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "设置失败" }); }
  }

  async function undo(token: string) {
    if (!session) return;
    try {
      await readJson(`/api/memory-changes/${token}/undo`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.sessionId }),
      });
      setNotice({ text: "已撤销刚才的记忆写入" });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "撤销失败" }); }
  }

  if (!persona || !session) {
    return <main className="identity-screen">
      <div className="identity-intro"><div className="identity-logo"><Sparkle weight="fill" /></div><span>小红书 AI 搜</span><h1>先认识一下你</h1><p>从一堆别人的经验里，找到真正适合你的答案。</p></div>
      <div className="identity-options">{(["xiaolin", "xiaob"] as const).map((key) => {
        const info = personaInfo[key];
        return <button key={key} disabled={busy} onClick={() => void choosePersona(key)} className="identity-option">
          <span className={`identity-avatar ${key}`}><info.Icon weight="duotone" /></span><span><small>{info.tagline}</small><strong>{info.name}</strong><em>{info.intro}</em></span><CaretRight />
        </button>;
      })}</div>
      <p className="privacy-copy">条件只来自你明确说过的话，随时可改或删除</p>
      {notice && <div className="toast">{notice.text}</div>}
    </main>;
  }

  if (view === "memory") return <MemoryScreen session={session} memoryDisabled={memoryDisabled} onBack={() => setView("chat")} onToggle={toggleMemory} onNotice={(text) => setNotice({ text })} />;

  const info = personaInfo[persona];
  return <main className="app-shell">
    {fixtureMode && <div className="fixture-banner">本地联调样本 · 数字与原话尚未经真实数据校对</div>}
    <header className="topbar"><div className="topbar-title"><span><Sparkle weight="fill" /></span><div><b>AI 搜</b><small>同类人口碑</small></div></div><div><button aria-label="切换身份" onClick={() => setPersona(null)}><UserSwitch /></button><button onClick={() => setView("memory")}>我的记忆</button></div></header>
    <section className="conversation" aria-live="polite">
      {!turns.length && <div className="welcome"><div className="welcome-icon"><Brain weight="duotone" /></div><p>{info.name}，你好</p><h1>想看看什么产品<br />适不适合你？</h1>{persona === "xiaolin" && <div className="welcome-memory"><b>已记住你的护肤条件</b><span>脂溢性皮炎 · 油皮</span><small>搜索时会自动参考</small></div>}<button className="start-query" onClick={() => void search(info.query)}><MagnifyingGlass />{info.query}</button><button className="reset-button" onClick={() => void reset()}>重置这个身份</button></div>}
      {turns.map((turn) => turn.kind === "user" ? <div className="user-turn" key={turn.id}>{turn.text}</div> : <AnswerCard key={turn.id} answer={turn.answer} turnId={turn.turnId} sessionId={session.sessionId} onConditions={() => setConditionAnswer(turn.answer)} onQuotes={setQuoteTarget} onSearch={search} />)}
      {busy && <div className="thinking"><Sparkle weight="fill" /><span>正在匹配相似作者，校验原话与人数...</span></div>}
      <div ref={bottomRef} />
    </section>
    <form className="composer" onSubmit={(event: FormEvent) => { event.preventDefault(); void search(input); }}><div className="quick-tags">{["DW粉底", "婴儿米粉推荐"].map((query) => <button key={query} type="button" onClick={() => void search(query)}>{query}</button>)}</div><div className="composer-input"><MagnifyingGlass /><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="问问适不适合你" aria-label="搜索问题" /><button disabled={!input.trim() || busy} aria-label="发送"><PaperPlaneRight weight="fill" /></button></div></form>
    {notice && <div className="toast" role="status"><span>{notice.text}</span>{notice.undoToken && <button onClick={() => void undo(notice.undoToken!)}>撤销</button>}<button aria-label="关闭提示" onClick={() => setNotice(null)}><X /></button></div>}
    {conditionAnswer && <ConditionSheet answer={conditionAnswer} disabled={memoryDisabled} onToggle={toggleMemory} onManage={() => { setConditionAnswer(null); setView("memory"); }} onClose={() => setConditionAnswer(null)} />}
    {quoteTarget && <QuoteSheet target={quoteTarget} sessionId={session.sessionId} onClose={() => setQuoteTarget(null)} />}
  </main>;
}
