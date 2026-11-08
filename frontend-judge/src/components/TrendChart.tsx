import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Area, AreaChart, CartesianGrid,
} from "recharts";
import type { Judgment } from "../api";

interface Props {
  judgments: Judgment[];
  feature?: string;
  height?: number;
}

function groupByDay(judgments: Judgment[]) {
  const map: Record<string, { sum: number; count: number }> = {};
  for (const j of judgments) {
    const day = j.created_at.slice(0, 10);
    if (!map[day]) map[day] = { sum: 0, count: 0 };
    map[day].sum += j.overall_score;
    map[day].count += 1;
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, { sum, count }]) => ({
      day: day.slice(5), // MM-DD
      avg: parseFloat((sum / count).toFixed(2)),
    }));
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  const color = v >= 8 ? "var(--color-high)" : v >= 6 ? "var(--color-mid)" : "var(--color-low)";
  return (
    <div className="glass" style={{ borderRadius: 10, padding: "10px 14px", minWidth: 120 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-dim)", marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>
        {v.toFixed(2)}
      </div>
      <div style={{ fontSize: 10, color: "var(--color-text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>
        avg score
      </div>
    </div>
  );
}

export default function TrendChart({ judgments, feature, height = 160 }: Props) {
  const filtered = feature ? judgments.filter((j) => j.feature === feature) : judgments;
  const data = groupByDay(filtered);

  if (data.length === 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>∅</div>
          <div style={{ fontSize: 13, color: "var(--color-text-dim)" }}>No data yet</div>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: "#475569", fontFamily: "'JetBrains Mono', monospace" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 10]}
          tick={{ fontSize: 10, fill: "#475569", fontFamily: "'JetBrains Mono', monospace" }}
          tickLine={false}
          axisLine={false}
          ticks={[0, 2, 4, 6, 7, 8, 10]}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={7} stroke="rgba(251,191,36,0.3)" strokeDasharray="4 3" />
        <ReferenceLine y={8} stroke="rgba(74,222,128,0.2)" strokeDasharray="4 3" />
        <Area
          type="monotone"
          dataKey="avg"
          stroke="#818cf8"
          strokeWidth={2}
          fill="url(#scoreGrad)"
          dot={{ r: 3, fill: "#818cf8", stroke: "var(--color-void)", strokeWidth: 2 }}
          activeDot={{ r: 5, fill: "#818cf8", stroke: "var(--color-void)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
