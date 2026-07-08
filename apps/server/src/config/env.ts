import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const sourceFile = fileURLToPath(import.meta.url);
export const serverRoot = dirname(dirname(dirname(sourceFile)));
export const repoRoot = resolve(serverRoot, "../..");
dotenv.config({ path: resolve(repoRoot, ".env") });

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().default("file:./data/usage.db"),
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  APP_USERNAME: z.string().optional(),
  APP_PASSWORD: z.string().optional(),
  OPENAI_ADMIN_KEY: z.string().optional(),
  ANTHROPIC_ADMIN_KEY: z.string().optional(),
  CURSOR_API_KEY: z.string().optional()
});

export const appConfig = envSchema.parse(process.env);

export const appVersion = "0.1.0";

const secretPaths = {
  openai: "/run/secrets/openai_admin_key",
  anthropic: "/run/secrets/anthropic_admin_key",
  cursor: "/run/secrets/cursor_api_key"
} as const;

function readSecret(path: string): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  const value = readFileSync(path, "utf8").trim();
  return value.length > 0 ? value : undefined;
}

export function getProviderCredential(provider: keyof typeof secretPaths): string | undefined {
  const secret = readSecret(secretPaths[provider]);
  if (secret) {
    return secret;
  }

  if (provider === "openai") {
    return appConfig.OPENAI_ADMIN_KEY;
  }

  if (provider === "anthropic") {
    return appConfig.ANTHROPIC_ADMIN_KEY;
  }

  return appConfig.CURSOR_API_KEY;
}

export function getDatabasePath(): string {
  if (!appConfig.DATABASE_URL.startsWith("file:")) {
    throw new Error("Only file: SQLite DATABASE_URL values are supported by the MVP");
  }

  const rawPath = appConfig.DATABASE_URL.replace(/^file:/, "");
  return rawPath.startsWith("/") ? rawPath : resolve(process.cwd(), rawPath);
}

export function isAuthConfigured(): boolean {
  return Boolean(appConfig.APP_USERNAME && appConfig.APP_PASSWORD);
}
