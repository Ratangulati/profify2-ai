import { env } from "../env.js";

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

/**
 * Build a deterministic cache key from tool name and params.
 */
export function cacheKey(tool: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${JSON.stringify(params[k])}`)
    .join("&");
  return `${tool}:${sorted}`;
}

/**
 * Get a cached value. Returns undefined if missing or expired.
 */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

/**
 * Set a cached value with optional TTL override (seconds).
 */
export function cacheSet(key: string, data: unknown, ttlSeconds?: number): void {
  const ttl = (ttlSeconds ?? env.CACHE_TTL_SECONDS) * 1000;
  store.set(key, { data, expiresAt: Date.now() + ttl });
}

/**
 * Invalidate all keys matching a prefix.
 */
export function cacheInvalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Prune expired entries. */
export function pruneCacheEntries(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

/** Start periodic cleanup. Returns cleanup function. */
export function startCacheCleanup(): () => void {
  const interval = setInterval(pruneCacheEntries, env.CACHE_TTL_SECONDS * 1000);
  return () => clearInterval(interval);
}
