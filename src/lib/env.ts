/** 仅服务端可读的环境配置；任何值都不得下发到客户端。 */
export const serverEnv = {
  get dataBackend(): "supabase" | "memory" {
    return process.env.DATA_BACKEND === "supabase" ? "supabase" : "memory";
  },
  get supabaseUrl(): string {
    return process.env.SUPABASE_URL ?? "";
  },
  get supabaseServiceRoleKey(): string {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  },
  get seedFixturePath(): string {
    return process.env.SEED_FIXTURE_PATH ?? "./data/fixtures.json";
  },
  get llmApiKey(): string {
    return process.env.LLM_API_KEY ?? "";
  },
  get llmBaseUrl(): string {
    return process.env.LLM_BASE_URL ?? "";
  },
  get llmModel(): string {
    return process.env.LLM_MODEL ?? "deepseek-chat";
  },
  get llmTimeoutMs(): number {
    const n = Number(process.env.LLM_TIMEOUT_MS);
    return Number.isFinite(n) && n > 0 ? n : 15_000;
  },
  get allowedSourceHosts(): string[] {
    return (process.env.ALLOWED_SOURCE_HOSTS ?? "www.xiaohongshu.com,xiaohongshu.com")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  get isModelConfigured(): boolean {
    return Boolean(this.llmApiKey);
  },
};

/** source_url 只允许 https 且域名命中允许列表，防止开放重定向（规格 6）。 */
export function sanitizeSourceUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return undefined;
    if (!serverEnv.allowedSourceHosts.includes(url.hostname.toLowerCase())) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
