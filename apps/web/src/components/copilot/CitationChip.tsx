"use client";

import { FileText, Lightbulb, GitBranch, Layers } from "lucide-react";

interface CitationChipProps {
  type: string;
  id: string;
  title: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  insight: {
    icon: Lightbulb,
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  spec: {
    icon: FileText,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  decision: {
    icon: GitBranch,
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  theme: {
    icon: Layers,
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  feedback: {
    icon: FileText,
    color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
  },
};

export function CitationChip({ type, title }: CitationChipProps) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.feedback!;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${config.color} cursor-pointer hover:opacity-80`}
    >
      <Icon className="h-2.5 w-2.5" />
      <span className="max-w-[120px] truncate">{title}</span>
    </span>
  );
}
