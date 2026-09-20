import { describe, expect, it } from "vitest";
import { matchRunbook } from "./catalog";

describe("curated runbook matching", () => {
  it("matches missing environment-variable evidence", () => {
    const match = matchRunbook([
      "ERROR required environment variable PAYMENT_API_URL is not set"
    ]);

    expect(match?.runbook.id).toBe("environment-variables");
    expect(match?.matchedSignals).toContain("environment variable");
    expect(match?.matchedSignals).toContain("not set");
  });

  it("explains a deterministic database match", () => {
    const match = matchRunbook([
      "ERROR postgres connect ECONNREFUSED 10.0.4.21:5432"
    ]);

    expect(match?.runbook.id).toBe("database-connection");
    expect(match?.matchedSignals).toContain("postgres");
    expect(match?.matchedSignals).toContain("5432");
  });

  it("matches upstream timeout evidence", () => {
    const match = matchRunbook([
      "ERROR upstream payments.internal timed out after 5000ms HTTP 504"
    ]);

    expect(match?.runbook.id).toBe("upstream-connection");
    expect(match?.matchedSignals).toContain("upstream");
    expect(match?.matchedSignals).toContain("http 504");
  });

  it("allows an ambiguous incident to remain unmatched", () => {
    expect(matchRunbook(["request was slow once"])).toBeNull();
    expect(matchRunbook(["timed out"])).toBeNull();
  });
});
