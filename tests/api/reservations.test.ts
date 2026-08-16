import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetPrismaMock, type PrismaMock } from "../helpers/prisma";
import { jsonRequest, rawRequest } from "../helpers/request";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prisma");
  return { prisma: createPrismaMock() };
});

const { prisma } = (await import("@/lib/prisma")) as unknown as { prisma: PrismaMock };
const { POST } = await import("@/app/api/reservations/route");

const VALID_PHONE = "09123456789";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    dropId: "drop-1",
    name: "Ali",
    phone: VALID_PHONE,
    lines: [{ dropItemId: "item-1", qty: 2 }],
    ...overrides,
  };
}

function happyPath() {
  prisma.drop.findUnique.mockResolvedValue({ id: "drop-1", admission: "OPEN" });
  prisma.customer.upsert.mockResolvedValue({ id: "cust-1", phone: VALID_PHONE });
  prisma.order.count.mockResolvedValue(0);
  prisma.dropItem.findUnique.mockResolvedValue({
    id: "item-1",
    dropId: "drop-1",
    menuItem: { price: 150 },
  });
  prisma.dropItem.updateMany.mockResolvedValue({ count: 1 });
  prisma.order.create.mockImplementation(async ({ data }: any) => ({
    id: "order-1",
    code: data.code,
    total: data.total,
  }));
}

describe("POST /api/reservations", () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
  });

  it("creates a reservation, prices lines from the menu item and returns the code", async () => {
    happyPath();

    const res = await POST(jsonRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.total).toBe(300);
    expect(json.code).toMatch(/^MILO-[0-9A-F]{4}$/);

    expect(prisma.dropItem.updateMany).toHaveBeenCalledWith({
      where: { id: "item-1", available: { gte: 2 } },
      data: { available: { decrement: 2 }, reserved: { increment: 2 } },
    });
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dropId: "drop-1",
          customerId: "cust-1",
          total: 300,
          lines: { create: [{ dropItemId: "item-1", qty: 2, unitPrice: 150 }] },
        }),
      }),
    );
  });

  it("sums the total across multiple lines", async () => {
    happyPath();
    prisma.dropItem.findUnique.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      dropId: "drop-1",
      menuItem: { price: where.id === "item-1" ? 150 : 40 },
    }));

    const res = await POST(
      jsonRequest(
        validBody({
          lines: [
            { dropItemId: "item-1", qty: 2 },
            { dropItemId: "item-2", qty: 3 },
          ],
        }),
      ),
    );

    expect((await res.json()).total).toBe(300 + 120);
    expect(prisma.dropItem.updateMany).toHaveBeenCalledTimes(2);
  });

  it("rejects unparsable JSON bodies", async () => {
    const res = await POST(rawRequest("not-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "BAD_REQUEST" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["missing dropId", { dropId: "" }],
    ["missing name", { name: "" }],
    ["missing phone", { phone: "" }],
    ["lines not an array", { lines: "x" }],
    ["empty lines", { lines: [] }],
  ])("rejects %s with BAD_REQUEST", async (_label, overrides) => {
    const res = await POST(jsonRequest(validBody(overrides)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "BAD_REQUEST" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(["12345678901", "0912345678", "091234567890", "+989123456789", "0812345678"])(
    "rejects invalid phone %s",
    async (phone) => {
      const res = await POST(jsonRequest(validBody({ phone })));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "INVALID_PHONE" });
    },
  );

  it("returns 404 when the drop does not exist", async () => {
    happyPath();
    prisma.drop.findUnique.mockResolvedValue(null);

    const res = await POST(jsonRequest(validBody()));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "DROP_NOT_FOUND" });
  });

  it("returns 403 when admission is paused", async () => {
    happyPath();
    prisma.drop.findUnique.mockResolvedValue({ id: "drop-1", admission: "PAUSED" });

    const res = await POST(jsonRequest(validBody()));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "DROP_PAUSED" });
    expect(prisma.customer.upsert).not.toHaveBeenCalled();
  });

  it("returns 409 when the phone already has an active order for the drop", async () => {
    happyPath();
    prisma.order.count.mockResolvedValue(1);

    const res = await POST(jsonRequest(validBody()));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "ALREADY_RESERVED" });
    expect(prisma.dropItem.updateMany).not.toHaveBeenCalled();
  });

  it("returns 409 SOLD_OUT when the inventory guard matches no row", async () => {
    happyPath();
    prisma.dropItem.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(jsonRequest(validBody()));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "SOLD_OUT" });
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it.each([
    ["qty below one", { lines: [{ dropItemId: "item-1", qty: 0 }] }],
    ["negative qty", { lines: [{ dropItemId: "item-1", qty: -1 }] }],
    ["missing dropItemId", { lines: [{ dropItemId: "", qty: 1 }] }],
  ])("returns 400 BAD_ITEM for %s", async (_label, overrides) => {
    happyPath();
    const res = await POST(jsonRequest(validBody(overrides)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "BAD_ITEM" });
  });

  it("returns 400 BAD_ITEM when the item belongs to another drop", async () => {
    happyPath();
    prisma.dropItem.findUnique.mockResolvedValue({
      id: "item-1",
      dropId: "other-drop",
      menuItem: { price: 10 },
    });

    const res = await POST(jsonRequest(validBody()));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "BAD_ITEM" });
  });

  it("returns 400 BAD_ITEM when the item has no menu item", async () => {
    happyPath();
    prisma.dropItem.findUnique.mockResolvedValue({ id: "item-1", dropId: "drop-1", menuItem: null });

    const res = await POST(jsonRequest(validBody()));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "BAD_ITEM" });
  });

  it("maps unknown failures to 500", async () => {
    happyPath();
    prisma.drop.findUnique.mockRejectedValue(new Error("DB_DOWN"));

    const res = await POST(jsonRequest(validBody()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "DB_DOWN" });
  });

  it("falls back to a generic ERROR when the failure carries no message", async () => {
    happyPath();
    prisma.drop.findUnique.mockRejectedValue({});

    const res = await POST(jsonRequest(validBody()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "ERROR" });
  });

  it("updates the customer name on repeat reservations", async () => {
    happyPath();

    await POST(jsonRequest(validBody({ name: "Sara" })));

    expect(prisma.customer.upsert).toHaveBeenCalledWith({
      where: { phone: VALID_PHONE },
      update: { name: "Sara" },
      create: { phone: VALID_PHONE, name: "Sara" },
    });
  });
});
