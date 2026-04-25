"use client";

import type React from "react";
import {
  Layers,
  FileText,
  Lightbulb,
  Target,
  TrendingUp,
  BarChart2,
  Settings,
  User,
} from "lucide-react";

export type ViewKey =
  | "evidence"
  | "specs"
  | "insights"
  | "opportunities"
  | "trends"
  | "competitive";

interface NavItem {
  key: ViewKey;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "evidence", icon: Layers, label: "Evidence" },
  { key: "specs", icon: FileText, label: "Specs" },
  { key: "insights", icon: Lightbulb, label: "Insights" },
  { key: "opportunities", icon: Target, label: "Opportunities" },
  { key: "trends", icon: TrendingUp, label: "Trends" },
  { key: "competitive", icon: BarChart2, label: "Competitive" },
];

interface AppSidebarProps {
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
}

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  return (
    <aside className="bg-background border-border flex w-12 shrink-0 flex-col border-r">
      {/* Logo mark */}
      <div className="border-border flex h-11 shrink-0 items-center justify-center border-b">
        <span className="text-primary text-xs font-bold tracking-tight">PM</span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col items-center gap-1 py-2">
        {NAV_ITEMS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            title={label}
            onClick={() => onViewChange(key)}
            className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
              activeView === key
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </nav>

      {/* Bottom items */}
      <div className="flex flex-col items-center gap-1 py-2">
        <button
          title="Settings"
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md transition-colors"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          title="Account"
          className="bg-primary/10 hover:bg-primary/20 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
        >
          <User className="text-primary h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
