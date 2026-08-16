import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, searchParam } from "@/lib/http";

export async function GET(req: Request) {
  const phone = searchParam(req, "phone");
  if (!phone) return jsonError("BAD_REQUEST");

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
  });
}
