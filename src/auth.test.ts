import { describe, expect, it } from "vitest";
import { digest, handleAppRequest } from "./auth";
import type { Principal } from "./lib/access-policy";

const id = "11111111-1111-4111-8111-111111111111";
const origin = "https://deploylens.example";
const aliceToken = "a".repeat(64);
const bobToken = "b".repeat(64);
const now = Date.now();

async function fixture() {
  const aliceHash = await digest(aliceToken);
  const bobHash = await digest(bobToken);
  const principals = new Map<string, Principal>([
    [aliceHash, { kind: "private", sessionHash: aliceHash, userId: "github:101", expiresAt: now + 60_000 }],
    [bobHash, { kind: "private", sessionHash: bobHash, userId: "github:202", expiresAt: now + 60_000 }]
  ]);
  let active = true;
  const control = {
    resolveSession: async (hash: string) => {
      const principal = principals.get(hash);
      return principal && principal.expiresAt > Date.now() ? principal : null;
    },
    authorize: async (hash: string, requestedId: string) => active && hash === aliceHash && requestedId === id ? principals.get(hash) : null,
    listInvestigations: async (hash: string) => hash === aliceHash ? [{ id, createdAt: now }] : [],
    beginDeletion: async (hash: string, requestedId: string) => {
      if (hash !== aliceHash || requestedId !== id) throw new Error("Only the owner may delete.");
      active = false;
    }
  };
  const env = { DeployLensControl: { getByName: () => control } } as unknown as Env;
  const request = (path: string, token?: string, init: RequestInit = {}) => new Request(`${origin}${path}`, {
    ...init,
    headers: {
      ...(token ? { Cookie: `dl_session=${token}` } : {}),
      ...init.headers
    }
  });
  return { env, request, expireAlice: () => principals.set(aliceHash, { ...principals.get(aliceHash)!, expiresAt: 0 }) };
}

describe("HTTP and WebSocket route authorization", () => {
  it("denies unauthenticated, second-account, and forged-owner requests on every Agent path", async () => {
    const { env, request } = await fixture();
    const paths = [
      `/agents/deploy-lens-agent/${id}`,
      `/agents/deploy-lens-agent/${id}/get-messages`,
      `/agents/deploy-lens-agent/${id}/source/LOG-123`,
      `/agents/deploy-lens-agent/${id}/export`
    ];
    for (const path of paths) {
      expect((await handleAppRequest(request(path), env))?.status).toBe(401);
      expect((await handleAppRequest(request(`${path}?ownerId=github:101`, bobToken), env))?.status).toBe(404);
      expect(await handleAppRequest(request(path, aliceToken), env)).toBeNull();
    }
  });

  it("checks WebSocket origin and ownership before SDK RPC/chat/state dispatch", async () => {
    const { env, request } = await fixture();
    const path = `/agents/deploy-lens-agent/${id}`;
    const ws = { headers: { Origin: origin, Upgrade: "websocket" } };
    expect((await handleAppRequest(request(path, bobToken, ws), env))?.status).toBe(404);
    expect((await handleAppRequest(request(path, aliceToken, { headers: { Origin: "https://attacker.example", Upgrade: "websocket" } }), env))?.status).toBe(403);
    expect(await handleAppRequest(request(path, aliceToken, ws), env)).toBeNull();
  });

  it("keeps listing and deletion owner-scoped and rejects cross-site mutation", async () => {
    const { env, request } = await fixture();
    const listing = await handleAppRequest(request("/api/investigations", bobToken), env);
    expect(await listing?.json()).toEqual({ investigations: [] });
    expect((await handleAppRequest(request(`/api/investigations/${id}`, bobToken, { method: "DELETE", headers: { Origin: origin } }), env))?.status).toBe(403);
    expect((await handleAppRequest(request(`/api/investigations/${id}`, aliceToken, { method: "DELETE", headers: { Origin: "https://attacker.example" } }), env))?.status).toBe(403);
    expect((await handleAppRequest(request(`/api/investigations/${id}`, aliceToken, { method: "DELETE", headers: { Origin: origin } }), env))?.status).toBe(200);
    expect((await handleAppRequest(request(`/api/investigations/${id}`, aliceToken), env))?.status).toBe(404);
    expect((await handleAppRequest(request(`/agents/deploy-lens-agent/${id}`, aliceToken, { headers: { Origin: origin, Upgrade: "websocket" } }), env))?.status).toBe(404);
  });

  it("rejects an expired session even with the old cookie and known URL", async () => {
    const { env, request, expireAlice } = await fixture();
    expireAlice();
    expect((await handleAppRequest(request(`/agents/deploy-lens-agent/${id}`, aliceToken), env))?.status).toBe(401);
    expect((await handleAppRequest(request(`/api/investigations/${id}`, aliceToken), env))?.status).toBe(401);
  });

  it("starts OAuth with a host-only state cookie and rejects missing or replayed state", async () => {
    const states = new Map<string, string>();
    const oauthControl = {
      saveOAuthState: async (hash: string, verifier: string) => { states.set(hash, verifier); },
      consumeOAuthState: async (hash: string) => { const value = states.get(hash) ?? null; states.delete(hash); return value; }
    };
    const env = {
      PUBLIC_ORIGIN: origin,
      GITHUB_CLIENT_ID: "test-client-id",
      GITHUB_CLIENT_SECRET: "test-secret",
      DeployLensControl: { getByName: () => oauthControl }
    } as unknown as Env;
    const started = await handleAppRequest(new Request(`${origin}/auth/github`), env);
    expect(started?.status).toBe(302);
    expect(started?.headers.get("Location")).toContain("https://github.com/login/oauth/authorize");
    expect(started?.headers.get("Set-Cookie")).toMatch(/HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
    const stateCookie = started!.headers.get("Set-Cookie")!.split(";")[0]!;
    const state = stateCookie.split("=")[1]!;
    const callback = `${origin}/auth/github/callback?code=fake&state=${encodeURIComponent(state)}`;
    expect((await handleAppRequest(new Request(callback), env))?.status).toBe(400);
    states.delete(await digest(state));
    expect((await handleAppRequest(new Request(callback, { headers: { Cookie: stateCookie } }), env))?.status).toBe(400);
  });
});
