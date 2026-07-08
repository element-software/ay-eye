import { Activity, CircleAlert, CircleCheck, PlugZap, RefreshCcw } from "lucide-react";
import type { Provider } from "../api/client";

type Props = {
  provider: Provider;
  busy: boolean;
  onTest: (provider: Provider) => void;
  onSync: (provider: Provider) => void;
};

export function ProviderCard({ provider, busy, onTest, onSync }: Props): JSX.Element {
  const healthy = provider.status === "ok" || provider.status === "partial";
  return (
    <article className="provider-card">
      <div className="provider-card__header">
        <div>
          <h3>{provider.label}</h3>
          <p>{provider.configured ? "Configured" : "Not configured"}</p>
        </div>
        {healthy ? <CircleCheck aria-label="healthy" /> : <CircleAlert aria-label="needs attention" />}
      </div>
      <div className={`status-pill status-pill--${provider.status}`}>{provider.status.replace("_", " ")}</div>
      <p className="provider-error">{provider.lastError ?? "No recent error"}</p>
      <div className="button-row">
        <button disabled={!provider.configured || busy} onClick={() => onTest(provider)} title="Test connection">
          <PlugZap size={16} />
          Test
        </button>
        <button disabled={!provider.configured || busy} onClick={() => onSync(provider)} title="Sync provider">
          <RefreshCcw size={16} />
          Sync
        </button>
      </div>
      <small>
        <Activity size={14} /> Last sync: {provider.lastSyncAt ? new Date(provider.lastSyncAt).toLocaleString() : "never"}
      </small>
    </article>
  );
}
