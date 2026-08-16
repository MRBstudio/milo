import { timingSafeEqual } from "crypto";

const MIN_PASSWORD_LENGTH = 12;

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still compare to keep timing independent of the provided value's length.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * True when the request carries the operator password. Fails closed when
 * OPERATOR_PASSWORD is unset or too weak to be a real secret.
 */
export function isOperator(req: Request): boolean {
  const expected = process.env.OPERATOR_PASSWORD;
  if (!expected || expected.length < MIN_PASSWORD_LENGTH) return false;
  const provided = req.headers.get("x-operator-password");
  if (!provided) return false;
  return constantTimeEquals(provided, expected);
}
