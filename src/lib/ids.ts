import { randomBytes, randomUUID } from "node:crypto";

/** 匿名 ID 使用不可预测随机值（规格 11）。 */
export function newAnonId(prefix: string): string {
  return `${prefix}_${randomBytes(18).toString("base64url")}`;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
