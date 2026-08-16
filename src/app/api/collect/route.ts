import { isOperator } from "@/lib/auth";
import { errorResponse, jsonError, jsonOk, parseJson } from "@/lib/http";
import { collectOrder } from "@/lib/orders";

// POST /api/collect — alternative entry point for the collect action
export async function POST(req: Request) {
  if (!isOperator(req)) return jsonError("UNAUTHORIZED");

  const body = await parseJson<{ code?: string }>(req);
  if (!body?.code) return jsonError("BAD_REQUEST");

  try {
    return jsonOk({ code: await collectOrder(body.code) });
  } catch (e) {
    return errorResponse(e);
  }
}
