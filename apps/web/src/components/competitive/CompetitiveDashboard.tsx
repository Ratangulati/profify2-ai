"use client";

import { useState, useCallback, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────

interface FeatureArea {
  area: string;
  favorable: number;
  unfavorable: number;
  advantages: string[];
}

interface CompetitorSummary {
  id: string;
  name: string;
  _count: { mentions: number };
}

interface DashboardData {
  competitor: string;
  totalMentions: number;
  favorableCount: number;
  unfavorableCount: number;
  neutralCount: number;
  switchingSignals: number;
  featureAreas: FeatureArea[];
  switchingBySegment: Record<string, number>;
  recentQuotes: string[];
}

interface CompetitiveDashboardProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  favorable: "#ef4444",
  unfavorable: "#22c55e",
  neutral: "#9ca3af",
};

// ── Component ──────────────────────────────────────────────────────────

export function CompetitiveDashboard({
  workspaceId,
  projectId,
  apiBaseUrl,
}: CompetitiveDashboardProps) {
  const [competitors, setCompetitors] = useState<CompetitorSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const base = `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}`;

  const fetchCompetitors = useCallback(async () => {
    try {
      const res = await fetch(`${base}/competitors`, { credentials: "include" });
      const json = await res.json();
      if (json.success) setCompetitors(json.data.competitors);
    } catch {
      setError("Failed to load competitors");
    }
  }, [base]);

  const fetchDashboard = useCallback(
    async (competitorId: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${base}/competitors/${competitorId}/dashboard`, {
          credentials: "include",
        });
        const json = await res.json();
        if (json.success) setDashboard(json.data);
      } catch {
        setError("Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    },
    [base],
  );

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);
  useEffect(() => {
    if (selectedId) fetchDashboard(selectedId);
  }, [selectedId, fetchDashboard]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await fetch(`${base}/competitors/scan`, { method: "POST", credentials: "include" });
      setTimeout(() => {
        fetchCompetitors();
        if (selectedId) fetchDashboard(selectedId);
      }, 3000);
    } finally {
      setScanning(false);
    }
  };

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
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Competitive Intelligence</h2>
        <button
          onClick={handleScan}
          disabled={scanning}
          style={{
            padding: "4px 12px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            fontSize: 12,
            cursor: scanning ? "not-allowed" : "pointer",
            backgroundColor: "#4f46e5",
            color: "#fff",
            opacity: scanning ? 0.6 : 1,
          }}
        >
          {scanning ? "Scanning..." : "Scan Feedback"}
        </button>
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

      {/* Competitor selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {competitors.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: "1px solid #d1d5db",
              fontSize: 13,
              cursor: "pointer",
              backgroundColor: selectedId === c.id ? "#4f46e5" : "#fff",
              color: selectedId === c.id ? "#fff" : "#374151",
            }}
          >
            {c.name} ({c._count.mentions})
          </button>
        ))}
        {competitors.length === 0 && (
          <span style={{ fontSize: 13, color: "#9ca3af" }}>
            No competitors configured. Add competitors via the API.
          </span>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>
          Loading dashboard...
        </div>
      )}

      {/* Dashboard content */}
      {!loading && dashboard && (
        <div>
          {/* Summary cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              { label: "Total Mentions", value: dashboard.totalMentions, color: "#6b7280" },
              {
                label: "They Prefer Competitor",
                value: dashboard.favorableCount,
                color: "#ef4444",
              },
              { label: "They Prefer Us", value: dashboard.unfavorableCount, color: "#22c55e" },
              { label: "Switching Signals", value: dashboard.switchingSignals, color: "#f59e0b" },
            ].map((card) => (
              <div
                key={card.label}
                style={{
                  padding: 14,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* Feature area breakdown */}
          {dashboard.featureAreas.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Feature Area Comparison
              </h3>
              {dashboard.featureAreas.map((fa) => {
                const total = fa.favorable + fa.unfavorable;
                const favPct = total > 0 ? (fa.favorable / total) * 100 : 50;
                return (
                  <div key={fa.area} style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 12,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{fa.area}</span>
                      <span style={{ color: "#6b7280" }}>
                        {fa.favorable} vs {fa.unfavorable}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        height: 8,
                        borderRadius: 4,
                        overflow: "hidden",
                        backgroundColor: "#e5e7eb",
                      }}
                    >
                      <div
                        style={{ width: `${favPct}%`, backgroundColor: TYPE_COLORS.favorable }}
                      />
                      <div
                        style={{
                          width: `${100 - favPct}%`,
                          backgroundColor: TYPE_COLORS.unfavorable,
                        }}
                      />
                    </div>
                    {fa.advantages.length > 0 && (
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                        {fa.advantages[0]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Switching risk by segment */}
          {Object.keys(dashboard.switchingBySegment).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Switching Risk by Segment
              </h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(dashboard.switchingBySegment).map(([seg, count]) => (
                  <span
                    key={seg}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 12,
                      fontSize: 12,
                      backgroundColor: "#fef2f2",
                      color: "#b91c1c",
                      border: "1px solid #fecaca",
                    }}
                  >
                    {seg}: {count} signal{count !== 1 ? "s" : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent quotes */}
          {dashboard.recentQuotes.length > 0 && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Recent Quotes</h3>
              {dashboard.recentQuotes.slice(0, 5).map((q, i) => (
                <div
                  key={i}
                  style={{
                    padding: 10,
                    backgroundColor: "#f9fafb",
                    borderRadius: 6,
                    marginBottom: 6,
                    fontSize: 12,
                    fontStyle: "italic",
                    color: "#4b5563",
                    borderLeft: "3px solid #d1d5db",
                  }}
                >
                  {q}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CompetitiveDashboard;
