import { describe, expect, it } from "vitest";
import { evaluateRateLimit, rateLimitMessage } from "./rate-limit";

describe("sliding-window rate limits", () => {
  const rule = { limit: 3, windowMs: 60_000 };

  it("allows requests below the limit and discards expired events", () => {
    expect(evaluateRateLimit([1, 70_000, 80_000], 100_000, rule)).toEqual({
      allowed: true,
      activeTimestamps: [70_000, 80_000]
    });
  });

  it("rejects requests at the limit with a stable retry interval", () => {
    expect(evaluateRateLimit([50_000, 70_000, 90_000], 100_000, rule)).toEqual({
      allowed: false,
      activeTimestamps: [50_000, 70_000, 90_000],
      retryAfterSeconds: 10
    });
    expect(rateLimitMessage("model requests", 10)).toContain("Try again in 10 seconds");
  });
});
