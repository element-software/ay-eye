export type ProviderId = "openai" | "anthropic" | "cursor";

export type ProviderStatus =
  | "not_configured"
  | "configured"
  | "ok"
  | "partial"
  | "error";

export type UsageGranularity = "hour" | "day";

export type UsageBucket = {
  provider: ProviderId;
  bucketStart: string;
  bucketEnd: string;
  granularity: UsageGranularity;
  model?: string;
  projectId?: string;
  workspaceId?: string;
  apiKeyId?: string;
  providerUserId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  requestCount?: number;
  costAmount?: number;
  costCurrency?: string;
  raw?: unknown;
};

export interface UsageProviderAdapter {
  id: ProviderId;
  label: string;
  isConfigured(): boolean;
  testConnection(): Promise<{
    ok: boolean;
    message?: string;
  }>;
  fetchUsage(params: {
    start: Date;
    end: Date;
    granularity: UsageGranularity;
  }): Promise<UsageBucket[]>;
}
