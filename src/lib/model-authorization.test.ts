import { describe, expect, it, vi } from "vitest";
import { authorizedModelInvocation } from "./model-authorization";

describe("per-invocation authorization", () => {
  it("does not charge or invoke the provider after access ends", async () => {
    const consume = vi.fn(async () => {});
    const invoke = vi.fn(async () => "model output");
    await expect(authorizedModelInvocation(async () => false, consume, invoke)).rejects.toThrow("Investigation access ended");
    expect(consume).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not invoke the provider if deletion races with quota accounting", async () => {
    let active = true;
    const consume = vi.fn(async () => { active = false; });
    const invoke = vi.fn(async () => "model output");
    await expect(authorizedModelInvocation(async () => active, consume, invoke)).rejects.toThrow("Investigation access ended");
    expect(consume).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("invokes once while access remains active", async () => {
    const consume = vi.fn(async () => {});
    const invoke = vi.fn(async () => "model output");
    await expect(authorizedModelInvocation(async () => true, consume, invoke)).resolves.toBe("model output");
    expect(consume).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledOnce();
  });
});
