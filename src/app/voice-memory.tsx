"use client";

import { ArrowLeft, Baby, Brain, ClockCounterClockwise, Drop, NotePencil, ShieldCheck, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { SessionInfo } from "./similar-voice-app";
import { readJson } from "./similar-voice-app";
import { Sheet } from "./voice-parts";

type Memory = { id: string; key: string; category: string; value?: string | { birthMonth: string }; createdAt: string; source: { channel: string; query?: string } };
type MemoryGroup = { category: "beauty" | "baby_food"; active: Memory[]; history: Memory[] };
type MemoryEvent = { id: string; memoryId: string; action: string; at: string };

const names: Record<string, string> = { skin_issue: "皮肤状况", skin_type: "肤质", allergy: "过敏史", diarrhea: "腹泻", age_month: "月龄" };
const options: Record<string, string[]> = {
  skin_issue: ["脂溢性皮炎", "敏感肌", "痘痘肌", "无特殊皮肤问题"],
  skin_type: ["油皮", "干皮", "混油", "混干", "中性"],
  allergy: ["有过敏", "无过敏"], diarrhea: ["有腹泻", "无腹泻"],
  age_month: ["6个月", "7个月", "8个月", "9个月"],
};
const actionNames: Record<string, string> = { created: "写入", superseded: "被新值取代", used: "用于一次搜索", disabled_for_session: "本次停用", enabled_for_session: "恢复使用", deleted: "删除", undo: "撤销写入" };

function valueOf(memory: Memory) { return typeof memory.value === "string" ? memory.value : memory.value ? `出生于 ${memory.value.birthMonth}` : "已删除"; }

export function MemoryScreen({ session, memoryDisabled, onBack, onToggle, onNotice }: {
  session: SessionInfo;
  memoryDisabled: boolean;
  onBack: () => void;
  onToggle: (disabled: boolean) => void;
  onNotice: (message: string) => void;
}) {
  const [groups, setGroups] = useState<MemoryGroup[]>([]);
  const [events, setEvents] = useState<MemoryEvent[]>([]);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await readJson<{ groups: MemoryGroup[]; events: MemoryEvent[] }>(`/api/memories?sessionId=${encodeURIComponent(session.sessionId)}`);
      setGroups(data.groups); setEvents(data.events); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "读取失败"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [session.sessionId]);

  async function update(memory: Memory, value: string) {
    try {
      await readJson(`/api/memories/${memory.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.sessionId, value }) });
      setEditing(null); setNotice("条件已更新"); onNotice("条件已更新"); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "修改失败"); }
  }

  async function remove(memory: Memory) {
    try {
      await readJson(`/api/memories/${memory.id}?sessionId=${encodeURIComponent(session.sessionId)}`, { method: "DELETE" });
      setNotice("条件已删除"); onNotice("条件已删除"); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "删除失败"); }
  }

  return <main className="memory-screen"><header className="memory-header"><button aria-label="返回对话" onClick={onBack}><ArrowLeft /></button><div><h1>我的记忆</h1><small>只记住你明确说过的条件</small></div></header>
    <div className="memory-content"><div className="memory-hero"><Brain weight="duotone" /><span><b>你始终拥有控制权</b><small>查看来源、修改或删除已记住的条件。</small></span></div>
      <label className="switch-row memory-switch"><span><b>本次不按我的条件</b><small>只影响当前对话</small></span><input type="checkbox" checked={memoryDisabled} onChange={(event) => onToggle(event.target.checked)} /></label>
      {loading && <p className="sheet-status">正在读取记忆...</p>}{error && <p className="error-message">{error}</p>}
      {groups.map((group) => <section className="memory-group" key={group.category}><div className="memory-group-heading">{group.category === "beauty" ? <Drop /> : <Baby />}<span><b>{group.category === "beauty" ? "护肤彩妆" : "母婴辅食"}</b><small>{group.active.length} 条生效条件</small></span></div>
        {group.active.length ? group.active.map((memory) => <article className="memory-row" key={memory.id}><div><small>{names[memory.key] || memory.key}</small><b>{valueOf(memory)}</b><em>{memory.source.channel === "preset" ? "来自预置身份" : memory.source.query || "来自你的主动补充"}</em></div><span><button aria-label={`修改${names[memory.key] || memory.key}`} onClick={() => setEditing(memory)}><NotePencil /></button><button aria-label={`删除${names[memory.key] || memory.key}`} onClick={() => void remove(memory)}><Trash /></button></span></article>) : <div className="memory-empty"><ShieldCheck /><p>还没有记住这个品类的条件</p></div>}
        {(group.history.length > 0 || events.some((event) => group.active.some((item) => item.id === event.memoryId))) && <details className="memory-history"><summary><ClockCounterClockwise />查看操作记录</summary>{group.history.map((memory) => <div key={memory.id}><b>{names[memory.key] || memory.key}</b><span>{memory.value ? valueOf(memory) : "已删除"}</span></div>)}{events.filter((event) => [...group.active, ...group.history].some((item) => item.id === event.memoryId)).slice(-8).reverse().map((event) => <p key={event.id}>{actionNames[event.action] || event.action} · {new Date(event.at).toLocaleString("zh-CN")}</p>)}</details>}
      </section>)}
    </div>
    {notice && <div className="toast" role="status">{notice}</div>}
    {editing && <Sheet title={`修改${names[editing.key] || "条件"}`} onClose={() => setEditing(null)}><div className="edit-options">{(options[editing.key] || []).map((value) => <button key={value} onClick={() => void update(editing, value)}>{value}</button>)}</div></Sheet>}
  </main>;
}
