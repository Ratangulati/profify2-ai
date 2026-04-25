"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { ChevronDown, Bell, Sun, Moon, Monitor, Search, User } from "lucide-react";

interface TopNavProps {
  workspaceId: string;
  projectId: string;
  workspaceName?: string;
  projectName?: string;
  onCommandPalette: () => void;
}

export function TopNav({
  workspaceId,
  projectId,
  workspaceName = "Workspace",
  projectName = "Project",
  onCommandPalette,
}: TopNavProps) {
  const { theme, setTheme } = useTheme();
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <header className="border-border bg-background flex h-11 shrink-0 items-center justify-between border-b px-3">
      {/* Left: breadcrumb */}
      <div className="flex items-center gap-1 text-sm">
        <button className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded px-2 py-1">
          {workspaceName}
          <ChevronDown className="h-3 w-3" />
        </button>
        <span className="text-muted-foreground">/</span>
        <button className="text-foreground hover:bg-accent flex items-center gap-1 rounded px-2 py-1 font-medium">
          {projectName}
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* Center: command palette trigger */}
      <button
        onClick={onCommandPalette}
        className="border-border/80 bg-muted/50 text-muted-foreground hover:bg-muted flex h-7 items-center gap-2 rounded-lg border px-3 text-xs"
      >
        <Search className="h-3 w-3" />
        <span>Search everything...</span>
        <kbd className="border-border bg-background rounded border px-1 text-[10px]">
          {"\u2318"}K
        </kbd>
      </button>

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={cycleTheme}
          className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded"
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="text-muted-foreground h-3.5 w-3.5" />
        </button>
        <button className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded">
          <Bell className="text-muted-foreground h-3.5 w-3.5" />
        </button>
        <button className="bg-primary/10 hover:bg-primary/20 ring-primary/30 flex h-7 w-7 items-center justify-center rounded-full ring-2">
          <User className="text-primary h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
