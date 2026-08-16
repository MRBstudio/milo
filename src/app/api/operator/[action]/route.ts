import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody, requireOperator, requireString, route } from "@/lib/http";
import { collectOrder } from "@/lib/orders";

export const POST = route(
  "operator.action",
  async (req: Request, { params }: { params: Promise<{ action: string }> }) => {
    requireOperator(req);
    const { action } = await params;
    const body = await parseJsonBody(req);

    // 1) Mark order PAID after physical card payment
    if (action === "pay") {
      const code = requireString(body, "code");
      const order = await prisma.order.findUnique({ where: { code } });
      if (!order) throw new ApiError("NOT_FOUND", 404);
      if (order.status !== "RESERVED") throw new ApiError(order.status, 409);

      await prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id: order.id, status: "RESERVED" },
          data: { status: "PAID", paidAt: new Date() },
        });
        if (claimed.count === 0) throw new ApiError("ALREADY_PAID", 409);

        // reserved -> sold
        const lines = await tx.orderLine.findMany({ where: { orderId: order.id } });
        for (const l of lines) {
          const moved = await tx.dropItem.updateMany({
            where: { id: l.dropItemId, reserved: { gte: l.qty } },
            data: { reserved: { decrement: l.qty }, sold: { increment: l.qty } },
          });
          if (moved.count === 0) {
            throw new ApiError("INVENTORY_CONFLICT", 409, {
              cause: new Error(`order ${order.id} line ${l.id}: dropItem ${l.dropItemId} has fewer than ${l.qty} reserved`),
            });
          }
        }
      });
      return NextResponse.json({ ok: true, code });
    }

    // 2) Collect / hand over (also mints the Passport stamp)
    if (action === "collect") {
      return collectOrder(requireString(body, "code"));
    }

    // 3) Cancel a reservation
    if (action === "cancel") {
      const code = requireString(body, "code");
      const order = await prisma.order.findUnique({ where: { code }, include: { lines: true } });
      if (!order) throw new ApiError("NOT_FOUND", 404);
      if (order.status !== "RESERVED") throw new ApiError(order.status, 409);

      await prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id: order.id, status: "RESERVED" },
          data: { status: "CANCELLED" },
        });
        if (claimed.count === 0) throw new ApiError("ALREADY_CANCELLED", 409);

        // Release inventory: reserved -> available
        for (const l of order.lines) {
          const released = await tx.dropItem.updateMany({
            where: { id: l.dropItemId, reserved: { gte: l.qty } },
            data: { reserved: { decrement: l.qty }, available: { increment: l.qty } },
          });
          if (released.count === 0) {
            throw new ApiError("INVENTORY_CONFLICT", 409, {
              cause: new Error(`order ${order.id} line ${l.id}: dropItem ${l.dropItemId} has fewer than ${l.qty} reserved`),
            });
          }
        }
      });
      return NextResponse.json({ ok: true, code });
    }

    // 4) Safe mode / reopen
    if (action === "safe-mode" || action === "reopen") {
      const dropId = requireString(body, "dropId");
      const updated = await prisma.drop.updateMany({
        where: { id: dropId },
        data: { admission: action === "safe-mode" ? "PAUSED" : "OPEN" },
      });
      if (updated.count === 0) throw new ApiError("NOT_FOUND", 404);
      return NextResponse.json({ ok: true });
    }

    throw new ApiError("UNKNOWN_ACTION", 400);
  },
);

// Live view for the operator dashboard
export const GET = route("operator.live", async (req: Request) => {
  requireOperator(req);
  const dropId = new URL(req.url).searchParams.get("dropId");
  if (!dropId) throw new ApiError("BAD_REQUEST", 400);

  const [items, statusCounts] = await Promise.all([
    prisma.dropItem.findMany({ where: { dropId }, include: { menuItem: true } }),
    prisma.order.groupBy({ by: ["status"], where: { dropId }, _count: { _all: true } }),
  ]);
  return NextResponse.json({ items, statusCounts });
});
