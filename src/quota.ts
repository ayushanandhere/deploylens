import { DurableObject } from "cloudflare:workers";
import { consumeQuotaBatch, modelScopes } from "./lib/shared-limits";

type CountRow = { count: number };

function configuredNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export class DeployLensQuota extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS model_counts (
      scope TEXT NOT NULL, quota_key TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL,
      PRIMARY KEY(scope, quota_key, day)
    )`);
  }

  async consumeModelInvocation(tokenHash: string, id: string): Promise<void> {
    const principal = await this.env.DeployLensControl.getByName("global").authorize(tokenHash, id);
    if (!principal) throw new Error("Investigation access ended. Refresh or sign in again.");
    if (this.env.INFERENCE_ENABLED !== "true") throw new Error("New AI responses are temporarily disabled. Saved investigations remain available.");
    const scopes = modelScopes(principal, {
      global: configuredNumber(this.env.GLOBAL_MODEL_DAILY, 500, 1, 100_000),
      privateUser: configuredNumber(this.env.PRIVATE_MODEL_DAILY, 80, 1, 10_000),
      demoSession: configuredNumber(this.env.DEMO_SESSION_MODEL_DAILY, 12, 1, 1_000),
      demoShared: configuredNumber(this.env.DEMO_SHARED_MODEL_DAILY, 240, 1, 100_000)
    });
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM model_counts WHERE day < ?", new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10));
      consumeQuotaBatch(scopes, Date.now(),
        (scope, key, day) => [...this.ctx.storage.sql.exec<CountRow>(
          "SELECT count FROM model_counts WHERE scope = ? AND quota_key = ? AND day = ?", scope, key, day
        )][0]?.count ?? 0,
        (scope, key, day) => {
          this.ctx.storage.sql.exec(
            "INSERT INTO model_counts(scope, quota_key, day, count) VALUES(?, ?, ?, 1) ON CONFLICT(scope, quota_key, day) DO UPDATE SET count = count + 1", scope, key, day
          );
        }
      );
    });
  }
}
