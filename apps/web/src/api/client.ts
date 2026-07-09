export type Provider = {
  id: "openai" | "anthropic" | "cursor";
  label: string;
  configured: boolean;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type Summary = {
  today: Totals;
  last7Days: Totals;
};

export type Totals = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  currency: string;
};

export type TimeseriesPoint = {
  bucketStart: string;
  provider: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number | null;
};

export type ModelUsage = {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  requests: number;
  cost: number | null;
  currency: string;
};

export type LimitSnapshot = {
  provider: string;
  source: string;
  capturedAt: string;
  window: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
  rawJson: string | null;
};

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "POST" });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}
