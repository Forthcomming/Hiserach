import { NextResponse } from "next/server";
import { AppError, toPublicError } from "@/domain/errors";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown): NextResponse {
  const pub = toPublicError(error);
  const status =
    error instanceof AppError
      ? error.status
      : pub.code === "INTERNAL"
        ? 500
        : 400;
  // 内部细节只写服务端日志，不进入响应体
  if (!(error instanceof AppError)) {
    console.error("[hisearch] unhandled error:", error instanceof Error ? error.message : "unknown");
  }
  return NextResponse.json(
    { code: pub.code, message: pub.message, retryable: pub.retryable },
    { status },
  );
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
