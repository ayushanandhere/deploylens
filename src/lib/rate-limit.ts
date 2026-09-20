export type RateLimitRule = {
  limit: number;
  windowMs: number;
};

export type RateLimitDecision =
  | { allowed: true; activeTimestamps: number[] }
  | { allowed: false; activeTimestamps: number[]; retryAfterSeconds: number };

export const MODEL_RATE_LIMIT: RateLimitRule = {
  limit: 12,
  windowMs: 10 * 60 * 1_000
};

export const RESOURCE_RATE_LIMIT: RateLimitRule = {
  limit: 20,
  windowMs: 10 * 60 * 1_000
};

export function evaluateRateLimit(
  timestamps: number[],
  now: number,
  rule: RateLimitRule
): RateLimitDecision {
  const cutoff = now - rule.windowMs;
  const activeTimestamps = timestamps
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > cutoff)
    .sort((left, right) => left - right);
  if (activeTimestamps.length < rule.limit) {
    return { allowed: true, activeTimestamps };
  }
  const oldest = activeTimestamps[0] ?? now;
  return {
    allowed: false,
    activeTimestamps,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((oldest + rule.windowMs - now) / 1_000)
    )
  };
}

export function rateLimitMessage(
  operation: "model requests" | "resource updates",
  retryAfterSeconds: number
): string {
  return `Rate limit reached for ${operation} in this investigation. Try again in ${retryAfterSeconds} seconds.`;
}
