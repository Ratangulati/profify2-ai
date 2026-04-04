"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

// ── Types ──────────────────────────────────────────────────────────────

interface PRDSection {
  id: string;
  title: string;
  content: string;
  evidenceStrength: number;
}

interface SpecEvidence {
  id: string;
  sectionRef: string | null;
  citationRef: string | null;
  position: number | null;
  evidenceType: string;
  note: string | null;
  insight: {
    id: string;
    title: string;
    type: string;
    severityScore: number;
    description: string;
  } | null;
  feedbackItem: {
    id: string;
    content: string;
    customerName: string | null;
    segmentTags: string[];
  } | null;
}

interface SpecVersion {
  id: string;
  version: number;
  changeNote: string | null;
  createdAt: string;
}

interface SpecComment {
  id: string;
  content: string;
  sectionRef: string | null;
  resolved: boolean;
  user: { id: string; name: string; avatarUrl: string | null };
  createdAt: string;
}

interface Assumption {
  id: string;
  assumption: string;
  category: string;
  riskLevel: string;
  validationStatus: string;
  sectionRef: string | null;
}

interface SpecData {
  id: string;
  title: string;
  type: string;
  status: string;
  content: { sections: PRDSection[] };
  metadata: Record<string, unknown>;
  evidence: SpecEvidence[];
  versions: SpecVersion[];
  comments: SpecComment[];
  assumptions: Assumption[];
}

interface PRDEditorProps {
  workspaceId: string;
  specId: string;
  apiBaseUrl: string;
}

type AICommand = "find_evidence" | "challenge" | "expand" | "simplify";

// ── Constants ────────────────────────────────────────────────────────

const EVIDENCE_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  INSIGHT: { label: "Insight", color: "#4f46e5" },
  PAIN_POINT: { label: "Pain Point", color: "#ef4444" },
  DESIRE: { label: "Desire", color: "#8b5cf6" },
  FEEDBACK_ITEM: { label: "Feedback", color: "#0891b2" },
  COMPETITIVE: { label: "Competitive", color: "#ea580c" },
  JTBD: { label: "JTBD", color: "#059669" },
  ANALYTICS: { label: "Analytics", color: "#2563eb" },
};

const RISK_COLORS: Record<string, string> = {
  LOW: "#10b981",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
  CRITICAL: "#991b1b",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "#6b7280" },
  REVIEW: { label: "In Review", color: "#3b82f6" },
  APPROVED: { label: "Approved", color: "#10b981" },
  ARCHIVED: { label: "Archived", color: "#9ca3af" },
};

// ── Helper Components ────────────────────────────────────────────────

function EvidenceStrengthBar({ strength }: { strength: number }) {
  const width = Math.min(Math.max(strength, 0), 1) * 100;
  const color = strength >= 0.7 ? "#10b981" : strength >= 0.4 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 60,
          height: 4,
          backgroundColor: "#e5e7eb",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: 2,
          }}
        />
      </div>
      <span style={{ fontSize: 10, color: "#6b7280" }}>{Math.round(strength * 100)}%</span>
    </div>
  );
}

function EvidencePopover({ evidence, onClose }: { evidence: SpecEvidence; onClose: () => void }) {
  const typeConfig =
    EVIDENCE_TYPE_CONFIG[evidence.insight?.type ?? evidence.evidenceType] ??
    EVIDENCE_TYPE_CONFIG.INSIGHT;

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 100,
        backgroundColor: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 14,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        maxWidth: 360,
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            padding: "1px 6px",
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            color: "#fff",
            backgroundColor: typeConfig.color,
          }}
        >
          {typeConfig.label}
        </span>
        <button
          onClick={onClose}
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

      {evidence.insight && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{evidence.insight.title}</div>
          <div style={{ color: "#4b5563", lineHeight: 1.4, marginBottom: 6 }}>
            {evidence.insight.description}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            Severity: {evidence.insight.severityScore}/5
          </div>
        </>
      )}

      {evidence.feedbackItem && (
        <>
          <div style={{ fontStyle: "italic", color: "#374151", lineHeight: 1.4, marginBottom: 6 }}>
            &ldquo;{evidence.feedbackItem.content.slice(0, 200)}
            {evidence.feedbackItem.content.length > 200 ? "..." : ""}&rdquo;
          </div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            {evidence.feedbackItem.customerName ?? "Anonymous"}
            {evidence.feedbackItem.segmentTags.length > 0 &&
              ` | ${evidence.feedbackItem.segmentTags.join(", ")}`}
          </div>
        </>
      )}

      {evidence.note && !evidence.insight && !evidence.feedbackItem && (
        <div style={{ color: "#4b5563" }}>{evidence.note}</div>
      )}
    </div>
  );
}

function AssumptionsSidebar({ assumptions }: { assumptions: Assumption[] }) {
  if (assumptions.length === 0) return null;

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid #fef3c7",
        borderRadius: 8,
        backgroundColor: "#fffbeb",
      }}
    >
      <h4 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", color: "#92400e" }}>
        Assumptions ({assumptions.length})
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {assumptions.map((a) => (
          <div
            key={a.id}
            style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid #fef3c7" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: RISK_COLORS[a.riskLevel] ?? "#9ca3af",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 500 }}>{a.assumption}</span>
            </div>
            <div style={{ fontSize: 10, color: "#92400e" }}>
              {a.category} | {a.riskLevel} | {a.validationStatus}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VersionHistory({
  versions,
  currentVersion,
  onSelectVersion,
}: {
  versions: SpecVersion[];
  currentVersion: number;
  onSelectVersion: (v: number) => void;
}) {
  return (
    <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
      <h4 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px" }}>Version History</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {versions.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelectVersion(v.version)}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: currentVersion === v.version ? "1px solid #4f46e5" : "1px solid #e5e7eb",
              backgroundColor: currentVersion === v.version ? "#eef2ff" : "#fff",
              cursor: "pointer",
              textAlign: "left",
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 500 }}>v{v.version}</div>
            {v.changeNote && <div style={{ fontSize: 11, color: "#6b7280" }}>{v.changeNote}</div>}
            <div style={{ fontSize: 10, color: "#9ca3af" }}>
              {new Date(v.createdAt).toLocaleDateString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Section Editor ───────────────────────────────────────────────────

function SectionEditor({
  section,
  evidence,
  onUpdate,
  onAIAssist,
  aiLoading,
}: {
  section: PRDSection;
  evidence: SpecEvidence[];
  onUpdate: (content: string) => void;
  onAIAssist: (command: AICommand, selectedText: string, sectionContext: string) => void;
  aiLoading: boolean;
}) {
  const [hoveredCitation, setHoveredCitation] = useState<string | null>(null);

  const sectionEvidence = useMemo(
    () => evidence.filter((e) => e.sectionRef === section.id),
    [evidence, section.id],
  );

  const evidenceMap = useMemo(() => {
    const map = new Map<string, SpecEvidence>();
    for (const e of sectionEvidence) {
      if (e.citationRef) map.set(e.citationRef, e);
    }
    return map;
  }, [sectionEvidence]);

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: "Start writing..." })],
    content: section.content,
    onUpdate: ({ editor: ed }) => {
      onUpdate(ed.getHTML());
    },
  });

  const handleAICommand = (command: AICommand) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    if (!selectedText.trim()) return;
    onAIAssist(command, selectedText, section.content);
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{section.title}</h3>
        <EvidenceStrengthBar strength={section.evidenceStrength} />
        <span style={{ fontSize: 10, color: "#9ca3af" }}>{sectionEvidence.length} citations</span>
      </div>

      {/* Editor */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          position: "relative",
        }}
      >
        {editor && (
          <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
            <div
              style={{
                display: "flex",
                gap: 2,
                padding: 4,
                backgroundColor: "#1f2937",
                borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              }}
            >
              {[
                { cmd: "find_evidence" as const, label: "Find Evidence", icon: "🔍" },
                { cmd: "challenge" as const, label: "Challenge", icon: "⚡" },
                { cmd: "expand" as const, label: "Expand", icon: "📝" },
                { cmd: "simplify" as const, label: "Simplify", icon: "✨" },
              ].map(({ cmd, label, icon }) => (
                <button
                  key={cmd}
                  onClick={() => handleAICommand(cmd)}
                  disabled={aiLoading}
                  style={{
                    padding: "4px 8px",
                    border: "none",
                    borderRadius: 4,
                    backgroundColor: "transparent",
                    color: "#fff",
                    cursor: aiLoading ? "wait" : "pointer",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    opacity: aiLoading ? 0.5 : 1,
                  }}
                  title={label}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </BubbleMenu>
        )}

        <div style={{ padding: "12px 16px", minHeight: 100 }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Inline citation indicators */}
      {sectionEvidence.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {sectionEvidence.map((ev) => {
            const typeConfig =
              EVIDENCE_TYPE_CONFIG[ev.insight?.type ?? ev.evidenceType] ??
              EVIDENCE_TYPE_CONFIG.INSIGHT;

            return (
              <div key={ev.id} style={{ position: "relative" }}>
                <button
                  onMouseEnter={() => setHoveredCitation(ev.id)}
                  onMouseLeave={() => setHoveredCitation(null)}
                  style={{
                    padding: "1px 6px",
                    borderRadius: 3,
                    border: `1px solid ${typeConfig.color}40`,
                    backgroundColor: `${typeConfig.color}10`,
                    color: typeConfig.color,
                    fontSize: 10,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {ev.citationRef ?? ev.insight?.title ?? "Evidence"}
                </button>
                {hoveredCitation === ev.id && (
                  <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4 }}>
                    <EvidencePopover evidence={ev} onClose={() => setHoveredCitation(null)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function PRDEditor({ workspaceId, specId, apiBaseUrl }: PRDEditorProps) {
  const [spec, setSpec] = useState<SpecData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAILoading] = useState(false);
  const [aiResult, setAIResult] = useState<{ command: string; content: string } | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeTab, setActiveTab] = useState<"evidence" | "assumptions" | "versions">("evidence");

  // Track local content changes
  const [localSections, setLocalSections] = useState<PRDSection[]>([]);
  const [dirty, setDirty] = useState(false);

  const base = `${apiBaseUrl}/api/workspaces/${workspaceId}`;

  // Fetch spec
  const fetchSpec = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}/specs/${specId}`, { credentials: "include" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to load spec");

      setSpec(json.data);
      setLocalSections(json.data.content.sections ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load spec");
    } finally {
      setLoading(false);
    }
  }, [base, specId]);

  useEffect(() => {
    fetchSpec();
  }, [fetchSpec]);

  // Save
  const save = async (changeNote?: string) => {
    if (!spec) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${base}/specs/${specId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { sections: localSections },
          changeNote: changeNote ?? "Manual edit",
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to save");

      setDirty(false);
      await fetchSpec();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Section update
  const handleSectionUpdate = (sectionId: string, content: string) => {
    setLocalSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, content } : s)));
    setDirty(true);
  };

  // AI assist
  const handleAIAssist = async (command: string, selectedText: string, sectionContext: string) => {
    if (!spec) return;
    setAILoading(true);
    setAIResult(null);
    try {
      const res = await fetch(`${base}/specs/${specId}/ai-assist`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, selectedText, sectionContext }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "AI assist failed");

      setAIResult({ command, content: json.data.content });
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI assist failed");
    } finally {
      setAILoading(false);
    }
  };

  // Status update
  const updateStatus = async (status: string) => {
    if (!spec) return;
    try {
      const res = await fetch(`${base}/specs/${specId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to update");

      await fetchSpec();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  if (loading) {
    return <div style={{ padding: 48, textAlign: "center", color: "#6b7280" }}>Loading PRD...</div>;
  }

  if (!spec) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#ef4444" }}>
        {error ?? "Spec not found"}
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[spec.status] ?? STATUS_CONFIG.DRAFT;
  const currentVersion = spec.versions[0]?.version ?? 1;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", display: "flex", gap: 24, maxWidth: 1400 }}>
      {/* Main editor panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{spec.title}</h1>
            <span
              style={{
                padding: "2px 10px",
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                color: "#fff",
                backgroundColor: statusConfig.color,
              }}
            >
              {statusConfig.label}
            </span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>v{currentVersion}</span>
          </div>

          {/* Toolbar */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={spec.status}
              onChange={(e) => updateStatus(e.target.value)}
              style={selectStyle}
            >
              {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            <button
              onClick={() => save()}
              disabled={!dirty || saving}
              style={{
                ...btnStyle,
                backgroundColor: dirty ? "#4f46e5" : "#d1d5db",
                color: "#fff",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving..." : dirty ? "Save Changes" : "Saved"}
            </button>

            <button
              onClick={() => setShowSidebar((v) => !v)}
              style={{ ...btnStyle, backgroundColor: "#fff", color: "#374151" }}
            >
              {showSidebar ? "Hide Panel" : "Show Panel"}
            </button>

            <div style={{ flex: 1 }} />

            <span style={{ fontSize: 12, color: "#6b7280" }}>
              {spec.evidence.length} citations | {spec.assumptions.length} assumptions |{" "}
              {(spec.metadata as Record<string, unknown>).evidenceCount ?? 0} evidence items
            </span>
          </div>
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

        {/* AI Assist Result */}
        {aiResult && (
          <div
            style={{
              padding: 14,
              backgroundColor: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0369a1" }}>
                AI Assist: {aiResult.command}
              </span>
              <button
                onClick={() => setAIResult(null)}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#6b7280" }}
              >
                &#x2715;
              </button>
            </div>
            <div
              style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "#1e3a5f" }}
            >
              {aiResult.content}
            </div>
          </div>
        )}

        {/* Sections */}
        {localSections.map((section) => (
          <SectionEditor
            key={section.id}
            section={section}
            evidence={spec.evidence}
            onUpdate={(content) => handleSectionUpdate(section.id, content)}
            onAIAssist={handleAIAssist}
            aiLoading={aiLoading}
          />
        ))}
      </div>

      {/* Sidebar */}
      {showSidebar && (
        <div style={{ width: 320, flexShrink: 0 }}>
          {/* Tab selector */}
          <div
            style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: "1px solid #e5e7eb" }}
          >
            {(["evidence", "assumptions", "versions"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "6px 12px",
                  border: "none",
                  borderBottom: activeTab === tab ? "2px solid #4f46e5" : "2px solid transparent",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: activeTab === tab ? 600 : 400,
                  color: activeTab === tab ? "#4f46e5" : "#6b7280",
                  textTransform: "capitalize",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "evidence" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {spec.evidence.length === 0 ? (
                <div style={{ fontSize: 12, color: "#9ca3af", padding: 12 }}>No citations yet.</div>
              ) : (
                spec.evidence.map((ev) => {
                  const typeConfig =
                    EVIDENCE_TYPE_CONFIG[ev.insight?.type ?? ev.evidenceType] ??
                    EVIDENCE_TYPE_CONFIG.INSIGHT;

                  return (
                    <div
                      key={ev.id}
                      style={{
                        padding: 10,
                        borderRadius: 6,
                        border: "1px solid #f3f4f6",
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}
                      >
                        <span
                          style={{
                            padding: "0 4px",
                            borderRadius: 3,
                            fontSize: 9,
                            fontWeight: 600,
                            color: "#fff",
                            backgroundColor: typeConfig.color,
                          }}
                        >
                          {typeConfig.label}
                        </span>
                        {ev.sectionRef && (
                          <span style={{ fontSize: 10, color: "#9ca3af" }}>{ev.sectionRef}</span>
                        )}
                      </div>
                      {ev.insight && <div style={{ fontWeight: 500 }}>{ev.insight.title}</div>}
                      {ev.note && (
                        <div style={{ color: "#6b7280", fontStyle: "italic", marginTop: 2 }}>
                          {ev.note.slice(0, 100)}
                          {ev.note.length > 100 ? "..." : ""}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === "assumptions" && <AssumptionsSidebar assumptions={spec.assumptions} />}

          {activeTab === "versions" && (
            <VersionHistory
              versions={spec.versions}
              currentVersion={currentVersion}
              onSelectVersion={(v) => {
                // TODO: load specific version content
                console.log("Load version", v);
              }}
            />
          )}
        </div>
      )}
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
  padding: "6px 14px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontWeight: 500,
  cursor: "pointer",
  fontSize: 13,
};

export default PRDEditor;
