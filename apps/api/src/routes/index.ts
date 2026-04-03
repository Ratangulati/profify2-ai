import { Router } from "express";

import { authenticate } from "../middleware/auth.js";
import { enforceWorkspace, requireRole } from "../middleware/workspace.js";

import competitiveRouter from "./competitive.js";
import healthRouter from "./health.js";
import insightsRouter from "./insights.js";
import integrationsRouter from "./integrations.js";
import jtbdRouter from "./jtbd.js";
import opportunitiesRouter from "./opportunities.js";
import queryRouter from "./query.js";
import synthesisRouter from "./synthesis.js";
import trendsRouter from "./trends.js";

const router = Router();

// Public routes (no auth required)
router.use(healthRouter);

router.get("/", (_req, res) => {
  res.json({
    success: true,
    data: {
      name: "PM-YC API",
      version: "0.0.0",
    },
  });
});

/**
 * Protected routes example:
 *
 * All workspace-scoped routes follow this pattern:
 *   authenticate -> enforceWorkspace -> requireRole(resource, action)
 *
 * Usage:
 *   router.get(
 *     "/workspaces/:workspaceId/projects",
 *     authenticate,
 *     enforceWorkspace,
 *     requireRole("project", "read"),
 *     listProjectsHandler
 *   );
 *
 *   router.post(
 *     "/workspaces/:workspaceId/projects",
 *     authenticate,
 *     enforceWorkspace,
 *     requireRole("project", "create"),
 *     createProjectHandler
 *   );
 */

// Integration routes (OAuth callbacks are public, other routes are protected)
router.use(integrationsRouter);

// Insight routes
router.use(insightsRouter);

// Trend & sentiment routes
router.use(trendsRouter);

// Synthesis routes (contradictions & assumptions)
router.use(synthesisRouter);

// Competitive intelligence routes
router.use(competitiveRouter);

// JTBD & cross-project learning routes
router.use(jtbdRouter);

// Opportunity scoring & prioritization routes
router.use(opportunitiesRouter);

// Query engine routes
router.use(queryRouter);

// Example: GET /api/workspaces/:workspaceId/me
router.get(
  "/workspaces/:workspaceId/me",
  authenticate,
  enforceWorkspace,
  requireRole("workspace", "read"),
  (req, res) => {
    res.json({
      success: true,
      data: {
        user: req.user,
        workspaceId: req.workspaceId,
      },
    });
  },
);

export default router;
