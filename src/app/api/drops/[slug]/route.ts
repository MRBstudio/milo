import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, route } from "@/lib/http";

export const GET = route(
  "drops.get",
  async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const drop = await prisma.drop.findUnique({
      where: { slug },
      include: { items: { include: { menuItem: true } } },
    });
    if (!drop) throw new ApiError("NOT_FOUND", 404);
    return NextResponse.json({ drop });
  },
);
