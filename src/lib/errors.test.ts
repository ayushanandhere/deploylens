import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  it("gives an actionable configuration error without leaking details", () => {
    const message = getErrorMessage(
      new Error("Unauthorized: missing Workers AI account token secret-value")
    );

    expect(message).toContain("authenticate Wrangler");
    expect(message).not.toContain("secret-value");
  });

  it("distinguishes connection failures", () => {
    expect(getErrorMessage(new Error("WebSocket closed"))).toContain(
      "connection"
    );
  });

  it("uses a safe generic message for unknown failures", () => {
    expect(getErrorMessage({ internal: "sensitive" })).toContain(
      "could not complete"
    );
  });

  it("surfaces a useful temporary rate-limit message", () => {
    expect(getErrorMessage(new Error("Rate limit reached"))).toContain(
      "temporary rate limit"
    );
  });
});
