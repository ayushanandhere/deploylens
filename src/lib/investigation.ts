export const INVESTIGATION_STORAGE_KEY = "deploylens.activeInvestigation";

const INVESTIGATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type IdFactory = () => string;

export function createInvestigationId(
  idFactory: IdFactory = () => crypto.randomUUID()
): string {
  return idFactory();
}

export function isInvestigationId(value: string | null): value is string {
  return value !== null && INVESTIGATION_ID_PATTERN.test(value);
}

export function getOrCreateInvestigationId(
  storage: Pick<Storage, "getItem" | "setItem">,
  idFactory?: IdFactory,
  requestedId?: string | null
): string {
  const requested = requestedId ?? null;
  if (isInvestigationId(requested)) {
    storage.setItem(INVESTIGATION_STORAGE_KEY, requested);
    return requested;
  }

  const stored = storage.getItem(INVESTIGATION_STORAGE_KEY);
  if (isInvestigationId(stored)) return stored;

  const created = createInvestigationId(idFactory);
  storage.setItem(INVESTIGATION_STORAGE_KEY, created);
  return created;
}

export function startNewInvestigation(
  storage: Pick<Storage, "setItem">,
  idFactory?: IdFactory
): string {
  const created = createInvestigationId(idFactory);
  storage.setItem(INVESTIGATION_STORAGE_KEY, created);
  return created;
}
