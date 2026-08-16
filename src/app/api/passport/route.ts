import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { allow, clientIp, tooManyRequests } from "@/lib/rateLimit";
import { validPhone } from "@/lib/validation";

export async function GET(req: Request) {
  if (!allow(`passport:${clientIp(req)}`, 10, 60_000)) return tooManyRequests();

  const phone = new URL(req.url).searchParams.get("phone");
  if (!validPhone(phone)) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const customer = await prisma.customer.findUnique({
    where: { phone },
    include: { passport: { include: { stamps: { include: { drop: true } } } } },
  });
  if (!customer || !customer.passport) {
    return NextResponse.json({ exists: false });
  }
  const p = customer.passport;
  return NextResponse.json({
    exists: true,
    travelerNumber: String(p.travelerNumber).padStart(5, "0"),
    foundingTraveler: p.travelerNumber <= 100,
    stamps: p.stamps.map((s) => ({
      dropName: s.drop.name, location: s.drop.location, at: s.collectedAt,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
