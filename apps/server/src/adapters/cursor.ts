import type { UsageBucket, UsageProviderAdapter } from "@ai-usage-meter/shared";
import { getProviderCredential } from "../config/env.js";

export class CursorAdapter implements UsageProviderAdapter {
  id = "cursor" as const;
  label = "Cursor";

  isConfigured(): boolean {
    return Boolean(getProviderCredential("cursor"));
  }

  async testConnection(): Promise<{ ok: boolean; message?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, message: "CURSOR_API_KEY is not configured" };
    }

    const response = await fetch("https://api.cursor.com/teams/members", {
      headers: this.headers()
    });

    if (!response.ok) {
      return { ok: false, message: `${response.status} ${response.statusText}: ${(await response.text()).slice(0, 300)}` };
    }

    return { ok: true };
  }

  async fetchUsage(params: { start: Date; end: Date }): Promise<UsageBucket[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const response = await fetch("https://api.cursor.com/teams/daily-usage-data", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        startDate: params.start.toISOString().slice(0, 10),
        endDate: params.end.toISOString().slice(0, 10)
      })
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${(await response.text()).slice(0, 300)}`);
    }

    const payload = (await response.json()) as unknown;
    return parseCursorUsage(payload);
  }

  private headers(): HeadersInit {
    const credential = Buffer.from(`${getProviderCredential("cursor") ?? ""}:`).toString("base64");
    return {
      Authorization: `Basic ${credential}`,
      "Content-Type": "application/json"
    };
  }
}

function parseCursorUsage(payload: unknown): UsageBucket[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).data)
      ? ((payload as Record<string, unknown>).data as unknown[])
      : [];

  const buckets: UsageBucket[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const record = row as Record<string, unknown>;
    const date = readString(record.date) ?? readString(record.day);
    if (!date) {
      continue;
    }

    const bucketStart = new Date(`${date}T00:00:00.000Z`);
    const bucketEnd = new Date(bucketStart.getTime() + 24 * 60 * 60 * 1000);
    buckets.push({
      provider: "cursor",
      bucketStart: bucketStart.toISOString(),
      bucketEnd: bucketEnd.toISOString(),
      granularity: "day",
      providerUserId: readString(record.email) ?? readString(record.userId),
      inputTokens: readNumber(record.inputTokens),
      outputTokens: readNumber(record.outputTokens),
      requestCount: readNumber(record.requests) ?? readNumber(record.requestCount),
      costAmount: centsToDollars(readNumber(record.spendCents) ?? readNumber(record.totalSpendCents)),
      costCurrency: "USD",
      raw: row
    });
  }

  return buckets;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function centsToDollars(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value / 100;
}
