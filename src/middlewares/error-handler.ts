import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/app-error";
import { env } from "../config/env";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  console.error("Unhandled error:", err);

  res.status(500).json({
    error:
      env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message || "Internal server error",
  });
}
