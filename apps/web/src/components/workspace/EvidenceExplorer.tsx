"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Tag,
  Lightbulb,
  MessageSquare,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  GripVertical,
  ChevronRight,
  ChevronDown,
  Loader2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface Theme {
  id: string;
  title: string;
  feedbackCount: number;
  color: string | null;
}

interface Insight {
  id: string;
  title: string;
  description: string;
  type: string;
  severityScore: number;
  frequencyCount: number;
  trend: string;
  segmentDistribution: Record<string, number>;
}

interface FeedbackItem {
  id: string;
  content: string;
  customerName: string | null;
  segmentTags: string[];
  sentiment: string | null;
  createdAt: string;
}

type TabId = "themes" | "insights" | "feedback" | "search";

interface EvidenceExplorerProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
}

// ── Constants ────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "themes", label: "Themes", icon: Tag },
  { id: "insights", label: "Insights", icon: Lightbulb },
  { id: "feedback", label: "Feed", icon: MessageSquare },
  { id: "search", label: "Search", icon: Search },
];

const INSIGHT_TYPES: Record<string, { label: string; class: string }> = {
  PAIN_POINT: { label: "Pain", class: "bg-red-500/10 text-red-600 dark:text-red-400" },
  DESIRE: { label: "Desire", class: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  OBSERVATION: { label: "Obs", class: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  TREND: { label: "Trend", class: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  OPPORTUNITY: { label: "Opp", class: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
};

const SENTIMENT_CLASSES: Record<string, string> = {
  POSITIVE: "text-emerald-500",
  NEGATIVE: "text-red-500",
  NEUTRAL: "text-muted-foreground",
  MIXED: "text-amber-500",
};

// ── Main Component ───────────────────────────────────────────────────

export function EvidenceExplorer({ workspaceId, projectId, apiBaseUrl }: EvidenceExplorerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("themes");
  const [themes, setThemes] = useState<Theme[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedThemeId, setExpandedThemeId] = useState<string | null>(null);
  const [insightTypeFilter, setInsightTypeFilter] = useState("");

  const base = `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}`;

  // Data fetching
  const fetchThemes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/themes?limit=50`, { credentials: "include" });
      const json = await res.json();
      if (json.success) setThemes(json.data?.themes ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [base]);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "30", sortBy: "severity", sortOrder: "desc" });
    if (insightTypeFilter) params.set("type", insightTypeFilter);
    try {
      const res = await fetch(`${base}/insights?${params}`, { credentials: "include" });
      const json = await res.json();
      if (json.success) setInsights(json.data?.insights ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [base, insightTypeFilter]);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/feedback?limit=30&sortOrder=desc`, {
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) setFeedback(json.data?.feedbackItems ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    if (activeTab === "themes") fetchThemes();
    else if (activeTab === "insights") fetchInsights();
    else if (activeTab === "feedback") fetchFeedback();
  }, [activeTab, fetchThemes, fetchInsights, fetchFeedback]);

  // Drag handlers for evidence items
  const handleDragStart = (e: React.DragEvent, type: string, id: string, title: string) => {
    e.dataTransfer.setData("application/pm-evidence", JSON.stringify({ type, id, title }));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="border-border flex shrink-0 border-b">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-foreground border-b-2"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3 w-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
          </div>
        )}

        {!loading && activeTab === "themes" && (
          <ThemesList
            themes={themes}
            expandedId={expandedThemeId}
            onToggleExpand={(id) => setExpandedThemeId(expandedThemeId === id ? null : id)}
            onDragStart={handleDragStart}
          />
        )}

        {!loading && activeTab === "insights" && (
          <InsightsList
            insights={insights}
            typeFilter={insightTypeFilter}
            onTypeFilterChange={setInsightTypeFilter}
            onDragStart={handleDragStart}
          />
        )}

        {!loading && activeTab === "feedback" && (
          <FeedbackList items={feedback} onDragStart={handleDragStart} />
        )}

        {activeTab === "search" && (
          <SearchPanel
            query={searchQuery}
            onQueryChange={setSearchQuery}
            base={base}
            onDragStart={handleDragStart}
          />
        )}
      </div>
    </div>
  );
}

// ── Themes Tab ───────────────────────────────────────────────────────

function ThemesList({
  themes,
  expandedId,
  onToggleExpand,
  onDragStart,
}: {
  themes: Theme[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onDragStart: (e: React.DragEvent, type: string, id: string, title: string) => void;
}) {
  if (themes.length === 0) {
    return <EmptyState message="No themes yet. Run insight extraction to auto-generate themes." />;
  }

  return (
    <div className="p-1">
      {themes.map((theme) => (
        <div key={theme.id} className="mb-0.5">
          <button
            draggable
            onDragStart={(e) => onDragStart(e, "theme", theme.id, theme.title)}
            onClick={() => onToggleExpand(theme.id)}
            className="hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
          >
            <GripVertical className="text-muted-foreground/50 h-3 w-3 shrink-0 cursor-grab" />
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: theme.color ?? "#6b7280" }}
            />
            {expandedId === theme.id ? (
              <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
            )}
            <span className="flex-1 truncate font-medium">{theme.title}</span>
            <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 text-[10px]">
              {theme.feedbackCount}
            </span>
          </button>

          {expandedId === theme.id && (
            <div className="border-border ml-8 border-l py-1 pl-2">
              <p className="text-muted-foreground text-xs">
                {theme.feedbackCount} feedback items linked
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Insights Tab ─────────────────────────────────────────────────────

function InsightsList({
  insights,
  typeFilter,
  onTypeFilterChange,
  onDragStart,
}: {
  insights: Insight[];
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  onDragStart: (e: React.DragEvent, type: string, id: string, title: string) => void;
}) {
  return (
    <div>
      {/* Filter */}
      <div className="border-border border-b px-2 py-1.5">
        <select
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value)}
          className="border-border bg-background w-full rounded border px-2 py-1 text-xs"
        >
          <option value="">All types</option>
          {Object.entries(INSIGHT_TYPES).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {insights.length === 0 ? (
        <EmptyState message="No insights found." />
      ) : (
        <div className="p-1">
          {insights.map((insight) => {
            const typeConfig = INSIGHT_TYPES[insight.type] ?? INSIGHT_TYPES.OBSERVATION;
            const TrendIcon =
              insight.trend === "INCREASING"
                ? TrendingUp
                : insight.trend === "DECREASING"
                  ? TrendingDown
                  : Minus;

            return (
              <div
                key={insight.id}
                draggable
                onDragStart={(e) => onDragStart(e, "insight", insight.id, insight.title)}
                className="hover:bg-accent group mb-0.5 cursor-grab rounded px-2 py-1.5"
              >
                <div className="flex items-start gap-2">
                  <GripVertical className="text-muted-foreground/50 mt-0.5 h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded px-1 text-[10px] font-semibold ${typeConfig.class}`}
                      >
                        {typeConfig.label}
                      </span>
                      <span className="truncate text-xs font-medium">{insight.title}</span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px]">
                      {insight.description}
                    </p>
                    <div className="text-muted-foreground mt-1 flex items-center gap-2 text-[10px]">
                      <span>{insight.frequencyCount} mentions</span>
                      {insight.type === "PAIN_POINT" && (
                        <span className="flex items-center gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {insight.severityScore.toFixed(1)}
                        </span>
                      )}
                      <TrendIcon className="h-2.5 w-2.5" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Feedback Tab ─────────────────────────────────────────────────────

function FeedbackList({
  items,
  onDragStart,
}: {
  items: FeedbackItem[];
  onDragStart: (e: React.DragEvent, type: string, id: string, title: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyState message="No feedback items yet." />;
  }

  return (
    <div className="p-1">
      {items.map((item) => (
        <div
          key={item.id}
          draggable
          onDragStart={(e) => onDragStart(e, "feedback", item.id, item.content.slice(0, 50))}
          className="hover:bg-accent group mb-0.5 cursor-grab rounded px-2 py-1.5"
        >
          <div className="flex items-start gap-2">
            <GripVertical className="text-muted-foreground/50 mt-0.5 h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground line-clamp-3 text-xs">{item.content}</p>
              <div className="text-muted-foreground mt-1 flex items-center gap-2 text-[10px]">
                <span>{item.customerName ?? "Anonymous"}</span>
                {item.sentiment && (
                  <span className={SENTIMENT_CLASSES[item.sentiment] ?? ""}>
                    {item.sentiment.toLowerCase()}
                  </span>
                )}
                <span>{new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
              {item.segmentTags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.segmentTags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="bg-muted text-muted-foreground rounded px-1 text-[9px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Search Tab ───────────────────────────────────────────────────────

function SearchPanel({
  query,
  onQueryChange,
  base,
  onDragStart,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  base: string;
  onDragStart: (e: React.DragEvent, type: string, id: string, title: string) => void;
}) {
  const [results, setResults] = useState<
    Array<{ id: string; title: string; type: string; snippet: string }>
  >([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`${base}/query`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      const json = await res.json();
      if (json.success && json.data?.response) {
        // Parse response into a displayable result
        setResults([
          {
            id: "query-result",
            title: "Search Result",
            type: "query",
            snippet: json.data.response.slice(0, 200),
          },
        ]);
      }
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
    }
  }, [query, base]);

  return (
    <div className="p-2">
      <div className="flex gap-1">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search all evidence..."
          className="border-border bg-background placeholder:text-muted-foreground focus:ring-ring flex-1 rounded border px-2 py-1.5 text-xs outline-none focus:ring-1"
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-2 py-1.5 text-xs disabled:opacity-50"
        >
          {searching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Search className="h-3 w-3" />
          )}
        </button>
      </div>

      <div className="mt-2">
        {results.map((r) => (
          <div
            key={r.id}
            draggable
            onDragStart={(e) => onDragStart(e, r.type, r.id, r.title)}
            className="hover:bg-accent cursor-grab rounded px-2 py-1.5 text-xs"
          >
            <div className="font-medium">{r.title}</div>
            <p className="text-muted-foreground mt-0.5">{r.snippet}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return <div className="text-muted-foreground px-4 py-8 text-center text-xs">{message}</div>;
}
