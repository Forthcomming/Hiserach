import { z } from "zod";
import { badRequest } from "@/domain/errors";

export const PersonaSchema = z.object({
  persona: z.enum(["xiaolin", "xiaob"]),
});

export const ChatSchema = z.object({
  sessionId: z.string().min(8).max(200),
  message: z.string().min(1).max(500),
  followupSelection: z
    .array(z.object({ key: z.string().min(1).max(60), value: z.string().min(1).max(60) }))
    .max(8)
    .optional(),
});

export const PreferencesSchema = z.object({
  sessionId: z.string().min(8).max(200),
  memoryDisabled: z.boolean(),
});

export const MemoryPatchSchema = z.object({
  sessionId: z.string().min(8).max(200),
  value: z.string().min(1).max(60),
});

export const QuotesQuerySchema = z.object({
  sessionId: z.string().min(8).max(200),
  productId: z.string().min(1).max(80),
  reasonId: z.string().min(1).max(120).optional(),
  stance: z.enum(["recommend", "not_recommend"]).optional(),
  allowedQuoteIds: z
    .string()
    .max(2_000)
    .refine((raw) => {
      if (!raw) return true;
      const ids = raw.split(",");
      return ids.length <= 50 && ids.every((id) => /^[A-Za-z0-9_-]+$/.test(id));
    }, "评价 ID 列表不合法"),
  conditionContext: z.string().max(300).optional(),
});

export const SessionQuerySchema = z.object({
  sessionId: z.string().min(8).max(200),
});

export const UndoBodySchema = z.object({
  sessionId: z.string().min(8).max(200),
});

export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest("请求体不是合法 JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw badRequest("请求参数不合法");
  return parsed.data;
}

export function parseQuery<T>(
  url: URL,
  schema: z.ZodType<T>,
): T {
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw badRequest("查询参数不合法");
  return parsed.data;
}
