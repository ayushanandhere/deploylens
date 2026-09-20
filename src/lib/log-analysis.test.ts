import { describe, expect, it } from "vitest";
import {
  MAX_LOG_CHARACTERS,
  MAX_LOG_LINES,
  analysisToEvidence,
  analyzeLogText,
  validateLogSubmission
} from "./log-analysis";

describe("deterministic log analysis", () => {
  it("preserves source line references and counts repeated error patterns", () => {
    const text = [
      "2026-09-20T14:32:10.000Z INFO worker started",
      "2026-09-20T14:32:11.000Z ERROR upstream unavailable HTTP 503",
      "an unrecognized diagnostic line",
      "2026-09-20T14:32:12.000Z ERROR upstream unavailable HTTP 503",
      "2026-09-20T14:32:13.000Z ERROR upstream unavailable HTTP 503"
    ].join("\n");

    const analysis = analyzeLogText("LOG-TEST", text);

    expect(analysis.timestamps).toHaveLength(4);
    expect(analysis.errorLines.map((item) => item.line)).toEqual([2, 4, 5]);
    expect(analysis.errorCodes).toEqual([
      { code: "HTTP 503", lines: [2, 4, 5] }
    ]);
    expect(analysis.repeatedPatterns).toEqual([
      {
        pattern: "ERROR upstream unavailable HTTP 503",
        count: 3,
        lines: [2, 4, 5]
      }
    ]);
    expect(analysis.unrecognizedLines.map((item) => item.line)).toEqual([1, 3]);

    const evidence = analysisToEvidence(
      {
        sourceId: "LOG-TEST",
        label: "test.log",
        lineCount: 5,
        createdAt: "2026-09-20T00:00:00.000Z"
      },
      analysis,
      () => "fixed"
    );
    expect(evidence[0]?.reference).toEqual({ sourceId: "LOG-TEST", line: 2 });
    expect(evidence.at(-1)?.relatedLines).toEqual([2, 4, 5]);
  });

  it("rejects empty, malformed, and oversized submissions", () => {
    expect(() => validateLogSubmission({ label: "x", text: "  " })).toThrow(
      "cannot be empty"
    );
    expect(() => validateLogSubmission({ label: "x", text: "bad\0log" })).toThrow(
      "null character"
    );
    expect(() => validateLogSubmission({ label: "x", text: 42 })).toThrow(
      "plain text"
    );
    expect(() =>
      validateLogSubmission({ label: "x", text: "x".repeat(MAX_LOG_CHARACTERS + 1) })
    ).toThrow("character limit");
    expect(() =>
      validateLogSubmission({
        label: "x",
        text: Array.from({ length: MAX_LOG_LINES + 1 }, () => "line").join("\n")
      })
    ).toThrow("line limit");
  });

  it("retains unmatched lines without manufacturing findings", () => {
    const analysis = analyzeLogText(
      "LOG-PLAIN",
      "service boot sequence\ncache warmed\nready"
    );

    expect(analysis.errorLines).toEqual([]);
    expect(analysis.errorCodes).toEqual([]);
    expect(analysis.repeatedPatterns).toEqual([]);
    expect(analysis.unrecognizedLines).toHaveLength(3);
  });

  it("does not mistake ordinary uppercase words for error codes", () => {
    const analysis = analyzeLogText(
      "LOG-ENV",
      "ERROR required environment variable PAYMENT_API_URL is not set"
    );

    expect(analysis.errorLines).toHaveLength(1);
    expect(analysis.errorCodes).toEqual([]);
  });
});
