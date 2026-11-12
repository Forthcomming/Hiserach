import { rateLimited } from "@/domain/errors";

/**
 * 进程内滑动窗口限流（规格 6：按匿名会话与 IP 双重限流）。
 * MVP 单实例足够；多实例 Vercel 部署应替换为 Vercel KV / Upstash 等共享存储。
 * 同时近似"模型调用费用上限"：单会话每分钟请求数受限，且每轮最多 2 次模型调用
 * （understand + compose，校验重试复用同一份工具结果，不重复随机计算人数）。
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const SESSION_LIMIT = 10;
const IP_LIMIT = 30;
const buckets = new Map<string, Bucket>();

function hit(key: string, limit: number, now: number): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function checkChatRateLimit(sessionId: string, ip: string): void {
  const now = Date.now();
  // 定期清理过期桶，避免无界增长
  if (buckets.size > 5000) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }
  if (!hit(`session:${sessionId}`, SESSION_LIMIT, now)) throw rateLimited();
  if (!hit(`ip:${ip}`, IP_LIMIT, now)) throw rateLimited();
}

/** 测试用：清空限流状态。 */
export function resetRateLimit(): void {
  buckets.clear();
}
