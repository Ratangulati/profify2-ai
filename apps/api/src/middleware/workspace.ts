import { requirePermission, type Action, type Resource, type WorkspaceRole } from "@pm-yc/auth";
import { ForbiddenError } from "@pm-yc/auth";
import { db } from "@pm-yc/db";
import type { Request, Response, NextFunction } from "express";

/**
 * Extract workspace ID from the request.
 * Supports: URL param (:workspaceId), header (x-workspace-id), or query param.
 */
function getWorkspaceId(req: Request): string | undefined {
  return (
    (req.params.workspaceId as string) ??
    (req.headers["x-workspace-id"] as string) ??
    (req.query.workspaceId as string) ??
    undefined
  );
}

/**
 * Middleware: Enforce workspace-level tenant isolation.
 * Resolves the workspace from the request, verifies the user is a member,
 * and attaches their role to req.user.workspaceRole.
 *
 * For API key auth, the workspace is already known from the key.
 */
export async function enforceWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    // API key auth: workspace is already set
    if (req.apiKey) {
      // Attach workspace context for downstream use
      req.workspaceId = req.apiKey.workspaceId;
      next();
      return;
    }

    // JWT auth: need user + workspace ID
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_WORKSPACE", message: "Workspace ID is required" },
      });
      return;
    }

    // Look up the user's membership in this workspace
    const membership = await db.workspaceMembership.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId,
        },
      },
    });

    if (!membership) {
      res.status(403).json({
        success: false,
        error: { code: "NOT_A_MEMBER", message: "You are not a member of this workspace" },
      });
      return;
    }

    req.user.workspaceRole = membership.role as WorkspaceRole;
    req.workspaceId = workspaceId;

    next();
  } catch {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Workspace verification failed" },
    });
  }
}

/**
 * Middleware factory: Check that the current user has permission
 * for a specific action on a resource.
 *
 * Must be used AFTER authenticate + enforceWorkspace.
 */
export function requireRole(resource: Resource, action: Action) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // API key auth: check scope instead of role
      if (req.apiKey) {
        const requiredScope = `${resource}:${action}`;
        const hasScope =
          req.apiKey.scopes.length === 0 || // Empty scopes = full access
          req.apiKey.scopes.includes(requiredScope) ||
          req.apiKey.scopes.includes(`${resource}:*`) ||
          req.apiKey.scopes.includes("*");

        if (!hasScope) {
          res.status(403).json({
            success: false,
            error: {
              code: "INSUFFICIENT_SCOPE",
              message: `API key lacks scope '${requiredScope}'`,
            },
          });
          return;
        }

        next();
        return;
      }

      // JWT auth: check RBAC
      if (!req.user?.workspaceRole) {
        res.status(403).json({
          success: false,
          error: { code: "FORBIDDEN", message: "No workspace role assigned" },
        });
        return;
      }

      requirePermission(req.user.workspaceRole, resource, action);
      next();
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.status(403).json({
          success: false,
          error: { code: "FORBIDDEN", message: err.message },
        });
        return;
      }
      next(err);
    }
  };
}
