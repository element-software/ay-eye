import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { TimeseriesPoint } from "../api/client";

type Props = {
  points: TimeseriesPoint[];
};

export function UsageChart({ points }: Props): JSX.Element {
  const grouped = new Map<string, { date: string; tokens: number; requests: number; cost: number }>();
  for (const point of points) {
    const key = point.bucketStart.slice(0, 10);
    const existing = grouped.get(key) ?? { date: key, tokens: 0, requests: 0, cost: 0 };
    existing.tokens += Number(point.inputTokens ?? 0) + Number(point.outputTokens ?? 0) + Number(point.cachedTokens ?? 0);
    existing.requests += Number(point.requests ?? 0);
    existing.cost += Number(point.cost ?? 0);
    grouped.set(key, existing);
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>7-day usage</h2>
      </div>
      <div className="chart-frame">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={[...grouped.values()]}>
            <defs>
              <linearGradient id="tokens" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#5eead4" stopOpacity={0.55} />
                <stop offset="95%" stopColor="#5eead4" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#26323d" />
            <XAxis dataKey="date" stroke="#8a9aaa" />
            <YAxis stroke="#8a9aaa" />
            <Tooltip contentStyle={{ background: "#111820", border: "1px solid #26323d", borderRadius: 8 }} />
            <Area dataKey="tokens" name="Tokens" stroke="#5eead4" fill="url(#tokens)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
