import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isOperator } from "@/lib/auth";
import { ApiError, errorResponse, jsonError, jsonOk, parseJson, searchParam } from "@/lib/http";
import { cancelOrder, collectOrder, payOrder } from "@/lib/orders";

type Body = { code?: string; dropId?: string };

const ORDER_ACTIONS: Record<string, (code: string) => Promise<string>> = {
  pay: payOrder,
  collect: collectOrder,
  cancel: cancelOrder,
};

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  if (!isOperator(req)) return jsonError("UNAUTHORIZED");
  const { action } = await params;
  const body = (await parseJson<Body>(req)) ?? {};

  try {
    const orderAction = ORDER_ACTIONS[action];
    if (orderAction) {
      if (!body.code) throw new ApiError("BAD_REQUEST");
      return jsonOk({ code: await orderAction(body.code) });
    }

    // Safe mode / reopen
    if (action === "safe-mode" || action === "reopen") {
      if (!body.dropId) throw new ApiError("BAD_REQUEST");
      await prisma.drop.update({
        where: { id: body.dropId },
        data: { admission: action === "safe-mode" ? "PAUSED" : "OPEN" },
      });
      return jsonOk();
    }

    return jsonError("UNKNOWN_ACTION");
  } catch (e) {
    return errorResponse(e);
  }
}

// Live view for the operator dashboard
export async function GET(req: Request) {
  if (!isOperator(req)) return jsonError("UNAUTHORIZED");
  const dropId = searchParam(req, "dropId");
  if (!dropId) return jsonError("BAD_REQUEST");

  const [items, statusCounts] = await Promise.all([
    prisma.dropItem.findMany({ where: { dropId }, include: { menuItem: true } }),
    prisma.order.groupBy({ by: ["status"], where: { dropId }, _count: { _all: true } }),
  ]);
  return NextResponse.json({ items, statusCounts });
}
