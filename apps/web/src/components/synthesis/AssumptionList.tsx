"use client";

import { useState, useCallback, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────

interface SpecSummary {
  id: string;
  title: string;
  type: string;
}

interface Assumption {
  id: string;
  assumption: string;
  category: string;
  quoteText: string;
  sectionRef: string | null;
  riskLevel: string;
  validationStatus: string;
  suggestion: string | null;
  createdAt: string;
  spec: SpecSummary;
}

interface AssumptionListProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
  specId?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
  HIGH: { bg: "#fff7ed", text: "#9a3412", border: "#fed7aa" },
  MEDIUM: { bg: "#fefce8", text: "#a16207", border: "#fef08a" },
  LOW: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
};

const VALIDATION_LABELS: Record<string, { label: string; color: string }> = {
  UNVALIDATED: { label: "Unvalidated", color: "#6b7280" },
  VALIDATED: { label: "Validated", color: "#15803d" },
  INVALIDATED: { label: "Invalidated", color: "#b91c1c" },
  PARTIALLY_VALIDATED: { label: "Partially Validated", color: "#a16207" },
};

const CATEGORY_LABELS: Record<string, string> = {
  USER_BEHAVIOR: "User Behavior",
  TECHNICAL: "Technical",
  MARKET: "Market",
  ADOPTION: "Adoption",
  RESOURCE: "Resource",
  REGULATORY: "Regulatory",
};

// ── Component ──────────────────────────────────────────────────────────

export function AssumptionList({
  workspaceId,
  projectId,
  apiBaseUrl,
  specId,
}: AssumptionListProps) {
  const [assumptions, setAssumptions] = useState<Assumption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [validationFilter, setValidationFilter] = useState<string>("");

  const base = `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}`;

  const fetchAssumptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (specId) params.set("specId", specId);
      if (riskFilter) params.set("riskLevel", riskFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (validationFilter) params.set("validationStatus", validationFilter);

      const res = await fetch(`${base}/assumptions?${params}`, { credentials: "include" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to load");
      setAssumptions(json.data.assumptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assumptions");
    } finally {
      setLoading(false);
    }
  }, [base, specId, riskFilter, categoryFilter, validationFilter]);

  useEffect(() => {
    fetchAssumptions();
  }, [fetchAssumptions]);

  const handleValidation = async (id: string, validationStatus: string) => {
    try {
      await fetch(`${base}/assumptions/${id}/validate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validationStatus }),
      });
      fetchAssumptions();
    } catch {
      setError("Failed to update validation status");
    }
  };

  // Group by risk level for display
  const grouped = {
    CRITICAL: assumptions.filter((a) => a.riskLevel === "CRITICAL"),
    HIGH: assumptions.filter((a) => a.riskLevel === "HIGH"),
    MEDIUM: assumptions.filter((a) => a.riskLevel === "MEDIUM"),
    LOW: assumptions.filter((a) => a.riskLevel === "LOW"),
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
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Assumptions</h2>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {assumptions.length} assumption{assumptions.length !== 1 ? "s" : ""} surfaced
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            <option value="">All risk levels</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            <option value="">All categories</option>
            <option value="USER_BEHAVIOR">User Behavior</option>
            <option value="TECHNICAL">Technical</option>
            <option value="MARKET">Market</option>
            <option value="ADOPTION">Adoption</option>
            <option value="RESOURCE">Resource</option>
            <option value="REGULATORY">Regulatory</option>
          </select>
          <select
            value={validationFilter}
            onChange={(e) => setValidationFilter(e.target.value)}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            <option value="">All statuses</option>
            <option value="UNVALIDATED">Unvalidated</option>
            <option value="VALIDATED">Validated</option>
            <option value="INVALIDATED">Invalidated</option>
            <option value="PARTIALLY_VALIDATED">Partially Validated</option>
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

      {!loading && assumptions.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
          No assumptions found. Analyze a spec to surface implicit assumptions.
        </div>
      )}

      {/* Render grouped by risk */}
      {!loading &&
        (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((level) => {
          const items = grouped[level];
          if (items.length === 0) return null;
          const colors = RISK_COLORS[level];

          return (
            <div key={level} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 8 }}>
                {level} Risk ({items.length})
              </h3>
              {items.map((a) => {
                const validation =
                  VALIDATION_LABELS[a.validationStatus] ?? VALIDATION_LABELS.UNVALIDATED;

                return (
                  <div
                    key={a.id}
                    style={{
                      padding: 14,
                      border: `1px solid ${colors.border}`,
                      borderLeft: `4px solid ${colors.text}`,
                      borderRadius: 6,
                      marginBottom: 8,
                      backgroundColor: colors.bg,
                    }}
                  >
                    {/* Assumption text */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>
                          {a.assumption}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                          <span
                            style={{
                              padding: "1px 6px",
                              borderRadius: 10,
                              fontSize: 10,
                              fontWeight: 600,
                              backgroundColor: "#e5e7eb",
                              color: "#374151",
                            }}
                          >
                            {CATEGORY_LABELS[a.category] ?? a.category}
                          </span>
                          <span style={{ fontSize: 11, color: validation.color, fontWeight: 600 }}>
                            {validation.label}
                          </span>
                          {a.sectionRef && (
                            <span style={{ fontSize: 11, color: "#6b7280" }}>
                              Section: {a.sectionRef}
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
                        {a.spec.title}
                      </span>
                    </div>

                    {/* Quote */}
                    <div
                      style={{
                        marginTop: 8,
                        padding: 8,
                        backgroundColor: "rgba(255,255,255,0.6)",
                        borderRadius: 4,
                        fontSize: 12,
                        fontStyle: "italic",
                        color: "#4b5563",
                        borderLeft: "3px solid #d1d5db",
                      }}
                    >
                      {a.quoteText}
                    </div>

                    {/* Suggestion */}
                    {a.suggestion && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#374151" }}>
                        <strong>To validate:</strong> {a.suggestion}
                      </div>
                    )}

                    {/* Validation actions */}
                    {a.validationStatus === "UNVALIDATED" && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button
                          onClick={() => handleValidation(a.id, "VALIDATED")}
                          style={{
                            padding: "3px 8px",
                            borderRadius: 4,
                            border: "1px solid #bbf7d0",
                            fontSize: 11,
                            cursor: "pointer",
                            backgroundColor: "#f0fdf4",
                            color: "#15803d",
                          }}
                        >
                          Validated
                        </button>
                        <button
                          onClick={() => handleValidation(a.id, "PARTIALLY_VALIDATED")}
                          style={{
                            padding: "3px 8px",
                            borderRadius: 4,
                            border: "1px solid #fef08a",
                            fontSize: 11,
                            cursor: "pointer",
                            backgroundColor: "#fefce8",
                            color: "#a16207",
                          }}
                        >
                          Partially
                        </button>
                        <button
                          onClick={() => handleValidation(a.id, "INVALIDATED")}
                          style={{
                            padding: "3px 8px",
                            borderRadius: 4,
                            border: "1px solid #fecaca",
                            fontSize: 11,
                            cursor: "pointer",
                            backgroundColor: "#fef2f2",
                            color: "#b91c1c",
                          }}
                        >
                          Invalidated
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}

export default AssumptionList;
