import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/http";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Issues the passport (creating one on first collection) and stamps the drop. */
async function stampPassport(tx: Tx, order: { id: string; customerId: string; dropId: string }) {
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

/**
 * Marks a PAID order COLLECTED and stamps the passport.
 * Status transitions are enforced inside the transaction so a concurrent
 * collect cannot double-collect the same order.
 */
export async function collectOrder(code: string) {
  const order = await prisma.order.findUnique({ where: { code } });
  if (!order) throw new ApiError("NOT_FOUND", 404);
  if (order.status !== "PAID") throw new ApiError(order.status, 409);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: "PAID" },
      data: { status: "COLLECTED", collectedAt: new Date() },
    });
    if (claimed.count === 0) throw new ApiError("ALREADY_COLLECTED", 409);
    await stampPassport(tx, order);
  });

  return NextResponse.json({ ok: true, code: order.code });
}
