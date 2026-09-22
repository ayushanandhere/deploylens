import { describe, expect, it, vi } from "vitest";
import { scheduleInvestigationTeardown } from "./investigation-teardown";

describe("investigation teardown", () => {
  it("closes sockets and drains work before acknowledging a durable scheduled destroy", async () => {
    const order: string[] = [];
    await scheduleInvestigationTeardown({
      closeConnections: () => { order.push("close"); },
      abortRequests: () => { order.push("abort"); },
      waitUntilStable: async () => { order.push("drain"); return true; },
      scheduleDestroy: async () => { order.push("schedule"); },
      warnIfUnstable: () => { order.push("warn"); }
    });
    expect(order).toEqual(["close", "abort", "drain", "schedule"]);
  });

  it("still schedules a durable destroy when the active turn does not settle", async () => {
    const warn = vi.fn();
    const schedule = vi.fn(async () => {});
    await scheduleInvestigationTeardown({
      closeConnections: () => {},
      abortRequests: () => {},
      waitUntilStable: async () => false,
      scheduleDestroy: schedule,
      warnIfUnstable: warn
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledOnce();
  });

  it("propagates scheduling failure so the tombstoned control record can retry", async () => {
    await expect(scheduleInvestigationTeardown({
      closeConnections: () => {},
      abortRequests: () => {},
      waitUntilStable: async () => true,
      scheduleDestroy: async () => { throw new Error("scheduler unavailable"); },
      warnIfUnstable: () => {}
    })).rejects.toThrow("scheduler unavailable");
  });
});
