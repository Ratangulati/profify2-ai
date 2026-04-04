"use client";

import { useEffect, useState, useCallback } from "react";
import { Command } from "cmdk";
import {
  FileText,
  Lightbulb,
  MessageSquare,
  Tag,
  Search,
  Zap,
  BarChart3,
  Users,
  Settings,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  workspaceId,
  projectId,
  apiBaseUrl,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  // Close on escape
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="border-border bg-popover relative w-full max-w-lg overflow-hidden rounded-xl border shadow-2xl">
        <Command className="flex flex-col" shouldFilter={true}>
          <div className="border-border flex items-center border-b px-3">
            <Search className="text-muted-foreground mr-2 h-4 w-4 shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search specs, insights, feedback, themes..."
              className="placeholder:text-muted-foreground flex h-11 w-full bg-transparent text-sm outline-none"
            />
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-1">
            <Command.Empty className="text-muted-foreground py-6 text-center text-sm">
              No results found.
            </Command.Empty>

            <Command.Group heading="Navigation" className="px-1 py-1.5">
              <CommandItem icon={FileText} label="Specs & PRDs" shortcut="G S" />
              <CommandItem icon={Lightbulb} label="Insights" shortcut="G I" />
              <CommandItem icon={MessageSquare} label="Feedback" shortcut="G F" />
              <CommandItem icon={Tag} label="Themes" shortcut="G T" />
              <CommandItem icon={BarChart3} label="Opportunities" shortcut="G O" />
              <CommandItem icon={Users} label="Competitors" shortcut="G C" />
            </Command.Group>

            <Command.Separator className="bg-border mx-1 my-1 h-px" />

            <Command.Group heading="Actions" className="px-1 py-1.5">
              <CommandItem icon={Zap} label="Generate PRD from opportunity" />
              <CommandItem icon={Lightbulb} label="Extract insights from feedback" />
              <CommandItem icon={Search} label="Ask a question about the project" />
              <CommandItem icon={Settings} label="Scoring configuration" />
            </Command.Group>
          </Command.List>

          <div className="border-border text-muted-foreground flex items-center justify-between border-t px-3 py-2 text-[10px]">
            <div className="flex gap-3">
              <span>
                <kbd className="border-border bg-muted rounded border px-1">↑↓</kbd> Navigate
              </span>
              <span>
                <kbd className="border-border bg-muted rounded border px-1">↵</kbd> Select
              </span>
              <span>
                <kbd className="border-border bg-muted rounded border px-1">Esc</kbd> Close
              </span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}

function CommandItem({
  icon: Icon,
  label,
  shortcut,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
}) {
  return (
    <Command.Item
      className="text-foreground aria-selected:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
      value={label}
    >
      <Icon className="text-muted-foreground h-4 w-4" />
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-muted-foreground text-[10px]">{shortcut}</span>}
    </Command.Item>
  );
}
