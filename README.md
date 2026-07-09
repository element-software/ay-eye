# AI Usage Meter

AI Usage Meter is a self-hosted, local-first dashboard for AI provider API usage. It runs in Docker, reads provider credentials from environment variables or Docker secrets, pulls usage from official provider APIs, stores usage in local SQLite, and exposes a compact JSON endpoint for an ESP32/CYD desk display.

This project does not include billing, payments, hosted accounts, telemetry, cloud sync, or dashboard scraping.

## Privacy

AI Usage Meter is designed to run locally.

- No hosted backend is required.
- API keys never leave your machine except when sent directly to the provider APIs you configure.
- No telemetry is collected by this project.
- No analytics scripts are included in the dashboard.
- No account registration is required.
- Usage data is stored only in your local Docker volume.
- You can delete all stored data by removing the local data volume.

## Supported Providers

- OpenAI: implemented for organization usage and cost APIs.
- Anthropic: adapter and connection test are scaffolded against the Admin API; usage sync needs final Usage/Cost API response mapping.
- Cursor: adapter and connection test are scaffolded against the Teams Admin API; usage parsing is intentionally conservative while the response schema stabilizes.

## Quick Start

```bash
cp .env.example .env
mkdir -p data secrets
docker compose up -d
```

Open [http://localhost:8787](http://localhost:8787).

If `APP_USERNAME` and `APP_PASSWORD` are set, the dashboard and API use browser basic auth. If they are unset, the app logs a startup warning and allows local access.

## Environment Setup

Edit `.env`:

```env
OPENAI_ADMIN_KEY=
ANTHROPIC_ADMIN_KEY=
CURSOR_API_KEY=
SYNC_INTERVAL_MINUTES=15
DATABASE_URL=file:/data/usage.db
APP_USERNAME=admin
APP_PASSWORD=changeme
```

Credential priority is:

1. Docker secret file
2. Environment variable
3. Not configured

Provider API keys are never stored in SQLite. The database stores connection status, sync status, usage buckets, and sync run metadata only.

## Docker Secrets

Create secret files instead of putting keys in `.env`:

```bash
mkdir -p secrets
printf '%s' 'sk-admin...' > secrets/openai_admin_key
printf '%s' 'sk-ant-admin...' > secrets/anthropic_admin_key
printf '%s' 'crsr_...' > secrets/cursor_api_key
```

Then start with the secrets override:

```bash
docker compose -f docker-compose.yml -f docker-compose.secrets.yml up -d
```

The container reads:

- `/run/secrets/openai_admin_key`
- `/run/secrets/anthropic_admin_key`
- `/run/secrets/cursor_api_key`

## Provider Notes

OpenAI uses:

- `GET /v1/organization/usage/completions`
- `GET /v1/organization/costs`

The key must be allowed to read organization usage and costs.

Anthropic requires an Admin API key that starts with `sk-ant-admin...`. The MVP tests connectivity via `/v1/organizations/me`.

Cursor requires a Teams Admin API key and uses HTTP Basic auth with the API key as the username.

## CYD Endpoint

The display-safe endpoint is:

```txt
http://localhost:8787/api/devices/cyd/status
```

Example response:

```json
{
  "updatedAt": "2026-07-08T22:15:00.000Z",
  "status": "ok",
  "today": {
    "requests": 842,
    "inputTokens": 1240000,
    "outputTokens": 318000,
    "cost": 12.48,
    "currency": "USD"
  },
  "providers": []
}
```

ESPHome placeholder:

```yaml
http_request:
  useragent: cyd-usage-meter

interval:
  - interval: 60s
    then:
      - http_request.get:
          url: "http://localhost:8787/api/devices/cyd/status"
```

This endpoint is intended for local LAN use. Do not expose it directly to the public internet.

## Codex Limit Snapshots

Codex and Claude subscription limits are not the same as provider API usage. This app supports local snapshots for limits such as Codex `5h` and `7d` windows without scraping product dashboards.

Install the local Codex hook:

```bash
npm run limits:install-codex-hook
```

The installer:

- creates `.codex/limit-snapshots/codex.json` from the example file if it does not exist
- merges a `Stop` hook into `~/.codex/hooks.json`
- preserves any existing hooks

Open Codex and run:

```txt
/hooks
```

Trust the new Stop hook if Codex asks for review. After each turn, Codex will run:

```bash
scripts/push-codex-limits.sh
```

The script posts `.codex/limit-snapshots/codex.json` to:

```txt
POST /api/limits/snapshot
```

Test the dashboard with sample data:

```bash
npm run limits:sample
```

Edit `.codex/limit-snapshots/codex.json` to update real values:

```json
{
  "provider": "codex",
  "source": "manual-local-file",
  "capturedAt": "2026-07-08T23:00:00Z",
  "windows": [
    { "window": "5h", "usedPercent": 41 },
    { "window": "7d", "usedPercent": 18 }
  ]
}
```

The hook automates pushing local data. It does not discover Codex remaining limits by itself unless a stable local command or state file is available.

## Development

Install dependencies:

```bash
npm install
```

Run the server and web app separately:

```bash
npm run dev:server
npm run dev:web
```

The Vite dev server runs at [http://localhost:5173](http://localhost:5173) and proxies `/api` to the Fastify server at [http://localhost:8787](http://localhost:8787).

Build everything:

```bash
npm run build
```

## Limitations

- OpenAI is the primary working provider for the MVP.
- Anthropic and Cursor are adapter scaffolds with connection tests and partial usage support.
- Costs are provider-reported and may not be attributable to a specific model.
- The app is designed for trusted local networks, not public multi-tenant hosting.
- SQLite is local-only and intentionally simple for this MVP.
