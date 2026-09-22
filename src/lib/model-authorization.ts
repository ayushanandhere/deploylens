/** Recheck server-side access around quota accounting before each provider call. */
export async function authorizedModelInvocation<T>(
  isActive: () => Promise<boolean>,
  consume: () => Promise<void>,
  invoke: () => PromiseLike<T>
): Promise<T> {
  if (!await isActive()) throw new Error("Investigation access ended.");
  await consume();
  // Quota accounting is another DO call. Access may have been revoked while it ran.
  if (!await isActive()) throw new Error("Investigation access ended.");
  return invoke();
}
