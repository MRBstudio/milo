import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function authorized(req: Request): boolean {
  const pw = req.headers.get("x-operator-password");
  return pw === process.env.OPERATOR_PASSWORD;
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { action } = await params;
  const body = await req.json().catch(() => ({}));

  // 1) Mark order PAID after physical card payment
  if (action === "pay") {
    const { code } = body as { code: string };
    if (!code) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    const order = await prisma.order.findUnique({ where: { code } });
    if (!order) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (order.status !== "RESERVED")
      return NextResponse.json({ error: order.status }, { status: 409 });

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: "PAID", paidAt: new Date() },
      });
      // reserved -> sold
      const lines = await tx.orderLine.findMany({ where: { orderId: order.id } });
      for (const l of lines) {
        await tx.dropItem.updateMany({
          where: { id: l.dropItemId, reserved: { gte: l.qty } },
          data: { reserved: { decrement: l.qty }, sold: { increment: l.qty } },
        });
      }
    });
    return NextResponse.json({ ok: true, code });
  }

  // 2) Collect / hand over (also mints the Passport stamp)
  if (action === "collect") {
    const { code } = body as { code: string };
    if (!code) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    const order = await prisma.order.findUnique({ where: { code }, include: { drop: true } });
    if (!order) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (order.status !== "PAID")
      return NextResponse.json({ error: order.status }, { status: 409 });

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: "COLLECTED", collectedAt: new Date() },
      });
      // Passport stamp (idempotent via unique [passportId, dropId])
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
    return NextResponse.json({ ok: true, code });
  }

  // 3) Cancel a reservation
  if (action === "cancel") {
    const { code } = body as { code: string };
    if (!code) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    const order = await prisma.order.findUnique({
      where: { code },
      include: { lines: true },
    });
    if (!order) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (order.status !== "RESERVED")
      return NextResponse.json({ error: order.status }, { status: 409 });

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      });
      // Release inventory: reserved -> available
      for (const l of order.lines) {
        await tx.dropItem.updateMany({
          where: { id: l.dropItemId, reserved: { gte: l.qty } },
          data: { reserved: { decrement: l.qty }, available: { increment: l.qty } },
        });
      }
    });
    return NextResponse.json({ ok: true, code });
  }

  // 4) Safe mode / reopen
  if (action === "safe-mode" || action === "reopen") {
    const { dropId } = body as { dropId: string };
    if (!dropId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    await prisma.drop.update({
      where: { id: dropId },
      data: { admission: action === "safe-mode" ? "PAUSED" : "OPEN" },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
}

// Live view for the operator dashboard
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const dropId = new URL(req.url).searchParams.get("dropId");
  if (!dropId) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const [items, statusCounts] = await Promise.all([
    prisma.dropItem.findMany({ where: { dropId }, include: { menuItem: true } }),
    prisma.order.groupBy({ by: ["status"], where: { dropId }, _count: { _all: true } }),
  ]);
  return NextResponse.json({ items, statusCounts });
}
