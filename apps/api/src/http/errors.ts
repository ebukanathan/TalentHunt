import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  const fail = (status: number, code: string, message: string, details?: unknown) => {
    response.status(status).json({ status: "error", code, message, ...(details ? { details } : {}) });
  };
  if (error instanceof HttpError) {
    fail(error.statusCode, error.code, error.message);
    return;
  }
  if (error instanceof ZodError) {
    fail(400, "VALIDATION_ERROR", "Invalid request parameters.", error.issues.map(issue => ({
      field: issue.path.map(String).join("."),
      message: issue.message,
    })));
    return;
  }
  const parserError = error as { status?: number; type?: string } | null;
  if (error instanceof URIError || (error instanceof SyntaxError && parserError?.status === 400)) {
    fail(400, "BAD_REQUEST", "Invalid request.");
    return;
  }
  if (parserError?.type === "entity.too.large") {
    fail(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    return;
  }
  if (error instanceof Prisma.PrismaClientInitializationError ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
       ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(error.code))) {
    fail(503, "SERVICE_UNAVAILABLE", "Database is temporarily unavailable.");
    return;
  }
  if (process.env.NODE_ENV !== "test") {
    console.error("Unhandled API error:", error instanceof Error ? error.name : "UnknownError");
  }
  fail(500, "INTERNAL_ERROR", "An unexpected error occurred.");
};
