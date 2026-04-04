"use client";

import { ChevronRight } from "lucide-react";

interface CommandChipsProps {
  onSelect: (command: string) => void;
}

const COMMANDS = [
  { label: "User feedback", prompt: "What did users say about " },
  { label: "Past decisions", prompt: "Have we considered this before?" },
  { label: "Feedback summary", prompt: "Summarize last month's feedback" },
  { label: "Interview prep", prompt: "Prep me for an interview with " },
  { label: "Churn analysis", prompt: "Why are users churning?" },
  { label: "Stakeholder update", prompt: "Write a stakeholder update" },
  { label: "Competitive brief", prompt: "Draft a competitive brief for " },
];

export function CommandChips({ onSelect }: CommandChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COMMANDS.map((cmd) => (
        <button
          key={cmd.label}
          onClick={() => onSelect(cmd.prompt)}
          className="border-border text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors"
        >
          <ChevronRight className="h-2.5 w-2.5" />
          {cmd.label}
        </button>
      ))}
    </div>
  );
}
