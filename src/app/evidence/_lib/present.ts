import { getCategoryConfig } from "@/domain/categories";
import { isInternalEvidenceUrl } from "@/lib/env";
import type { Category, ExperienceRecord, Stance, SourceType } from "@/domain/types";

/**
 * 站内合成样本预览页的展示层（纯函数 + 样式常量，无状态、无客户端代码）。
 * 页面里所有数字都从 Repository 实时计算，不硬编码样本量。
 */
export const EVIDENCE_CSS = `
*{box-sizing:border-box}
.ev-root{max-width:520px;margin:0 auto;min-height:100vh;background:#f6f7f9;padding-bottom:48px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#1c2026;-webkit-font-smoothing:antialiased}
.ev-bar{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:rgba(255,255,255,.94);border-bottom:1px solid #e9ecf0;backdrop-filter:blur(10px)}
.ev-brand{font-size:14px;font-weight:650;letter-spacing:.01em}
.ev-badge{flex:none;font-size:11px;color:#8a6a1c;background:#fff5d8;border:1px solid #efdfa6;padding:4px 9px;border-radius:999px;letter-spacing:.02em}
.ev-back{display:inline-flex;align-items:center;gap:4px;font-size:13px;color:#4a5058;text-decoration:none}
.ev-back:hover{color:#1c2026}
.ev-notice{margin:14px 16px 0;padding:12px 14px;border-radius:12px;background:#fffaf0;border:1px solid #f2e3bd;color:#796022;font-size:12px;line-height:1.7}
.ev-card{margin:14px 16px 0;background:#fff;border:1px solid #e9ecf0;border-radius:16px;padding:18px;box-shadow:0 2px 14px rgba(22,32,50,.04)}
.ev-kicker{margin:0 0 10px;font-size:11px;letter-spacing:.06em;color:#9298a2}
.ev-h1{margin:0 0 8px;font-size:21px;line-height:1.35;font-weight:650;letter-spacing:-.01em}
.ev-meta{margin:0;font-size:12px;color:#8b9099;line-height:1.7}
.ev-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:center}
.ev-tag{font-size:12px;padding:5px 10px;border-radius:8px;background:#f3f5f8;border:1px solid #e8ebef;color:#555c66}
.ev-tag b{font-weight:600;color:#1f242b}
.ev-tag.core{background:#eef4ff;border-color:#d9e6ff;color:#3c5a8a}
.ev-stance{display:inline-flex;align-items:center;font-size:12px;padding:5px 11px;border-radius:999px;font-weight:600}
.ev-stance.rec{background:#eaf7f0;color:#1b7a4b;border:1px solid #cfeadb}
.ev-stance.not{background:#f3f4f6;color:#6b7280;border:1px solid #e3e6ea}
.ev-body{margin:0;font-size:15px;line-height:1.95;color:#262a30;white-space:pre-wrap;word-break:break-word}
.ev-body mark{background:#fff0a8;color:#1a1a1a;padding:2px 3px;border-radius:4px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.ev-quote{margin:0;padding:14px 16px;border-left:3px solid #eec23f;background:#fffdf5;border-radius:0 10px 10px 0;font-size:15px;line-height:1.85;color:#262a30}
.ev-note{margin:12px 0 0;font-size:12px;color:#8b9099;line-height:1.75}
.ev-chain{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;color:#626a75}
.ev-chain span{background:#f5f6f8;border:1px solid #ebedf0;padding:5px 8px;border-radius:6px}
.ev-chain i{font-style:normal;color:#c2c7ce}
.ev-link{color:#2f6bda;text-decoration:none;font-size:13px}
.ev-link:hover{text-decoration:underline}
.ev-group-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:0 0 10px}
.ev-group-title{font-size:15px;font-weight:650;margin:0}
.ev-group-count{font-size:12px;color:#9298a2}
.ev-row{display:block;padding:12px 2px;border-top:1px solid #f0f1f3;text-decoration:none;color:inherit;border-radius:8px}
.ev-row:hover{background:#fafbfc}
.ev-row-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ev-row-id{font-size:12px;color:#9298a2;font-variant-numeric:tabular-nums}
.ev-row-type{font-size:11px;color:#9298a2}
.ev-row-quote{margin-top:6px;font-size:14px;line-height:1.6;color:#2b3038}
.ev-row-meta{margin-top:5px;font-size:11px;color:#9298a2;line-height:1.6}
.ev-foot{padding:18px 16px 0;font-size:12px;color:#9298a2;line-height:1.7}
@media(min-width:600px){.ev-root{box-shadow:0 0 0 1px #eceef1}}
`;

export function stanceLabel(stance: Stance): string {
  return stance === "recommend" ? "推荐" : "不推荐";
}

export function stanceClass(stance: Stance): string {
  return stance === "recommend" ? "ev-stance rec" : "ev-stance not";
}

/** 用中性词，不出现任何真实平台名称。 */
export function sourceTypeLabel(type: SourceType): string {
  return type === "note" ? "样本笔记" : "样本评论";
}

export function categoryLabel(category: Category): string {
  return getCategoryConfig(category).label;
}

export function conditionTags(record: ExperienceRecord, category: Category) {
  return getCategoryConfig(category)
    .dimensions.filter((d) => record.authorConditions[d.key] !== undefined)
    .map((d) => {
      const raw = record.authorConditions[d.key];
      return {
        key: d.key,
        label: d.label,
        value: typeof raw === "number" ? `${raw}${d.unit ?? ""}` : String(raw),
        core: d.core,
      };
    });
}

/** 把原文按引用原话切段，保证高亮内容与 quote 字段逐字一致。 */
export function splitQuote(
  text: string,
  quote: string,
): Array<{ text: string; hit: boolean }> {
  if (!quote) return [{ text, hit: false }];
  const parts: Array<{ text: string; hit: boolean }> = [];
  let rest = text;
  let idx = rest.indexOf(quote);
  if (idx < 0) return [{ text, hit: false }];
  while (idx >= 0) {
    if (idx > 0) parts.push({ text: rest.slice(0, idx), hit: false });
    parts.push({ text: quote, hit: true });
    rest = rest.slice(idx + quote.length);
    idx = rest.indexOf(quote);
  }
  if (rest) parts.push({ text: rest, hit: false });
  return parts;
}

/** 站内预览 / 外部原文两套来源并存，跳转逻辑不写死在某一类上。 */
export function sourceLabel(url: string | undefined): string {
  if (!url) return "未提供原文链接";
  return isInternalEvidenceUrl(url) ? "站内合成样本页" : "已授权外部原文";
}
