import { vi } from "vitest";

const MODELS = [
  "drop",
  "dropItem",
  "menuItem",
  "customer",
  "order",
  "orderLine",
  "passport",
  "passportCounter",
  "stamp",
] as const;

const METHODS = [
  "findUnique",
  "findFirst",
  "findMany",
  "create",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "count",
  "groupBy",
] as const;

type Model = (typeof MODELS)[number];
type Method = (typeof METHODS)[number];

export type PrismaMock = Record<Model, Record<Method, ReturnType<typeof vi.fn>>> & {
  $transaction: ReturnType<typeof vi.fn>;
};

/**
 * Deep mock of the Prisma client used by the API routes. `$transaction` invokes
 * its callback with the same mock, so assertions can target a single set of spies.
 */
export function createPrismaMock(): PrismaMock {
  const mock = {} as PrismaMock;
  for (const model of MODELS) {
    const methods = {} as Record<Method, ReturnType<typeof vi.fn>>;
    for (const method of METHODS) methods[method] = vi.fn();
    mock[model] = methods;
  }
  mock.$transaction = vi.fn(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: PrismaMock) => unknown)(mock) : arg,
  );
  return mock;
}

export function resetPrismaMock(mock: PrismaMock): void {
  for (const model of MODELS) {
    for (const method of METHODS) {
      mock[model][method].mockReset();
    }
  }
  mock.$transaction.mockReset();
  mock.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: PrismaMock) => unknown)(mock) : arg,
  );
}
