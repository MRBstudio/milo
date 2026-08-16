export type Msg = { text: string; ok?: boolean };

export type JsonResult<T> = { ok: boolean; status: number; data: T };

/** Fetch JSON, returning the parsed body alongside the response status. */
export async function requestJson<T = any>(
  url: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<JsonResult<T>> {
  const res = await fetch(url, {
    method: init?.method,
    headers: {
      ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}
