import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { ProviderId, ProviderStatus, UsageBucket } from "@ai-usage-meter/shared";
import { getDatabasePath } from "../config/env.js";

export type ProviderConnection = {
  id: number;
  provider: ProviderId;
  displayName: string;
  authMode: string;
  status: ProviderStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SummaryTotals = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  currency: string;
};

export type LimitSnapshotInput = {
  provider: string;
  source?: string;
  capturedAt?: string;
  window: string;
  usedPercent?: number | null;
  remainingPercent?: number | null;
  resetAt?: string | null;
  rawJson?: unknown;
};

const databasePath = getDatabasePath();
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      auth_mode TEXT NOT NULL,
      status TEXT NOT NULL,
      last_sync_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS usage_buckets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unique_key TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      bucket_start TEXT NOT NULL,
      bucket_end TEXT NOT NULL,
      granularity TEXT NOT NULL,
      model TEXT,
      project_id TEXT,
      workspace_id TEXT,
      api_key_id TEXT,
      provider_user_id TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cached_tokens INTEGER NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL DEFAULT 0,
      cost_amount REAL,
      cost_currency TEXT,
      raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      error_message TEXT,
      records_upserted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS limit_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      source TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      window TEXT NOT NULL,
      used_percent REAL,
      remaining_percent REAL,
      reset_at TEXT,
      raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_usage_buckets_provider_start ON usage_buckets(provider, bucket_start);
    CREATE INDEX IF NOT EXISTS idx_usage_buckets_model ON usage_buckets(model);
    CREATE INDEX IF NOT EXISTS idx_limit_snapshots_provider_window ON limit_snapshots(provider, window, captured_at);
  `);
}

export function ensureProviderConnection(
  provider: ProviderId,
  displayName: string,
  configured: boolean
): ProviderConnection {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO provider_connections (provider, display_name, auth_mode, status, created_at, updated_at)
    VALUES (@provider, @displayName, @authMode, @status, @now, @now)
    ON CONFLICT(provider) DO UPDATE SET
      display_name = excluded.display_name,
      auth_mode = excluded.auth_mode,
      status = CASE
        WHEN provider_connections.status = 'ok' AND excluded.status = 'configured' THEN provider_connections.status
        WHEN provider_connections.status = 'error' AND excluded.status = 'configured' THEN provider_connections.status
        ELSE excluded.status
      END,
      updated_at = excluded.updated_at
  `).run({
    provider,
    displayName,
    authMode: configured ? "secret_or_env" : "none",
    status: configured ? "configured" : "not_configured",
    now
  });

  return getProviderConnection(provider)!;
}

export function getProviderConnection(provider: ProviderId): ProviderConnection | undefined {
  const row = db.prepare("SELECT * FROM provider_connections WHERE provider = ?").get(provider) as
    | Record<string, unknown>
    | undefined;
  return row ? mapConnection(row) : undefined;
}

export function listProviderConnections(): ProviderConnection[] {
  return (db.prepare("SELECT * FROM provider_connections ORDER BY provider").all() as Record<string, unknown>[]).map(
    mapConnection
  );
}

export function updateProviderStatus(
  provider: ProviderId,
  status: ProviderStatus,
  lastError?: string | null,
  synced = false
): void {
  db.prepare(`
    UPDATE provider_connections
    SET status = @status,
        last_error = @lastError,
        last_sync_at = CASE WHEN @synced THEN @now ELSE last_sync_at END,
        updated_at = @now
    WHERE provider = @provider
  `).run({
    provider,
    status,
    lastError: lastError ?? null,
    synced: synced ? 1 : 0,
    now: new Date().toISOString()
  });
}

export function createSyncRun(provider: ProviderId): number {
  const result = db
    .prepare("INSERT INTO sync_runs (provider, status, started_at) VALUES (?, 'running', ?)")
    .run(provider, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

export function finishSyncRun(id: number, status: "ok" | "error", recordsUpserted: number, errorMessage?: string): void {
  db.prepare(`
    UPDATE sync_runs
    SET status = @status,
        finished_at = @finishedAt,
        error_message = @errorMessage,
        records_upserted = @recordsUpserted
    WHERE id = @id
  `).run({
    id,
    status,
    finishedAt: new Date().toISOString(),
    errorMessage: errorMessage ?? null,
    recordsUpserted
  });
}

export function upsertUsageBuckets(buckets: UsageBucket[]): number {
  const statement = db.prepare(`
    INSERT INTO usage_buckets (
      unique_key, provider, bucket_start, bucket_end, granularity, model, project_id, workspace_id,
      api_key_id, provider_user_id, input_tokens, output_tokens, cached_tokens, request_count,
      cost_amount, cost_currency, raw_json
    )
    VALUES (
      @uniqueKey, @provider, @bucketStart, @bucketEnd, @granularity, @model, @projectId, @workspaceId,
      @apiKeyId, @providerUserId, @inputTokens, @outputTokens, @cachedTokens, @requestCount,
      @costAmount, @costCurrency, @rawJson
    )
    ON CONFLICT(unique_key) DO UPDATE SET
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      cached_tokens = excluded.cached_tokens,
      request_count = excluded.request_count,
      cost_amount = excluded.cost_amount,
      cost_currency = excluded.cost_currency,
      raw_json = excluded.raw_json
  `);

  const transaction = db.transaction((items: UsageBucket[]) => {
    for (const bucket of items) {
      statement.run({
        uniqueKey: makeUsageKey(bucket),
        provider: bucket.provider,
        bucketStart: bucket.bucketStart,
        bucketEnd: bucket.bucketEnd,
        granularity: bucket.granularity,
        model: bucket.model ?? null,
        projectId: bucket.projectId ?? null,
        workspaceId: bucket.workspaceId ?? null,
        apiKeyId: bucket.apiKeyId ?? null,
        providerUserId: bucket.providerUserId ?? null,
        inputTokens: bucket.inputTokens ?? 0,
        outputTokens: bucket.outputTokens ?? 0,
        cachedTokens: bucket.cachedTokens ?? 0,
        requestCount: bucket.requestCount ?? 0,
        costAmount: bucket.costAmount ?? null,
        costCurrency: bucket.costCurrency ?? null,
        rawJson: bucket.raw ? JSON.stringify(bucket.raw) : null
      });
    }
  });

  transaction(buckets);
  return buckets.length;
}

export function getSummaryTotals(start: Date, end: Date): SummaryTotals {
  const row = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(request_count), 0) AS requests,
        COALESCE(SUM(input_tokens), 0) AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(cached_tokens), 0) AS cachedTokens,
        COALESCE(SUM(cost_amount), 0) AS cost,
        COALESCE(MAX(cost_currency), 'USD') AS currency
      FROM usage_buckets
      WHERE bucket_start >= ? AND bucket_start < ?
    `
    )
    .get(start.toISOString(), end.toISOString()) as SummaryTotals;
  return normalizeTotals(row);
}

export function getTimeseries(start: Date, end: Date): unknown[] {
  return db
    .prepare(
      `
      SELECT
        bucket_start AS bucketStart,
        provider,
        SUM(request_count) AS requests,
        SUM(input_tokens) AS inputTokens,
        SUM(output_tokens) AS outputTokens,
        SUM(cached_tokens) AS cachedTokens,
        SUM(cost_amount) AS cost,
        COALESCE(MAX(cost_currency), 'USD') AS currency
      FROM usage_buckets
      WHERE bucket_start >= ? AND bucket_start < ?
      GROUP BY bucket_start, provider
      ORDER BY bucket_start ASC, provider ASC
    `
    )
    .all(start.toISOString(), end.toISOString());
}

export function getModels(start: Date, end: Date): unknown[] {
  return db
    .prepare(
      `
      SELECT
        COALESCE(model, 'unattributed') AS model,
        provider,
        SUM(input_tokens) AS inputTokens,
        SUM(output_tokens) AS outputTokens,
        SUM(cached_tokens) AS cachedTokens,
        SUM(request_count) AS requests,
        SUM(cost_amount) AS cost,
        COALESCE(MAX(cost_currency), 'USD') AS currency
      FROM usage_buckets
      WHERE bucket_start >= ? AND bucket_start < ?
      GROUP BY provider, COALESCE(model, 'unattributed')
      ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC
    `
    )
    .all(start.toISOString(), end.toISOString());
}

export function getProviderUsageToday(start: Date, end: Date): unknown[] {
  return db
    .prepare(
      `
      SELECT
        provider,
        SUM(input_tokens + output_tokens + cached_tokens) AS tokens,
        SUM(request_count) AS requests,
        SUM(cost_amount) AS cost
      FROM usage_buckets
      WHERE bucket_start >= ? AND bucket_start < ?
      GROUP BY provider
    `
    )
    .all(start.toISOString(), end.toISOString());
}

export function insertLimitSnapshots(snapshots: LimitSnapshotInput[]): number {
  const statement = db.prepare(`
    INSERT INTO limit_snapshots (
      provider, source, captured_at, window, used_percent, remaining_percent, reset_at, raw_json
    )
    VALUES (
      @provider, @source, @capturedAt, @window, @usedPercent, @remainingPercent, @resetAt, @rawJson
    )
  `);

  const transaction = db.transaction((items: LimitSnapshotInput[]) => {
    for (const snapshot of items) {
      statement.run({
        provider: snapshot.provider,
        source: snapshot.source ?? "local",
        capturedAt: snapshot.capturedAt ?? new Date().toISOString(),
        window: snapshot.window,
        usedPercent: snapshot.usedPercent ?? null,
        remainingPercent: snapshot.remainingPercent ?? null,
        resetAt: snapshot.resetAt ?? null,
        rawJson: snapshot.rawJson ? JSON.stringify(snapshot.rawJson) : null
      });
    }
  });

  transaction(snapshots);
  return snapshots.length;
}

export function getLatestLimitSnapshots(): unknown[] {
  return db
    .prepare(
      `
      SELECT
        provider,
        source,
        captured_at AS capturedAt,
        window,
        used_percent AS usedPercent,
        remaining_percent AS remainingPercent,
        reset_at AS resetAt,
        raw_json AS rawJson
      FROM (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY provider, window
            ORDER BY captured_at DESC, id DESC
          ) AS rank
        FROM limit_snapshots
      )
      WHERE rank = 1
      ORDER BY provider, window
    `
    )
    .all();
}

function mapConnection(row: Record<string, unknown>): ProviderConnection {
  return {
    id: Number(row.id),
    provider: row.provider as ProviderId,
    displayName: String(row.display_name),
    authMode: String(row.auth_mode),
    status: row.status as ProviderStatus,
    lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function makeUsageKey(bucket: UsageBucket): string {
  return [
    bucket.provider,
    bucket.bucketStart,
    bucket.bucketEnd,
    bucket.granularity,
    bucket.model ?? "",
    bucket.projectId ?? "",
    bucket.workspaceId ?? "",
    bucket.apiKeyId ?? "",
    bucket.providerUserId ?? ""
  ].join("|");
}

function normalizeTotals(row: SummaryTotals): SummaryTotals {
  return {
    requests: Number(row.requests ?? 0),
    inputTokens: Number(row.inputTokens ?? 0),
    outputTokens: Number(row.outputTokens ?? 0),
    cachedTokens: Number(row.cachedTokens ?? 0),
    cost: Number(row.cost ?? 0),
    currency: row.currency ?? "USD"
  };
}
