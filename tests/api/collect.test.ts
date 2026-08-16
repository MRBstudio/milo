import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPrismaMock, type PrismaMock } from "../helpers/prisma";
import { jsonRequest, rawRequest } from "../helpers/request";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prisma");
  return { prisma: createPrismaMock() };
});

const { prisma } = (await import("@/lib/prisma")) as unknown as { prisma: PrismaMock };
const { POST } = await import("@/app/api/collect/route");

const PASSWORD = "let-me-in";
const originalPassword = process.env.OPERATOR_PASSWORD;
process.env.OPERATOR_PASSWORD = PASSWORD;

afterAll(() => {
  if (originalPassword === undefined) delete process.env.OPERATOR_PASSWORD;
  else process.env.OPERATOR_PASSWORD = originalPassword;
});

const auth = { "x-operator-password": PASSWORD };

const paidOrder = {
  id: "order-1",
  code: "MILO-BEEF",
  status: "PAID",
  customerId: "cust-1",
  dropId: "drop-1",
};

describe("POST /api/collect", () => {
  beforeEach(() => resetPrismaMock(prisma));

  it("collects a paid order and stamps the existing passport", async () => {
    prisma.order.findUnique.mockResolvedValue(paidOrder);
    prisma.passport.findUnique.mockResolvedValue({ id: "pass-1" });

    const res = await POST(jsonRequest({ code: "MILO-BEEF" }, { headers: auth }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, code: "MILO-BEEF" });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "COLLECTED", collectedAt: expect.any(Date) },
    });
    expect(prisma.stamp.upsert).toHaveBeenCalledWith({
      where: { passportId_dropId: { passportId: "pass-1", dropId: "drop-1" } },
      create: { passportId: "pass-1", dropId: "drop-1", orderId: "order-1" },
      update: {},
    });
  });

  it("mints a passport when the customer has none", async () => {
    prisma.order.findUnique.mockResolvedValue(paidOrder);
    prisma.passport.findUnique.mockResolvedValue(null);
    prisma.passportCounter.upsert.mockResolvedValue({ id: "one", nextNumber: 6 });
    prisma.passport.create.mockResolvedValue({ id: "pass-new" });

    const res = await POST(jsonRequest({ code: "MILO-BEEF" }, { headers: auth }));

    expect(res.status).toBe(200);
    expect(prisma.passport.create).toHaveBeenCalledWith({
      data: { customerId: "cust-1", travelerNumber: 5 },
    });
  });

  it("checks the body before the password", async () => {
    const res = await POST(jsonRequest({}, { headers: auth }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "BAD_REQUEST" });
  });

  it("returns 400 for an unparsable body", async () => {
    const res = await POST(rawRequest("<html>", { headers: auth }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "BAD_REQUEST" });
  });

  it.each([
    ["no header", {}],
    ["wrong password", { "x-operator-password": "nope" }],
  ])("returns 401 with %s", async (_label, headers) => {
    const res = await POST(jsonRequest({ code: "MILO-BEEF" }, { headers }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown code", async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    const res = await POST(jsonRequest({ code: "MILO-ZZZZ" }, { headers: auth }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
  });

  it.each(["RESERVED", "COLLECTED", "CANCELLED"])(
    "returns 409 with the current status when the order is %s",
    async (status) => {
      prisma.order.findUnique.mockResolvedValue({ ...paidOrder, status });
      const res = await POST(jsonRequest({ code: "MILO-BEEF" }, { headers: auth }));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: status });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
