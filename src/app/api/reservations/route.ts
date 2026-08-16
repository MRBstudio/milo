import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { allow, clientIp, tooManyRequests } from "@/lib/rateLimit";
import { MAX_LINES, MAX_QTY_PER_ITEM, validId, validName, validPhone, validQty } from "@/lib/validation";

const ERROR_STATUS: Record<string, number> = {
  DROP_NOT_FOUND: 404,
  DROP_PAUSED: 403,
  ALREADY_RESERVED: 409,
  SOLD_OUT: 409,
  BAD_ITEM: 400,
  INVALID_PHONE: 400,
};

function pickupCode(): string {
  return "MILO-" + randomBytes(5).toString("hex").toUpperCase();
}

export async function POST(req: Request) {
  if (!allow(`reservations:${clientIp(req)}`, 10, 60_000)) return tooManyRequests();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const { dropId, name, phone, lines } = body as {
    dropId: unknown; name: unknown; phone: unknown; lines: unknown;
  };

  if (!validId(dropId) || !validName(name) || !Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  if (!validPhone(phone)) {
    return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });
  }

  // One line per item, integer quantities within per-item cap.
  const requested = new Map<string, number>();
  for (const line of lines as { dropItemId?: unknown; qty?: unknown }[]) {
    if (!line || typeof line !== "object") {
      return NextResponse.json({ error: "BAD_ITEM" }, { status: 400 });
    }
    if (!validId(line.dropItemId) || !validQty(line.qty)) {
      return NextResponse.json({ error: "BAD_ITEM" }, { status: 400 });
    }
    const total = (requested.get(line.dropItemId) ?? 0) + line.qty;
    if (total > MAX_QTY_PER_ITEM) {
      return NextResponse.json({ error: "BAD_ITEM" }, { status: 400 });
    }
    requested.set(line.dropItemId, total);
  }

  const customerName = name.trim();

  try {
    const order = await prisma.$transaction(async (tx) => {
      const drop = await tx.drop.findUnique({ where: { id: dropId } });
      if (!drop) throw new Error("DROP_NOT_FOUND");
      if (drop.admission !== "OPEN") throw new Error("DROP_PAUSED");

      // Upsert customer by phone
      const customer = await tx.customer.upsert({
        where: { phone },
        update: { name: customerName },
        create: { phone, name: customerName },
      });

      // One active reservation per phone per drop
      const existing = await tx.order.count({
        where: { dropId, customerId: customer.id, status: { in: ["RESERVED", "PAID"] } },
      });
      if (existing > 0) throw new Error("ALREADY_RESERVED");

      let total = 0;
      const lineData: { dropItemId: string; qty: number; unitPrice: number }[] = [];

      // Atomic inventory decrement — the no-oversell guard
      for (const [dropItemId, qty] of requested) {
        const item = await tx.dropItem.findUnique({
          where: { id: dropItemId },
          include: { menuItem: true },
        });
        if (!item || item.dropId !== dropId) throw new Error("BAD_ITEM");
        if (!item.menuItem) throw new Error("BAD_ITEM");

        const updated = await tx.dropItem.updateMany({
          where: { id: dropItemId, available: { gte: qty } },
          data: {
            available: { decrement: qty },
            reserved: { increment: qty },
          },
        });
        if (updated.count === 0) throw new Error("SOLD_OUT");

        total += item.menuItem.price * qty;
        lineData.push({ dropItemId, qty, unitPrice: item.menuItem.price });
      }

      return tx.order.create({
        data: {
          dropId, customerId: customer.id, total, code: pickupCode(),
          lines: { create: lineData },
        },
      });
    });

    return NextResponse.json({ ok: true, code: order.code, total: order.total });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERROR";
    const status = ERROR_STATUS[msg];
    if (!status) {
      console.error("reservation failed", e);
      return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
    }
    return NextResponse.json({ error: msg }, { status });
  }
}
