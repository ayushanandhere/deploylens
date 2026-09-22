import { describe, expect, it } from "vitest";
import { consumeQuotaBatch, modelScopes } from "./shared-limits";
import type { Principal } from "./access-policy";

const now = Date.parse("2026-09-21T12:00:00Z");
const config = { global: 4, privateUser: 2, demoSession: 2, demoShared: 2 };

describe("shared model request limits", () => {
  it("keys private usage by provider ID, not session or investigation UUID", () => {
    const first: Principal = { kind: "private", userId: "github:123", sessionHash: "session-a", expiresAt: now + 1000 };
    const second = { ...first, sessionHash: "session-b" };
    expect(modelScopes(first, config)).toEqual(modelScopes(second, config));
  });

  it("enforces global and demo-wide ceilings across concurrent callers", async () => {
    const counters = new Map<string, number>();
    const read = (scope: string, key: string, day: string) => counters.get(`${scope}:${key}:${day}`) ?? 0;
    const increment = (scope: string, key: string, day: string) => {
      const counterKey = `${scope}:${key}:${day}`;
      counters.set(counterKey, (counters.get(counterKey) ?? 0) + 1);
    };
    const demoA: Principal = { kind: "demo", userId: null, sessionHash: "demo-a", expiresAt: now + 1000 };
    const demoB = { ...demoA, sessionHash: "demo-b" };
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => Promise.resolve().then(() => {
      consumeQuotaBatch(modelScopes(index % 2 ? demoA : demoB, config), now, read, increment);
    })));
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(2);
    expect(read("model/demo-shared", "all", "2026-09-21")).toBe(2);
    expect(read("model/global", "all", "2026-09-21")).toBe(2);
    expect(results.find((item) => item.status === "rejected")?.status).toBe("rejected");
  });

  it("does not partially increment a batch when a later scope is exhausted", () => {
    const counts = new Map<string, number>([["model/user:github:1:2026-09-21", 2]]);
    const principal: Principal = { kind: "private", userId: "github:1", sessionHash: "x", expiresAt: now + 1000 };
    const key = (scope: string, id: string, day: string) => `${scope}:${id}:${day}`;
    expect(() => consumeQuotaBatch(modelScopes(principal, config), now,
      (scope, id, day) => counts.get(key(scope, id, day)) ?? 0,
      (scope, id, day) => counts.set(key(scope, id, day), (counts.get(key(scope, id, day)) ?? 0) + 1)
    )).toThrow(/request limit reached.*2026-09-22T00:00:00.000Z/);
    expect(counts.get("model/global:all:2026-09-21")).toBeUndefined();
  });
});
