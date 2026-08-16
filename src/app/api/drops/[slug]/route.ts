import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const drop = await prisma.drop.findUnique({
    where: { slug },
    include: { items: { include: { menuItem: true } } },
  });
  if (!drop) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ drop });
}
