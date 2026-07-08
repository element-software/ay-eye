import type { ProviderId, UsageProviderAdapter } from "@ai-usage-meter/shared";
import { AnthropicAdapter } from "./anthropic.js";
import { CursorAdapter } from "./cursor.js";
import { OpenAIAdapter } from "./openai.js";

export const adapters: UsageProviderAdapter[] = [
  new OpenAIAdapter(),
  new AnthropicAdapter(),
  new CursorAdapter()
];

export function getAdapter(provider: ProviderId): UsageProviderAdapter | undefined {
  return adapters.find((adapter) => adapter.id === provider);
}
