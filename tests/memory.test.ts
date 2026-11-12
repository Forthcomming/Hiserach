import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { MemoryItem, MemorySource } from "@/domain/types";
import { createMemoryRepository } from "@/repository/memoryRepository";
import type { MemoryWritePlan } from "@/repository/types";

const FIXTURE = resolve(process.cwd(), "data/fixtures.json");
const source: MemorySource = { channel: "user_input", query: "婴儿米粉推荐" };

function plan(userId: string, items: MemoryWritePlan["items"], usedIds: string[] = []): MemoryWritePlan {
  return {
    userId,
    turnId: "t_test",
    category: "baby_food",
    items,
    usedIds,
    now: "2026-11-12T12:00:00.000Z",
  };
}

function activeOf(memories: MemoryItem[], key: string) {
  return memories.filter((m) => m.key === key && m.status === "active");
}

describe("记忆层状态机（规格 3.4 / 5.1 / AC-08）", () => {
  it("小林预置两条护肤条件，小B 保持无记忆", async () => {
    const repo = createMemoryRepository(FIXTURE);
    const xiaolin = await repo.createUser("xiaolin");
    const xiaob = await repo.createUser("xiaob");
    const a = await repo.listActiveMemories(xiaolin.id);
    const b = await repo.listActiveMemories(xiaob.id);
    expect(a).toHaveLength(2);
    expect(a.find((m) => m.key === "skin_issue")?.value).toBe("脂溢性皮炎");
    expect(a.find((m) => m.key === "skin_issue")?.isCore).toBe(true);
    expect(a.find((m) => m.key === "skin_type")?.isCore).toBe(false);
    expect(b).toHaveLength(0);
  });

  it("跨身份、跨品类无法读取对方记忆", async () => {
    const repo = createMemoryRepository(FIXTURE);
    const u1 = await repo.createUser("xiaolin");
    const u2 = await repo.createUser("xiaob");
    await repo.applyMemoryWrite(plan(u2.id, [
      { key: "allergy", value: "有过敏", isCore: true, category: "baby_food", source },
    ]));
    expect(await repo.getMemory(u1.id, (await repo.listMemories(u2.id))[0].id)).toBeNull();
    expect(await repo.listActiveMemories(u1.id, "baby_food")).toEqual([]);
    expect(await repo.listActiveMemories(u2.id, "beauty")).toEqual([]);
  });

  it("新增 → 同维度更新：旧值 superseded、新值唯一 active、双方建立取代关系", async () => {
    const repo = createMemoryRepository(FIXTURE);
    const u = await repo.createUser("xiaob");
    const first = await repo.applyMemoryWrite(plan(u.id, [
      { key: "allergy", value: "有过敏", isCore: true, category: "baby_food", source },
    ]));
    expect(first.created).toHaveLength(1);
    expect(first.undoable).toBe(true);

    const second = await repo.applyMemoryWrite(plan(u.id, [
      { key: "allergy", value: "无过敏", isCore: true, category: "baby_food", source },
    ]));
    const all = await repo.listMemories(u.id);
    expect(activeOf(all, "allergy")).toHaveLength(1);
    expect(activeOf(all, "allergy")[0].value).toBe("无过敏");
    expect(activeOf(all, "allergy")[0].supersedes).toBe(first.created[0].id);
    expect(all.find((m) => m.id === first.created[0].id)?.status).toBe("superseded");
    expect(second.supersededIds).toEqual([first.created[0].id]);

    const events = await repo.listMemoryEvents(u.id);
    expect(events.map((e) => e.action)).toContain("created");
    expect(events.map((e) => e.action)).toContain("superseded");
  });

  it("同值忽略：不新建条目、不产生写入事件", async () => {
    const repo = createMemoryRepository(FIXTURE);
    const u = await repo.createUser("xiaob");
    const item = { key: "allergy", value: "有过敏", isCore: true, category: "baby_food" as const, source };
    await repo.applyMemoryWrite(plan(u.id, [item]));
    const again = await repo.applyMemoryWrite(plan(u.id, [item]));
    expect(again.created).toHaveLength(0);
    expect(again.undoable).toBe(false);
    expect((await repo.listMemories(u.id))).toHaveLength(1);
  });

  it("used 事件只追加；删除后清除条件值且日志只留删除事实", async () => {
    const repo = createMemoryRepository(FIXTURE);
    const u = await repo.createUser("xiaob");
    const { created } = await repo.applyMemoryWrite(plan(u.id, [
      { key: "allergy", value: "有过敏", isCore: true, category: "baby_food", source },
    ]));
    // 用真实 id 追加一次 used
    await repo.applyMemoryWrite(plan(u.id, [], [created[0].id]));
    expect((await repo.listMemoryEvents(u.id)).some((e) => e.action === "used")).toBe(true);

    await repo.deleteMemory(u.id, created[0].id, "t_del");
    const after = (await repo.listMemories(u.id))[0];
    expect(after.status).toBe("deleted");
    expect(after.value).toBe("");
    const deletedEvent = (await repo.listMemoryEvents(u.id)).find((e) => e.action === "deleted");
    expect(deletedEvent?.reason).not.toContain("有过敏");
  });

  it("撤销写入恢复写入前有效状态，不丢失历史取代关系", async () => {
    const repo = createMemoryRepository(FIXTURE);
    const u = await repo.createUser("xiaob");
    const first = await repo.applyMemoryWrite(plan(u.id, [
      { key: "allergy", value: "有过敏", isCore: true, category: "baby_food", source },
    ]));
    const second = await repo.applyMemoryWrite(plan(u.id, [
      { key: "allergy", value: "无过敏", isCore: true, category: "baby_food", source },
    ]));
    const ok = await repo.undoMemoryWrite(u.id, second.undoToken!, "t_undo");
    expect(ok).toBe(true);
    const all = await repo.listMemories(u.id);
    expect(activeOf(all, "allergy")).toHaveLength(1);
    expect(activeOf(all, "allergy")[0].id).toBe(first.created[0].id);
    // 新条目保留为 superseded，历史关系不丢失
    expect(all.find((m) => m.id === second.created[0].id)?.status).toBe("superseded");
    expect((await repo.listMemoryEvents(u.id)).some((e) => e.action === "undo")).toBe(true);
  });

  it("重置：清空新增数据并恢复预置记忆，小B 保持无记忆", async () => {
    const repo = createMemoryRepository(FIXTURE);
    const u = await repo.createUser("xiaolin");
    const session = await repo.createSession(u.id);
    await repo.applyMemoryWrite(plan(u.id, [
      { key: "allergy", value: "有过敏", isCore: true, category: "baby_food", source },
    ]));
    await repo.resetUser(u.id, "xiaolin");
    expect((await repo.listMemories(u.id)).map((m) => m.key).sort()).toEqual([
      "skin_issue",
      "skin_type",
    ]);
    expect(await repo.getSession(session.id)).toBeNull();

    const b = await repo.createUser("xiaob");
    await repo.applyMemoryWrite(plan(b.id, [
      { key: "allergy", value: "有过敏", isCore: true, category: "baby_food", source },
    ]));
    await repo.resetUser(b.id, "xiaob");
    expect(await repo.listMemories(b.id)).toEqual([]);
  });
});
