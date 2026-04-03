import { randomBytes, createHash } from "crypto";

const API_KEY_PREFIX = "pmyc";
const API_KEY_BYTE_LENGTH = 32;

export interface GeneratedApiKey {
  /** The full key to display to the user once (never stored) */
  rawKey: string;
  /** The prefix shown in UI for identification (e.g. "pmyc_a1b2...") */
  keyPrefix: string;
  /** SHA-256 hash stored in the database */
  keyHash: string;
}

/**
 * Generate a new API key with a prefix, raw key, and hash.
 * The raw key is shown to the user once and never stored.
 */
export function generateApiKey(): GeneratedApiKey {
  const bytes = randomBytes(API_KEY_BYTE_LENGTH);
  const secret = bytes.toString("base64url");
  const rawKey = `${API_KEY_PREFIX}_${secret}`;
  const keyPrefix = `${API_KEY_PREFIX}_${secret.slice(0, 8)}...`;
  const keyHash = hashApiKey(rawKey);

  return { rawKey, keyPrefix, keyHash };
}

/**
 * Hash an API key for storage/comparison using SHA-256.
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Verify a raw API key against a stored hash.
 */
export function verifyApiKey(rawKey: string, storedHash: string): boolean {
  const hash = hashApiKey(rawKey);
  // Constant-time comparison to prevent timing attacks
  if (hash.length !== storedHash.length) return false;
  let result = 0;
  for (let i = 0; i < hash.length; i++) {
    result |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Extract the raw key from an Authorization header.
 * Supports: "Bearer pmyc_..." or just "pmyc_..."
 */
export function extractApiKey(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();

  if (trimmed.startsWith("Bearer ")) {
    const token = trimmed.slice(7).trim();
    return token.startsWith(API_KEY_PREFIX + "_") ? token : null;
  }

  return trimmed.startsWith(API_KEY_PREFIX + "_") ? trimmed : null;
}
