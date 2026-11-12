"use client";

import { useEffect, useMemo, useState } from "react";

type Identity = "xiaolin" | "xiaob";
type Screen = "identity" | "chat" | "memory";
type Query = "DW粉底" | "婴儿米粉推荐";
type Sheet = "conditions" | "quotes" | null;

const FOUNDATION_IMAGE =
  "https://images.unsplash.com/photo-1759157403692-9a639efdc023?auto=format&fit=crop&w=700&q=82";

export const Icon = ({
  name,
  size = 22,
  strokeWidth = 1.9,
}: {
  name:
    | "back"
    | "more"
    | "search"
    | "shield"
    | "chevron"
    | "mic"
    | "camera"
    | "plus"
    | "close"
    | "check"
    | "edit"
    | "trash"
    | "memory"
    | "external"
    | "sparkle"
    | "alert"
    | "thumb"
    | "info"
    | "voice"
    | "copy"
    | "star"
    | "share"
    | "dislike"
    | "retry";
  size?: number;
  strokeWidth?: number;
}) => {
  const paths: Record<string, React.ReactNode> = {
    back: <path d="m15 18-6-6 6-6" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5.5 5.8v5.3c0 4.1 2.6 7.8 6.5 9.9 3.9-2.1 6.5-5.8 6.5-9.9V5.8L12 3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    mic: (
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
      </>
    ),
    camera: (
      <>
        <path d="M4 7h3l1.5-2h7L17 7h3v12H4Z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4L19 6" />,
    edit: (
      <>
        <path d="M4 20h4l11-11-4-4L4 16v4Z" />
        <path d="m13.5 6.5 4 4" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14" />
      </>
    ),
    memory: (
      <>
        <path d="M8 4a3 3 0 0 0-3 3v2a3 3 0 0 0 0 6v2a3 3 0 0 0 3 3h2V4H8ZM16 4a3 3 0 0 1 3 3v2a3 3 0 0 1 0 6v2a3 3 0 0 1-3 3h-2V4h2Z" />
        <path d="M10 8H8M10 16H8M14 12h3" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6M20 4l-9 9" />
        <path d="M18 13v6H5V6h6" />
      </>
    ),
    sparkle: (
      <>
        <path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3Z" />
        <path d="m5 15 .7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7L5 15Z" />
      </>
    ),
    alert: (
      <>
        <path d="M12 4 3.5 20h17L12 4Z" />
        <path d="M12 9v5M12 17h.01" />
      </>
    ),
    thumb: (
      <>
        <path d="M7 10v10H3V10h4ZM7 19h10l3-8a2 2 0 0 0-2-3h-5l1-4-2-1-5 7v9Z" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    voice: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 10v4M11 8v8M14 10v4M17 11v2" />
      </>
    ),
    copy: (
      <>
        <rect x="7" y="7" width="11" height="12" rx="2" />
        <path d="M15 7V5H5v10h2" />
      </>
    ),
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    ),
    share: (
      <>
        <path d="m15 7 4 4-4 4" />
        <path d="M19 11h-7a7 7 0 0 0-7 7v1c1.8-3 4.2-4 7-4h3" />
      </>
    ),
    dislike: (
      <>
        <path d="M7 14V4H3v10h4ZM7 5h10l3 8a2 2 0 0 1-2 3h-5l1 4-2 1-5-7V5Z" />
      </>
    ),
    retry: (
      <>
        <path d="M4 10a8 8 0 1 1 2 7" />
        <path d="M4 4v6h6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
};

/** 真机上状态栏由系统/浏览器提供，网页内不再渲染假状态栏（保留导出以免改动各页面结构）。 */
export function StatusBar() {
  return null;
}

export function DotsLogo({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "dots-logo small" : "dots-logo"}>
      <i />
      <i />
    </span>
  );
}

export function ProductVisual({
  kind,
  compact = false,
}: {
  kind: "dw" | "lancome" | "rice" | "engnice" | "gerber";
  compact?: boolean;
}) {
  if (kind === "dw") {
    return (
      <div className={`product-visual foundation ${compact ? "compact" : ""}`}>
        <div className="foundation-bottle">
          <span>
            ESTĒE
            <br />
            LAUDER
          </span>
          <b>DW</b>
        </div>
      </div>
    );
  }
  if (kind === "lancome") {
    return (
      <div className={`product-visual foundation lancome ${compact ? "compact" : ""}`}>
        <div className="foundation-bottle">
          <span>LANCÔME</span>
          <b>
            TEINT
            <br />
            IDÔLE
          </b>
        </div>
      </div>
    );
  }
  const labels = {
    rice: ["小皮", "有机高铁米粉"],
    engnice: ["英氏", "婴幼儿米粉"],
    gerber: ["嘉宝", "RICE"],
  };
  return (
    <div className={`product-visual cereal ${kind} ${compact ? "compact" : ""}`}>
      <div className="cereal-box">
        <b>{labels[kind][0]}</b>
        <span>{labels[kind][1]}</span>
        <i />
      </div>
    </div>
  );
}

export const Reason = ({
  tone,
  title,
  text,
  count,
  onClick,
}: {
  tone: "good" | "bad" | "info";
  title: string;
  text: string;
  count?: string;
  onClick?: () => void;
}) => (
  <button className={`reason ${tone}`} onClick={onClick}>
    <span className="reason-icon">
      {tone === "good" ? (
        <Icon name="thumb" size={18} />
      ) : tone === "bad" ? (
        <Icon name="alert" size={18} />
      ) : (
        <Icon name="sparkle" size={18} />
      )}
    </span>
    <span>
      <b>{title}</b>
      {text}
    </span>
    {count && (
      <em>
        {count}
        <Icon name="chevron" size={14} />
      </em>
    )}
  </button>
);

export function IdentityPage({
  onSelect,
  onReset,
}: {
  onSelect: (id: Identity) => void;
  onReset: () => void;
}) {
  return (
    <main className="phone identity-page">
      <StatusBar />
      <div className="identity-top">
        <DotsLogo />
        <div>
          <p>小红书 AI 搜</p>
          <h1>先选择一个体验身份</h1>
        </div>
        <button
          className="info-button"
          title="条件按匿名身份保存，可在记忆页查看或删除"
          aria-label="隐私说明：条件按匿名身份保存，可在记忆页查看或删除"
        ></button>
      </div>
      <div className="identity-list">
        <button className="identity-card xiaolin" onClick={() => onSelect("xiaolin")}>
          <div
            className="identity-photo"
            style={{
              backgroundImage: `url(${FOUNDATION_IMAGE})`,
              width: 72,
              height: 72,
              borderRadius: "50%",
            }}
          ></div>
          <div className="identity-copy">
            <div>
              <h2>小林</h2>
              <span className="memory-badge">
                <Icon name="memory" size={13} /> 有记忆
              </span>
            </div>
            <div className="remembered">
              <span>26 岁</span>
              <span>脂溢性皮炎</span>
              <span>油皮</span>
            </div>
          </div>
          <Icon name="chevron" size={20} />
        </button>
        <button className="identity-card xiaob" onClick={() => onSelect("xiaob")}>
          <div
            className="identity-photo baby"
            style={{ width: 72, height: 72, borderRadius: "50%" }}
          />
          <div className="identity-copy">
            <div>
              <h2>小B</h2>
              <span className="new-badge">新用户</span>
            </div>
            <div className="remembered">
              <span>30 岁</span>
              <span>7 个月宝宝妈妈</span>
            </div>
          </div>
          <Icon name="chevron" size={20} />
        </button>
      </div>
      <button className="identity-reset" onClick={onReset}>
        重置演示记忆
      </button>
    </main>
  );
}

export function ChatHeader({ onBack, onMemory }: { onBack: () => void; onMemory: () => void }) {
  return (
    <>
      <StatusBar />
      <header className="chat-header">
        <button onClick={onBack} aria-label="返回">
          <Icon name="back" size={27} />
        </button>
        <div className="chat-title">
          <span className="chat-logo-transparent">
            <DotsLogo small />
          </span>
          <b>点点</b>
        </div>
        <button onClick={onMemory} aria-label="管理我的记忆" title="管理我的记忆">
          <Icon name="memory" size={25} />
        </button>
      </header>
    </>
  );
}

export function Welcome({ onQuery }: { onQuery: (q: Query) => void }) {
  return (
    <section className="welcome">
      <div className="welcome-logo">
        <DotsLogo />
        <span className="spark">
          <Icon name="sparkle" size={15} />
        </span>
      </div>
      <h2>想搜点什么？</h2>
      <div className="quick-query">
        <button onClick={() => onQuery("DW粉底")}>
          <Icon name="search" size={18} />
          <span>
            <b>DW粉底</b>
          </span>
          <Icon name="chevron" size={17} />
        </button>
        <button onClick={() => onQuery("婴儿米粉推荐")}>
          <Icon name="search" size={18} />
          <span>
            <b>婴儿米粉推荐</b>
          </span>
          <Icon name="chevron" size={17} />
        </button>
      </div>
    </section>
  );
}

function UnsupportedAnswer({ query, onQuery }: { query: string; onQuery: (q: Query) => void }) {
  return (
    <>
      <div className="user-bubble">{query}</div>
      <section className="answer-card unsupported-card">
        <p>Demo 目前只覆盖以下查询</p>
        <div className="unsupported-options">
          <button onClick={() => onQuery("DW粉底")}>DW粉底</button>
          <button onClick={() => onQuery("婴儿米粉推荐")}>婴儿米粉推荐</button>
        </div>
        <AnswerActions />
      </section>
    </>
  );
}

function ConditionBar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="condition-bar" onClick={onClick}>
      <Icon name="shield" size={20} />
      <span>
        <b>已按你的条件筛选</b>
        <small>{label}</small>
      </span>
      <Icon name="chevron" size={17} />
    </button>
  );
}

function DWAnswer({
  useConditions,
  onConditions,
  onQuotes,
  onMemory,
}: {
  useConditions: boolean;
  onConditions: () => void;
  onQuotes: (reason?: string) => void;
  onMemory: (key: string) => void;
}) {
  return (
    <article className="answer-card">
      {useConditions && (
        <button className="condition-bar" onClick={onConditions}>
          <Icon name="shield" size={20} />
          <span>
            <b>根据您的肤质进行筛选</b>
          </span>
          <Icon name="chevron" size={17} />
        </button>
      )}
      <h2 className="m-0 mb-3 text-[18px] leading-[1.35] font-semibold">雅诗兰黛 DW 持妆粉底液</h2>
      {useConditions ? (
        <section className="rounded-[16px] bg-[#f8f8f8] p-[15px]">
          <p className="m-0 text-[15px] leading-[1.45]">
            和你情况相似的 <b className="text-[18px] text-[#222]">17</b> 人中，
            <b className="text-[18px] text-[#222]">6</b> 人推荐
          </p>
          <div className="meter mt-2 mb-2.5">
            <i style={{ width: "35%", background: "#222" }} />
          </div>
          <div className="border-t border-[#e9e9e9]">
            <button
              className="flex w-full items-center gap-2.5 border-b border-[#e9e9e9] py-3 text-left text-[12px] leading-[1.6]"
              onClick={() => onQuotes("闷痘")}
            >
              <span className="text-[#ff2e4d]">
                <Icon name="alert" size={17} />
              </span>
              <span className="flex-1">
                <b>闷痘：</b>5 人提到，使用 3–10 天后出现闭口
              </span>
              <Icon name="chevron" size={14} />
            </button>
            <button
              className="flex w-full items-center gap-2.5 border-b border-[#e9e9e9] py-3 text-left text-[12px] leading-[1.6]"
              onClick={() => onQuotes("泛红脱屑")}
            >
              <span className="text-[#ff2e4d]">
                <Icon name="alert" size={17} />
              </span>
              <span className="flex-1">
                <b>泛红脱屑：</b>4 人提到，集中在鼻翼和嘴角
              </span>
              <Icon name="chevron" size={14} />
            </button>
            <button
              className="flex w-full items-center gap-2.5 py-3 text-left text-[12px] leading-[1.6]"
              onClick={() => onQuotes("持妆好评")}
            >
              <span className="text-[#555]">
                <Icon name="thumb" size={17} />
              </span>
              <span className="flex-1">
                <b>持妆稳定：</b>6 人提到，8 小时后妆面仍完整
              </span>
              <Icon name="chevron" size={14} />
            </button>
          </div>
        </section>
      ) : (
        <p className="m-0 rounded-[14px] bg-[#f8f8f8] p-[14px] text-[14px]">
          全站 <b className="text-[18px]">72%</b> 推荐
        </p>
      )}
      <img
        className="mt-3 block w-full rounded-[16px]"
        src="/assets/dw-product-gallery.png"
        alt="雅诗兰黛 DW 粉底液三张商品展示"
      />
      <p className="mt-3 mb-0 border-b border-[#eee] pb-3 text-[11px] text-[#999]">
        {useConditions ? "全站 72% 推荐 · 部分油皮反馈闷痘" : "部分油皮反馈闷痘"}
      </p>
      {useConditions && (
        <section className="alternative">
          <div className="section-title">
            <Icon name="sparkle" size={18} />
            <b>同类人更推荐</b>
          </div>
          <div className="alternative-card">
            <ProductVisual kind="lancome" compact />
            <div>
              <h3>兰蔻持妆轻透粉底液</h3>
              <p>8 人推荐 · 妆感更轻薄</p>
              <button onClick={() => onQuotes("替代品好评")}>
                查看原话 <Icon name="chevron" size={14} />
              </button>
            </div>
          </div>
        </section>
      )}
      <SafetyNote text="皮肤状态存在个体差异；如出现持续红肿、瘙痒，请停止使用并咨询医生。" />
      <AgentTrace kind="dw" onMemory={onMemory} />
      <DataNote count={useConditions ? 143 : 326} />
      <AnswerActions />
    </article>
  );
}

function ProductCard({
  kind,
  title,
  rate,
  onQuotes,
}: {
  kind: "dw" | "rice";
  title: string;
  rate: string;
  onQuotes: (reason?: string) => void;
}) {
  return (
    <section className="product-card">
      {kind === "dw" ? (
        <div className="dw-product-gallery">
          <img src="/assets/dw-product-gallery.png" alt="雅诗兰黛 DW 粉底液商品展示" />
          <em>{rate}</em>
        </div>
      ) : (
        <div className="product-head">
          <ProductVisual kind={kind} />
          <div>
            <span className="rank">1</span>
            <h2>{title}</h2>
            <p>有机高铁 · 婴幼儿米粉</p>
            <em>{rate}</em>
          </div>
        </div>
      )}
      {kind === "dw" ? (
        <>
          <Reason
            tone="good"
            title="持妆稳定："
            text="6 人反馈 8 小时后妆面仍完整。"
            count="6 人"
            onClick={() => onQuotes("持妆好评")}
          />
          <Reason
            tone="bad"
            title="闷痘反馈："
            text="5 人在使用 3–10 天后出现闭口或痘痘。"
            count="5 人"
            onClick={() => onQuotes("闷痘")}
          />
          <Reason
            tone="bad"
            title="皮炎复发："
            text="4 人反馈鼻翼泛红、脱屑或刺痒。"
            count="4 人"
            onClick={() => onQuotes("皮炎复发")}
          />
        </>
      ) : (
        <>
          <Reason
            tone="good"
            title="配料干净："
            text="无乳粉和蔗糖，高铁配方适合初尝辅食。"
            count="9 人"
            onClick={() => onQuotes("配料好评")}
          />
          <Reason
            tone="bad"
            title="起红疹："
            text="7 人反馈首次吃后 1–2 天出现面部红疹。"
            count="7 人"
            onClick={() => onQuotes("起红疹")}
          />
          <Reason
            tone="bad"
            title="湿疹加重："
            text="5 人反馈原有湿疹在食用后反复。"
            count="5 人"
            onClick={() => onQuotes("湿疹加重")}
          />
        </>
      )}
      <div className="sentiment-buttons">
        <button onClick={() => onQuotes("同类好评")}>
          同类好评 <b>{kind === "dw" ? 6 : 9}</b>
          <Icon name="chevron" size={14} />
        </button>
        <button onClick={() => onQuotes("同类吐槽")}>
          同类吐槽 <b>{kind === "dw" ? 11 : 12}</b>
          <Icon name="chevron" size={14} />
        </button>
      </div>
    </section>
  );
}

function GeneralRiceAnswer({
  onFollowup,
  selections,
  setSelections,
  onMemory,
}: {
  onFollowup: () => void;
  selections: string[];
  setSelections: (s: string[]) => void;
  onMemory: (key: string) => void;
}) {
  const toggle = (value: string) =>
    setSelections(
      selections.includes(value) ? selections.filter((v) => v !== value) : [...selections, value],
    );
  return (
    <>
      <article className="answer-card">
        <div className="source-line">
          <Icon name="shield" size={20} />
          已过滤疑似广告，参考 486 人经验
        </div>
        <p className="answer-lead">
          给宝宝选第一口米粉，配料干净和高铁好消化是关键，这几款在妈妈圈口碑很稳：
        </p>
        <section className="ranking">
          {[
            ["rice", "小皮米粉", "47%"],
            ["engnice", "英氏米粉", "26%"],
            ["gerber", "嘉宝米粉", "21%"],
          ].map((p, i) => (
            <div key={p[1]}>
              <span>{i + 1}</span>
              <ProductVisual kind={p[0] as "rice"} compact />
              <b>{p[1]}</b>
              <em>{p[2]} 人推荐</em>
            </div>
          ))}
        </section>
        <section className="mini-product">
          <div>
            <b>1. 小皮米粉</b>
            <span>47% 人推荐</span>
          </div>
          <Reason tone="good" title="配料干净：" text="成分简单，高铁配方适合初尝辅食。" />
          <Reason tone="info" title="细腻好冲：" text="粉质细滑，按比例冲泡不易结块。" />
          <Reason tone="bad" title="敏宝慎选：" text="有反馈宝宝食用后出现红疹。" />
        </section>
        <SafetyNote text="婴幼儿体质差异大，首次添加请少量尝试；严重情况请咨询医生。" />
        <AgentTrace kind="rice-general" onMemory={onMemory} />
        <DataNote count={486} />
        <AnswerActions />
      </article>
      <section className="followup-card">
        <div className="followup-title">
          <DotsLogo small />
          <div>
            <b>找和你家情况相似的经验</b>
          </div>
        </div>
        <label>宝宝月龄</label>
        <div className="option-row">
          {["6 个月左右", "7–8 个月", "9 个月以上"].map((v) => (
            <button
              className={selections.includes(v) ? "active" : ""}
              onClick={() => toggle(v)}
              key={v}
            >
              {selections.includes(v) && <Icon name="check" size={13} />}
              {v}
            </button>
          ))}
        </div>
        <label>是否有过敏或湿疹史</label>
        <div className="option-row">
          {["有过敏", "有湿疹", "都没有"].map((v) => (
            <button
              className={selections.includes(v) ? "active" : ""}
              onClick={() => toggle(v)}
              key={v}
            >
              {selections.includes(v) && <Icon name="check" size={13} />}
              {v}
            </button>
          ))}
        </div>
        <button
          className="primary-button"
          disabled={selections.length < 2}
          onClick={() => onFollowup()}
        >
          看看同类家长怎么说
        </button>
      </section>
    </>
  );
}

function SimilarRiceAnswer({
  onConditions,
  onQuotes,
  onMemory,
}: {
  onConditions: () => void;
  onQuotes: (r?: string) => void;
  onMemory: (key: string) => void;
}) {
  return (
    <article className="answer-card">
      <ConditionBar label="7 个月 · 有过敏史" onClick={onConditions} />
      <p className="answer-lead">结合你家宝宝的情况，结论和全站排名不太一样：</p>
      <section className="similar-summary rice-summary">
        <div className="summary-kicker">
          <span className="people-stack">
            <i>可</i>
            <i>安</i>
            <i>米</i>
          </span>
          参考 21 位同类家长经验
        </div>
        <div className="summary-main">
          <strong>
            21<small> 人中</small> 6<small> 人推荐小皮</small>
          </strong>
          <span>多数不推荐</span>
        </div>
        <div className="meter">
          <i style={{ width: "29%" }} />
        </div>
        <button onClick={() => onQuotes("起红疹")}>
          <span>起红疹</span>
          <b>7 人</b>
          <small>6–8 月龄，首次添加</small>
          <Icon name="chevron" size={15} />
        </button>
        <button onClick={() => onQuotes("湿疹加重")}>
          <span>湿疹加重</span>
          <b>5 人</b>
          <small>有湿疹或过敏史</small>
          <Icon name="chevron" size={15} />
        </button>
      </section>
      <div className="consensus">
        <b>全站共识</b>
        <span>整体 47% 推荐</span>
        <i />
        同类家长反馈更谨慎
      </div>
      <ProductCard kind="rice" title="小皮有机高铁米粉" rate="29% 同类人推荐" onQuotes={onQuotes} />
      <section className="alternative">
        <div className="section-title">
          <Icon name="sparkle" size={18} />
          <b>同类家长更推荐</b>
        </div>
        <div className="alternative-card rice-alt">
          <ProductVisual kind="engnice" compact />
          <div>
            <h3>英氏婴幼儿米粉</h3>
            <p>15 位同类家长推荐，淡淡米香、接受度高。</p>
            <button onClick={() => onQuotes("替代品好评")}>
              查看 15 条同类好评 <Icon name="chevron" size={14} />
            </button>
          </div>
        </div>
      </section>
      <SafetyNote text="婴幼儿体质差异大，首次添加请少量尝试；严重情况请咨询医生。" />
      <AgentTrace kind="rice-similar" onMemory={onMemory} />
      <DataNote count={184} />
      <AnswerActions />
    </article>
  );
}

const SafetyNote = ({ text }: { text: string }) => (
  <div className="safety-note">
    <Icon name="alert" size={18} />
    <span>
      <b>健康提示</b>
      {text}
    </span>
  </div>
);
const DataNote = ({ count }: { count: number }) => (
  <div className="data-note">基于本次收集的 {count} 条公开笔记与评论 · 内容由 AI 整理</div>
);

function AnswerActions() {
  const [active, setActive] = useState<"star" | "dislike" | "retry" | null>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText("点点 AI 搜索答案");
    } finally {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  };
  return (
    <div className="answer-actions">
      <div>
        <button
          onClick={copy}
          className={copied ? "active" : ""}
          aria-label="复制答案"
          title="复制"
        >
          <Icon name={copied ? "check" : "copy"} size={18} />
        </button>
        <button
          onClick={() => setActive(active === "star" ? null : "star")}
          className={active === "star" ? "active" : ""}
          aria-label="收藏答案"
          title="收藏"
        >
          <Icon name="star" size={19} />
        </button>
        <button aria-label="分享答案" title="分享">
          <Icon name="share" size={19} />
        </button>
      </div>
      <div>
        <button
          onClick={() => setActive(active === "dislike" ? null : "dislike")}
          className={active === "dislike" ? "active" : ""}
          aria-label="不喜欢此答案"
          title="不喜欢"
        >
          <Icon name="dislike" size={18} />
        </button>
        <button
          onClick={() => {
            setActive("retry");
            window.setTimeout(() => setActive(null), 600);
          }}
          className={active === "retry" ? "active retrying" : ""}
          aria-label="重新生成"
          title="重新生成"
        >
          <Icon name="retry" size={19} />
        </button>
      </div>
    </div>
  );
}

function AgentTrace({
  kind,
  onMemory,
}: {
  kind: "dw" | "rice-general" | "rice-similar";
  onMemory: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isRice = kind !== "dw";
  const isNew = kind === "rice-similar";
  const steps = [
    {
      title: "理解查询",
      detail: isRice
        ? "品类「母婴辅食」，查询「婴儿米粉推荐」"
        : "品类「护肤彩妆」，产品「DW 粉底」",
      time: "0.8s",
    },
    {
      title: "读取记忆",
      detail: kind === "rice-general" ? "暂无母婴类条件" : "",
      time: "0.1s",
      tags:
        kind === "dw"
          ? ["脂溢性皮炎", "油皮"]
          : kind === "rice-similar"
            ? ["7 个月", "有过敏史"]
            : [],
    },
    {
      title: "判断是否追问",
      detail: kind === "rice-general" ? "缺少宝宝情况，需要追问" : "核心条件已具备，无需追问",
      time: "0.0s",
    },
    {
      title: "调用工具",
      detail:
        kind === "dw"
          ? "同类人匹配 23 人 · 原因聚合 4 个 · 替代品 1 款"
          : kind === "rice-similar"
            ? "同类家长匹配 21 人 · 原因聚合 3 个 · 替代品 1 款"
            : "全站口碑聚合 486 条 · 产品排序 5 款",
      time: "0.3s",
    },
    {
      title: "生成答案",
      detail: kind === "rice-general" ? "10 个数字、6 条原话已校验" : "12 个数字、8 条原话已校验",
      time: "2.1s",
    },
    {
      title: "写入记忆",
      detail: isNew ? "" : "无新增条件",
      time: "0.2s",
      tags: isNew ? ["月龄 6–8 个月", "有过敏史"] : [],
      isNew,
    },
  ];
  return (
    <section className={`agent-trace ${open ? "open" : ""}`}>
      <button className="agent-trace-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        查看 Agent 过程 <Icon name="chevron" size={13} />
      </button>
      {open && (
        <ol className="agent-steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <i className={step.isNew ? "new" : ""} />
              <div>
                <b>
                  {index + 1}. {step.title}
                </b>
                {step.detail && <p>{step.detail}</p>}
                {!!step.tags?.length && (
                  <div className="agent-tags">
                    {step.isNew && <span className="new-label">新增</span>}
                    {step.tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() =>
                          onMemory(
                            tag.includes("月龄") || tag.includes("个月")
                              ? "age"
                              : tag.includes("过敏")
                                ? "allergy"
                                : tag.includes("油皮")
                                  ? "oil"
                                  : "skin",
                          )
                        }
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <time>{step.time}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Composer({
  onSubmit,
  setDraft,
  draft,
}: {
  onSubmit: () => void;
  setDraft: (v: string) => void;
  draft: string;
}) {
  return (
    <div className="composer-wrap">
      <div className="composer">
        <button className="composer-icon voice-button" aria-label="语音输入暂未开放" title="语音输入暂未开放" disabled>
          <Icon name="voice" size={25} />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="发消息…"
        />
        {draft ? (
          <button onClick={onSubmit} className="send-button" aria-label="发送">
            <Icon name="chevron" size={18} />
          </button>
        ) : (
          <div className="composer-tools">
            <button className="composer-icon" aria-label="拍照暂未开放" title="拍照暂未开放" disabled>
              <Icon name="camera" size={24} />
            </button>
            <button className="composer-icon" aria-label="添加暂未开放" title="添加暂未开放" disabled>
              <Icon name="plus" size={26} />
            </button>
          </div>
        )}
      </div>
      <span className="ai-caption">内容由 AI 生成</span>
    </div>
  );
}

function BottomSheet({
  type,
  identity,
  reason,
  useConditions,
  setUseConditions,
  close,
  goMemory,
}: {
  type: Sheet;
  identity: Identity;
  reason: string;
  useConditions: boolean;
  setUseConditions: (v: boolean) => void;
  close: () => void;
  goMemory: () => void;
}) {
  if (!type) return null;
  if (type === "conditions") {
    const isLin = identity === "xiaolin";
    return (
      <div className="sheet-layer" onMouseDown={(e) => e.target === e.currentTarget && close()}>
        <section className="bottom-sheet">
          <div className="sheet-handle" />
          <div className="sheet-header">
            <div>
              <h2>本次参考的条件</h2>
            </div>
            <button onClick={close} aria-label="关闭">
              <Icon name="close" />
            </button>
          </div>
          <div className="condition-detail">
            <div className="condition-item">
              <span>{isLin ? "脂溢性皮炎" : "有过敏史"}</span>
              <b>核心条件</b>
              <p>来自你{isLin ? "上次搜索护肤时的补充" : "刚才填写的追问卡片"}</p>
            </div>
            <div className="condition-item">
              <span>{isLin ? "油皮" : "宝宝 7 个月"}</span>
              <b className="secondary">辅助条件</b>
              <p>{isLin ? "来自你主动选择的肤质" : "来自刚才填写的追问卡片"}</p>
            </div>
          </div>
          <div className="sheet-switch">
            <div>
              <b>本次不按我的条件</b>
              <span>关闭后将显示全站综合结论</span>
            </div>
            <button
              className={!useConditions ? "on" : ""}
              onClick={() => setUseConditions(!useConditions)}
            >
              <i />
            </button>
          </div>
          <button className="text-button" onClick={goMemory}>
            管理已记住的条件 <Icon name="chevron" size={15} />
          </button>
        </section>
      </div>
    );
  }
  const quotes =
    reason.includes("好评") || reason.includes("持妆") || reason.includes("配料")
      ? [
          [
            "笔记",
            identity === "xiaolin" ? "油皮 · 有脂溢性皮炎史" : "宝宝 7 个月 · 有过敏史",
            identity === "xiaolin"
              ? "我鼻翼容易出油，但这款到晚上也没斑驳，皮肤状态好的时候还是会用。"
              : "配料看着很简单，从一小勺慢慢加，宝宝目前接受得不错。",
            "2026-10",
          ],
          [
            "评论",
            identity === "xiaolin" ? "混油皮 · 同类情况" : "宝宝 8 个月 · 湿疹史",
            identity === "xiaolin"
              ? "妆效是真的稳，薄薄一层就够了，我会避开正在泛红的区域。"
              : "换成这款后适应得挺好，还是建议敏宝第一次只少量尝试。",
            "2026-09",
          ],
        ]
      : [
          [
            "评论",
            identity === "xiaolin" ? "油皮 · 脂溢性皮炎" : "宝宝 7 个月 · 蛋黄过敏",
            identity === "xiaolin"
              ? "连续用了四天后额头开始冒闭口，鼻翼也有点痒，停用一周才慢慢恢复。"
              : "第一次只吃了两勺，第二天脸上一片红疹，停了三天才慢慢下去。",
            "2026-10",
          ],
          [
            "笔记",
            identity === "xiaolin" ? "混油皮 · 反复脱屑" : "宝宝 6 个月 · 有湿疹史",
            identity === "xiaolin"
              ? "持妆是好，但我皮炎刚稳定时用了两次，鼻翼又开始泛红脱屑。"
              : "本来腿弯有一点湿疹，添加米粉两天后明显红了，所以先暂停了。",
            "2026-09",
          ],
          [
            "评论",
            identity === "xiaolin" ? "油皮 · 敏感肌" : "宝宝 8 个月 · 牛奶蛋白过敏",
            identity === "xiaolin"
              ? "下午开始觉得闷，卸妆后下巴有几颗小痘，可能不太适合我的状态。"
              : "我家过敏体质，吃完嘴边有一圈小红点，敏宝真的要一点点试。",
            "2026-08",
          ],
        ];
  return (
    <div className="sheet-layer" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section className="bottom-sheet quote-sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <h2>{reason || "同类人原话"}</h2>
          </div>
          <button onClick={close} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
        <div className="quote-tabs">
          <button className="active">相关原话 {quotes.length}</button>
          <button>全部反馈</button>
        </div>
        <div className="quote-list">
          {quotes.map((q, i) => (
            <div className="quote-item" key={i}>
              <div>
                <span>{q[0]}</span>
                <b>{q[1]}</b>
                <time>{q[3]}</time>
              </div>
              <p>“{q[2]}”</p>
              <a href="https://www.xiaohongshu.com/" target="_blank" rel="noreferrer">
                查看小红书原文 <Icon name="external" size={14} />
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MemoryPage({
  identity,
  hasXiaolinMemory,
  hasBabyMemory,
  initialDetail,
  onBack,
  onDelete,
  onReset,
}: {
  identity: Identity;
  hasXiaolinMemory: boolean;
  hasBabyMemory: boolean;
  initialDetail: string | null;
  onBack: () => void;
  onDelete: (key: string) => void;
  onReset: () => void;
}) {
  const [detail, setDetail] = useState<string | null>(initialDetail);
  if (detail) {
    return (
      <ConditionDetail
        conditionKey={detail}
        identity={identity}
        onBack={() => setDetail(null)}
        onDelete={() => {
          onDelete(detail);
          setDetail(null);
        }}
      />
    );
  }
  return (
    <main className="phone memory-page">
      <StatusBar />
      <header className="memory-header">
        <button onClick={onBack} aria-label="返回">
          <Icon name="back" size={27} />
        </button>
        <h1>我的记忆</h1>
        <button
          className="info-button"
          title="仅保存主动添加的条件；删除后相关筛选会失效"
          aria-label="记忆说明：仅保存主动添加的条件，删除后相关筛选会失效"
        >
          <Icon name="info" size={18} />
        </button>
      </header>
      {identity === "xiaolin" && hasXiaolinMemory && (
        <section className="memory-group">
          <div className="memory-group-title">
            <span className="category-icon beauty" />
            <div>
              <b>护肤彩妆</b>
            </div>
          </div>
          <MemoryRow
            title="脂溢性皮炎"
            tag="核心条件"
            source="来自上次搜索“适合油皮的底妆”时的补充"
            onOpen={() => setDetail("skin")}
          />
          <MemoryRow
            title="油皮"
            tag="辅助条件"
            source="来自你主动选择的肤质"
            onOpen={() => setDetail("oil")}
          />
        </section>
      )}
      {identity === "xiaob" && hasBabyMemory && (
        <section className="memory-group">
          <div className="memory-group-title">
            <span className="category-icon baby" />
            <div>
              <b>母婴辅食</b>
            </div>
          </div>
          <MemoryRow
            title="有过敏史"
            tag="核心条件"
            source="来自搜索“婴儿米粉推荐”的追问卡片"
            onOpen={() => setDetail("allergy")}
          />
          <MemoryRow
            title="宝宝 7 个月"
            tag="辅助条件"
            source="出生月份已保存，月龄会自动更新"
            onOpen={() => setDetail("age")}
          />
        </section>
      )}
      {identity === "xiaob" && !hasBabyMemory && (
        <div className="empty-state">
          <span>
            <Icon name="memory" size={30} />
          </span>
          <h2>还没有记住的条件</h2>
          <p>完成一次搜索追问后，你主动选择的条件会出现在这里。</p>
        </div>
      )}
      {identity === "xiaolin" && !hasXiaolinMemory && (
        <div className="empty-state">
          <span>
            <Icon name="memory" size={30} />
          </span>
          <h2>还没有记住的条件</h2>
          <p>主动补充肤质或皮肤状态后，相关条件会出现在这里。</p>
        </div>
      )}
      <button
        className="reset-button"
        onClick={onReset}
        disabled={
          (identity === "xiaob" && !hasBabyMemory) || (identity === "xiaolin" && !hasXiaolinMemory)
        }
      >
        清除全部记忆
      </button>
    </main>
  );
}

function MemoryRow({
  title,
  tag,
  source,
  onOpen,
}: {
  title: string;
  tag: string;
  source: string;
  onOpen: () => void;
}) {
  return (
    <button className="memory-row" onClick={onOpen}>
      <div className="memory-row-top">
        <div>
          <b>{title}</b>
          <span>{tag}</span>
        </div>
        <Icon name="chevron" size={18} />
      </div>
      <p>{source}</p>
      <time>更新于 2026-11-12</time>
    </button>
  );
}

function ConditionDetail({
  conditionKey,
  identity,
  onBack,
  onDelete,
}: {
  conditionKey: string;
  identity: Identity;
  onBack: () => void;
  onDelete: () => void;
}) {
  const details: Record<string, { name: string; value: string; source: string }> = {
    age: {
      name: "月龄",
      value: "7 个月（按出生月份 2026-04 自动换算）",
      source: "宝宝 7 个月，吃蛋黄过敏过",
    },
    allergy: {
      name: "过敏史",
      value: "有过敏史",
      source: "宝宝 7 个月，吃蛋黄过敏过",
    },
    skin: {
      name: "皮肤状态",
      value: "脂溢性皮炎",
      source: "之前得过脂溢性皮炎，现在是油皮",
    },
    oil: {
      name: "肤质",
      value: "油皮",
      source: "之前得过脂溢性皮炎，现在是油皮",
    },
  };
  const item = details[conditionKey] || details[identity === "xiaob" ? "allergy" : "skin"];
  const [value, setValue] = useState(item.value);
  const modify = () => {
    const next = window.prompt(`修改${item.name}`, value);
    if (next?.trim()) setValue(next.trim());
  };
  return (
    <main className="phone memory-page condition-detail-page">
      <StatusBar />
      <header className="memory-header">
        <button onClick={onBack} aria-label="返回">
          <Icon name="back" size={27} />
        </button>
        <h1>条件详情</h1>
        <span />
      </header>
      <section className="condition-hero">
        <span>{item.name}</span>
        <h2>{value}</h2>
        <p>
          来自你在搜索「{identity === "xiaob" ? "婴儿米粉推荐" : "适合油皮的底妆"}」时说的：
          <b>“{item.source}”</b>
        </p>
      </section>
      <section className="history-card">
        <h3>操作记录</h3>
        <ol>
          <li>
            <i />
            <div>
              <b>被搜索「{identity === "xiaob" ? "婴儿米粉推荐" : "DW粉底"}」使用</b>
              <time>11-12 19:05</time>
            </div>
          </li>
          <li>
            <i />
            <div>
              <b>写入</b>
              <span>来源：{identity === "xiaob" ? "追问卡片" : "主动补充"}</span>
              <time>11-12 19:00</time>
            </div>
          </li>
        </ol>
      </section>
      <div className="condition-actions">
        <button onClick={modify}>修改</button>
        <button
          onClick={() => {
            if (window.confirm("删除后，相关的筛选和排序将不再生效")) onDelete();
          }}
        >
          删除
        </button>
      </div>
    </main>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("identity");
  const [identity, setIdentity] = useState<Identity>("xiaolin");
  const [query, setQuery] = useState<Query | null>(null);
  const [draft, setDraft] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [reason, setReason] = useState("");
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [canUndoMemory, setCanUndoMemory] = useState(false);
  const [unsupportedQuery, setUnsupportedQuery] = useState("");
  const [followupText, setFollowupText] = useState("");
  const [memoryFocus, setMemoryFocus] = useState<string | null>(null);
  const [selections, setSelections] = useState<string[]>([]);
  const [useConditions, setUseConditions] = useState(true);
  const [babyMemory, setBabyMemory] = useState(
    () => localStorage.getItem("dd-baby-memory") === "true",
  );
  const [xiaolinMemory, setXiaolinMemory] = useState(
    () => localStorage.getItem("dd-xiaolin-memory") !== "false",
  );
  const [babyAnswered, setBabyAnswered] = useState(false);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(
        () => {
          setToast("");
          setCanUndoMemory(false);
        },
        canUndoMemory ? 4000 : 2400,
      );
      return () => clearTimeout(t);
    }
  }, [toast, canUndoMemory]);
  useEffect(() => {
    document.body.classList.toggle("sheet-open", !!sheet);
  }, [sheet]);

  const chooseIdentity = (id: Identity) => {
    setIdentity(id);
    setQuery(null);
    setBabyAnswered(false);
    setSelections([]);
    setUnsupportedQuery("");
    setFollowupText("");
    setUseConditions(true);
    setScreen("chat");
  };
  const runQuery = (q: Query) => {
    setQuery(q);
    setUnsupportedQuery("");
    setFollowupText("");
    setDraft("");
    setMenu(false);
    if (q === "婴儿米粉推荐" && identity === "xiaob") setBabyAnswered(babyMemory);
    window.setTimeout(
      () => document.querySelector(".chat-scroll")?.scrollTo({ top: 0, behavior: "smooth" }),
      10,
    );
  };
  const submit = () => {
    const normalized = draft.trim().toLowerCase();
    if (
      query === "婴儿米粉推荐" &&
      identity === "xiaob" &&
      !babyAnswered &&
      /(个月|月龄|过敏|湿疹|蛋黄)/.test(draft)
    ) {
      confirmFollowup(draft.trim());
      setDraft("");
    } else if (normalized.includes("dw")) runQuery("DW粉底");
    else if (normalized.includes("米粉")) runQuery("婴儿米粉推荐");
    else if (draft.trim()) {
      setUnsupportedQuery(draft.trim());
      setQuery(null);
      setDraft("");
    }
  };
  const confirmFollowup = (text?: string) => {
    setBabyMemory(true);
    localStorage.setItem("dd-baby-memory", "true");
    setBabyAnswered(true);
    setFollowupText(text || selections.join("，") || "宝宝 7 个月，有过敏史");
    setToast("已记住，下次母婴类搜索自动参考");
    setCanUndoMemory(true);
    window.setTimeout(
      () => document.querySelector(".chat-scroll")?.scrollTo({ top: 0, behavior: "smooth" }),
      40,
    );
  };
  const openQuotes = (r = "同类人原话") => {
    setReason(r);
    setSheet("quotes");
  };
  const title = useMemo(() => (identity === "xiaolin" ? "小林" : "小B"), [identity]);

  if (screen === "identity")
    return (
      <IdentityPage
        onSelect={chooseIdentity}
        onReset={() => {
          if (!window.confirm("恢复初始演示状态？小B 已保存的条件将被清除。")) return;
          localStorage.removeItem("dd-baby-memory");
          localStorage.removeItem("dd-xiaolin-memory");
          setBabyMemory(false);
          setXiaolinMemory(true);
          setUseConditions(true);
          setToast("");
        }}
      />
    );
  if (screen === "memory")
    return (
      <MemoryPage
        identity={identity}
        hasXiaolinMemory={xiaolinMemory}
        hasBabyMemory={babyMemory}
        initialDetail={memoryFocus}
        onBack={() => {
          setMemoryFocus(null);
          setScreen("chat");
        }}
        onDelete={(key) => {
          const label =
            key === "age"
              ? "宝宝月龄"
              : key === "allergy"
                ? "过敏史"
                : key === "oil"
                  ? "油皮"
                  : "脂溢性皮炎";
          if (identity === "xiaob") {
            setBabyMemory(false);
            localStorage.removeItem("dd-baby-memory");
            setBabyAnswered(false);
          } else {
            setXiaolinMemory(false);
            localStorage.setItem("dd-xiaolin-memory", "false");
            setUseConditions(false);
          }
          setToast(`已删除“${label}”`);
        }}
        onReset={() => {
          if (!window.confirm("清除当前身份的全部记忆？相关个性化筛选将立即失效。")) return;
          if (identity === "xiaob") {
            setBabyMemory(false);
            localStorage.removeItem("dd-baby-memory");
            setBabyAnswered(false);
          } else {
            setXiaolinMemory(false);
            localStorage.setItem("dd-xiaolin-memory", "false");
            setUseConditions(false);
          }
          setToast("已重置当前身份的记忆");
        }}
      />
    );

  return (
    <main className="phone chat-page">
      <ChatHeader onBack={() => setScreen("identity")} onMemory={() => setScreen("memory")} />
      {menu && (
        <div className="menu-popover">
          <div className="menu-person">
            <span>{title.slice(-1)}</span>
            <div>
              <b>当前身份：{title}</b>
              <small>
                {identity === "xiaolin"
                  ? xiaolinMemory
                    ? "已记住 2 个条件"
                    : "暂无记忆"
                  : babyMemory
                    ? "已记住 2 个条件"
                    : "暂无记忆"}
              </small>
            </div>
          </div>
          <button onClick={() => setScreen("memory")}>
            <Icon name="memory" size={18} />
            管理我的记忆
          </button>
          <button onClick={() => setScreen("identity")}>
            <Icon name="edit" size={18} />
            切换体验身份
          </button>
        </div>
      )}
      <div className="chat-scroll">
        {!query ? (
          unsupportedQuery ? (
            <UnsupportedAnswer query={unsupportedQuery} onQuery={runQuery} />
          ) : (
            <Welcome onQuery={runQuery} />
          )
        ) : (
          <>
            <div className="user-bubble">{query}</div>
            {query === "DW粉底" ? (
              <DWAnswer
                useConditions={identity === "xiaolin" && xiaolinMemory && useConditions}
                onConditions={() => setSheet("conditions")}
                onQuotes={openQuotes}
                onMemory={(key) => {
                  setMemoryFocus(key);
                  setScreen("memory");
                }}
              />
            ) : identity !== "xiaob" || !babyAnswered || !useConditions ? (
              <GeneralRiceAnswer
                onFollowup={confirmFollowup}
                selections={selections}
                setSelections={setSelections}
                onMemory={(key) => {
                  setMemoryFocus(key);
                  setScreen("memory");
                }}
              />
            ) : (
              <>
                {followupText && <div className="user-bubble followup-bubble">{followupText}</div>}
                <SimilarRiceAnswer
                  onConditions={() => setSheet("conditions")}
                  onQuotes={openQuotes}
                  onMemory={(key) => {
                    setMemoryFocus(key);
                    setScreen("memory");
                  }}
                />
              </>
            )}
          </>
        )}
      </div>
      <Composer onSubmit={submit} draft={draft} setDraft={setDraft} />
      {toast && (
        <div className="toast">
          <Icon name="check" size={17} />
          <span>{toast}</span>
          {canUndoMemory && (
            <button
              onClick={() => {
                setBabyMemory(false);
                localStorage.removeItem("dd-baby-memory");
                setCanUndoMemory(false);
                setToast("已撤销");
              }}
            >
              撤销
            </button>
          )}
        </div>
      )}
      <BottomSheet
        type={sheet}
        identity={identity}
        reason={reason}
        useConditions={useConditions}
        setUseConditions={(v) => {
          setUseConditions(v);
          if (!v) setToast("本次已切换为全站综合结论");
          setSheet(null);
        }}
        close={() => setSheet(null)}
        goMemory={() => {
          setSheet(null);
          setScreen("memory");
        }}
      />
    </main>
  );
}
