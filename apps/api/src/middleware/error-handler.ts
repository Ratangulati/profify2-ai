import { ForbiddenError } from "@pm-yc/auth";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("[API Error]", err);

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.flatten(),
      },
    });
    return;
  }

  if (err instanceof ForbiddenError) {
    res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: err.message,
      },
    });
    return;
  }

  const status = err.status ?? err.statusCode ?? 500;
  const message = err.message ?? "Internal server error";

  res.status(status).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: status === 500 ? "Internal server error" : message,
    },
  });
};
