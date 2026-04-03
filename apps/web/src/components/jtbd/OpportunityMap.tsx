"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ZAxis,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────

interface JTBDPoint {
  id: string;
  statement: string;
  jobType: string;
  importance: number;
  satisfaction: number;
  opportunityScore: number;
  themeTitle: string | null;
}

interface OpportunityMapProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

const JOB_TYPE_COLORS: Record<string, string> = {
  MAIN: "#4f46e5",
  RELATED: "#0891b2",
  EMOTIONAL: "#db2777",
  SOCIAL: "#ea580c",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  MAIN: "Main Job",
  RELATED: "Related Job",
  EMOTIONAL: "Emotional Job",
  SOCIAL: "Social Job",
};

// ── Component ──────────────────────────────────────────────────────────

export function OpportunityMap({ workspaceId, projectId, apiBaseUrl }: OpportunityMapProps) {
  const [points, setPoints] = useState<JTBDPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<JTBDPoint | null>(null);
  const [filterType, setFilterType] = useState<string>("");

  const base = `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}/jtbds/opportunity-map`, { credentials: "include" });
      const json = await res.json();
      if (json.success) setPoints(json.data.points);
    } catch {
      setError("Failed to load opportunity map data");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = filterType ? points.filter((p) => p.jobType === filterType) : points;

  // Group by job type for colored scatter series
  const grouped = Object.entries(JOB_TYPE_COLORS).map(([type, color]) => ({
    type,
    color,
    label: JOB_TYPE_LABELS[type] ?? type,
    data: filtered
      .filter((p) => p.jobType === type)
      .map((p) => ({
        x: p.satisfaction,
        y: p.importance,
        z: p.opportunityScore,
        ...p,
      })),
  }));

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>JTBD Opportunity Map</h2>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            Importance vs Satisfaction — top-left = biggest opportunity
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            <option value="">All job types</option>
            {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
        <div style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>Loading...</div>
      )}

      {!loading && points.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
          No JTBD data yet. Run JTBD extraction on themes with 10+ feedback items.
        </div>
      )}

      {/* Scatter plot */}
      {!loading && points.length > 0 && (
        <div style={{ width: "100%", height: 400 }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0.5, 5.5]}
                name="Satisfaction"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                label={{ value: "Satisfaction", position: "bottom", fontSize: 12, fill: "#6b7280" }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[0.5, 5.5]}
                name="Importance"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                label={{
                  value: "Importance",
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 12,
                  fill: "#6b7280",
                }}
              />
              <ZAxis type="number" dataKey="z" range={[60, 200]} name="Opportunity" />
              <Tooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0].payload as JTBDPoint & { x: number; y: number; z: number };
                  return (
                    <div
                      style={{
                        backgroundColor: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 6,
                        padding: 10,
                        fontSize: 12,
                        maxWidth: 300,
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.statement}</div>
                      <div>
                        Importance: {d.importance} | Satisfaction: {d.satisfaction}
                      </div>
                      <div>Opportunity Score: {d.opportunityScore}</div>
                      {d.themeTitle && (
                        <div style={{ color: "#6b7280", marginTop: 2 }}>Theme: {d.themeTitle}</div>
                      )}
                    </div>
                  );
                }}
              />
              {/* Midpoint reference lines */}
              <ReferenceLine x={3} stroke="#d1d5db" strokeDasharray="3 3" />
              <ReferenceLine y={3} stroke="#d1d5db" strokeDasharray="3 3" />
              {grouped.map((group) =>
                group.data.length > 0 ? (
                  <Scatter
                    key={group.type}
                    name={group.label}
                    data={group.data}
                    fill={group.color}
                    onClick={(data) => setSelectedPoint(data as unknown as JTBDPoint)}
                  />
                ) : null,
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
        {Object.entries(JOB_TYPE_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color }} />
            <span>{JOB_TYPE_LABELS[type]}</span>
          </div>
        ))}
      </div>

      {/* Selected detail */}
      {selectedPoint && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            backgroundColor: "#f9fafb",
          }}
        >
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedPoint.statement}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                {JOB_TYPE_LABELS[selectedPoint.jobType]} | Importance: {selectedPoint.importance} |
                Satisfaction: {selectedPoint.satisfaction} | Opportunity:{" "}
                {selectedPoint.opportunityScore}
              </div>
              {selectedPoint.themeTitle && (
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  Theme: {selectedPoint.themeTitle}
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedPoint(null)}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 16,
                color: "#6b7280",
              }}
            >
              &#x2715;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default OpportunityMap;
