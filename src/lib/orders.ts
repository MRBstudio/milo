import type { Order, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/http";

type Tx = Prisma.TransactionClient;
type InventoryLine = { dropItemId: string; qty: number };

/**
 * Throw the right API error when an order is missing or not in the expected
 * status (the current status doubles as the error code, e.g. "COLLECTED").
 */
function requireStatus<T extends { status: OrderStatus }>(order: T | null, expected: OrderStatus): T {
  if (!order) throw new ApiError("NOT_FOUND");
  if (order.status !== expected) throw new ApiError(order.status);
  return order;
}

/** Move reserved inventory to "sold" (payment) or back to "available" (cancellation). */
async function moveReserved(tx: Tx, lines: InventoryLine[], to: "sold" | "available"): Promise<void> {
  for (const line of lines) {
    const decrement = { reserved: { decrement: line.qty } };
    await tx.dropItem.updateMany({
      where: { id: line.dropItemId, reserved: { gte: line.qty } },
      data:
        to === "sold"
          ? { ...decrement, sold: { increment: line.qty } }
          : { ...decrement, available: { increment: line.qty } },
    });
  }
}

/** Issue the customer's passport on first collection, then stamp it for the drop. */
async function stampPassport(tx: Tx, order: Order): Promise<void> {
  let passport = await tx.passport.findUnique({ where: { customerId: order.customerId } });
  if (!passport) {
    const counter = await tx.passportCounter.upsert({
      where: { id: "one" },
      update: { nextNumber: { increment: 1 } },
      create: { id: "one", nextNumber: 2 },
    });
    passport = await tx.passport.create({
      data: { customerId: order.customerId, travelerNumber: counter.nextNumber - 1 },
    });
  }
  await tx.stamp.upsert({
    where: { passportId_dropId: { passportId: passport.id, dropId: order.dropId } },
    create: { passportId: passport.id, dropId: order.dropId, orderId: order.id },
    update: {},
  });
}

/** Mark a reservation PAID and turn its reserved inventory into sold. */
export async function payOrder(code: string): Promise<string> {
  const paid = requireStatus(
    await prisma.order.findUnique({ where: { code }, include: { lines: true } }),
    "RESERVED",
  );

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: paid.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    await moveReserved(tx, paid.lines, "sold");
  });
  return paid.code;
}

/** Hand a paid order over and mint the passport stamp (idempotent per drop). */
export async function collectOrder(code: string): Promise<string> {
  const collected = requireStatus(await prisma.order.findUnique({ where: { code } }), "PAID");

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: collected.id },
      data: { status: "COLLECTED", collectedAt: new Date() },
    });
    await stampPassport(tx, collected);
  });
  return collected.code;
}

/** Cancel a reservation and release its inventory back to available. */
export async function cancelOrder(code: string): Promise<string> {
  const cancelled = requireStatus(
    await prisma.order.findUnique({ where: { code }, include: { lines: true } }),
    "RESERVED",
  );

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });
    await moveReserved(tx, cancelled.lines, "available");
  });
  return cancelled.code;
}
