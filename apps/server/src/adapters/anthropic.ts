import type { UsageBucket, UsageProviderAdapter } from "@ai-usage-meter/shared";
import { getProviderCredential } from "../config/env.js";

export class AnthropicAdapter implements UsageProviderAdapter {
  id = "anthropic" as const;
  label = "Anthropic";

  isConfigured(): boolean {
    return Boolean(getProviderCredential("anthropic"));
  }

  async testConnection(): Promise<{ ok: boolean; message?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, message: "ANTHROPIC_ADMIN_KEY is not configured" };
    }

    const response = await fetch("https://api.anthropic.com/v1/organizations/me", {
      headers: {
        "anthropic-version": "2023-06-01",
        "x-api-key": getProviderCredential("anthropic") ?? ""
      }
    });

    if (!response.ok) {
      return { ok: false, message: `${response.status} ${response.statusText}: ${(await response.text()).slice(0, 300)}` };
    }

    return { ok: true };
  }

  async fetchUsage(): Promise<UsageBucket[]> {
    if (!this.isConfigured()) {
      return [];
    }

    throw new Error("Anthropic usage sync is scaffolded; configure official Usage/Cost API mapping before enabling sync");
  }
}
