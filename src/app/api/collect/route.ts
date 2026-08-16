import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/collect — alternative entry point (delegates to operator logic)
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !body.code) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const pw = req.headers.get("x-operator-password");
  if (pw !== process.env.OPERATOR_PASSWORD) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const order = await prisma.order.findUnique({
    where: { code: body.code },
    include: { drop: true, lines: true },
  });
  if (!order) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (order.status !== "PAID")
    return NextResponse.json({ error: order.status }, { status: 409 });

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "COLLECTED", collectedAt: new Date() },
    });
    // Release inventory: reserved -> sold already done at pay step
    // just need to collect — no inventory change here

    // Passport stamp (idempotent)
    let passport = await tx.passport.findUnique({
      where: { customerId: order.customerId },
    });
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
  });

  return NextResponse.json({ ok: true, code: order.code });
}
