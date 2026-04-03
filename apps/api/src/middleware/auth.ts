import type { WorkspaceRole } from "@pm-yc/auth";
import { extractApiKey, hashApiKey } from "@pm-yc/auth/api-key";
import { db } from "@pm-yc/db";
import type { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";

import { env } from "../env.js";

/**
 * Authenticated user attached to the request by auth middleware.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  /** Populated by workspace middleware, not auth middleware */
  workspaceRole?: WorkspaceRole;
}

/**
 * API key context attached to the request by API key auth.
 */
export interface ApiKeyContext {
  keyId: string;
  workspaceId: string;
  scopes: string[];
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      apiKey?: ApiKeyContext;
      workspaceId?: string;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

/**
 * JWT verification using the AUTH_SECRET (symmetric HS256).
 * NextAuth v5 signs JWTs with AUTH_SECRET using the `jose` library.
 */
async function verifyJwt(token: string) {
  const secret = new TextEncoder().encode(env.AUTH_SECRET);

  // NextAuth v5 uses a JWE (encrypted JWT) by default.
  // We use jose to decrypt then verify.
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });

  return payload as {
    sub?: string;
    email?: string;
    name?: string;
    workspaces?: Array<{ workspaceId: string; role: WorkspaceRole }>;
  };
}

/**
 * Middleware: Authenticate via JWT session token (from cookie or Authorization header).
 * Sets req.user on success.
 */
export async function authenticateJwt(req: Request, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ") && !authHeader.includes("pmyc_")) {
      token = authHeader.slice(7);
    }

    // Fall back to cookie (NextAuth session token)
    if (!token) {
      token =
        req.cookies?.["__Secure-authjs.session-token"] ?? req.cookies?.["authjs.session-token"];
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    const payload = await verifyJwt(token);

    if (!payload.sub) {
      res.status(401).json({
        success: false,
        error: { code: "INVALID_TOKEN", message: "Invalid session token" },
      });
      return;
    }

    req.user = {
      id: payload.sub,
      email: payload.email ?? "",
      name: payload.name ?? "",
    };

    next();
  } catch {
    res.status(401).json({
      success: false,
      error: { code: "INVALID_TOKEN", message: "Invalid or expired token" },
    });
  }
}

/**
 * Middleware: Authenticate via API key.
 * Looks for "Bearer pmyc_..." in Authorization header.
 * Sets req.apiKey on success.
 */
export async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const rawKey = extractApiKey(req.headers.authorization);
    if (!rawKey) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "API key required" },
      });
      return;
    }

    const keyHash = hashApiKey(rawKey);
    const apiKey = await db.apiKey.findUnique({
      where: { keyHash },
      include: { workspace: { select: { id: true } } },
    });

    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: { code: "INVALID_API_KEY", message: "Invalid API key" },
      });
      return;
    }

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      res.status(401).json({
        success: false,
        error: { code: "EXPIRED_API_KEY", message: "API key has expired" },
      });
      return;
    }

    // Update last used timestamp (fire-and-forget)
    db.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    req.apiKey = {
      keyId: apiKey.id,
      workspaceId: apiKey.workspaceId,
      scopes: apiKey.scopes,
    };

    next();
  } catch {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "API key verification failed" },
    });
  }
}

/**
 * Middleware: Authenticate via JWT OR API key.
 * Tries API key first (if present), then JWT.
 * At least one must succeed.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  // Check if this looks like an API key request
  const rawKey = extractApiKey(req.headers.authorization);
  if (rawKey) {
    return authenticateApiKey(req, res, next);
  }

  // Otherwise try JWT
  return authenticateJwt(req, res, next);
}
