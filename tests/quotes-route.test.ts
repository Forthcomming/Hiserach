import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/quotes/route";
import { getRepository } from "@/repository";

describe("原话接口的人群过滤", () => {
  it("只返回本轮答案允许展示的评价", async () => {
    const repo = getRepository();
    const user = await repo.createUser("xiaob");
    const session = await repo.createSession(user.id);
    const url = new URL("http://localhost/api/quotes");
    url.searchParams.set("sessionId", session.id);
    url.searchParams.set("productId", "p_rice_01");
    url.searchParams.set("stance", "recommend");
    // r27、r28 是本轮同类人好评；同产品下其他好评不得混入。
    url.searchParams.set("allowedQuoteIds", "r27,r28");

    const response = await GET(new Request(url));
    const body = (await response.json()) as { quotes: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.quotes.map((quote) => quote.id).sort()).toEqual(["r27", "r28"]);
  });

  it("允许列表为空时返回空列表", async () => {
    const repo = getRepository();
    const user = await repo.createUser("xiaob");
    const session = await repo.createSession(user.id);
    const url = new URL("http://localhost/api/quotes");
    url.searchParams.set("sessionId", session.id);
    url.searchParams.set("productId", "p_rice_01");
    url.searchParams.set("allowedQuoteIds", "");

    const response = await GET(new Request(url));
    const body = (await response.json()) as { quotes: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.quotes).toEqual([]);
  });
});
