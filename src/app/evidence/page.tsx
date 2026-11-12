import { getRepository } from "@/repository";
import {
  categoryLabel,
  conditionTags,
  EVIDENCE_CSS,
  sourceTypeLabel,
  stanceClass,
  stanceLabel,
} from "./_lib/present";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 合成样本索引：答案弹层里「查看原文」都落到 /evidence/:id。 */
export default async function EvidenceIndexPage() {
  const repo = getRepository();
  const [records, products] = await Promise.all([
    repo.listExperiences(),
    repo.listProducts(),
  ]);

  // 页面上的数字一律由数据集实时计算，不硬编码（规格 10）。
  const authorCount = new Set(records.map((r) => r.authorId)).size;
  const groups = products
    .map((product) => ({
      product,
      rows: records.filter((r) => r.productId === product.id),
    }))
    .filter((g) => g.rows.length > 0);

  return (
    <main className="ev-root">
      <style>{EVIDENCE_CSS}</style>

      <div className="ev-bar">
        <span className="ev-brand">同境 · 合成样本库</span>
        <span className="ev-badge">合成样本 · MOCK</span>
      </div>

      <div className="ev-notice">
        以下全部为离线合成样本，仅用于演示「答案 → 原话 → 原文」的证据链；不是任何真实平台的笔记或评论，也不代表真实用户观点。
      </div>

      <section className="ev-card">
        <p className="ev-kicker">数据集概览</p>
        <h1 className="ev-h1">可预览样本索引</h1>
        <p className="ev-meta">
          {records.length} 条样本 · {authorCount} 位匿名作者 · {products.length} 个产品
        </p>
        <p className="ev-note">
          人数按 author_id 去重；答案中的人数、比例、原因聚合与替代品排序全部由确定性工具从这些记录计算，模型只写文案。
          点开任意一条即可看到原文，以及与答案引用逐字一致的高亮原话。
        </p>
      </section>

      {groups.map(({ product, rows }) => (
        <section className="ev-card" key={product.id}>
          <div className="ev-group-head">
            <h2 className="ev-group-title">
              <span style={{ color: "#9298a2", fontSize: 12, fontWeight: 400 }}>
                {categoryLabel(product.category)} ·{" "}
              </span>
              {product.name}
            </h2>
            <span className="ev-group-count">{rows.length} 条</span>
          </div>

          {rows.map((r) => {
            const tags = conditionTags(r, product.category);
            return (
              <a className="ev-row" href={`/evidence/${r.id}`} key={r.id}>
                <div className="ev-row-head">
                  <span className="ev-row-id">{r.id}</span>
                  <span className={stanceClass(r.stance)}>{stanceLabel(r.stance)}</span>
                  <span className="ev-row-type">{sourceTypeLabel(r.sourceType)}</span>
                </div>
                <div className="ev-row-quote">{r.quote}</div>
                <div className="ev-row-meta">
                  {[
                    `作者 ${r.authorId}`,
                    r.publishedAt,
                    ...tags.map((t) => `${t.label} ${t.value}`),
                  ].join(" · ")}
                </div>
              </a>
            );
          })}
        </section>
      ))}

      <div className="ev-foot">
        <a className="ev-link" href="/">← 返回接口清单</a>
        <p>
          Demo 默认使用本地夹具（DATA_BACKEND=memory）。切换到 Supabase 后需先按离线管线导入样本，
          本页与详情页会自动读取同一份数据。
        </p>
      </div>
    </main>
  );
}
