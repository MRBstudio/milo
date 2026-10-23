import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";

interface BasePassportResponse {
  exists: boolean;
}

interface ValidPassportResponse extends BasePassportResponse {
  exists: true;
  travelerNumber: string;
  foundingTraveler?: boolean;
  stamps: {
    dropName: string;
    location: string;
    at: Date;
  }[];
}

interface InvalidPassportResponse extends BasePassportResponse {
  exists: false;
}

interface ErrorResponse {
  error: string;
}

type PassportResponse = ValidPassportResponse | InvalidPassportResponse | ErrorResponse;

export async function GET(req: Request) {
  // Phone numbers are enumerable: keep lookups supervised so an open
  // indexer cannot walk the customer base. (Limits are per server instance.)
  const limiter = rateLimit(`passport-lookup:${clientIp(req)}`, { limit: 20, windowMs: 60_000 });
  if (!limiter.ok) {
    const response: ErrorResponse = { error: "TOO_MANY_REQUESTS" };
    return NextResponse.json(response, {
      status: 429,
      headers: { "Retry-After": String(limiter.retryAfterSeconds) },
    });
  }

  const phone = new URL(req.url).searchParams.get("phone");
  if (!phone) {
    const response: PassportResponse = { error: "BAD_REQUEST" };
    return NextResponse.json(response, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({
    where: { phone },
    include: { passport: { include: { stamps: { include: { drop: true } } } } },
  });
  
  if (!customer || !customer.passport) {
    const response: PassportResponse = { exists: false };
    return NextResponse.json(response);
  }
  
  const p = customer.passport;
  const response: PassportResponse = {
    exists: true,
    travelerNumber: String(p.travelerNumber).padStart(5, "0"),
    foundingTraveler: p.travelerNumber <= 100,
    stamps: p.stamps.map((s) => ({
      dropName: s.drop.name, 
      location: s.drop.location, 
      at: s.collectedAt,
    })),
  };
  
  return NextResponse.json(response);
}
