import { notFound } from "@/domain/errors";
import type { WorkingCondition } from "@/domain/types";
import { getRepository } from "@/repository";
import { getQuotes } from "@/tools/deterministic";
import { requireSession } from "@/server/auth";
import { jsonError, jsonOk } from "@/server/http";
import { QuotesQuerySchema, parseQuery } from "@/server/schemas";

export const runtime = "nodejs";

/** GET /api/quotes —— 按产品/原因/立场过滤原话（AC-07）。 */
export async function GET(request: Request) {
  try {
    const query = parseQuery(new URL(request.url), QuotesQuerySchema);
    const repo = getRepository();
    await requireSession(repo, query.sessionId);

    const product = await repo.getProduct(query.productId);
    if (!product) throw notFound("产品不存在");
    const [products, records] = await Promise.all([
      repo.listProducts(product.category),
      repo.listExperiences({ category: product.category }),
    ]);

    // conditionContext 预留给原话相关度排序；正式环境用词表归一化后的条件
    // 生成 query embedding，走 pgvector 余弦排序（规格 6.5）。
    const conditionContext: WorkingCondition[] = [];
    const quotes = getQuotes({
      records,
      products,
      category: product.category,
      filter: {
        productId: query.productId,
        ...(query.reasonId ? { reasonId: query.reasonId } : {}),
        ...(query.stance ? { stance: query.stance } : {}),
        conditionContext,
      },
    });

    return jsonOk({
      productId: query.productId,
      reasonId: query.reasonId ?? null,
      stance: query.stance ?? null,
      quotes,
    });
  } catch (error) {
    return jsonError(error);
  }
}
