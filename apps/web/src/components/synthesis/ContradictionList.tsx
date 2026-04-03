"use client";

import { useState, useCallback, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────

interface InsightSummary {
  id: string;
  title: string;
  type: string;
  description: string;
}

interface Contradiction {
  id: string;
  description: string;
  explanation: string;
  recommendedResolution: string | null;
  status: string;
  createdAt: string;
  insightA: InsightSummary;
  insightB: InsightSummary;
}

interface ContradictionListProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: "#fef2f2", text: "#b91c1c" },
  ACKNOWLEDGED: { bg: "#fefce8", text: "#a16207" },
  RESOLVED: { bg: "#f0fdf4", text: "#15803d" },
  DISMISSED: { bg: "#f9fafb", text: "#6b7280" },
};

function formatType(type: string): string {
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

// ── Component ──────────────────────────────────────────────────────────

export function ContradictionList({ workspaceId, projectId, apiBaseUrl }: ContradictionListProps) {
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const base = `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}`;

  const fetchContradictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`${base}/contradictions?${params}`, { credentials: "include" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to load");
      setContradictions(json.data.contradictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contradictions");
    } finally {
      setLoading(false);
    }
  }, [base, statusFilter]);

  useEffect(() => {
    fetchContradictions();
  }, [fetchContradictions]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await fetch(`${base}/contradictions/scan`, {
        method: "POST",
        credentials: "include",
      });
      // Refetch after a short delay to show new results
      setTimeout(fetchContradictions, 3000);
    } catch {
      setError("Failed to trigger scan");
    } finally {
      setScanning(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await fetch(`${base}/contradictions/${id}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchContradictions();
    } catch {
      setError("Failed to update status");
    }
  };

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
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Contradictions</h2>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {contradictions.length} contradiction{contradictions.length !== 1 ? "s" : ""} found
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
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
            {scanning ? "Scanning..." : "Scan for Contradictions"}
          </button>
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

      {/* List */}
      {!loading && contradictions.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
          No contradictions found. Run a scan to check for conflicts between insights.
        </div>
      )}

      {!loading &&
        contradictions.map((c) => {
          const statusStyle = STATUS_COLORS[c.status] ?? STATUS_COLORS.OPEN;
          const expanded = expandedId === c.id;

          return (
            <div
              key={c.id}
              style={{
                padding: 16,
                border: "1px solid #fecaca",
                borderRadius: 8,
                marginBottom: 12,
                backgroundColor: "#fff",
              }}
            >
              {/* Warning badge + description */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                  <span style={{ fontSize: 16 }} role="img" aria-label="warning">
                    &#x26A0;
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.description}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      {formatType(c.insightA.type)} vs {formatType(c.insightB.type)}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: statusStyle.bg,
                    color: statusStyle.text,
                  }}
                >
                  {c.status}
                </span>
              </div>

              {/* Insight pair summary */}
              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                <div
                  style={{
                    flex: 1,
                    padding: 10,
                    backgroundColor: "#fef2f2",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{c.insightA.title}</div>
                  <div style={{ color: "#4b5563" }}>
                    {c.insightA.description.slice(0, 150)}
                    {c.insightA.description.length > 150 ? "..." : ""}
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    padding: 10,
                    backgroundColor: "#eff6ff",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{c.insightB.title}</div>
                  <div style={{ color: "#4b5563" }}>
                    {c.insightB.description.slice(0, 150)}
                    {c.insightB.description.length > 150 ? "..." : ""}
                  </div>
                </div>
              </div>

              {/* Expand / collapse */}
              <button
                onClick={() => setExpandedId(expanded ? null : c.id)}
                style={{
                  marginTop: 8,
                  padding: 0,
                  border: "none",
                  background: "none",
                  color: "#4f46e5",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {expanded ? "Hide details" : "Show details"}
              </button>

              {expanded && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
                    <strong>Explanation:</strong> {c.explanation}
                  </div>
                  {c.recommendedResolution && (
                    <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
                      <strong>Recommended resolution:</strong> {c.recommendedResolution}
                    </div>
                  )}
                  {c.status === "OPEN" && (
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button
                        onClick={() => handleStatusChange(c.id, "ACKNOWLEDGED")}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                          cursor: "pointer",
                          backgroundColor: "#fefce8",
                        }}
                      >
                        Acknowledge
                      </button>
                      <button
                        onClick={() => handleStatusChange(c.id, "RESOLVED")}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                          cursor: "pointer",
                          backgroundColor: "#f0fdf4",
                        }}
                      >
                        Mark Resolved
                      </button>
                      <button
                        onClick={() => handleStatusChange(c.id, "DISMISSED")}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                          cursor: "pointer",
                          backgroundColor: "#f9fafb",
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

export default ContradictionList;
