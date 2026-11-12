import { toPublicError } from "@/domain/errors";
import type { StreamEvent } from "@/domain/types";

/**
 * 原生 SSE 流式响应（规格 4.4）。
 * 事实字段以 answer.data 为准；answer.delta 只用于提升感知速度。
 * 任何未捕获异常都收敛成安全错误码，不下发密钥或内部堆栈。
 */
export function sseResponse(
  run: (emit: (event: StreamEvent) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await run(emit);
      } catch (error) {
        const pub = toPublicError(error);
        emit({ type: "turn.failed", code: pub.code, retryable: pub.retryable });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
