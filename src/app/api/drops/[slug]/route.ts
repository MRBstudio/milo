import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const drop = await prisma.drop.findUnique({
    where: { slug },
    include: { items: { include: { menuItem: true } } },
  });
  if (!drop) return jsonError("NOT_FOUND");
  return NextResponse.json({ drop });
}
