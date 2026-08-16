import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { ApiError, parseJsonBody, requireString, route } from "@/lib/http";

/** Validate Iranian phone number (09xx xxx xxxx) */
function validPhone(phone: string): boolean {
  return /^09\d{9}$/.test(phone);
}

type Line = { dropItemId: string; qty: number };

function parseLines(value: unknown): Line[] {
  if (!Array.isArray(value) || value.length === 0) throw new ApiError("BAD_REQUEST", 400);
  return value.map((line) => {
    const dropItemId = (line as Line)?.dropItemId;
    const qty = (line as Line)?.qty;
    if (typeof dropItemId !== "string" || !dropItemId || !Number.isInteger(qty) || qty < 1) {
      throw new ApiError("BAD_ITEM", 400);
    }
    return { dropItemId, qty };
  });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Picks a pickup code that is not taken, instead of letting a collision surface as a 500. */
async function unusedCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = "MILO-" + randomBytes(2).toString("hex").toUpperCase();
    const taken = await tx.order.findUnique({ where: { code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new ApiError("CODE_EXHAUSTED", 503);
}

export const POST = route("reservations.create", async (req: Request) => {
  const body = await parseJsonBody(req);
  const dropId = requireString(body, "dropId");
  const name = requireString(body, "name");
  const phone = requireString(body, "phone");
  const lines = parseLines(body.lines);

  if (!validPhone(phone)) throw new ApiError("INVALID_PHONE", 400);

  const order = await prisma.$transaction(async (tx) => {
    const drop = await tx.drop.findUnique({ where: { id: dropId } });
    if (!drop) throw new ApiError("DROP_NOT_FOUND", 404);
    if (drop.admission !== "OPEN") throw new ApiError("DROP_PAUSED", 403);

    // Upsert customer by phone
    const customer = await tx.customer.upsert({
      where: { phone },
      update: { name },
      create: { phone, name },
    });

    // One active reservation per phone per drop
    const existing = await tx.order.count({
      where: { dropId, customerId: customer.id, status: { in: ["RESERVED", "PAID"] } },
    });
    if (existing > 0) throw new ApiError("ALREADY_RESERVED", 409);

    let total = 0;
    const lineData: { dropItemId: string; qty: number; unitPrice: number }[] = [];

    // Atomic inventory decrement — the no-oversell guard
    for (const line of lines) {
      const item = await tx.dropItem.findUnique({
        where: { id: line.dropItemId },
        include: { menuItem: true },
      });
      if (!item || item.dropId !== dropId || !item.menuItem) throw new ApiError("BAD_ITEM", 400);

      const updated = await tx.dropItem.updateMany({
        where: { id: line.dropItemId, available: { gte: line.qty } },
        data: {
          available: { decrement: line.qty },
          reserved: { increment: line.qty },
        },
      });
      if (updated.count === 0) throw new ApiError("SOLD_OUT", 409);

      total += item.menuItem.price * line.qty;
      lineData.push({ dropItemId: line.dropItemId, qty: line.qty, unitPrice: item.menuItem.price });
    }

    const code = await unusedCode(tx);

    return tx.order.create({
      data: {
        dropId, customerId: customer.id, total, code,
        lines: { create: lineData },
      },
    });
  });

  return NextResponse.json({ ok: true, code: order.code, total: order.total });
});
