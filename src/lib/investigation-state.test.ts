import { describe, expect, it } from "vitest";
import {
  applyModelInvestigationUpdate,
  createInitialInvestigationState,
  MAX_INVESTIGATION_CHECKS,
  recordCheckResult,
  setInvestigationStatus,
  validateSourceReference
} from "./investigation-state";

const source = {
  sourceId: "LOG-LOCAL",
  label: "local.log",
  lineCount: 4,
  createdAt: "2026-09-20T00:00:00.000Z"
};

describe("investigation state validation", () => {
  it("rejects nonexistent, out-of-range, and cross-investigation references", () => {
    expect(() =>
      validateSourceReference({ sourceId: "LOG-OTHER", line: 1 }, [source])
    ).toThrow("does not belong");
    expect(() =>
      validateSourceReference({ sourceId: "LOG-LOCAL", line: 5 }, [source])
    ).toThrow("does not exist");

    const state = { ...createInitialInvestigationState(), sources: [source] };
    expect(() =>
      applyModelInvestigationUpdate(state, {
        hypotheses: [
          {
            text: "An external source says this failed",
            evidence: [{ sourceId: "LOG-CROSS-INVESTIGATION", line: 1 }]
          }
        ]
      })
    ).toThrow("does not belong");
  });

  it("preserves user-recorded results and user-controlled resolution", () => {
    const base = applyModelInvestigationUpdate(
      { ...createInitialInvestigationState(), sources: [source] },
      {
        hypotheses: [
          {
            text: "Database listener may be unavailable",
            evidence: [{ sourceId: "LOG-LOCAL", line: 2 }]
          }
        ],
        suggestedChecks: ["Verify listener health"],
        openQuestions: ["Did the endpoint change?"]
      },
      { now: "2026-09-20T01:00:00.000Z", idFactory: () => "one" }
    );
    const checkId = base.checks[0]!.id;
    const withResult = recordCheckResult(
      base,
      checkId,
      "Listener is healthy on the expected port",
      "2026-09-20T01:05:00.000Z"
    );
    const resolved = setInvestigationStatus(
      withResult,
      "resolved",
      "Restored the correct endpoint binding",
      "2026-09-20T01:10:00.000Z"
    );
    const revised = applyModelInvestigationUpdate(
      resolved,
      { hypotheses: [{ text: "Endpoint configuration was stale" }] },
      { now: "2026-09-20T01:11:00.000Z", idFactory: () => "two" }
    );

    expect(revised.checks.find((item) => item.id === checkId)?.result).toBe(
      "Listener is healthy on the expected port"
    );
    expect(revised.status).toBe("resolved");
    expect(revised.resolutionSummary).toBe("Restored the correct endpoint binding");
  });

  it("bounds accumulated model-suggested checks", () => {
    let state = createInitialInvestigationState();
    for (let index = 0; index < 4; index += 1) {
      state = applyModelInvestigationUpdate(
        state,
        {
          suggestedChecks: Array.from(
            { length: 12 },
            (_, item) => `Check ${index}-${item}`
          )
        },
        { idFactory: () => crypto.randomUUID() }
      );
    }

    expect(state.checks).toHaveLength(MAX_INVESTIGATION_CHECKS);
  });
});
