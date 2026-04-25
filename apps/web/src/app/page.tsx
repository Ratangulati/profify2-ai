import Link from "next/link";
import { Layers, Bot, FileText, ArrowRight } from "lucide-react";

const FEATURES = [
  {
    icon: Layers,
    title: "Evidence Explorer",
    description:
      "Browse themes, insights, and raw feedback from customers. Every claim is traceable to a source.",
  },
  {
    icon: Bot,
    title: "AI Copilot",
    description:
      "Ask questions, challenge assumptions, and expand specs with cited answers backed by real evidence.",
  },
  {
    icon: FileText,
    title: "Spec Editor",
    description:
      "Write PRDs with slash commands and AI suggestions. Every section linked to supporting evidence.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-[#0a0a0a] text-white">
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-primary mb-4 text-[11px] font-semibold uppercase tracking-[0.2em]">
          Product Intelligence Platform
        </p>
        <h1 className="mb-6 max-w-2xl text-5xl font-bold leading-tight tracking-tight text-white">
          Turn user feedback into product decisions
        </h1>
        <p className="mb-10 max-w-xl text-xl leading-relaxed text-[#a1a1aa]">
          PM-YC synthesizes customer evidence, surfaces insights, and helps you write specs backed
          by real data.
        </p>
        <Link
          href="/workspace"
          className="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors"
        >
          Open Workspace
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* Feature highlights */}
      <section className="border-t border-white/10 px-6 py-16">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex flex-col gap-3">
              <div className="bg-primary/15 flex h-10 w-10 items-center justify-center rounded-lg">
                <Icon className="text-primary h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-[#a1a1aa]">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-8 py-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <span className="text-sm font-bold text-white">PM-YC</span>
          <span className="text-xs text-[#71717a]">Product Intelligence Platform</span>
        </div>
      </footer>
    </main>
  );
}
