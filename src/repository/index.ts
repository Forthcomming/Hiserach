import { serverEnv } from "@/lib/env";
import { getDefaultMemoryRepository } from "./memoryRepository";
import { createSupabaseRepository } from "./supabaseRepository";
import type { Repository } from "./types";

let cached: Repository | null = null;

/**
 * 生产路径为 Supabase（规格锁定的唯一持久化服务）。
 * DATA_BACKEND=memory 使用本地夹具适配器，仅用于单元测试与本地链路联调；
 * 它不是演示数据来源，正式经验数据必须经离线管线校验后写入 Supabase。
 */
export function getRepository(): Repository {
  // 本地内存仓库需要在每次取用时检查 HMR 后的接口兼容性；不能被本模块的旧引用锁死。
  if (serverEnv.dataBackend === "memory") return getDefaultMemoryRepository();
  if (cached) return cached;
  if (serverEnv.dataBackend === "supabase") {
    if (!serverEnv.supabaseUrl || !serverEnv.supabaseServiceRoleKey) {
      throw new Error(
        "DATA_BACKEND=supabase 但未配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    cached = createSupabaseRepository();
  }
  return cached!;
}

export type { Repository } from "./types";
