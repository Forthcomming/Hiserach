/** 对外安全错误码。规格 6：不下发密钥、数据库内部错误或堆栈。 */
export type PublicErrorCode =
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "MODEL_UNAVAILABLE"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    readonly code: PublicErrorCode,
    readonly status: number,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message = "请求参数不合法") =>
  new AppError("INVALID_REQUEST", 400, false, message);
export const notFound = (message = "资源不存在") =>
  new AppError("NOT_FOUND", 404, false, message);
export const forbidden = (message = "无权访问该资源") =>
  new AppError("FORBIDDEN", 403, false, message);
export const rateLimited = () =>
  new AppError("RATE_LIMITED", 429, true, "请求过于频繁，请稍后重试");

/** 把任意异常收敛为可下发的安全错误；内部细节只写服务端日志。 */
export function toPublicError(error: unknown): {
  code: PublicErrorCode;
  retryable: boolean;
  message: string;
} {
  if (error instanceof AppError) {
    return { code: error.code, retryable: error.retryable, message: error.message };
  }
  return { code: "INTERNAL", retryable: true, message: "服务暂时不可用，请重试" };
}
