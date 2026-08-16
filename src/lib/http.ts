import { NextResponse } from "next/server";

/** An error that maps to a specific HTTP status and a stable machine-readable code. */
export class ApiError extends Error {
  readonly status: number;

  constructor(code: string, status: number, options?: { cause?: unknown }) {
    super(code, options);
    this.name = "ApiError";
    this.status = status;
  }
}

export function jsonError(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

/**
 * Wraps a route handler so unexpected failures are logged with context and
 * answered with a generic 500 instead of leaking internals or bubbling up as an
 * unhandled rejection.
 */
export function route<Args extends unknown[]>(
  name: string,
  handler: (req: Request, ...args: Args) => Promise<Response>,
) {
  return async (req: Request, ...args: Args): Promise<Response> => {
    try {
      return await handler(req, ...args);
    } catch (err) {
      if (err instanceof ApiError) {
        console.warn(`[${name}] ${req.method} ${req.url} -> ${err.status} ${err.message}`, err.cause ?? "");
        return jsonError(err.message, err.status);
      }
      console.error(`[${name}] ${req.method} ${req.url} failed`, err);
      return jsonError("INTERNAL_ERROR", 500);
    }
  };
}

/** Parses a JSON body, distinguishing a malformed body from a missing field. */
export async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    throw new ApiError("INVALID_JSON", 400, { cause: err });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", 400);
  }
  return body as Record<string, unknown>;
}

export function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError("BAD_REQUEST", 400);
  }
  return value.trim();
}

/** Throws instead of silently rejecting every operator request when the password is not configured. */
export function requireOperator(req: Request): void {
  const expected = process.env.OPERATOR_PASSWORD;
  if (!expected) {
    throw new ApiError("SERVER_MISCONFIGURED", 500, {
      cause: new Error("OPERATOR_PASSWORD is not set"),
    });
  }
  if (req.headers.get("x-operator-password") !== expected) {
    throw new ApiError("UNAUTHORIZED", 401);
  }
}
