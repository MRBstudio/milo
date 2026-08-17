import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

/** Validate Iranian phone number (09xx xxx xxxx) */
function validPhone(phone: string): boolean {
  return /^09\d{9}$/.test(phone);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const { dropId, name, phone, lines } = body as {
    dropId: string; name: string; phone: string;
    lines: { dropItemId: string; qty: number }[];
  };

  if (!dropId || !name || !phone || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  if (!validPhone(phone)) {
    return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const drop = await tx.drop.findUnique({ where: { id: dropId } });
      if (!drop) throw new Error("DROP_NOT_FOUND");
      if (drop.admission !== "OPEN") throw new Error("DROP_PAUSED");

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
      if (existing > 0) throw new Error("ALREADY_RESERVED");

      let total = 0;
      const lineData: { dropItemId: string; qty: number; unitPrice: number }[] = [];

       // Atomic inventory decrement — the no-oversell guard
       for (const line of lines) {
         if (!line.dropItemId || !line.qty || line.qty < 1) throw new Error("BAD_ITEM");

         const item = await tx.dropItem.findUnique({
           where: { id: line.dropItemId },
           include: { menuItem: true },
         });
         if (!item || item.dropId !== dropId) throw new Error("BAD_ITEM");
         if (!item.menuItem) throw new Error("BAD_ITEM");

         // Use a database-level lock to prevent race conditions
         const updated = await tx.$executeRaw`
           UPDATE "DropItem" 
           SET 
             "available" = "available" - ${line.qty},
             "reserved" = "reserved" + ${line.qty}
           WHERE 
             "id" = ${line.dropItemId} 
             AND "available" >= ${line.qty}
             FOR UPDATE
         `;
         
         if (updated === 0) throw new Error("SOLD_OUT");

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
  } catch (e: any) {
    const map: Record<string, number> = {
      DROP_NOT_FOUND: 404, DROP_PAUSED: 403, ALREADY_RESERVED: 409,
      SOLD_OUT: 409, BAD_ITEM: 400, INVALID_PHONE: 400,
    };
    const msg = e?.message ?? "ERROR";
    return NextResponse.json({ error: msg }, { status: map[msg] ?? 500 });
  }
}
