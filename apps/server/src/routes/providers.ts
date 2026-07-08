import type { FastifyInstance } from "fastify";
import { providerIdSchema } from "@ai-usage-meter/shared";
import { adapters, getAdapter } from "../adapters/index.js";
import { ensureProviderConnection, listProviderConnections, updateProviderStatus } from "../db/database.js";
import { syncOneProvider } from "../scheduler/sync-service.js";

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/providers", async () => {
    for (const adapter of adapters) {
      ensureProviderConnection(adapter.id, adapter.label, adapter.isConfigured());
    }

    const connections = listProviderConnections();
    return adapters.map((adapter) => {
      const connection = connections.find((item) => item.provider === adapter.id);
      return {
        id: adapter.id,
        label: adapter.label,
        configured: adapter.isConfigured(),
        status: adapter.isConfigured() ? connection?.status ?? "configured" : "not_configured",
        lastSyncAt: connection?.lastSyncAt ?? null,
        lastError: connection?.lastError ?? null
      };
    });
  });

  app.post("/api/providers/:provider/test", async (request, reply) => {
    const parsed = providerIdSchema.safeParse((request.params as { provider?: string }).provider);
    if (!parsed.success) {
      return reply.code(404).send({ error: "Unknown provider" });
    }

    const adapter = getAdapter(parsed.data);
    if (!adapter) {
      return reply.code(404).send({ error: "Unknown provider" });
    }

    ensureProviderConnection(adapter.id, adapter.label, adapter.isConfigured());
    const result = await adapter.testConnection();
    updateProviderStatus(adapter.id, result.ok ? (adapter.id === "openai" ? "ok" : "partial") : "error", result.message);
    return result;
  });

  app.post("/api/providers/:provider/sync", async (request, reply) => {
    const parsed = providerIdSchema.safeParse((request.params as { provider?: string }).provider);
    if (!parsed.success) {
      return reply.code(404).send({ error: "Unknown provider" });
    }

    const adapter = getAdapter(parsed.data);
    if (!adapter) {
      return reply.code(404).send({ error: "Unknown provider" });
    }

    return syncOneProvider(adapter);
  });
}
