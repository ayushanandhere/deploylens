import { describe, expect, it } from "vitest";
import {
  INVESTIGATION_STORAGE_KEY,
  getOrCreateInvestigationId,
  startNewInvestigation
} from "./investigation";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial) values.set(INVESTIGATION_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe("investigation identity", () => {
  it("reuses a valid persisted ID after reload", () => {
    const storage = memoryStorage(firstId);

    expect(getOrCreateInvestigationId(storage, () => secondId)).toBe(firstId);
  });

  it("creates and persists a separate ID for a new investigation", () => {
    const storage = memoryStorage(firstId);

    const next = startNewInvestigation(storage, () => secondId);

    expect(next).toBe(secondId);
    expect(getOrCreateInvestigationId(storage, () => firstId)).toBe(secondId);
    expect(next).not.toBe(firstId);
  });

  it("replaces malformed persisted IDs", () => {
    const storage = memoryStorage("../../shared-agent");

    expect(getOrCreateInvestigationId(storage, () => firstId)).toBe(firstId);
  });

  it("reopens a valid investigation requested by URL", () => {
    const storage = memoryStorage(firstId);

    expect(
      getOrCreateInvestigationId(storage, () => firstId, secondId)
    ).toBe(secondId);
    expect(getOrCreateInvestigationId(storage, () => firstId)).toBe(secondId);
  });

  it("ignores malformed investigation IDs requested by URL", () => {
    const storage = memoryStorage(firstId);

    expect(
      getOrCreateInvestigationId(storage, () => secondId, "../../shared-agent")
    ).toBe(firstId);
  });
});
