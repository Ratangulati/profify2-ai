"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────

interface TrendDataPoint {
  period: string;
  value: number;
  metadata: Record<string, unknown>;
}

interface SpikeAlert {
  id: string;
  entityType: string;
  entityId: string;
  entityTitle: string;
  spikeFactor: number;
  currentVolume: number;
  rollingAverage: number;
  sampleItems: Array<{ id: string; content: string; customerName: string | null }>;
  status: string;
  createdAt: string;
}

interface TrendChartProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
  entityType?: "project" | "theme" | "insight";
  entityId?: string;
  entityTitle?: string;
}

interface ChartDataPoint {
  week: string;
  volume: number;
  sentiment: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatWeek(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getTrendLabel(currentVol: number, prevVols: number[]): { label: string; color: string } {
  if (prevVols.length === 0) return { label: "Stable", color: "#9ca3af" };
  const avg = prevVols.reduce((s, v) => s + v, 0) / prevVols.length;
  if (avg === 0)
    return currentVol > 0
      ? { label: "Spiking", color: "#ef4444" }
      : { label: "Stable", color: "#9ca3af" };
  const ratio = currentVol / avg;
  if (ratio > 2) return { label: "Spiking", color: "#ef4444" };
  if (ratio > 1.2) return { label: "Growing", color: "#f59e0b" };
  if (ratio < 0.8) return { label: "Declining", color: "#3b82f6" };
  return { label: "Stable", color: "#9ca3af" };
}

// ── Main Component ─────────────────────────────────────────────────────

export function TrendChart({
  workspaceId,
  projectId,
  apiBaseUrl,
  entityType = "project",
  entityId,
  entityTitle,
}: TrendChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [alerts, setAlerts] = useState<SpikeAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weeks, setWeeks] = useState(12);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const baseParams = new URLSearchParams({
        entityType,
        weeks: String(weeks),
      });
      if (entityId) baseParams.set("entityId", entityId);

      // Fetch volume and sentiment in parallel
      const volumeParams = new URLSearchParams(baseParams);
      volumeParams.set("metric", "volume");
      const sentimentParams = new URLSearchParams(baseParams);
      sentimentParams.set("metric", "avg_sentiment");

      const base = `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}`;

      const [volRes, sentRes, alertRes] = await Promise.all([
        fetch(`${base}/trends?${volumeParams}`, { credentials: "include" }),
        fetch(`${base}/trends?${sentimentParams}`, { credentials: "include" }),
        fetch(`${base}/alerts?status=PENDING&limit=5`, { credentials: "include" }),
      ]);

      const [volJson, sentJson, alertJson] = await Promise.all([
        volRes.json(),
        sentRes.json(),
        alertRes.json(),
      ]);

      if (!volJson.success) throw new Error(volJson.error?.message ?? "Failed to load volume data");

      // Merge volume and sentiment data by period
      const volumeMap = new Map<string, number>();
      const sentimentMap = new Map<string, number>();

      for (const dp of volJson.data.dataPoints as TrendDataPoint[]) {
        volumeMap.set(dp.period, dp.value);
      }
      for (const dp of (sentJson.data?.dataPoints as TrendDataPoint[]) ?? []) {
        sentimentMap.set(dp.period, dp.value);
      }

      const allPeriods = new Set([...volumeMap.keys(), ...sentimentMap.keys()]);
      const sorted = Array.from(allPeriods).sort();

      const merged: ChartDataPoint[] = sorted.map((period) => ({
        week: formatWeek(period),
        volume: volumeMap.get(period) ?? 0,
        sentiment: Math.round((sentimentMap.get(period) ?? 0) * 100) / 100,
      }));

      setChartData(merged);

      if (alertJson.success) {
        setAlerts(alertJson.data.alerts ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trend data");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, workspaceId, projectId, entityType, entityId, weeks]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute trend label from chart data
  const volumes = chartData.map((d) => d.volume);
  const currentVol = volumes[volumes.length - 1] ?? 0;
  const prevVols = volumes.slice(0, -1);
  const trend = getTrendLabel(currentVol, prevVols);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            {entityTitle ?? "Project"} Trends
          </h2>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
            <span
              style={{
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                color: "#fff",
                backgroundColor: trend.color,
              }}
            >
              {trend.label}
            </span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>{currentVol} items this week</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {[4, 8, 12, 24].map((w) => (
            <button
              key={w}
              onClick={() => setWeeks(w)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 12,
                cursor: "pointer",
                backgroundColor: weeks === w ? "#4f46e5" : "#fff",
                color: weeks === w ? "#fff" : "#374151",
              }}
            >
              {w}w
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            backgroundColor: "#fef2f2",
            color: "#b91c1c",
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>Loading trends...</div>
      )}

      {/* Chart */}
      {!loading && chartData.length > 0 && (
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis yAxisId="volume" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis
                yAxisId="sentiment"
                orientation="right"
                domain={[-1, 1]}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
                formatter={(value, name) => {
                  const v = Number(value);
                  return name === "Avg Sentiment" ? [v.toFixed(2), name] : [v, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine yAxisId="sentiment" y={0} stroke="#9ca3af" strokeDasharray="3 3" />
              <Bar
                yAxisId="volume"
                dataKey="volume"
                fill="#818cf8"
                opacity={0.7}
                radius={[2, 2, 0, 0]}
                name="Volume"
              />
              <Line
                yAxisId="sentiment"
                type="monotone"
                dataKey="sentiment"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Avg Sentiment"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && chartData.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
          No trend data yet. Run trend aggregation to populate.
        </div>
      )}

      {/* Spike Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Active Alerts</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  padding: 12,
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  backgroundColor: "#fef2f2",
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{alert.entityTitle}</span>
                    <span style={{ fontSize: 12, color: "#b91c1c", marginLeft: 8 }}>
                      {alert.spikeFactor >= 999
                        ? "New spike"
                        : `${alert.spikeFactor.toFixed(1)}x spike`}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    {alert.currentVolume} items (avg {alert.rollingAverage.toFixed(1)})
                  </span>
                </div>
                {(alert.sampleItems as Array<{ content: string }>).length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#4b5563" }}>
                    {(alert.sampleItems as Array<{ content: string }>)
                      .slice(0, 2)
                      .map((item, i) => (
                        <p key={i} style={{ margin: "4px 0", fontStyle: "italic" }}>
                          {item.content.slice(0, 120)}...
                        </p>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TrendChart;
