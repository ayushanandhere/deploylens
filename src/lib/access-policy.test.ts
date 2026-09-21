import { describe, expect, it } from "vitest";
import { assertLogAttachmentAllowed, canAccessInvestigation, isAgentPath, nextUtcReset, originAllowed, type InvestigationAccess, type Principal } from "./access-policy";

const id = "11111111-1111-4111-8111-111111111111";
const now = Date.parse("2026-09-21T12:00:00Z");
const alice: Principal = { kind: "private", userId: "github:101", sessionHash: "alice-session", expiresAt: now + 1000 };
const bob: Principal = { kind: "private", userId: "github:202", sessionHash: "bob-session", expiresAt: now + 1000 };
const privateRecord: InvestigationAccess = { id, kind: "private", ownerId: "github:101", sessionHash: null, status: "active", expiresAt: null };

describe("investigation authorization", () => {
  it("uses stable provider ID, not a known UUID, forged owner, or another session", () => {
    expect(canAccessInvestigation(alice, privateRecord, now)).toBe(true);
    expect(canAccessInvestigation(bob, privateRecord, now)).toBe(false);
    expect(canAccessInvestigation(null, privateRecord, now)).toBe(false);
  });

  it("denies expired sessions, expired demos, and deletion tombstones", () => {
    expect(canAccessInvestigation({ ...alice, expiresAt: now }, privateRecord, now)).toBe(false);
    for (const status of ["deleting", "deleted", "expiring", "expired"] as const) {
      expect(canAccessInvestigation(alice, { ...privateRecord, status }, now)).toBe(false);
    }
    const demo: Principal = { kind: "demo", userId: null, sessionHash: "visitor-a", expiresAt: now + 1000 };
    const demoRecord: InvestigationAccess = { ...privateRecord, kind: "demo", ownerId: null, sessionHash: "visitor-a", expiresAt: now + 1000 };
    expect(canAccessInvestigation(demo, demoRecord, now)).toBe(true);
    expect(canAccessInvestigation({ ...demo, sessionHash: "visitor-b" }, demoRecord, now)).toBe(false);
    expect(canAccessInvestigation(alice, demoRecord, now)).toBe(false);
    expect(canAccessInvestigation(demo, { ...demoRecord, expiresAt: now }, now)).toBe(false);
  });

  it("recognizes only the expected agent route and same-origin mutations", () => {
    expect(isAgentPath(`/agents/deploy-lens-agent/${id}/get-messages`)).toBe(id);
    expect(isAgentPath(`/agents/other-agent/${id}`)).toBe(null);
    expect(isAgentPath("/agents/deploy-lens-agent/not-a-uuid")).toBe(null);
    expect(originAllowed(new Request("https://app.example/api/x", { headers: { Origin: "https://app.example" } }))).toBe(true);
    expect(originAllowed(new Request("https://app.example/api/x", { headers: { Origin: "https://evil.example" } }))).toBe(false);
    expect(nextUtcReset(now)).toBe(Date.parse("2026-09-22T00:00:00Z"));
  });

  it("rejects arbitrary demo log attachment even through a direct callable invocation", () => {
    expect(() => assertLogAttachmentAllowed({ kind: "demo", userId: null, sessionHash: "x", expiresAt: now + 1000 })).toThrow(/bundled synthetic examples/);
    expect(() => assertLogAttachmentAllowed(alice)).not.toThrow();
  });
});
