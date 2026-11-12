import { getRepository } from "@/repository";
import {
  conditionTags,
  EVIDENCE_CSS,
  sourceLabel,
  sourceTypeLabel,
  splitQuote,
  stanceClass,
  stanceLabel,
} from "../_lib/present";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_URL = "/evidence";

/** 单条合成样本详情：原文 + 与答案引用逐字一致的高亮原话 + 证据链说明。 */
export default async function EvidenceDetailPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  const repo = getRepository();
  const [record, products] = await Promise.all([
    repo.getExperienceById(recordId),
    repo.listProducts(),
  ]);

  const product = record
    ? products.find((p) => p.id === record.productId)
    : undefined;
  const category = product?.category ?? "beauty";
  const tags = record ? conditionTags(record, category) : [];
  const sourceText = record?.sourceText ?? record?.quote ?? "";
  const pieces = record ? splitQuote(sourceText, record.quote) : [];

  return (
    <main className="ev-root">
      <style>{EVIDENCE_CSS}</style>

      <div className="ev-bar">
        <a className="ev-back" href={LIST_URL}>← 样本列表</a>
        <span className="ev-badge">合成样本 · MOCK</span>
      </div>

      <div className="ev-notice">
        本页为离线合成样本，仅用于演示「答案 → 原话 → 原文」的证据链；内容不是任何真实平台的笔记或评论，也不代表真实用户观点。
      </div>

      {!record ? (
        <section className="ev-card">
          <h1 className="ev-h1">没有找到这条样本</h1>
          <p className="ev-note">
            编号 {recordId} 不在当前数据集里。Demo 默认使用本地夹具；切换到 Supabase 后需先导入样本。
          </p>
          <p className="ev-note">
            <a className="ev-link" href={LIST_URL}>返回样本列表 →</a>
          </p>
        </section>
      ) : (
        <>
          <section className="ev-card">
            <p className="ev-kicker">
              样本编号 {record.id} · {sourceTypeLabel(record.sourceType)}
            </p>
            <h1 className="ev-h1">{product?.name ?? record.productId}</h1>
            <p className="ev-meta">
              匿名作者 {record.authorId} · 发布于 {record.publishedAt} · {sourceLabel(record.sourceUrl)}
            </p>
            <div className="ev-tags">
              <span className={stanceClass(record.stance)}>{stanceLabel(record.stance)}</span>
              {tags.map((t) => (
                <span key={t.key} className={t.core ? "ev-tag core" : "ev-tag"}>
                  {t.label} <b>{t.value}</b>{t.core ? " · 核心条件" : ""}
                </span>
              ))}
            </div>
          </section>

          <section className="ev-card">
            <p className="ev-kicker">样本原文</p>
            <p className="ev-body">
              {pieces.map((part, i) =>
                part.hit ? (
                  <mark key={i}>{part.text}</mark>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </p>
            <p className="ev-note">
              黄色高亮部分即答案引用的原话；其余文字只用于还原语境，不参与任何统计。
            </p>
          </section>

          <section className="ev-card">
            <p className="ev-kicker">答案引用的原话</p>
            <blockquote className="ev-quote">{record.quote}</blockquote>
            <p className="ev-note">
              与答案弹层中的 quote 字段逐字一致。入库门禁要求 quote 必须是 source_text 的子串，
              否则这条记录会被拒绝写入，避免「弹层一句、点开另一句」。
            </p>
          </section>

          {record.reasons.length > 0 ? (
            <section className="ev-card">
              <p className="ev-kicker">结构化原因标签</p>
              <div className="ev-tags">
                {record.reasons.map((r, i) => (
                  <span key={`${r.tag}-${i}`} className="ev-tag">
                    <b>{r.tag}</b>
                    {r.onset ? ` · ${r.onset}` : ""}
                    {r.outcome ? ` · ${r.outcome}` : ""}
                  </span>
                ))}
              </div>
              <p className="ev-note">
                出现时机与后续结果只有在同一原因下超过半数作者给出同一取值时，才会在答案里展示。
              </p>
            </section>
          ) : null}

          <section className="ev-card">
            <p className="ev-kicker">这条样本如何进入答案</p>
            <div className="ev-chain">
              <span>experience_records.{record.id}</span>
              <i>→</i>
              <span>match_similar 按 author_id 去重</span>
              <i>→</i>
              <span>summarize_product</span>
              <i>→</i>
              <span>get_quotes</span>
              <i>→</i>
              <span>answer.data</span>
            </div>
            <p className="ev-note">
              人数、比例、原因聚合与替代品排序全部由确定性工具从记录计算；模型只产出文案草稿与引用声明，
              且要经过一致性校验。因此答案里每个数字都能回溯到本页的原句。
            </p>
          </section>

          <div style={{ padding: "18px 16px 0" }}>
            <a className="ev-link" href={LIST_URL}>← 返回样本列表</a>
          </div>
        </>
      )}
    </main>
  );
}
