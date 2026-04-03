"use client";

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────

interface Recommendation {
  title: string;
  reasoning: string;
  confidenceLevel: "high" | "medium" | "low";
  evidenceCount: number;
  keyQuote: string | null;
  linkedThemes: string[];
}

interface QueryResponseData {
  summary: string;
  recommendations: Recommendation[];
  risks: string[];
  nextSteps: string[];
  query: string;
}

interface ParsedIntent {
  intent: string;
  segments: string[];
  featureArea: string | null;
  competitor: string | null;
}

interface ProductQueryProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

const CONFIDENCE_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: "#f0fdf4", text: "#15803d" },
  medium: { bg: "#fefce8", text: "#a16207" },
  low: { bg: "#f9fafb", text: "#6b7280" },
};

const INTENT_LABELS: Record<string, string> = {
  build_recommendation: "Build Recommendation",
  segment_analysis: "Segment Analysis",
  pain_exploration: "Pain Exploration",
  feature_inquiry: "Feature Inquiry",
  competitive: "Competitive Analysis",
};

// ── Component ──────────────────────────────────────────────────────────

export function ProductQuery({ workspaceId, projectId, apiBaseUrl }: ProductQueryProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [response, setResponse] = useState<QueryResponseData | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const base = `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResponse(null);
    setIntent(null);
    setExpandedIdx(null);

    try {
      const res = await fetch(`${base}/query`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Query failed");
      setIntent(json.data.intent);
      setResponse(json.data.response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process query");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Search bar */}
      <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your product..."
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
              backgroundColor: "#4f46e5",
              color: "#fff",
              opacity: loading || !question.trim() ? 0.6 : 1,
            }}
          >
            {loading ? "Thinking..." : "Ask"}
          </button>
        </div>
      </form>

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
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>Analyzing your feedback data...</div>
          <div style={{ fontSize: 12 }}>This may take a few seconds</div>
        </div>
      )}

      {/* Response */}
      {!loading && response && (
        <div>
          {/* Intent badge */}
          {intent && (
            <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  backgroundColor: "#eff6ff",
                  color: "#1d4ed8",
                }}
              >
                {INTENT_LABELS[intent.intent] ?? intent.intent}
              </span>
              {intent.featureArea && (
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  Feature: {intent.featureArea}
                </span>
              )}
              {intent.competitor && (
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  Competitor: {intent.competitor}
                </span>
              )}
            </div>
          )}

          {/* Summary */}
          <div
            style={{
              padding: 16,
              backgroundColor: "#f9fafb",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {response.summary}
          </div>

          {/* Recommendations */}
          {response.recommendations.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Recommendations</h3>
              {response.recommendations.map((rec, i) => {
                const conf = CONFIDENCE_COLORS[rec.confidenceLevel] ?? CONFIDENCE_COLORS.medium;
                const expanded = expandedIdx === i;

                return (
                  <div
                    key={i}
                    style={{
                      padding: 14,
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      marginBottom: 8,
                      backgroundColor: "#fff",
                      cursor: "pointer",
                    }}
                    onClick={() => setExpandedIdx(expanded ? null : i)}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>
                            {i + 1}. {rec.title}
                          </span>
                          <span
                            style={{
                              padding: "1px 6px",
                              borderRadius: 10,
                              fontSize: 10,
                              fontWeight: 600,
                              backgroundColor: conf.bg,
                              color: conf.text,
                            }}
                          >
                            {rec.confidenceLevel}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                          {rec.evidenceCount} evidence points
                          {rec.linkedThemes.length > 0 &&
                            ` | Themes: ${rec.linkedThemes.join(", ")}`}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: "#9ca3af" }}>
                        {expanded ? "\u25B2" : "\u25BC"}
                      </span>
                    </div>

                    {expanded && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
                          {rec.reasoning}
                        </div>
                        {rec.keyQuote && (
                          <div
                            style={{
                              padding: 8,
                              backgroundColor: "#f9fafb",
                              borderRadius: 4,
                              fontSize: 12,
                              fontStyle: "italic",
                              color: "#4b5563",
                              borderLeft: "3px solid #d1d5db",
                            }}
                          >
                            {rec.keyQuote}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Risks */}
          {response.risks.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Risks & Caveats</h3>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {response.risks.map((risk, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#b91c1c", marginBottom: 4 }}>
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next steps */}
          {response.nextSteps.length > 0 && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Suggested Next Steps
              </h3>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {response.nextSteps.map((step, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProductQuery;
