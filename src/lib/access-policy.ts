import { isInvestigationId } from "./investigation";

export type Principal = {
  kind: "demo" | "private";
  sessionHash: string;
  userId: string | null;
  expiresAt: number;
};

export type InvestigationAccess = {
  id: string;
  kind: "demo" | "private";
  ownerId: string | null;
  sessionHash: string | null;
  status: "active" | "deleting" | "deleted" | "expiring" | "expired";
  expiresAt: number | null;
};

export function canAccessInvestigation(
  principal: Principal | null,
  investigation: InvestigationAccess | null,
  now: number
): boolean {
  if (!principal || !investigation || !isInvestigationId(investigation.id)) return false;
  if (principal.expiresAt <= now || investigation.status !== "active") return false;
  if (investigation.expiresAt !== null && investigation.expiresAt <= now) return false;
  if (investigation.kind !== principal.kind) return false;
  return principal.kind === "private"
    ? principal.userId !== null && principal.userId === investigation.ownerId
    : principal.sessionHash === investigation.sessionHash;
}

export function nextUtcReset(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function quotaError(label: string, resetAt: number): string {
  return `${label} request limit reached. New model requests reset at ${new Date(resetAt).toISOString()}.`;
}

export function assertLogAttachmentAllowed(principal: Principal): void {
  if (principal.kind === "demo") {
    throw new Error("Demo investigations only accept bundled synthetic examples. Sign in with GitHub to attach redacted logs.");
  }
}

export function originAllowed(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export function isAgentPath(pathname: string): string | null {
  const match = /^\/agents\/deploy-lens-agent\/([^/]+)(?:\/.*)?$/.exec(pathname);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1] ?? "");
    return isInvestigationId(id) ? id : null;
  } catch { return null; }
}
