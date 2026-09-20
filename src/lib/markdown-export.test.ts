import { describe, expect, it } from "vitest";
import { createInitialInvestigationState } from "./investigation-state";
import { exportInvestigationMarkdown } from "./markdown-export";

describe("Markdown handoff export", () => {
  it("reflects saved evidence, hypotheses, results, questions, and resolution", () => {
    const state = {
      ...createInitialInvestigationState("2026-09-20T02:00:00.000Z"),
      status: "resolved" as const,
      symptoms: "Checkout failed after a config-only release.",
      sources: [
        {
          sourceId: "LOG-ABC",
          label: "checkout.log",
          lineCount: 3,
          createdAt: "2026-09-20T01:00:00.000Z"
        }
      ],
      evidence: [
        {
          id: "evidence-1",
          kind: "log" as const,
          category: "error" as const,
          summary: "Recognizable error line",
          excerpt: "ERROR connect ECONNREFUSED 10.0.4.21:5432",
          reference: { sourceId: "LOG-ABC", line: 2 }
        }
      ],
      hypotheses: [
        {
          id: "hyp-1",
          text: "The configured database endpoint may be stale",
          status: "unconfirmed" as const,
          evidence: [{ sourceId: "LOG-ABC", line: 2 }],
          createdAt: "2026-09-20T01:05:00.000Z"
        }
      ],
      checks: [
        {
          id: "check-1",
          description: "Compare the deployed endpoint",
          status: "completed" as const,
          result: "The host was stale",
          createdAt: "2026-09-20T01:06:00.000Z",
          completedAt: "2026-09-20T01:07:00.000Z"
        }
      ],
      openQuestions: [{ id: "q-1", text: "Why did promotion retain the old host?" }],
      resolutionSummary: "Corrected the endpoint binding."
    };

    const markdown = exportInvestigationMarkdown(
      state,
      "11111111-1111-4111-8111-111111111111"
    );

    expect(markdown).toContain("LOG-ABC:L2");
    expect(markdown).toContain(
      "**Unconfirmed:** The configured database endpoint may be stale. Evidence:"
    );
    expect(markdown).not.toContain("stale.. Evidence");
    expect(markdown).toContain("**User-reported result:** The host was stale");
    expect(markdown).toContain("Why did promotion retain the old host?");
    expect(markdown).toContain("Marked resolved by the user");
  });
});
