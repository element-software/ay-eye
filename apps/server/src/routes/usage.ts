import type { FastifyInstance } from "fastify";
import { adapters } from "../adapters/index.js";
import {
  getModels,
  getProviderUsageToday,
  getLatestLimitSnapshots,
  getSummaryTotals,
  getTimeseries,
  listProviderConnections
} from "../db/database.js";

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/usage/summary", async () => {
    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const last7DaysStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    return {
      today: getSummaryTotals(todayStart, now),
      last7Days: getSummaryTotals(last7DaysStart, now)
    };
  });

  app.get("/api/usage/timeseries", async () => {
    const now = new Date();
    const start = new Date(startOfUtcDay(now).getTime() - 6 * 24 * 60 * 60 * 1000);
    return getTimeseries(start, now);
  });

  app.get("/api/usage/models", async () => {
    const now = new Date();
    const start = new Date(startOfUtcDay(now).getTime() - 30 * 24 * 60 * 60 * 1000);
    return getModels(start, now);
  });

  app.get("/api/usage/providers", async () => {
    const now = new Date();
    return getProviderUsageToday(startOfUtcDay(now), now);
  });

  app.get("/api/devices/cyd/status", async () => {
    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const today = getSummaryTotals(todayStart, now);
    const providerUsage = getProviderUsageToday(todayStart, now) as {
      provider: string;
      tokens: number | null;
      requests: number | null;
      cost: number | null;
    }[];
    const connections = listProviderConnections();

    return {
      updatedAt: now.toISOString(),
      status: connections.some((connection) => connection.status === "error") ? "error" : "ok",
      today: {
        requests: today.requests,
        inputTokens: today.inputTokens,
        outputTokens: today.outputTokens,
        cost: today.cost,
        currency: today.currency
      },
      providers: adapters.map((adapter) => {
        const usage = providerUsage.find((item) => item.provider === adapter.id);
        const connection = connections.find((item) => item.provider === adapter.id);
        return {
          id: adapter.id,
          label: adapter.label,
          tokens: usage?.tokens ?? null,
          requests: usage?.requests ?? null,
          cost: usage?.cost ?? null,
          status: connection?.status ?? (adapter.isConfigured() ? "configured" : "not_configured")
        };
      }),
      limits: getLatestLimitSnapshots()
    };
  });
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
