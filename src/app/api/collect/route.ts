import { parseJsonBody, requireOperator, requireString, route } from "@/lib/http";
import { collectOrder } from "@/lib/orders";

// POST /api/collect — alternative entry point (delegates to operator logic)
export const POST = route("collect", async (req: Request) => {
  requireOperator(req);
  const body = await parseJsonBody(req);
  const code = requireString(body, "code");
  return collectOrder(code);
});
