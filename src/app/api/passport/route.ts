import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, route } from "@/lib/http";

export const GET = route("passport.get", async (req: Request) => {
  const phone = new URL(req.url).searchParams.get("phone");
  if (!phone) throw new ApiError("BAD_REQUEST", 400);

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
});
