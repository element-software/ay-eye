import type { FastifyInstance } from "fastify";
import { providerIdSchema } from "@ai-usage-meter/shared";
import { adapters, getAdapter } from "../adapters/index.js";
import { syncProviders } from "../scheduler/sync-service.js";

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/sync", async () => syncProviders(adapters));

  app.post("/api/sync/:provider", async (request, reply) => {
    const parsed = providerIdSchema.safeParse((request.params as { provider?: string }).provider);
    if (!parsed.success) {
      return reply.code(404).send({ error: "Unknown provider" });
    }

    if (!getAdapter(parsed.data)) {
      return reply.code(404).send({ error: "Unknown provider" });
    }

    return syncProviders(adapters, parsed.data);
  });
}
