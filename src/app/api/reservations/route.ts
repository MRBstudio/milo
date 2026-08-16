import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { ApiError, errorResponse, jsonError, parseJson } from "@/lib/http";
import { isValidPhone } from "@/lib/validation";

export async function POST(req: Request) {
  const body = await parseJson<{
    dropId: string;
    name: string;
    phone: string;
    lines: { dropItemId: string; qty: number }[];
  }>(req);
  if (!body) return jsonError("BAD_REQUEST");

  const { dropId, name, phone, lines } = body;

  if (!dropId || !name || !phone || !Array.isArray(lines) || lines.length === 0) {
    return jsonError("BAD_REQUEST");
  }

  if (!isValidPhone(phone)) return jsonError("INVALID_PHONE");

  try {
    const order = await prisma.$transaction(async (tx) => {
      const drop = await tx.drop.findUnique({ where: { id: dropId } });
      if (!drop) throw new ApiError("DROP_NOT_FOUND");
      if (drop.admission !== "OPEN") throw new ApiError("DROP_PAUSED");

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
      if (existing > 0) throw new ApiError("ALREADY_RESERVED");

      let total = 0;
      const lineData: { dropItemId: string; qty: number; unitPrice: number }[] = [];

      // Atomic inventory decrement — the no-oversell guard
      for (const line of lines) {
        if (!line.dropItemId || !line.qty || line.qty < 1) throw new ApiError("BAD_ITEM");

        const item = await tx.dropItem.findUnique({
          where: { id: line.dropItemId },
          include: { menuItem: true },
        });
        if (!item || item.dropId !== dropId) throw new ApiError("BAD_ITEM");
        if (!item.menuItem) throw new ApiError("BAD_ITEM");

        const updated = await tx.dropItem.updateMany({
          where: { id: line.dropItemId, available: { gte: line.qty } },
          data: {
            available: { decrement: line.qty },
            reserved: { increment: line.qty },
          },
        });
        if (updated.count === 0) throw new ApiError("SOLD_OUT");

        total += item.menuItem.price * line.qty;
        lineData.push({ dropItemId: line.dropItemId, qty: line.qty, unitPrice: item.menuItem.price });
      }

      const code = "MILO-" + randomBytes(2).toString("hex").toUpperCase();

      return tx.order.create({
        data: {
          dropId, customerId: customer.id, total, code,
          lines: { create: lineData },
        },
      });
    });

    return NextResponse.json({ ok: true, code: order.code, total: order.total });
  } catch (e) {
    return errorResponse(e);
  }
}
