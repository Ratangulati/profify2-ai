import { describe, it, expect } from "vitest";

import { encrypt, decrypt, encryptTokens, decryptTokens } from "../src/encryption.js";

describe("encryption", () => {
  const secret = "test-secret-at-least-16-chars-long";

  describe("encrypt/decrypt", () => {
    it("round-trips a plaintext string", () => {
      const plaintext = "hello world";
      const encrypted = encrypt(plaintext, secret);
      expect(encrypted).not.toBe(plaintext);
      expect(decrypt(encrypted, secret)).toBe(plaintext);
    });

    it("produces different ciphertexts for the same input (random salt)", () => {
      const plaintext = "deterministic? no.";
      const a = encrypt(plaintext, secret);
      const b = encrypt(plaintext, secret);
      expect(a).not.toBe(b);
      // Both still decrypt to the same thing
      expect(decrypt(a, secret)).toBe(plaintext);
      expect(decrypt(b, secret)).toBe(plaintext);
    });

    it("fails to decrypt with the wrong secret", () => {
      const encrypted = encrypt("sensitive data", secret);
      expect(() => decrypt(encrypted, "wrong-secret-here-too")).toThrow();
    });

    it("handles empty string", () => {
      const encrypted = encrypt("", secret);
      expect(decrypt(encrypted, secret)).toBe("");
    });

    it("handles unicode and special characters", () => {
      const plaintext = "café ☕ 日本語 🚀 <script>alert('xss')</script>";
      const encrypted = encrypt(plaintext, secret);
      expect(decrypt(encrypted, secret)).toBe(plaintext);
    });
  });

  describe("encryptTokens/decryptTokens", () => {
    it("round-trips a token object", () => {
      const tokens = {
        accessToken: "xoxb-123-456",
        refreshToken: "xoxr-789",
        expiresAt: 1700000000,
      };

      const encrypted = encryptTokens(tokens, secret);
      const decrypted = decryptTokens<typeof tokens>(encrypted, secret);
      expect(decrypted).toEqual(tokens);
    });
  });
});
