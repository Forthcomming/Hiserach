import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const FIXTURE_PATH = resolve(ROOT, "data/fixtures.json");

/** 不引入 dotenv：手动读取 .env.local，仅在变量未设置时补值。 */
function loadLocalEnv() {
  const file = resolve(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

function loadFixture() {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  return {
    products: raw.products ?? [],
    records: raw.experience_records ?? [],
  };
}

/** 与 0001_init.sql 的约束对齐：产品外键、原话逐字、source_url 必须 https。 */
function validate(products, records) {
  const errors = [];
  const productIds = new Set(products.map((p) => p.id));
  for (const r of records) {
    if (!productIds.has(r.product_id)) {
      errors.push(`${r.id}: product_id ${r.product_id} 不在 products 中`);
    }
    if (r.source_text && !r.source_text.includes(r.quote)) {
      errors.push(`${r.id}: quote 不是 source_text 的子串`);
    }
    if (r.source_url && !/^https:\/\//.test(r.source_url)) {
      errors.push(`${r.id}: source_url 必须是 https`);
    }
    if (!["recommend", "not_recommend"].includes(r.stance)) {
      errors.push(`${r.id}: stance 非法`);
    }
    if (!["note", "comment"].includes(r.source_type)) {
      errors.push(`${r.id}: source_type 非法`);
    }
  }
  return errors;
}

loadLocalEnv();
const { products, records } = loadFixture();
const errors = validate(products, records);

console.log("注意：这是 MOCK 演示数据，禁止作为真实事实来源（见 data/fixtures.json 的 _notice）。");
console.log(`夹具：products ${products.length} 条，experience_records ${records.length} 条，作者去重 ${new Set(records.map((r) => r.author_id)).size} 人。`);

if (errors.length) {
  console.error("夹具校验失败，未写入：\n" + errors.join("\n"));
  process.exit(1);
}
console.log("夹具校验通过：产品外键、原话逐字、source_url/stance/source_type 全部合法。");

if (DRY_RUN) {
  console.log("dry-run 结束：仅离线校验，未连接 Supabase。");
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY。请在 .env.local 或环境变量中配置。");
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function upsert(table, rows) {
  const { error } = await db.from(table).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`upsert ${table}: ${rows.length} 行`);
}

try {
  await upsert(
    "products",
    products.map((p) => ({ id: p.id, category: p.category, name: p.name })),
  );
  await upsert(
    "experience_records",
    records.map((r) => ({
      id: r.id,
      author_id: r.author_id,
      product_id: r.product_id,
      stance: r.stance,
      author_conditions: r.author_conditions ?? {},
      reasons: r.reasons ?? [],
      quote: r.quote,
      source_text: r.source_text ?? null,
      source_type: r.source_type,
      source_url: r.source_url ?? null,
      published_at: r.published_at,
    })),
  );
  console.log("导入完成。前提：supabase/migrations/0001_init.sql 已在 SQL Editor 执行。");
} catch (error) {
  console.error("导入失败：", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
