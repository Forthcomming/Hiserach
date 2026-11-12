import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isInternalEvidenceUrl, sanitizeSourceUrl } from "@/lib/env";
import { createMemoryRepository } from "@/repository/memoryRepository";
import { getQuotes } from "@/tools/deterministic";

const FIXTURE = resolve(process.cwd(), "data/fixtures.json");

describe("站内证据预览链接", () => {
  const original = process.env.ALLOWED_SOURCE_HOSTS;

  afterEach(() => {
    if (original === undefined) delete process.env.ALLOWED_SOURCE_HOSTS;
    else process.env.ALLOWED_SOURCE_HOSTS = original;
  });

  it("放行固定前缀的站内路径，拒绝协议相对 URL 与路径穿越", () => {
    expect(sanitizeSourceUrl("/evidence/r01")).toBe("/evidence/r01");
    expect(isInternalEvidenceUrl("/evidence/r01")).toBe(true);
    expect(sanitizeSourceUrl("/evidence/../admin")).toBeUndefined();
    expect(sanitizeSourceUrl("//evil.com/evidence/r01")).toBeUndefined();
    expect(sanitizeSourceUrl("/evidence/r01?next=//evil.com")).toBeUndefined();
    expect(sanitizeSourceUrl("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeSourceUrl("http://example.com/x")).toBeUndefined();
  });

  it("外部 https 链接默认拒绝，配置白名单后才放行", () => {
    delete process.env.ALLOWED_SOURCE_HOSTS;
    expect(sanitizeSourceUrl("https://example.com/note/1")).toBeUndefined();
    process.env.ALLOWED_SOURCE_HOSTS = "example.com";
    expect(sanitizeSourceUrl("https://example.com/note/1")).toBe(
      "https://example.com/note/1",
    );
    expect(sanitizeSourceUrl("https://evil.com/note/1")).toBeUndefined();
  });

  it("夹具 36 条 source_url 全部指向站内预览页，且可按 ID 取回原文", async () => {
    const repo = createMemoryRepository(FIXTURE);
    const records = await repo.listExperiences();
    expect(records).toHaveLength(36);
    expect(records.every((r) => r.sourceUrl === `/evidence/${r.id}`)).toBe(true);

    const first = await repo.getExperienceById("r01");
    expect(first).not.toBeNull();
    if (first?.sourceText) {
      expect(first.sourceText.includes(first.quote)).toBe(true);
    }
    expect(await repo.getExperienceById("missing")).toBeNull();

    const products = await repo.listProducts();
    const quotes = getQuotes({ records, products, category: "beauty", filter: {} });
    expect(quotes.every((q) => q.sourceUrl?.startsWith("/evidence/"))).toBe(true);
  });
});
