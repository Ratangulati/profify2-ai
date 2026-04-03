"use client";

import { useState, useCallback, useEffect } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

// ── Types ──────────────────────────────────────────────────────────────

type OpportunityStatus =
  | "IDENTIFIED"
  | "EVALUATING"
  | "PRIORITIZED"
  | "IN_PROGRESS"
  | "SHIPPED"
  | "KILLED"
  | "DEFERRED"
  | "ARCHIVED";

type ConfidenceLevel = "high" | "medium" | "low";

type SortField = "composite" | "rice" | "ice" | "segmentWeighted" | "manual" | "createdAt";

interface LinkedInsight {
  insight: {
    id: string;
    title: string;
    type: string;
    severityScore: number;
    frequencyCount: number;
  };
}

interface LinkedTheme {
  theme: {
    id: string;
    title: string;
    color: string | null;
  };
}

interface Opportunity {
  id: string;
  title: string;
  description: string | null;
  status: OpportunityStatus;
  frequencyScore: number;
  severityScore: number;
  strategicAlignment: number;
  effortEstimate: number;
  compositeScore: number;
  riceReach: number | null;
  riceImpact: number | null;
  riceConfidence: number | null;
  riceEffort: number | null;
  riceScore: number | null;
  iceImpact: number | null;
  iceConfidence: number | null;
  iceEase: number | null;
  iceScore: number | null;
  segmentWeightedFreq: number;
  alignmentScores: Record<string, number>;
  manualRank: number | null;
  linkedInsights: LinkedInsight[];
  linkedThemes: LinkedTheme[];
  confidenceLevel: ConfidenceLevel;
  evidenceCount: number;
  createdAt: string;
}

interface ScoringConfig {
  id: string;
  weightFrequency: number;
  weightSeverity: number;
  weightStrategicAlignment: number;
  weightEffortInverse: number;
  segmentMultipliers: Record<string, number>;
  strategicBets: Array<{
    id: string;
    statement: string;
    weight: number;
    active: boolean;
  }>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PrioritizationTableProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
}

// ── Constants ────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OpportunityStatus, { label: string; color: string }> = {
  IDENTIFIED: { label: "Identified", color: "#6b7280" },
  EVALUATING: { label: "Evaluating", color: "#3b82f6" },
  PRIORITIZED: { label: "Prioritized", color: "#8b5cf6" },
  IN_PROGRESS: { label: "In Progress", color: "#f59e0b" },
  SHIPPED: { label: "Shipped", color: "#10b981" },
  KILLED: { label: "Killed", color: "#ef4444" },
  DEFERRED: { label: "Deferred", color: "#9ca3af" },
  ARCHIVED: { label: "Archived", color: "#d1d5db" },
};

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; color: string; bg: string }> = {
  high: { label: "High", color: "#166534", bg: "#dcfce7" },
  medium: { label: "Med", color: "#854d0e", bg: "#fef9c3" },
  low: { label: "Low", color: "#991b1b", bg: "#fee2e2" },
};

const SCORE_COLORS = {
  frequency: "#3b82f6",
  severity: "#ef4444",
  alignment: "#8b5cf6",
  effort: "#10b981",
};

// ── Helper Components ────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const config = CONFIDENCE_CONFIG[level];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        color: config.color,
        backgroundColor: config.bg,
      }}
    >
      {config.label}
    </span>
  );
}

function StatusBadge({ status }: { status: OpportunityStatus }) {
  const config = STATUS_CONFIG[status];
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

function ScoreBar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  const width = Math.min(Math.max(value / max, 0), 1) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
      <span style={{ width: 60, color: "#6b7280", flexShrink: 0 }}>{label}</span>
      <div
        style={{
          flex: 1,
          height: 6,
          backgroundColor: "#f3f4f6",
          borderRadius: 3,
          overflow: "hidden",
          minWidth: 40,
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: 3,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span style={{ width: 28, textAlign: "right", color: "#374151", fontWeight: 500 }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function ScoreBreakdownChart({ opportunities }: { opportunities: Opportunity[] }) {
  const data = opportunities.slice(0, 15).map((opp) => ({
    name: opp.title.length > 20 ? opp.title.slice(0, 20) + "..." : opp.title,
    Frequency: opp.frequencyScore,
    Severity: opp.severityScore,
    Alignment: opp.strategicAlignment * 5,
    "Effort Inv": (1 / Math.max(opp.effortEstimate, 1)) * 5,
  }));

  if (data.length === 0) return null;

  return (
    <div style={{ width: "100%", height: 300, marginTop: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>Score Breakdown</h3>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 100, right: 20, top: 5, bottom: 5 }}
        >
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Frequency" stackId="a" fill={SCORE_COLORS.frequency} />
          <Bar dataKey="Severity" stackId="a" fill={SCORE_COLORS.severity} />
          <Bar dataKey="Alignment" stackId="a" fill={SCORE_COLORS.alignment} />
          <Bar dataKey="Effort Inv" stackId="a" fill={SCORE_COLORS.effort} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Scoring Config Panel ─────────────────────────────────────────────

function ScoringConfigPanel({
  config,
  onSave,
  saving,
}: {
  config: ScoringConfig;
  onSave: (
    data: Partial<{
      weights: {
        frequency: number;
        severity: number;
        strategicAlignment: number;
        effortInverse: number;
      };
      segmentMultipliers: Record<string, number>;
      strategicBets: Array<{ id?: string; statement: string; weight: number; active: boolean }>;
    }>,
  ) => void;
  saving: boolean;
}) {
  const [weights, setWeights] = useState({
    frequency: config.weightFrequency,
    severity: config.weightSeverity,
    strategicAlignment: config.weightStrategicAlignment,
    effortInverse: config.weightEffortInverse,
  });

  const [segments, setSegments] = useState(config.segmentMultipliers);
  const [bets, setBets] = useState(config.strategicBets);
  const [newBet, setNewBet] = useState("");
  const [newSegment, setNewSegment] = useState({ name: "", multiplier: "1" });

  const totalWeight =
    weights.frequency + weights.severity + weights.strategicAlignment + weights.effortInverse;
  const isValid = Math.abs(totalWeight - 1) < 0.01;

  const handleWeightChange = (key: keyof typeof weights, val: string) => {
    setWeights((prev) => ({ ...prev, [key]: parseFloat(val) || 0 }));
  };

  const handleSave = () => {
    onSave({
      weights: {
        frequency: weights.frequency,
        severity: weights.severity,
        strategicAlignment: weights.strategicAlignment,
        effortInverse: weights.effortInverse,
      },
      segmentMultipliers: segments,
      strategicBets: bets.map((b) => ({
        id: b.id,
        statement: b.statement,
        weight: b.weight,
        active: b.active,
      })),
    });
  };

  return (
    <div
      style={{
        padding: 16,
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        backgroundColor: "#fafafa",
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Scoring Configuration</h3>

      {/* Weights */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", color: "#374151" }}>
          Composite Weights
          <span style={{ fontWeight: 400, color: isValid ? "#10b981" : "#ef4444", marginLeft: 8 }}>
            (sum: {totalWeight.toFixed(2)})
          </span>
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {(
            [
              ["frequency", "Frequency"],
              ["severity", "Severity"],
              ["strategicAlignment", "Strategic Alignment"],
              ["effortInverse", "Effort Inverse"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 12, width: 120, flexShrink: 0 }}>{label}</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={weights[key]}
                onChange={(e) => handleWeightChange(key, e.target.value)}
                style={{ ...inputStyle, width: 70 }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Segment Multipliers */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", color: "#374151" }}>
          Segment Multipliers
        </h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(segments).map(([name, mult]) => (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
              }}
            >
              <span style={{ fontSize: 12 }}>{name}:</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={mult}
                onChange={(e) =>
                  setSegments((prev) => ({ ...prev, [name]: parseFloat(e.target.value) || 0 }))
                }
                style={{ ...inputStyle, width: 50 }}
              />
              <button
                onClick={() => {
                  const next = { ...segments };
                  delete next[name];
                  setSegments(next);
                }}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: "#9ca3af",
                  fontSize: 14,
                }}
              >
                &#x2715;
              </button>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              placeholder="Segment"
              value={newSegment.name}
              onChange={(e) => setNewSegment((p) => ({ ...p, name: e.target.value }))}
              style={{ ...inputStyle, width: 80 }}
            />
            <input
              type="number"
              placeholder="x"
              value={newSegment.multiplier}
              onChange={(e) => setNewSegment((p) => ({ ...p, multiplier: e.target.value }))}
              style={{ ...inputStyle, width: 40 }}
            />
            <button
              onClick={() => {
                if (newSegment.name.trim()) {
                  setSegments((prev) => ({
                    ...prev,
                    [newSegment.name.toLowerCase().trim()]: parseFloat(newSegment.multiplier) || 1,
                  }));
                  setNewSegment({ name: "", multiplier: "1" });
                }
              }}
              style={{ ...buttonSmall, backgroundColor: "#4f46e5", color: "#fff" }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Strategic Bets */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", color: "#374151" }}>
          Strategic Bets
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {bets.map((bet, i) => (
            <div
              key={bet.id}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}
            >
              <span style={{ fontSize: 12, flex: 1 }}>{bet.statement}</span>
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={bet.weight}
                onChange={(e) => {
                  const next = [...bets];
                  next[i] = { ...bet, weight: parseFloat(e.target.value) || 0 };
                  setBets(next);
                }}
                style={{ ...inputStyle, width: 50 }}
              />
              <button
                onClick={() => setBets((prev) => prev.filter((_, j) => j !== i))}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: "#9ca3af",
                  fontSize: 14,
                }}
              >
                &#x2715;
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="New strategic bet..."
              value={newBet}
              onChange={(e) => setNewBet(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={() => {
                if (newBet.trim()) {
                  setBets((prev) => [
                    ...prev,
                    { id: `new-${Date.now()}`, statement: newBet.trim(), weight: 1, active: true },
                  ]);
                  setNewBet("");
                }
              }}
              style={{ ...buttonSmall, backgroundColor: "#4f46e5", color: "#fff" }}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!isValid || saving}
        style={{
          padding: "8px 16px",
          borderRadius: 6,
          border: "none",
          backgroundColor: isValid ? "#4f46e5" : "#d1d5db",
          color: "#fff",
          fontWeight: 500,
          cursor: isValid ? "pointer" : "not-allowed",
          fontSize: 13,
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Saving..." : "Save Configuration"}
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function PrioritizationTable({
  workspaceId,
  projectId,
  apiBaseUrl,
}: PrioritizationTableProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Filters & sorting
  const [sortBy, setSortBy] = useState<SortField>("composite");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<OpportunityStatus | "">("");
  const [page, setPage] = useState(1);

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const base = `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}`;

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      sortBy,
      sortOrder,
      page: String(page),
      limit: "20",
    });
    if (statusFilter) params.set("status", statusFilter);

    try {
      const res = await fetch(`${base}/opportunities?${params}`, { credentials: "include" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to load");

      setOpportunities(json.data.opportunities);
      setPagination(json.data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load opportunities");
    } finally {
      setLoading(false);
    }
  }, [base, sortBy, sortOrder, statusFilter, page]);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${base}/scoring-config`, { credentials: "include" });
      const json = await res.json();
      if (json.success) setConfig(json.data);
    } catch {
      /* ignore */
    }
  }, [base]);

  useEffect(() => {
    fetchOpportunities();
    fetchConfig();
  }, [fetchOpportunities, fetchConfig]);

  const saveConfig = async (
    data: Parameters<typeof ScoringConfigPanel>[0] extends { onSave: (d: infer T) => void }
      ? T
      : never,
  ) => {
    setSavingConfig(true);
    try {
      const res = await fetch(`${base}/scoring-config`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to save");
      setConfig(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSavingConfig(false);
    }
  };

  const recalculateAll = async () => {
    setRecalculating(true);
    setError(null);
    try {
      const res = await fetch(`${base}/opportunities/recalculate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to recalculate");

      await fetchOpportunities();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate");
    } finally {
      setRecalculating(false);
    }
  };

  const updateOpportunity = async (id: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/workspaces/${workspaceId}/opportunities/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to update");

      // Refresh the list
      await fetchOpportunities();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  };

  // Drag-to-rerank handlers
  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;

    const reordered = [...opportunities];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    setOpportunities(reordered);
    setDragIdx(idx);
  };

  const handleDragEnd = async () => {
    if (dragIdx === null) return;
    setDragIdx(null);

    // Persist new manual ranks
    for (let i = 0; i < opportunities.length; i++) {
      const opp = opportunities[i];
      const newRank = i + 1;
      if (opp.manualRank !== newRank) {
        await updateOpportunity(opp.id, { manualRank: newRank });
      }
    }
  };

  const getScoreDisplay = (opp: Opportunity): string => {
    switch (sortBy) {
      case "rice":
        return opp.riceScore?.toFixed(1) ?? "-";
      case "ice":
        return opp.iceScore?.toFixed(2) ?? "-";
      case "segmentWeighted":
        return opp.segmentWeightedFreq.toFixed(1);
      case "manual":
        return opp.manualRank?.toString() ?? "-";
      default:
        return opp.compositeScore.toFixed(2);
    }
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 1200 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Opportunity Prioritization</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowChart((v) => !v)}
            style={{
              ...btnStyle,
              backgroundColor: showChart ? "#4f46e5" : "#fff",
              color: showChart ? "#fff" : "#374151",
            }}
          >
            {showChart ? "Hide Chart" : "Show Chart"}
          </button>
          <button
            onClick={() => setShowConfig((v) => !v)}
            style={{
              ...btnStyle,
              backgroundColor: showConfig ? "#4f46e5" : "#fff",
              color: showConfig ? "#fff" : "#374151",
            }}
          >
            {showConfig ? "Hide Config" : "Config"}
          </button>
          <button
            onClick={recalculateAll}
            disabled={recalculating}
            style={{
              ...btnStyle,
              backgroundColor: "#4f46e5",
              color: "#fff",
              opacity: recalculating ? 0.6 : 1,
            }}
          >
            {recalculating ? "Recalculating..." : "Recalculate All"}
          </button>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && config && (
        <div style={{ marginBottom: 16 }}>
          <ScoringConfigPanel config={config} onSave={saveConfig} saving={savingConfig} />
        </div>
      )}

      {/* Chart */}
      {showChart && <ScoreBreakdownChart opportunities={opportunities} />}

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as OpportunityStatus | "");
            setPage(1);
          }}
          style={selectStyle}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value as SortField);
            setPage(1);
          }}
          style={selectStyle}
        >
          <option value="composite">Composite Score</option>
          <option value="rice">RICE Score</option>
          <option value="ice">ICE Score</option>
          <option value="segmentWeighted">Segment-Weighted</option>
          <option value="manual">Manual Rank</option>
          <option value="createdAt">Date Created</option>
        </select>

        <button
          onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
          style={{ ...selectStyle, cursor: "pointer", minWidth: 40 }}
        >
          {sortOrder === "desc" ? "\u2193" : "\u2191"}
        </button>

        <button
          onClick={() => fetchOpportunities()}
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
          Loading opportunities...
        </div>
      )}

      {/* Empty state */}
      {!loading && opportunities.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
          No opportunities found. Create opportunities from insights to start prioritizing.
        </div>
      )}

      {/* Table */}
      {!loading && opportunities.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                <th style={thStyle}></th>
                <th style={{ ...thStyle, textAlign: "left" }}>Opportunity</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>Breakdown</th>
                <th style={thStyle}>RICE</th>
                <th style={thStyle}>ICE</th>
                <th style={thStyle}>Confidence</th>
                <th style={thStyle}>Effort</th>
                <th style={thStyle}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opp, idx) => (
                <tr
                  key={opp.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                    backgroundColor:
                      dragIdx === idx ? "#eef2ff" : idx % 2 === 0 ? "#fff" : "#fafafa",
                    cursor: "grab",
                    transition: "background-color 0.15s",
                  }}
                >
                  {/* Rank */}
                  <td style={{ ...tdStyle, width: 40, textAlign: "center", color: "#9ca3af" }}>
                    {opp.manualRank ?? idx + 1}
                  </td>

                  {/* Title & insights */}
                  <td style={{ ...tdStyle, maxWidth: 280, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{opp.title}</div>
                    {opp.description && (
                      <div
                        style={{ fontSize: 11, color: "#6b7280", marginBottom: 4, lineHeight: 1.3 }}
                      >
                        {opp.description.length > 100
                          ? opp.description.slice(0, 100) + "..."
                          : opp.description}
                      </div>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {opp.linkedThemes.map((lt) => (
                        <span
                          key={lt.theme.id}
                          style={{
                            padding: "0 5px",
                            borderRadius: 3,
                            fontSize: 10,
                            backgroundColor: lt.theme.color ? `${lt.theme.color}20` : "#f3f4f6",
                            color: lt.theme.color ?? "#6b7280",
                          }}
                        >
                          {lt.theme.title}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Status */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <StatusBadge status={opp.status} />
                  </td>

                  {/* Primary score */}
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, fontSize: 16 }}>
                    {getScoreDisplay(opp)}
                  </td>

                  {/* Breakdown bars */}
                  <td style={{ ...tdStyle, minWidth: 200 }}>
                    <ScoreBar
                      value={opp.frequencyScore}
                      max={50}
                      color={SCORE_COLORS.frequency}
                      label="Freq"
                    />
                    <ScoreBar
                      value={opp.severityScore}
                      max={5}
                      color={SCORE_COLORS.severity}
                      label="Severity"
                    />
                    <ScoreBar
                      value={opp.strategicAlignment}
                      max={1}
                      color={SCORE_COLORS.alignment}
                      label="Align"
                    />
                    <ScoreBar
                      value={1 / Math.max(opp.effortEstimate, 1)}
                      max={1}
                      color={SCORE_COLORS.effort}
                      label="Ease"
                    />
                  </td>

                  {/* RICE */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <div style={{ fontWeight: 600 }}>{opp.riceScore?.toFixed(1) ?? "-"}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>
                      R:{opp.riceReach ?? "-"} I:{opp.riceImpact ?? "-"} C:
                      {opp.riceConfidence ?? "-"} E:{opp.riceEffort ?? "-"}
                    </div>
                  </td>

                  {/* ICE */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <div style={{ fontWeight: 600 }}>{opp.iceScore?.toFixed(2) ?? "-"}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>
                      I:{opp.iceImpact?.toFixed(1) ?? "-"} C:{opp.iceConfidence ?? "-"} E:
                      {opp.iceEase?.toFixed(2) ?? "-"}
                    </div>
                  </td>

                  {/* Confidence */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <ConfidenceBadge level={opp.confidenceLevel} />
                  </td>

                  {/* Effort */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <select
                      value={opp.effortEstimate}
                      onChange={(e) =>
                        updateOpportunity(opp.id, { effortEstimate: parseInt(e.target.value) })
                      }
                      style={{ ...selectStyle, padding: "2px 4px", fontSize: 12 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {[1, 2, 3, 4, 5].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Evidence count */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{opp.evidenceCount}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

      {/* Legend */}
      <div
        style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: "#f9fafb",
          borderRadius: 6,
          fontSize: 11,
          color: "#6b7280",
        }}
      >
        <strong>Score legend:</strong>{" "}
        <span style={{ color: SCORE_COLORS.frequency }}>&#9632;</span> Frequency{" "}
        <span style={{ color: SCORE_COLORS.severity }}>&#9632;</span> Severity{" "}
        <span style={{ color: SCORE_COLORS.alignment }}>&#9632;</span> Strategic Alignment{" "}
        <span style={{ color: SCORE_COLORS.effort }}>&#9632;</span> Ease (inverse effort) | Drag
        rows to manually re-rank | Confidence: based on evidence volume ({">"}20 = green, 10-20 =
        yellow, {"<"}10 = red)
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 13,
  backgroundColor: "#fff",
};

const btnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontWeight: 500,
  cursor: "pointer",
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  padding: "4px 6px",
  borderRadius: 4,
  border: "1px solid #d1d5db",
  fontSize: 12,
};

const buttonSmall: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 4,
  border: "none",
  fontWeight: 500,
  cursor: "pointer",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "center",
  fontSize: 11,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px",
  verticalAlign: "top",
};

export default PrioritizationTable;
