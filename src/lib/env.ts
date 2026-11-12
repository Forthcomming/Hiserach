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
    // 默认不放行任何外部域名：Demo 的「查看原文」指向站内合成样本页 /evidence/:id。
    // 将来接入已授权的真实来源时，按实际域名配置白名单即可，无需改动代码。
    return (process.env.ALLOWED_SOURCE_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  get isModelConfigured(): boolean {
    return Boolean(this.llmApiKey);
  },
};

/** 站内证据预览页路径：固定前缀 + 单段安全 ID，不接受 query / hash / 协议相对 URL。 */
const INTERNAL_EVIDENCE_PATH = /^\/evidence\/[A-Za-z0-9_-]+$/;

/**
 * source_url 安全清洗（规格 6）。两类合法值：
 *  ① 站内合成样本预览路径 /evidence/:id（Demo 默认，页面明确标注为 mock）
 *  ② https 且域名命中 ALLOWED_SOURCE_HOSTS 的外部真实来源（将来接入）
 * 其余一律丢弃，防止 javascript: / data: / 协议相对 URL / 开放重定向。
 */
export function sanitizeSourceUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value || /[\r\n\\]/.test(value)) return undefined;

  if (value.startsWith("/")) {
    // "//evil.com" 这类协议相对 URL 必须拒绝，否则会形成开放重定向。
    if (value.startsWith("//")) return undefined;
    return INTERNAL_EVIDENCE_PATH.test(value) ? value : undefined;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    if (!serverEnv.allowedSourceHosts.includes(url.hostname.toLowerCase())) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/** 供前端判断"站内预览 / 外部原文"，避免把跳转逻辑写死在某一类来源上。 */
export function isInternalEvidenceUrl(url: string | undefined): boolean {
  return Boolean(url && INTERNAL_EVIDENCE_PATH.test(url));
}
