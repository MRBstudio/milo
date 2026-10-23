import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison that cannot throw.
 *
 * `timingSafeEqual` requires equal-length buffers. Comparing lengths first is
 * not enough: non-ASCII passwords can have more bytes than characters, so two
 * strings with equal `length` may still be given buffers of different sizes.
 * Compare byte lengths first, keep timing flat on a length mismatch, and only
 * then run the constant-time comparison.
 */
export function secureEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    // burn a comparison anyway so failure timing does not leak the length
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** Operator password check shared by /api/operator and /api/collect. */
export function isAuthorizedOperator(
  providedPassword: string | null,
  expectedPassword: string | undefined,
): boolean {
  if (!providedPassword || !expectedPassword) return false;
  return secureEqual(providedPassword, expectedPassword);
}
