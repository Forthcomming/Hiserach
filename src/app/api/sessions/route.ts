import { getRepository } from "@/repository";
import { jsonError, jsonOk } from "@/server/http";
import { PersonaSchema, parseBody } from "@/server/schemas";

export const runtime = "nodejs";

/** POST /api/sessions —— 选择/初始化身份，创建匿名会话与预置记忆。 */
export async function POST(request: Request) {
  try {
    const { persona } = await parseBody(request, PersonaSchema);
    const repo = getRepository();
    const user = await repo.createUser(persona);
    const session = await repo.createSession(user.id);
    const memories = await repo.listActiveMemories(user.id);

    return jsonOk(
      {
        sessionId: session.id,
        userId: user.id,
        persona,
        presetMemories: memories.map((m) => ({
          id: m.id,
          category: m.category,
          key: m.key,
          isCore: m.isCore,
          value: m.value,
        })),
      },
      201,
    );
  } catch (error) {
    return jsonError(error);
  }
}
