import { describe, expect, it } from "vitest";
import {
  parseCheckResult,
  parseExampleId,
  parseInvestigationId,
  parseObservation,
  parseSourceId,
  parseStatusChange,
  rejectClientStateChange
} from "./public-inputs";

describe("public Agent input validation", () => {
  it("rejects malformed runtime arguments instead of trusting TypeScript", () => {
    expect(() => parseExampleId({ id: "database" })).toThrow("invalid");
    expect(() => parseSourceId("../../LOG-ABC")).toThrow("invalid");
    expect(() => parseObservation(42)).toThrow("must be text");
    expect(() => parseCheckResult([], "done")).toThrow("must be text");
    expect(() => parseStatusChange("resolved", 42)).toThrow("must be text");
    expect(() => parseStatusChange("resolved", " ")).toThrow("cannot be empty");
    expect(() => parseInvestigationId("not-an-investigation")).toThrow("invalid");
  });

  it("accepts and normalizes valid public arguments", () => {
    expect(parseExampleId("database")).toBe("database");
    expect(parseSourceId("LOG-ABCDEF1234")).toBe("LOG-ABCDEF1234");
    expect(parseObservation("  observed fact  ")).toBe("observed fact");
    expect(parseCheckResult(" check-1 ", " healthy ")).toEqual({
      checkId: "check-1",
      result: "healthy"
    });
    expect(
      parseInvestigationId("11111111-1111-4111-8111-111111111111")
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("rejects generic client state replacement while allowing server updates", () => {
    expect(() => rejectClientStateChange({ id: "socket" })).toThrow(
      "Direct client state updates are disabled"
    );
    expect(() => rejectClientStateChange("server")).not.toThrow();
  });
});
