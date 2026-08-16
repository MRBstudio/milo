import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetPrismaMock, type PrismaMock } from "../helpers/prisma";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prisma");
  return { prisma: createPrismaMock() };
});

const { prisma } = (await import("@/lib/prisma")) as unknown as { prisma: PrismaMock };
const { GET } = await import("@/app/api/passport/route");

function get(query: string): Request {
  return new Request(`http://localhost/api/passport${query}`);
}

describe("GET /api/passport", () => {
  beforeEach(() => resetPrismaMock(prisma));

  it("returns 400 without a phone", async () => {
    const res = await GET(get(""));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "BAD_REQUEST" });
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
  });

  it("reports exists: false for an unknown customer", async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    const res = await GET(get("?phone=09123456789"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exists: false });
  });

  it("reports exists: false when the customer has no passport", async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: "cust-1", passport: null });
    const res = await GET(get("?phone=09123456789"));
    expect(await res.json()).toEqual({ exists: false });
  });

  it("pads the traveler number to five digits and maps stamps", async () => {
    const at = new Date("2025-01-02T03:04:05.000Z");
    prisma.customer.findUnique.mockResolvedValue({
      id: "cust-1",
      passport: {
        travelerNumber: 42,
        stamps: [
          { collectedAt: at, drop: { name: "Bologna Drop", location: "Tehran" } },
        ],
      },
    });

    const res = await GET(get("?phone=09123456789"));
    const json = await res.json();

    expect(json).toEqual({
      exists: true,
      travelerNumber: "00042",
      foundingTraveler: true,
      stamps: [{ dropName: "Bologna Drop", location: "Tehran", at: at.toISOString() }],
    });
    expect(prisma.customer.findUnique).toHaveBeenCalledWith({
      where: { phone: "09123456789" },
      include: { passport: { include: { stamps: { include: { drop: true } } } } },
    });
  });

  it.each([
    [1, true],
    [100, true],
    [101, false],
    [12345, false],
  ])("marks traveler %i as founding=%s", async (travelerNumber, foundingTraveler) => {
    prisma.customer.findUnique.mockResolvedValue({
      id: "cust-1",
      passport: { travelerNumber, stamps: [] },
    });

    const json = await (await GET(get("?phone=09123456789"))).json();
    expect(json.foundingTraveler).toBe(foundingTraveler);
    expect(json.travelerNumber).toBe(String(travelerNumber).padStart(5, "0"));
  });
});
