import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { secureEqual, isAuthorizedOperator } from "@/lib/secure-compare";
import { rateLimit, resetRateLimiter } from "@/lib/rate-limit";

describe("secureEqual / isAuthorizedOperator", () => {
  it("accepts an exact match", () => {
    assert.equal(secureEqual("same-secret", "same-secret"), true);
    assert.equal(
      isAuthorizedOperator("pw-value", "pw-value"),
      true,
    );
  });

  it("rejects wrong passwords of equal and unequal length", () => {
    assert.equal(secureEqual("same-secret", "different-secret"), false);
    assert.equal(secureEqual("short", "a-much-longer-secret"), false);
    assert.equal(isAuthorizedOperator("pw-value", "another-pw-value"), false);
  });

  it("fails closed on missing values", () => {
    assert.equal(isAuthorizedOperator(null, "expected"), false);
    assert.equal(isAuthorizedOperator("provided", undefined), false);
    assert.equal(isAuthorizedOperator(null, undefined), false);
  });

  it("handles ascii-vs-multibyte length differences without throwing", () => {
    // "ñ".length is 1 in UTF-16 but 2 bytes in UTF-8 — timingSafeEqual must
    // never see mismatched buffer sizes.
    assert.equal(secureEqual("passñword", "password"), false);
    assert.equal(secureEqual("passñword", "passñword"), true);
  });
});

describe("rateLimit", () => {
  beforeEach(() => resetRateLimiter());

  it("allows requests inside the limit and rejects past it", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    let now = 1_000_000;
    assert.equal(rateLimit("test:a", opts, now).ok, true);
    assert.equal(rateLimit("test:a", opts, now).ok, true);
    const third = rateLimit("test:a", opts, now);
    assert.equal(third.ok, true);
    const fourth = rateLimit("test:a", opts, now);
    assert.equal(fourth.ok, false);
    assert.ok(fourth.retryAfterSeconds >= 1 && fourth.retryAfterSeconds <= 60);
  });

  it("opens a fresh window after expiry (fixed-window semantics)", () => {
    const opts = { limit: 2, windowMs: 5_000 };
    let now = 2_000_000;
    rateLimit("test:b", opts, now);
    rateLimit("test:b", opts, now);
    assert.equal(rateLimit("test:b", opts, now).ok, false);
    now += 5_001;
    assert.equal(rateLimit("test:b", opts, now).ok, true);
  });

  it("keys are isolated per client", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    let now = 3_000_000;
    assert.equal(rateLimit("test:ip1", opts, now).ok, true);
    assert.equal(rateLimit("test:ip2", opts, now).ok, true);
    assert.equal(rateLimit("test:ip1", opts, now).ok, false);
  });
});
