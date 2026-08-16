/** Error thrown by fetchJson for any non-2xx response or unreadable payload. */
export class RequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, status: number, options?: { cause?: unknown }) {
    super(code, options);
    this.name = "RequestError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Fetches JSON and turns transport, HTTP and parse failures into a RequestError
 * carrying the server's error code, so callers cannot mistake a failure for data.
 */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new RequestError("NETWORK_ERROR", 0, { cause: err });
  }

  let payload: unknown = null;
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (err) {
      if (res.ok) throw new RequestError("INVALID_RESPONSE", res.status, { cause: err });
    }
  }

  if (!res.ok) {
    const code =
      typeof payload === "object" && payload !== null && typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `HTTP_${res.status}`;
    throw new RequestError(code, res.status);
  }

  return payload as T;
}

export function errorMessage(err: unknown): string {
  const code = err instanceof RequestError ? err.code : null;
  switch (code) {
    case "NETWORK_ERROR":
      return "Connection failed. Check your network and try again.";
    case "SOLD_OUT":
      return "Sold out.";
    case "ALREADY_RESERVED":
      return "You already have a reservation for this drop.";
    case "DROP_PAUSED":
      return "Reservations are temporarily paused.";
    case "DROP_NOT_FOUND":
    case "NOT_FOUND":
      return "Not found.";
    case "INVALID_PHONE":
      return "Enter a valid phone number (09xxxxxxxxx).";
    case "INTERNAL_ERROR":
    case "SERVER_MISCONFIGURED":
      return "Something went wrong on our side. Please try again.";
    default:
      return code ?? (err instanceof Error ? err.message : "Something went wrong.");
  }
}
