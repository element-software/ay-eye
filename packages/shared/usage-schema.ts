import { z } from "zod";

export const providerIdSchema = z.enum(["openai", "anthropic", "cursor"]);
export const granularitySchema = z.enum(["hour", "day"]);

export const usageBucketSchema = z.object({
  provider: providerIdSchema,
  bucketStart: z.string(),
  bucketEnd: z.string(),
  granularity: granularitySchema,
  model: z.string().optional(),
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
  apiKeyId: z.string().optional(),
  providerUserId: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cachedTokens: z.number().optional(),
  requestCount: z.number().optional(),
  costAmount: z.number().optional(),
  costCurrency: z.string().optional(),
  raw: z.unknown().optional()
});
