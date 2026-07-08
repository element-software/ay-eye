import type { ProviderId, UsageProviderAdapter } from "@ai-usage-meter/shared";
import {
  createSyncRun,
  ensureProviderConnection,
  finishSyncRun,
  updateProviderStatus,
  upsertUsageBuckets
} from "../db/database.js";

let running = false;

export async function syncProviders(adapters: UsageProviderAdapter[], provider?: ProviderId): Promise<unknown[]> {
  if (running) {
    throw new Error("A sync run is already in progress");
  }

  running = true;
  try {
    const selected = provider ? adapters.filter((adapter) => adapter.id === provider) : adapters;
    const results: unknown[] = [];
    for (const adapter of selected) {
      results.push(await syncOneProvider(adapter));
    }
    return results;
  } finally {
    running = false;
  }
}

export async function syncOneProvider(adapter: UsageProviderAdapter): Promise<unknown> {
  ensureProviderConnection(adapter.id, adapter.label, adapter.isConfigured());
  if (!adapter.isConfigured()) {
    return { provider: adapter.id, status: "not_configured", recordsUpserted: 0 };
  }

  const runId = createSyncRun(adapter.id);
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const buckets = await adapter.fetchUsage({ start, end, granularity: "day" });
    const recordsUpserted = upsertUsageBuckets(buckets);
    updateProviderStatus(adapter.id, adapter.id === "openai" ? "ok" : "partial", null, true);
    finishSyncRun(runId, "ok", recordsUpserted);
    return { provider: adapter.id, status: "ok", recordsUpserted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateProviderStatus(adapter.id, "error", message);
    finishSyncRun(runId, "error", 0, message);
    return { provider: adapter.id, status: "error", error: message, recordsUpserted: 0 };
  }
}

export function isSyncRunning(): boolean {
  return running;
}
