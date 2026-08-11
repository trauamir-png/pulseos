"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Metric = "visitors" | "sessions" | "pageviews";

const METRIC_LABELS: Record<Metric, string> = {
  visitors: "Visitors",
  sessions: "Sessions",
  pageviews: "Page Views",
};

export function TrafficChart({
  siteId,
  initialData,
}: {
  siteId: string;
  initialData: Array<{ label: string; value: number }>;
}) {
  const searchParams = useSearchParams();
  const [metric, setMetric] = useState<Metric>("visitors");
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

  async function handleMetricChange(m: Metric) {
    setMetric(m);
    if (m === "visitors") {
      setData(initialData);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set("site", siteId);
    params.set("metric", m);
    try {
      const res = await fetch(`/api/dashboard/timeseries?${params.toString()}`);
      const json = await res.json();
      setData(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Traffic</h2>
        <div className="flex rounded-lg border border-[var(--border)] bg-white p-0.5">
          {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => handleMetricChange(m)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                metric === m ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      <div className={`h-64 transition-opacity ${loading ? "opacity-50" : ""}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="pulseArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
              labelStyle={{ color: "var(--muted)" }}
            />
            <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="url(#pulseArea)" name={METRIC_LABELS[metric]} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
