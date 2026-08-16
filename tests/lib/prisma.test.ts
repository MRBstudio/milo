import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructed: unknown[] = [];

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      constructed.push(this);
    }
  },
}));

type GlobalWithPrisma = typeof globalThis & { prisma?: unknown };

describe("lib/prisma", () => {
  beforeEach(() => {
    constructed.length = 0;
    delete (globalThis as GlobalWithPrisma).prisma;
    vi.resetModules();
  });

  afterEach(() => {
    delete (globalThis as GlobalWithPrisma).prisma;
    vi.unstubAllEnvs();
  });

  it("caches the client on globalThis outside production so reloads reuse it", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const first = (await import("@/lib/prisma")).prisma;
    expect((globalThis as GlobalWithPrisma).prisma).toBe(first);

    vi.resetModules();
    const second = (await import("@/lib/prisma")).prisma;

    expect(second).toBe(first);
    expect(constructed).toHaveLength(1);
  });

  it("does not cache on globalThis in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const client = (await import("@/lib/prisma")).prisma;

    expect(client).toBeDefined();
    expect((globalThis as GlobalWithPrisma).prisma).toBeUndefined();
    expect(constructed).toHaveLength(1);
  });
});
