// apps/api/src/services/copilot/commands.ts

export interface DetectedCommand {
  type: string;
  label: string;
  promptSuffix: string;
  extractedParam?: string;
}

interface CommandPattern {
  type: string;
  label: string;
  pattern: RegExp;
  paramGroup?: number;
  promptSuffix: string;
}

const COMMAND_PATTERNS: CommandPattern[] = [
  {
    type: "user_feedback",
    label: "User feedback",
    pattern: /what\s+did\s+users?\s+say\s+about\s+(.+?)[\s?.!]*$/i,
    paramGroup: 1,
    promptSuffix: `Focus on direct user quotes and feedback. Group by sentiment. Cite specific feedback items and insights. Format as: main themes, supporting quotes, sentiment breakdown.`,
  },
  {
    type: "past_decisions",
    label: "Past decisions",
    pattern:
      /have\s+we\s+considered\s+this\s+before|have\s+we\s+already\s+(decided|discussed|looked\s+at)/i,
    promptSuffix: `Search the decision log and past specs for related work. For each match, explain: what was decided, when, the rationale, and the outcome. If nothing was found, say so clearly.`,
  },
  {
    type: "feedback_summary",
    label: "Feedback summary",
    pattern: /summarize\s+(last\s+month'?s?|recent|this\s+month'?s?)\s+feedback/i,
    promptSuffix: `Provide a structured summary: top themes (with counts), sentiment trends, emerging issues, and notable individual feedback items. Use a clear structure with headers.`,
  },
  {
    type: "interview_prep",
    label: "Interview prep",
    pattern: /prep\s+me\s+for\s+an?\s+interview\s+with\s+(.+?)[\s?.!]*$/i,
    paramGroup: 1,
    promptSuffix: `Generate interview questions organized by: (1) knowledge gaps we have about this persona, (2) validation of existing assumptions, (3) discovery of unmet needs. For each question, explain what insight it's designed to uncover.`,
  },
  {
    type: "churn_analysis",
    label: "Churn analysis",
    pattern: /why\s+are\s+users?\s+(churning|leaving|cancell?ing)/i,
    promptSuffix: `Cross-reference pain points with churn-related feedback. Organize by: (1) top churn drivers ranked by severity and frequency, (2) supporting evidence for each, (3) segments most affected, (4) recommended actions.`,
  },
  {
    type: "stakeholder_update",
    label: "Stakeholder update",
    pattern: /write\s+a?\s*stakeholder\s+update|draft\s+a?\s*(weekly|monthly)?\s*update/i,
    promptSuffix: `Draft a concise stakeholder update email. Include: (1) key decisions made, (2) opportunities shipped or in progress, (3) important user feedback trends, (4) risks or blockers. Keep it under 300 words. Professional tone.`,
  },
  {
    type: "competitive_brief",
    label: "Competitive brief",
    pattern: /(?:draft\s+a?\s*)?competitive\s+brief\s+(?:for|on|about)\s+(.+?)[\s?.!]*$/i,
    paramGroup: 1,
    promptSuffix: `Generate a competitive analysis brief. Include: (1) how users compare us, (2) areas where we're favorable vs unfavorable, (3) switching signals, (4) feature gaps, (5) recommended response. Cite specific competitor mentions from feedback.`,
  },
];

export function detectCommand(message: string): DetectedCommand | null {
  for (const cmd of COMMAND_PATTERNS) {
    const match = message.match(cmd.pattern);
    if (match) {
      return {
        type: cmd.type,
        label: cmd.label,
        promptSuffix: cmd.promptSuffix,
        extractedParam: cmd.paramGroup ? match[cmd.paramGroup]?.trim() : undefined,
      };
    }
  }
  return null;
}

/** List of commands for the frontend quick-action chips */
export const QUICK_COMMANDS = COMMAND_PATTERNS.map((c) => ({
  type: c.type,
  label: c.label,
}));
