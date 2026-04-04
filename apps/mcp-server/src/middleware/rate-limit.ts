import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

import { env } from "../env.js";

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();
const WINDOW_MS = 60_000;

/**
 * Check rate limit for an API key. Throws McpError if exceeded.
 */
export function checkRateLimit(keyId: string): void {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let entry = windows.get(keyId);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(keyId, entry);
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= env.RATE_LIMIT_RPM) {
    const oldestInWindow = entry.timestamps[0]!;
    const retryAfter = Math.ceil((oldestInWindow + WINDOW_MS - now) / 1000);
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Rate limit exceeded (${env.RATE_LIMIT_RPM}/min). Retry after ${retryAfter}s.`,
    );
  }

  entry.timestamps.push(now);
}

/** Prune expired entries. */
export function pruneRateLimitEntries(): void {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, entry] of windows) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) windows.delete(key);
  }
}

/** Start periodic cleanup. Returns cleanup function. */
export function startRateLimitCleanup(): () => void {
  const interval = setInterval(pruneRateLimitEntries, WINDOW_MS);
  return () => clearInterval(interval);
}
