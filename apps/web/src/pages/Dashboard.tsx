import { useCallback, useEffect, useMemo, useState } from "react";
import { Cpu, Database, DollarSign, Download, KeyRound, RadioTower, RefreshCcw, Send } from "lucide-react";
import { apiGet, apiPost, type ModelUsage, type Provider, type Summary, type TimeseriesPoint } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { ProviderCard } from "../components/ProviderCard";
import { UsageChart } from "../components/UsageChart";

type Tab = "overview" | "providers" | "models" | "device";

const emptySummary: Summary = {
  today: { requests: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, cost: 0, currency: "USD" },
  last7Days: { requests: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, cost: 0, currency: "USD" }
};

export function Dashboard(): JSX.Element {
  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [models, setModels] = useState<ModelUsage[]>([]);
  const [deviceJson, setDeviceJson] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextSummary, nextProviders, nextTimeseries, nextModels, nextDevice] = await Promise.all([
      apiGet<Summary>("/api/usage/summary"),
      apiGet<Provider[]>("/api/providers"),
      apiGet<TimeseriesPoint[]>("/api/usage/timeseries"),
      apiGet<ModelUsage[]>("/api/usage/models"),
      apiGet<unknown>("/api/devices/cyd/status")
    ]);
    setSummary(nextSummary);
    setProviders(nextProviders);
    setTimeseries(nextTimeseries);
    setModels(nextModels);
    setDeviceJson(nextDevice);
  }, []);

  useEffect(() => {
    refresh().catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [refresh]);

  const lastSync = useMemo(() => {
    const dates = providers.map((provider) => provider.lastSyncAt).filter(Boolean) as string[];
    return dates.length ? new Date(dates.sort().at(-1)!).toLocaleString() : "never";
  }, [providers]);

  async function runAction(action: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>AI Usage Meter</h1>
          <p>Local API usage telemetry from provider APIs</p>
        </div>
        <button disabled={busy} onClick={() => runAction(() => apiPost("/api/sync"), "Sync completed")}>
          <RefreshCcw size={16} />
          Sync all
        </button>
      </header>

      <nav className="tabs" aria-label="Dashboard sections">
        {(["overview", "providers", "models", "device"] as Tab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>

      {message ? <div className="notice">{message}</div> : null}

      {tab === "overview" ? (
        <>
          <section className="metric-grid">
            <MetricCard icon={<Send />} label="Requests today" value={formatNumber(summary.today.requests)} />
            <MetricCard icon={<Download />} label="Input tokens today" value={formatNumber(summary.today.inputTokens)} />
            <MetricCard icon={<Cpu />} label="Output tokens today" value={formatNumber(summary.today.outputTokens)} />
            <MetricCard
              icon={<DollarSign />}
              label="Provider cost today"
              value={formatCurrency(summary.today.cost, summary.today.currency)}
              sublabel={`Last sync: ${lastSync}`}
            />
          </section>
          <section className="provider-grid provider-grid--compact">
            {providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                busy={busy}
                onTest={(item) => runAction(() => apiPost(`/api/providers/${item.id}/test`), `${item.label} tested`)}
                onSync={(item) => runAction(() => apiPost(`/api/sync/${item.id}`), `${item.label} synced`)}
              />
            ))}
          </section>
          <UsageChart points={timeseries} />
        </>
      ) : null}

      {tab === "providers" ? (
        <section className="provider-grid">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              busy={busy}
              onTest={(item) => runAction(() => apiPost(`/api/providers/${item.id}/test`), `${item.label} tested`)}
              onSync={(item) => runAction(() => apiPost(`/api/sync/${item.id}`), `${item.label} synced`)}
            />
          ))}
        </section>
      ) : null}

      {tab === "models" ? (
        <section className="panel">
          <div className="section-heading">
            <h2>Model usage</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Provider</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Requests</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={`${model.provider}-${model.model}`}>
                    <td>{model.model}</td>
                    <td>{model.provider}</td>
                    <td>{formatNumber(model.inputTokens)}</td>
                    <td>{formatNumber(model.outputTokens)}</td>
                    <td>{formatNumber(model.requests)}</td>
                    <td>{formatCurrency(model.cost ?? 0, model.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "device" ? (
        <section className="device-layout">
          <article className="panel">
            <div className="section-heading">
              <h2>CYD endpoint</h2>
              <RadioTower />
            </div>
            <code>{window.location.origin}/api/devices/cyd/status</code>
            <p className="muted">Intended for local LAN display devices. Keep it behind the same network protections as the dashboard.</p>
            <pre>{JSON.stringify(deviceJson, null, 2)}</pre>
          </article>
          <article className="panel">
            <div className="section-heading">
              <h2>ESPHome placeholder</h2>
              <Database />
            </div>
            <pre>{`http_request:
  useragent: cyd-usage-meter

interval:
  - interval: 60s
    then:
      - http_request.get:
          url: "${window.location.origin}/api/devices/cyd/status"`}</pre>
          </article>
        </section>
      ) : null}

      <footer>
        <KeyRound size={14} />
        API keys are read from Docker secrets or environment variables on this host only.
      </footer>
    </main>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(value);
}
