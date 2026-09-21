import { nextUtcReset, quotaError, type Principal } from "./access-policy";

export type QuotaScope = { scope: string; key: string; limit: number };
export type ModelLimitConfig = {
  global: number;
  privateUser: number;
  demoSession: number;
  demoShared: number;
};

export function modelScopes(principal: Principal, config: ModelLimitConfig): QuotaScope[] {
  const scopes: QuotaScope[] = [{ scope: "model/global", key: "all", limit: config.global }];
  if (principal.kind === "private") {
    scopes.push({ scope: "model/user", key: principal.userId!, limit: config.privateUser });
  } else {
    scopes.push(
      { scope: "model/demo-session", key: principal.sessionHash, limit: config.demoSession },
      { scope: "model/demo-shared", key: "all", limit: config.demoShared }
    );
  }
  return scopes;
}

/** Must run inside one database transaction in production. */
export function consumeQuotaBatch(
  scopes: QuotaScope[],
  now: number,
  readCount: (scope: string, key: string, day: string) => number,
  increment: (scope: string, key: string, day: string) => void
): void {
  const day = new Date(now).toISOString().slice(0, 10);
  for (const item of scopes) {
    if (readCount(item.scope, item.key, day) >= item.limit) {
      throw new Error(quotaError(item.scope, nextUtcReset(now)));
    }
  }
  for (const item of scopes) increment(item.scope, item.key, day);
}
