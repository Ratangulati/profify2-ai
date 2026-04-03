"use client";

import { useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────

type InsightType = "PAIN_POINT" | "DESIRE" | "OBSERVATION" | "TREND" | "OPPORTUNITY";
type InsightTrend = "INCREASING" | "STABLE" | "DECREASING";

interface InsightSummary {
  id: string;
  title: string;
  description: string;
  type: InsightType;
  severityScore: number;
  frequencyCount: number;
  trend: InsightTrend;
  segmentDistribution: Record<string, number>;
  affectedWorkflow: string | null;
  inferredJtbd: string | null;
  themeId: string | null;
  createdAt: string;
  _count: { insightEvidence: number };
}

interface InsightEvidence {
  id: string;
  quote: string;
  feedbackItem: {
    id: string;
    content: string;
    customerName: string | null;
    segmentTags: string[];
    sourceUrl: string | null;
    createdAt: string;
  };
}

interface InsightDetail extends InsightSummary {
  theme: { id: string; title: string; color: string | null } | null;
  insightEvidence: InsightEvidence[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface InsightListProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<InsightType, { label: string; color: string }> = {
  PAIN_POINT: { label: "Pain Point", color: "#ef4444" },
  DESIRE: { label: "Desire", color: "#8b5cf6" },
  OBSERVATION: { label: "Observation", color: "#3b82f6" },
  TREND: { label: "Trend", color: "#f59e0b" },
  OPPORTUNITY: { label: "Opportunity", color: "#10b981" },
};

const TREND_CONFIG: Record<InsightTrend, { label: string; icon: string }> = {
  INCREASING: { label: "Increasing", icon: "\u2191" },
  STABLE: { label: "Stable", icon: "\u2192" },
  DECREASING: { label: "Decreasing", icon: "\u2193" },
};

function SeverityBar({ score }: { score: number }) {
  const width = Math.min(Math.max(score / 5, 0), 1) * 100;
  const color =
    score >= 4 ? "#ef4444" : score >= 3 ? "#f59e0b" : score >= 2 ? "#3b82f6" : "#9ca3af";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 60,
          height: 6,
          backgroundColor: "#e5e7eb",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: 3,
          }}
        />
      </div>
      <span style={{ fontSize: 12, color: "#6b7280" }}>{score.toFixed(1)}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: InsightType }) {
  const config = TYPE_CONFIG[type];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        color: "#fff",
        backgroundColor: config.color,
      }}
    >
      {config.label}
    </span>
  );
}

function TrendIndicator({ trend }: { trend: InsightTrend }) {
  const config = TREND_CONFIG[trend];
  const color = trend === "INCREASING" ? "#ef4444" : trend === "DECREASING" ? "#10b981" : "#9ca3af";

  return (
    <span style={{ fontSize: 12, color, fontWeight: 500 }}>
      {config.icon} {config.label}
    </span>
  );
}

function SegmentChips({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  if (entries.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {entries.map(([tag, count]) => (
        <span
          key={tag}
          style={{
            padding: "1px 6px",
            borderRadius: 4,
            fontSize: 11,
            backgroundColor: "#f3f4f6",
            color: "#374151",
          }}
        >
          {tag} ({count})
        </span>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function InsightList({ workspaceId, projectId, apiBaseUrl }: InsightListProps) {
  const [insights, setInsights] = useState<InsightSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InsightDetail | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<InsightType | "">("");
  const [trendFilter, setTrendFilter] = useState<InsightTrend | "">("");
  const [sortBy, setSortBy] = useState<"frequency" | "severity" | "createdAt">("frequency");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      sortBy,
      sortOrder,
      page: String(page),
      limit: "20",
    });
    if (typeFilter) params.set("type", typeFilter);
    if (trendFilter) params.set("trend", trendFilter);

    try {
      const res = await fetch(
        `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/insights?${params}`,
        { credentials: "include" },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to load insights");

      setInsights(json.data.insights);
      setPagination(json.data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, workspaceId, projectId, typeFilter, trendFilter, sortBy, sortOrder, page]);

  const fetchDetail = async (insightId: string) => {
    if (expandedId === insightId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }

    try {
      const res = await fetch(`${apiBaseUrl}/api/workspaces/${workspaceId}/insights/${insightId}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to load detail");

      setDetail(json.data);
      setExpandedId(insightId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insight detail");
    }
  };

  const triggerExtraction = async () => {
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/insights/extract`,
        { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to trigger extraction");

      alert(json.data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger extraction");
    }
  };

  // Auto-fetch on mount/filter change
  useState(() => {
    fetchInsights();
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Insights</h2>
        <button
          onClick={triggerExtraction}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            backgroundColor: "#4f46e5",
            color: "#fff",
            fontWeight: 500,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Extract Insights
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as InsightType | "");
            setPage(1);
          }}
          style={selectStyle}
        >
          <option value="">All types</option>
          {Object.entries(TYPE_CONFIG).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={trendFilter}
          onChange={(e) => {
            setTrendFilter(e.target.value as InsightTrend | "");
            setPage(1);
          }}
          style={selectStyle}
        >
          <option value="">All trends</option>
          <option value="INCREASING">Increasing</option>
          <option value="STABLE">Stable</option>
          <option value="DECREASING">Decreasing</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          style={selectStyle}
        >
          <option value="frequency">Sort by Frequency</option>
          <option value="severity">Sort by Severity</option>
          <option value="createdAt">Sort by Date</option>
        </select>

        <button
          onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
          style={{ ...selectStyle, cursor: "pointer", minWidth: 40 }}
        >
          {sortOrder === "desc" ? "\u2193" : "\u2191"}
        </button>

        <button
          onClick={() => fetchInsights()}
          style={{ ...selectStyle, cursor: "pointer", backgroundColor: "#f3f4f6", fontWeight: 500 }}
        >
          Refresh
        </button>
      </div>

      {/* Error */}
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

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>
          Loading insights...
        </div>
      )}

      {/* List */}
      {!loading && insights.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
          No insights yet. Click {"\u201C"}Extract Insights{"\u201D"} to analyze feedback.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {insights.map((insight) => (
          <div key={insight.id}>
            {/* Card */}
            <div
              onClick={() => fetchDetail(insight.id)}
              style={{
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                cursor: "pointer",
                backgroundColor: expandedId === insight.id ? "#f9fafb" : "#fff",
                transition: "background-color 0.15s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <TypeBadge type={insight.type} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{insight.title}</span>
                  </div>
                  <p
                    style={{ margin: "4px 0 8px", fontSize: 13, color: "#4b5563", lineHeight: 1.4 }}
                  >
                    {insight.description}
                  </p>
                  <SegmentChips
                    distribution={insight.segmentDistribution as Record<string, number>}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      color: "#6b7280",
                    }}
                  >
                    <span>{insight.frequencyCount} mentions</span>
                    <TrendIndicator trend={insight.trend} />
                  </div>
                  {insight.type === "PAIN_POINT" && <SeverityBar score={insight.severityScore} />}
                  {insight.affectedWorkflow && (
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                      Workflow: {insight.affectedWorkflow}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Expanded detail */}
            {expandedId === insight.id && detail && (
              <div
                style={{
                  padding: "12px 16px",
                  borderLeft: "3px solid #4f46e5",
                  marginLeft: 16,
                  marginTop: -1,
                }}
              >
                {detail.inferredJtbd && (
                  <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                    <strong>Job-to-be-done:</strong> {detail.inferredJtbd}
                  </p>
                )}
                <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  Evidence ({detail.insightEvidence.length} items)
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {detail.insightEvidence.slice(0, 10).map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        padding: 10,
                        backgroundColor: "#f9fafb",
                        borderRadius: 6,
                        fontSize: 13,
                      }}
                    >
                      <p style={{ margin: 0, fontStyle: "italic", color: "#374151" }}>
                        {"\u201C"}
                        {ev.quote}
                        {"\u201D"}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: 6,
                          fontSize: 11,
                          color: "#9ca3af",
                        }}
                      >
                        <span>{ev.feedbackItem.customerName ?? "Anonymous"}</span>
                        <span>{new Date(ev.feedbackItem.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                  {detail.insightEvidence.length > 10 && (
                    <p style={{ fontSize: 12, color: "#6b7280", textAlign: "center" }}>
                      + {detail.insightEvidence.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            marginTop: 16,
            alignItems: "center",
          }}
        >
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            style={{
              ...selectStyle,
              cursor: page <= 1 ? "not-allowed" : "pointer",
              opacity: page <= 1 ? 0.5 : 1,
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={{
              ...selectStyle,
              cursor: page >= pagination.totalPages ? "not-allowed" : "pointer",
              opacity: page >= pagination.totalPages ? 0.5 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 13,
  backgroundColor: "#fff",
};

export default InsightList;
