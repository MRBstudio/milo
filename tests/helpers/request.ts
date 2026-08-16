export function jsonRequest(
  body: unknown,
  { headers = {}, url = "http://localhost/api", method = "POST" }: {
    headers?: Record<string, string>;
    url?: string;
    method?: string;
  } = {},
): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function rawRequest(
  body: string,
  { headers = {}, url = "http://localhost/api" }: {
    headers?: Record<string, string>;
    url?: string;
  } = {},
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

export function routeParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
