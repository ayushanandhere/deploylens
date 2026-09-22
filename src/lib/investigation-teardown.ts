export async function scheduleInvestigationTeardown(actions: {
  closeConnections: () => void;
  abortRequests: () => void;
  waitUntilStable: () => Promise<boolean>;
  scheduleDestroy: () => Promise<void>;
  warnIfUnstable: () => void;
}): Promise<void> {
  actions.closeConnections();
  actions.abortRequests();
  if (!await actions.waitUntilStable()) actions.warnIfUnstable();
  // SDK destroy() aborts its own isolate. Calling it in an RPC prevents
  // Control from receiving success and causes a perpetual cleanup retry.
  // Its durable marker acknowledges the RPC, then wipes in a fresh alarm.
  await actions.scheduleDestroy();
}
