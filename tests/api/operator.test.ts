import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPrismaMock, type PrismaMock } from "../helpers/prisma";
import { jsonRequest, rawRequest, routeParams } from "../helpers/request";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prisma");
  return { prisma: createPrismaMock() };
});

const { prisma } = (await import("@/lib/prisma")) as unknown as { prisma: PrismaMock };
const { POST, GET } = await import("@/app/api/operator/[action]/route");

const PASSWORD = "let-me-in";
const originalPassword = process.env.OPERATOR_PASSWORD;
process.env.OPERATOR_PASSWORD = PASSWORD;

afterAll(() => {
  if (originalPassword === undefined) delete process.env.OPERATOR_PASSWORD;
  else process.env.OPERATOR_PASSWORD = originalPassword;
});

const auth = { "x-operator-password": PASSWORD };

describe("POST /api/operator/[action] authorization", () => {
  beforeEach(() => resetPrismaMock(prisma));

  it.each([
    ["no header", {}],
    ["wrong password", { "x-operator-password": "nope" }],
  ])("returns 401 with %s", async (_label, headers) => {
    const res = await POST(jsonRequest({ code: "MILO-AAAA" }, { headers }), routeParams({ action: "pay" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown action", async () => {
    const res = await POST(jsonRequest({}, { headers: auth }), routeParams({ action: "explode" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "UNKNOWN_ACTION" });
  });

  it("treats an unparsable body as empty and reports BAD_REQUEST", async () => {
    const res = await POST(rawRequest("{{", { headers: auth }), routeParams({ action: "pay" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "BAD_REQUEST" });
  });
});

describe("POST /api/operator/pay", () => {
  beforeEach(() => resetPrismaMock(prisma));

  it("marks the order PAID and moves reserved inventory to sold", async () => {
    prisma.order.findUnique.mockResolvedValue({ id: "order-1", code: "MILO-AAAA", status: "RESERVED" });
    prisma.orderLine.findMany.mockResolvedValue([
      { dropItemId: "item-1", qty: 2 },
      { dropItemId: "item-2", qty: 1 },
    ]);

    const res = await POST(
      jsonRequest({ code: "MILO-AAAA" }, { headers: auth }),
      routeParams({ action: "pay" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, code: "MILO-AAAA" });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "PAID", paidAt: expect.any(Date) },
    });
    expect(prisma.dropItem.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "item-1", reserved: { gte: 2 } },
      data: { reserved: { decrement: 2 }, sold: { increment: 2 } },
    });
    expect(prisma.dropItem.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "item-2", reserved: { gte: 1 } },
      data: { reserved: { decrement: 1 }, sold: { increment: 1 } },
    });
  });

  it("returns 400 without a code", async () => {
    const res = await POST(jsonRequest({}, { headers: auth }), routeParams({ action: "pay" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "BAD_REQUEST" });
  });

  it("returns 404 for an unknown code", async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    const res = await POST(jsonRequest({ code: "MILO-ZZZZ" }, { headers: auth }), routeParams({ action: "pay" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
  });

  it.each(["PAID", "COLLECTED", "CANCELLED"])(
    "returns 409 with the current status when the order is %s",
    async (status) => {
      prisma.order.findUnique.mockResolvedValue({ id: "order-1", code: "MILO-AAAA", status });
      const res = await POST(
        jsonRequest({ code: "MILO-AAAA" }, { headers: auth }),
        routeParams({ action: "pay" }),
      );
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: status });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});

describe("POST /api/operator/collect", () => {
  beforeEach(() => resetPrismaMock(prisma));

  it("collects the order and stamps an existing passport", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      code: "MILO-AAAA",
      status: "PAID",
      customerId: "cust-1",
      dropId: "drop-1",
    });
    prisma.passport.findUnique.mockResolvedValue({ id: "pass-1", travelerNumber: 7 });

    const res = await POST(
      jsonRequest({ code: "MILO-AAAA" }, { headers: auth }),
      routeParams({ action: "collect" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, code: "MILO-AAAA" });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "COLLECTED", collectedAt: expect.any(Date) },
    });
    expect(prisma.passportCounter.upsert).not.toHaveBeenCalled();
    expect(prisma.stamp.upsert).toHaveBeenCalledWith({
      where: { passportId_dropId: { passportId: "pass-1", dropId: "drop-1" } },
      create: { passportId: "pass-1", dropId: "drop-1", orderId: "order-1" },
      update: {},
    });
  });

  it("mints a passport with the pre-increment traveler number for a first-time customer", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      code: "MILO-AAAA",
      status: "PAID",
      customerId: "cust-1",
      dropId: "drop-1",
    });
    prisma.passport.findUnique.mockResolvedValue(null);
    prisma.passportCounter.upsert.mockResolvedValue({ id: "one", nextNumber: 42 });
    prisma.passport.create.mockResolvedValue({ id: "pass-new", travelerNumber: 41 });

    const res = await POST(
      jsonRequest({ code: "MILO-AAAA" }, { headers: auth }),
      routeParams({ action: "collect" }),
    );

    expect(res.status).toBe(200);
    expect(prisma.passportCounter.upsert).toHaveBeenCalledWith({
      where: { id: "one" },
      update: { nextNumber: { increment: 1 } },
      create: { id: "one", nextNumber: 2 },
    });
    expect(prisma.passport.create).toHaveBeenCalledWith({
      data: { customerId: "cust-1", travelerNumber: 41 },
    });
    expect(prisma.stamp.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ passportId: "pass-new" }) }),
    );
  });

  it("returns 409 when the order is not PAID", async () => {
    prisma.order.findUnique.mockResolvedValue({ id: "order-1", status: "RESERVED" });
    const res = await POST(
      jsonRequest({ code: "MILO-AAAA" }, { headers: auth }),
      routeParams({ action: "collect" }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "RESERVED" });
  });

  it("returns 404 for an unknown code and 400 without a code", async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    const notFound = await POST(
      jsonRequest({ code: "MILO-ZZZZ" }, { headers: auth }),
      routeParams({ action: "collect" }),
    );
    expect(notFound.status).toBe(404);

    const badRequest = await POST(jsonRequest({}, { headers: auth }), routeParams({ action: "collect" }));
    expect(badRequest.status).toBe(400);
    expect(await badRequest.json()).toEqual({ error: "BAD_REQUEST" });
  });
});

describe("POST /api/operator/cancel", () => {
  beforeEach(() => resetPrismaMock(prisma));

  it("cancels the order and returns reserved inventory to available", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      code: "MILO-AAAA",
      status: "RESERVED",
      lines: [
        { dropItemId: "item-1", qty: 3 },
        { dropItemId: "item-2", qty: 1 },
      ],
    });

    const res = await POST(
      jsonRequest({ code: "MILO-AAAA" }, { headers: auth }),
      routeParams({ action: "cancel" }),
    );

    expect(res.status).toBe(200);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "CANCELLED" },
    });
    expect(prisma.dropItem.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "item-1", reserved: { gte: 3 } },
      data: { reserved: { decrement: 3 }, available: { increment: 3 } },
    });
    expect(prisma.dropItem.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "item-2", reserved: { gte: 1 } },
      data: { reserved: { decrement: 1 }, available: { increment: 1 } },
    });
  });

  it("refuses to cancel an order that is no longer RESERVED", async () => {
    prisma.order.findUnique.mockResolvedValue({ id: "order-1", status: "COLLECTED", lines: [] });
    const res = await POST(
      jsonRequest({ code: "MILO-AAAA" }, { headers: auth }),
      routeParams({ action: "cancel" }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "COLLECTED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 400 without a code and 404 for an unknown code", async () => {
    const badRequest = await POST(jsonRequest({}, { headers: auth }), routeParams({ action: "cancel" }));
    expect(badRequest.status).toBe(400);

    prisma.order.findUnique.mockResolvedValue(null);
    const notFound = await POST(
      jsonRequest({ code: "MILO-ZZZZ" }, { headers: auth }),
      routeParams({ action: "cancel" }),
    );
    expect(notFound.status).toBe(404);
  });
});

describe("POST /api/operator/safe-mode and reopen", () => {
  beforeEach(() => resetPrismaMock(prisma));

  it.each([
    ["safe-mode", "PAUSED"],
    ["reopen", "OPEN"],
  ])("%s sets admission to %s", async (action, admission) => {
    const res = await POST(
      jsonRequest({ dropId: "drop-1" }, { headers: auth }),
      routeParams({ action }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prisma.drop.update).toHaveBeenCalledWith({
      where: { id: "drop-1" },
      data: { admission },
    });
  });

  it("returns 400 without a dropId", async () => {
    const res = await POST(jsonRequest({}, { headers: auth }), routeParams({ action: "safe-mode" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "BAD_REQUEST" });
    expect(prisma.drop.update).not.toHaveBeenCalled();
  });
});

describe("GET /api/operator/[action]", () => {
  beforeEach(() => resetPrismaMock(prisma));

  it("returns items and status counts for a drop", async () => {
    const items = [{ id: "item-1", menuItem: { name: "Mortadella" } }];
    const statusCounts = [{ status: "RESERVED", _count: { _all: 2 } }];
    prisma.dropItem.findMany.mockResolvedValue(items);
    prisma.order.groupBy.mockResolvedValue(statusCounts);

    const res = await GET(
      new Request("http://localhost/api/operator/live?dropId=drop-1", { headers: auth }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items, statusCounts });
    expect(prisma.dropItem.findMany).toHaveBeenCalledWith({
      where: { dropId: "drop-1" },
      include: { menuItem: true },
    });
    expect(prisma.order.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      where: { dropId: "drop-1" },
      _count: { _all: true },
    });
  });

  it("returns 401 when unauthorized", async () => {
    const res = await GET(new Request("http://localhost/api/operator/live?dropId=drop-1"));
    expect(res.status).toBe(401);
    expect(prisma.dropItem.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 without a dropId", async () => {
    const res = await GET(new Request("http://localhost/api/operator/live", { headers: auth }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "BAD_REQUEST" });
  });
});
