import type { ReactNode } from "react";

type Props = {
  icon: ReactNode;
  label: string;
  value: string;
  sublabel?: string;
};

export function MetricCard({ icon, label, value, sublabel }: Props): JSX.Element {
  return (
    <section className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div>
        <p className="muted">{label}</p>
        <strong>{value}</strong>
        {sublabel ? <span>{sublabel}</span> : null}
      </div>
    </section>
  );
}
