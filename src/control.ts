import { DurableObject } from "cloudflare:workers";
import { canAccessInvestigation, nextUtcReset, type InvestigationAccess, type Principal } from "./lib/access-policy";
import { isInvestigationId } from "./lib/investigation";

type SessionRow = { token_hash: string; kind: "demo" | "private"; user_id: string | null; expires_at: number };
type InvestigationRow = { id: string; kind: "demo" | "private"; owner_id: string | null; session_hash: string | null; status: InvestigationAccess["status"]; created_at: number; expires_at: number | null };
type OAuthRow = { verifier: string; expires_at: number };
type QuotaRow = { count: number };

function configuredNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export class DeployLensControl extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT, expires_at INTEGER NOT NULL
    )`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner_id TEXT, session_hash TEXT,
      status TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER
    )`);
    ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS investigations_owner ON investigations(owner_id, created_at)`);
    ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS investigations_session ON investigations(session_hash, created_at)`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
    )`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS quotas (
      scope TEXT NOT NULL, quota_key TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL,
      PRIMARY KEY(scope, quota_key, day)
    )`);
  }

  private sql<T extends Record<string, unknown>>(query: string, ...params: (string | number | null)[]): T[] {
    return [...this.ctx.storage.sql.exec<Record<string, SqlStorageValue>>(query, ...params)] as T[];
  }

  private session(tokenHash: string): Principal | null {
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) return null;
    const row = this.sql<SessionRow>("SELECT * FROM sessions WHERE token_hash = ? LIMIT 1", tokenHash)[0];
    if (!row || row.expires_at <= Date.now()) return null;
    return { kind: row.kind, sessionHash: row.token_hash, userId: row.user_id, expiresAt: row.expires_at };
  }

  async createSession(tokenHash: string, kind: "demo" | "private", userId: string | null): Promise<Principal> {
    if (!/^[a-f0-9]{64}$/.test(tokenHash) || (kind === "private" && !/^github:\d+$/.test(userId ?? "")) || (kind === "demo" && userId !== null)) {
      throw new Error("Invalid session identity.");
    }
    const now = Date.now();
    const expiresAt = now + (kind === "demo"
      ? configuredNumber(this.env.DEMO_TTL_HOURS, 48, 1, 168) * 3_600_000
      : configuredNumber(this.env.PRIVATE_SESSION_DAYS, 14, 1, 30) * 86_400_000);
    this.ctx.storage.transactionSync(() => {
      if (kind === "demo") this.consume("sessions/demo-shared", "all", configuredNumber(this.env.DEMO_SESSIONS_DAILY, 1000, 1, 100_000), now, "Demo session creation");
      this.sql("INSERT INTO sessions(token_hash, kind, user_id, expires_at) VALUES(?, ?, ?, ?)", tokenHash, kind, userId, expiresAt);
    });
    await this.scheduleExpiry();
    return { kind, sessionHash: tokenHash, userId, expiresAt };
  }

  async resolveSession(tokenHash: string): Promise<Principal | null> { return this.session(tokenHash); }

  async revokeSession(tokenHash: string): Promise<void> {
    const principal = this.session(tokenHash);
    this.sql("DELETE FROM sessions WHERE token_hash = ?", tokenHash);
    if (!principal) return;
    const rows = principal.kind === "demo"
      ? this.sql<InvestigationRow>("SELECT * FROM investigations WHERE session_hash = ? AND status = 'active' LIMIT 500", tokenHash)
      : this.sql<InvestigationRow>("SELECT * FROM investigations WHERE owner_id = ? AND status = 'active' LIMIT 500", principal.userId);
    const outcomes = await Promise.allSettled(rows.map((row) => this.env.DeployLensAgent.getByName(row.id).closeSessionConnections(tokenHash)));
    if (outcomes.some((item) => item.status === "rejected")) console.warn("Some investigation sockets could not be closed immediately after logout; per-frame and expiry checks remain active.");
  }

  async saveOAuthState(stateHash: string, verifier: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(stateHash) || verifier.length < 43 || verifier.length > 128) throw new Error("Invalid OAuth state.");
    this.sql("DELETE FROM oauth_states WHERE expires_at <= ?", Date.now());
    this.sql("INSERT INTO oauth_states(state_hash, verifier, expires_at) VALUES(?, ?, ?)", stateHash, verifier, Date.now() + 10 * 60_000);
  }

  async consumeOAuthState(stateHash: string): Promise<string | null> {
    return this.ctx.storage.transactionSync(() => {
      const row = this.sql<OAuthRow>("SELECT verifier, expires_at FROM oauth_states WHERE state_hash = ?", stateHash)[0];
      this.sql("DELETE FROM oauth_states WHERE state_hash = ?", stateHash);
      return row && row.expires_at > Date.now() ? row.verifier : null;
    });
  }

  private accessRow(id: string): InvestigationAccess | null {
    if (!isInvestigationId(id)) return null;
    const row = this.sql<InvestigationRow>("SELECT * FROM investigations WHERE id = ? LIMIT 1", id)[0];
    return row ? { id: row.id, kind: row.kind, ownerId: row.owner_id, sessionHash: row.session_hash, status: row.status, expiresAt: row.expires_at } : null;
  }

  async authorize(tokenHash: string, id: string): Promise<Principal | null> {
    const principal = this.session(tokenHash);
    return canAccessInvestigation(principal, this.accessRow(id), Date.now()) ? principal : null;
  }

  async isActiveForPrincipal(principal: Principal, id: string): Promise<boolean> {
    // Re-resolve the server-issued session on every operation: logout and expiry
    // invalidate already-open WebSockets, not only future handshakes.
    const current = this.session(principal.sessionHash);
    return canAccessInvestigation(current, this.accessRow(id), Date.now());
  }

  private consume(scope: string, key: string, limit: number, now: number, label = "Investigation creation"): void {
    const day = new Date(now).toISOString().slice(0, 10);
    this.sql("DELETE FROM quotas WHERE day < ?", new Date(now - 2 * 86_400_000).toISOString().slice(0, 10));
    const count = this.sql<QuotaRow>("SELECT count FROM quotas WHERE scope = ? AND quota_key = ? AND day = ?", scope, key, day)[0]?.count ?? 0;
    if (count >= limit) throw new Error(`${label} limit reached. Try again after ${new Date(nextUtcReset(now)).toISOString()}.`);
    this.sql("INSERT INTO quotas(scope, quota_key, day, count) VALUES(?, ?, ?, 1) ON CONFLICT(scope, quota_key, day) DO UPDATE SET count = count + 1", scope, key, day);
  }

  async createInvestigation(tokenHash: string): Promise<{ id: string; kind: Principal["kind"] }> {
    const principal = this.session(tokenHash);
    if (!principal) throw new Error("Session expired. Refresh the page and sign in again.");
    const now = Date.now();
    return this.ctx.storage.transactionSync(() => {
      this.consume(
        principal.kind === "demo" ? "investigations/demo-session" : "investigations/user",
        principal.kind === "demo" ? tokenHash : principal.userId!,
        principal.kind === "demo"
          ? configuredNumber(this.env.DEMO_INVESTIGATIONS_DAILY, 8, 1, 1_000)
          : configuredNumber(this.env.PRIVATE_INVESTIGATIONS_DAILY, 30, 1, 10_000),
        now
      );
      if (principal.kind === "demo") this.consume(
        "investigations/demo-shared", "all",
        configuredNumber(this.env.DEMO_SHARED_INVESTIGATIONS_DAILY, 500, 1, 100_000), now
      );
      const id = crypto.randomUUID();
      this.sql("INSERT INTO investigations(id, kind, owner_id, session_hash, status, created_at, expires_at) VALUES(?, ?, ?, ?, 'active', ?, ?)",
        id, principal.kind, principal.userId, principal.kind === "demo" ? tokenHash : null, now, principal.kind === "demo" ? principal.expiresAt : null);
      return { id, kind: principal.kind };
    });
  }

  async listInvestigations(tokenHash: string): Promise<Array<{ id: string; createdAt: number }>> {
    const principal = this.session(tokenHash);
    if (!principal) return [];
    const rows = principal.kind === "private"
      ? this.sql<InvestigationRow>("SELECT * FROM investigations WHERE owner_id = ? AND kind = 'private' AND status = 'active' ORDER BY created_at DESC LIMIT 100", principal.userId)
      : this.sql<InvestigationRow>("SELECT * FROM investigations WHERE session_hash = ? AND kind = 'demo' AND status = 'active' ORDER BY created_at DESC LIMIT 100", tokenHash);
    return rows.map((row) => ({ id: row.id, createdAt: row.created_at }));
  }

  async beginDeletion(tokenHash: string, id: string): Promise<void> {
    const principal = await this.authorize(tokenHash, id);
    if (!principal || principal.kind !== "private") throw new Error("Only the owner may delete a private investigation.");
    // Tombstone first. New gateway requests, stale sockets, tools, and model steps
    // now fail authorization before cleanup starts. Never recycle this ID.
    this.sql("UPDATE investigations SET status = 'deleting' WHERE id = ? AND status = 'active'", id);
    await this.cleanupInvestigation(id, "deleted");
  }

  private async cleanupInvestigation(id: string, status: "deleted" | "expired"): Promise<void> {
    try {
      await this.env.DeployLensAgent.getByName(id).purgeInvestigation();
      this.sql("UPDATE investigations SET status = ? WHERE id = ?", status, id);
    } catch (error) {
      // Keep the denying tombstone; the alarm retries cleanup.
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      throw error;
    }
  }

  private async scheduleExpiry(): Promise<void> {
    const next = this.sql<{ expires_at: number }>("SELECT MIN(expires_at) AS expires_at FROM sessions WHERE expires_at > ?", Date.now())[0]?.expires_at;
    const current = await this.ctx.storage.getAlarm();
    if (next && (current === null || current <= Date.now() || next < current)) await this.ctx.storage.setAlarm(next);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.sql("UPDATE investigations SET status = 'expiring' WHERE kind = 'demo' AND status = 'active' AND expires_at <= ?", now);
    const stale = this.sql<InvestigationRow>("SELECT * FROM investigations WHERE status IN ('expiring', 'deleting') LIMIT 50");
    for (const row of stale) {
      try { await this.cleanupInvestigation(row.id, row.status === "deleting" ? "deleted" : "expired"); }
      catch { /* Tombstone remains; retry alarm below. */ }
    }
    this.sql("DELETE FROM sessions WHERE expires_at <= ?", now);
    this.sql("DELETE FROM oauth_states WHERE expires_at <= ?", now);
    this.sql("DELETE FROM quotas WHERE day < ?", new Date(now - 2 * 86_400_000).toISOString().slice(0, 10));
    if (this.sql<InvestigationRow>("SELECT * FROM investigations WHERE status IN ('expiring', 'deleting') LIMIT 1").length) await this.ctx.storage.setAlarm(now + 60_000);
    else await this.scheduleExpiry();
  }
}
