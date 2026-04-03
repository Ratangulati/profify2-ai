import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

/**
 * Derive a 256-bit key from AUTH_SECRET using scrypt.
 * Salt is stored alongside the ciphertext so each encryption is unique.
 */
function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, KEY_LENGTH);
}

/**
 * Encrypt a plaintext string (e.g. JSON-serialised OAuth tokens).
 * Returns a base64 string: salt(32) + iv(16) + tag(16) + ciphertext.
 */
export function encrypt(plaintext: string, secret: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypt a string produced by `encrypt()`.
 */
export function decrypt(encoded: string, secret: string): string {
  const buf = Buffer.from(encoded, "base64");

  const salt = buf.subarray(0, SALT_LENGTH);
  const iv = buf.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = buf.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = deriveKey(secret, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext) + decipher.final("utf8");
}

/** Encrypt an OAuthTokens object into a storable string. */
export function encryptTokens(tokens: Record<string, unknown>, secret: string): string {
  return encrypt(JSON.stringify(tokens), secret);
}

/** Decrypt a stored token string back into an object. */
export function decryptTokens<T = Record<string, unknown>>(encrypted: string, secret: string): T {
  return JSON.parse(decrypt(encrypted, secret)) as T;
}
