import type { UsageProviderAdapter } from "@ai-usage-meter/shared";
import { appConfig } from "../config/env.js";
import { syncProviders } from "./sync-service.js";

export function startScheduler(adapters: UsageProviderAdapter[]): NodeJS.Timeout {
  const intervalMs = appConfig.SYNC_INTERVAL_MINUTES * 60 * 1000;

  return setInterval(() => {
    syncProviders(adapters).catch((error) => {
      console.error("Scheduled sync failed", error);
    });
  }, intervalMs);
}
