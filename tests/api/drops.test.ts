import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetPrismaMock, type PrismaMock } from "../helpers/prisma";
import { routeParams } from "../helpers/request";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prisma");
  return { prisma: createPrismaMock() };
});

const { prisma } = (await import("@/lib/prisma")) as unknown as { prisma: PrismaMock };
const { GET: listDrops } = await import("@/app/api/drops/route");
const { GET: getDrop } = await import("@/app/api/drops/[slug]/route");

describe("GET /api/drops", () => {
  beforeEach(() => resetPrismaMock(prisma));

  it("returns drops ordered by start time with the public field selection", async () => {
    const drops = [{ id: "drop-1", slug: "bologna", name: "Bologna Drop" }];
    prisma.drop.findMany.mockResolvedValue(drops);

    const res = await listDrops();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ drops });
    const args = prisma.drop.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ startsAt: "asc" });
    expect(args.select).not.toHaveProperty("items");
  });

  it("returns an empty list when there are no drops", async () => {
    prisma.drop.findMany.mockResolvedValue([]);
    expect(await (await listDrops()).json()).toEqual({ drops: [] });
  });
});

describe("GET /api/drops/[slug]", () => {
  beforeEach(() => resetPrismaMock(prisma));

  it("returns the drop with its items and menu items", async () => {
    const drop = { id: "drop-1", slug: "bologna", items: [{ id: "item-1", menuItem: { price: 10 } }] };
    prisma.drop.findUnique.mockResolvedValue(drop);

    const res = await getDrop(new Request("http://localhost/api/drops/bologna"), routeParams({ slug: "bologna" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ drop });
    expect(prisma.drop.findUnique).toHaveBeenCalledWith({
      where: { slug: "bologna" },
      include: { items: { include: { menuItem: true } } },
    });
  });

  it("returns 404 for an unknown slug", async () => {
    prisma.drop.findUnique.mockResolvedValue(null);

    const res = await getDrop(new Request("http://localhost/api/drops/nope"), routeParams({ slug: "nope" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
  });
});
