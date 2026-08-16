import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const drops = await prisma.drop.findMany({
    orderBy: { startsAt: "asc" },
    select: {
      id: true, name: true, slug: true, location: true,
      startsAt: true, endsAt: true, status: true, admission: true, storyLine: true,
    },
  });
  return NextResponse.json({ drops });
}
