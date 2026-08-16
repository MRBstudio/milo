import { NextResponse } from "next/server";

/** Status code for each domain error code returned by the API. */
export const ERROR_STATUS: Record<string, number> = {
  BAD_REQUEST: 400,
  BAD_ITEM: 400,
  INVALID_PHONE: 400,
  UNKNOWN_ACTION: 400,
  UNAUTHORIZED: 401,
  DROP_PAUSED: 403,
  NOT_FOUND: 404,
  DROP_NOT_FOUND: 404,
  ALREADY_RESERVED: 409,
  SOLD_OUT: 409,
  RESERVED: 409,
  PAID: 409,
  COLLECTED: 409,
  CANCELLED: 409,
  EXPIRED: 409,
};

/** An error carrying an API error code, translated to a status by `errorResponse`. */
export class ApiError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "ApiError";
  }
}

export function jsonError(code: string, status?: number) {
  return NextResponse.json({ error: code }, { status: status ?? ERROR_STATUS[code] ?? 500 });
}

export function errorResponse(e: unknown) {
  const code = e instanceof Error ? e.message : "ERROR";
  return jsonError(code);
}

export function jsonOk<T extends object>(data?: T) {
  return NextResponse.json({ ok: true, ...(data ?? {}) });
}

/** Parse a JSON request body, returning null when absent or malformed. */
export async function parseJson<T>(req: Request): Promise<T | null> {
  return req.json().catch(() => null) as Promise<T | null>;
}

/** Read a required search param from the request URL. */
export function searchParam(req: Request, key: string): string | null {
  return new URL(req.url).searchParams.get(key);
}
