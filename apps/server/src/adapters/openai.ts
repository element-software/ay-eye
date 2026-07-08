import type { UsageBucket, UsageGranularity, UsageProviderAdapter } from "@ai-usage-meter/shared";
import { getProviderCredential } from "../config/env.js";

type OpenAIBucket = {
  start_time: number;
  end_time: number;
  results?: OpenAIUsageResult[];
};

type OpenAIUsageResult = {
  input_tokens?: number;
  output_tokens?: number;
  input_cached_tokens?: number;
  num_model_requests?: number;
  model?: string | null;
  project_id?: string | null;
  api_key_id?: string | null;
  user_id?: string | null;
};

type OpenAIResponse<T> = {
  data?: T[];
  next_page?: string | null;
};

export class OpenAIAdapter implements UsageProviderAdapter {
  id = "openai" as const;
  label = "OpenAI";

  isConfigured(): boolean {
    return Boolean(getProviderCredential("openai"));
  }

  async testConnection(): Promise<{ ok: boolean; message?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, message: "OPENAI_ADMIN_KEY is not configured" };
    }

    const now = Math.floor(Date.now() / 1000);
    const url = new URL("https://api.openai.com/v1/organization/costs");
    url.searchParams.set("start_time", String(now - 86400));
    url.searchParams.set("end_time", String(now));
    url.searchParams.set("limit", "1");

    const response = await fetch(url, { headers: this.headers() });
    if (!response.ok) {
      return { ok: false, message: await responseError(response) };
    }

    return { ok: true };
  }

  async fetchUsage(params: {
    start: Date;
    end: Date;
    granularity: UsageGranularity;
  }): Promise<UsageBucket[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const usageBuckets = await this.fetchCompletionUsage(params);
    const costBuckets = await this.fetchCosts(params.start, params.end);
    return [...usageBuckets, ...costBuckets];
  }

  private async fetchCompletionUsage(params: {
    start: Date;
    end: Date;
    granularity: UsageGranularity;
  }): Promise<UsageBucket[]> {
    const results: UsageBucket[] = [];
    let page: string | undefined;

    do {
      const url = new URL("https://api.openai.com/v1/organization/usage/completions");
      url.searchParams.set("start_time", toUnixSeconds(params.start));
      url.searchParams.set("end_time", toUnixSeconds(params.end));
      url.searchParams.set("bucket_width", params.granularity === "hour" ? "1h" : "1d");
      url.searchParams.set("limit", params.granularity === "hour" ? "168" : "31");
      for (const group of ["model", "project_id", "api_key_id", "user_id"]) {
        url.searchParams.append("group_by[]", group);
      }
      if (page) {
        url.searchParams.set("page", page);
      }

      const payload = await fetchJson<OpenAIResponse<OpenAIBucket>>(url, this.headers());
      for (const bucket of payload.data ?? []) {
        for (const item of bucket.results ?? []) {
          results.push({
            provider: this.id,
            bucketStart: fromUnixSeconds(bucket.start_time),
            bucketEnd: fromUnixSeconds(bucket.end_time),
            granularity: params.granularity,
            model: item.model ?? undefined,
            projectId: item.project_id ?? undefined,
            apiKeyId: item.api_key_id ?? undefined,
            providerUserId: item.user_id ?? undefined,
            inputTokens: item.input_tokens ?? 0,
            outputTokens: item.output_tokens ?? 0,
            cachedTokens: item.input_cached_tokens ?? 0,
            requestCount: item.num_model_requests ?? 0,
            raw: item
          });
        }
      }

      page = payload.next_page ?? undefined;
    } while (page);

    return results;
  }

  private async fetchCosts(start: Date, end: Date): Promise<UsageBucket[]> {
    const results: UsageBucket[] = [];
    let page: string | undefined;

    do {
      const url = new URL("https://api.openai.com/v1/organization/costs");
      url.searchParams.set("start_time", toUnixSeconds(start));
      url.searchParams.set("end_time", toUnixSeconds(end));
      url.searchParams.set("bucket_width", "1d");
      url.searchParams.set("limit", "180");
      if (page) {
        url.searchParams.set("page", page);
      }

      const payload = await fetchJson<OpenAIResponse<OpenAIBucket>>(url, this.headers());
      for (const bucket of payload.data ?? []) {
        const costAmount = (bucket.results ?? []).reduce((sum, item) => sum + readCostAmount(item), 0);
        if (costAmount > 0) {
          results.push({
            provider: this.id,
            bucketStart: fromUnixSeconds(bucket.start_time),
            bucketEnd: fromUnixSeconds(bucket.end_time),
            granularity: "day",
            model: "__provider_cost__",
            costAmount,
            costCurrency: readCostCurrency(bucket.results?.[0]) ?? "USD",
            raw: bucket
          });
        }
      }

      page = payload.next_page ?? undefined;
    } while (page);

    return results;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${getProviderCredential("openai")}`,
      "Content-Type": "application/json"
    };
  }
}

async function fetchJson<T>(url: URL, headers: HeadersInit): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return (await response.json()) as T;
}

async function responseError(response: Response): Promise<string> {
  const body = await response.text();
  return `${response.status} ${response.statusText}${body ? `: ${body.slice(0, 300)}` : ""}`;
}

function toUnixSeconds(date: Date): string {
  return String(Math.floor(date.getTime() / 1000));
}

function fromUnixSeconds(value: number): string {
  return new Date(value * 1000).toISOString();
}

function readCostAmount(item: unknown): number {
  if (!item || typeof item !== "object") {
    return 0;
  }
  const record = item as Record<string, unknown>;
  const amount = record.amount;
  if (typeof amount === "number") {
    return amount;
  }
  if (amount && typeof amount === "object" && typeof (amount as Record<string, unknown>).value === "number") {
    return (amount as Record<string, number>).value;
  }
  if (typeof record.cost_amount === "number") {
    return record.cost_amount;
  }
  return 0;
}

function readCostCurrency(item: unknown): string | undefined {
  if (!item || typeof item !== "object") {
    return undefined;
  }
  const record = item as Record<string, unknown>;
  const amount = record.amount;
  if (amount && typeof amount === "object" && typeof (amount as Record<string, unknown>).currency === "string") {
    return (amount as Record<string, string>).currency.toUpperCase();
  }
  return typeof record.currency === "string" ? record.currency.toUpperCase() : undefined;
}
