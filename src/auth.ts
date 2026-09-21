import * as oauth from "oauth4webapi";
import { isAgentPath, originAllowed, type Principal } from "./lib/access-policy";
import { isInvestigationId } from "./lib/investigation";
import type { DeployLensControl } from "./control";

const SESSION_COOKIE = "dl_session";
const STATE_COOKIE = "dl_oauth_state";
const NO_STORE = { "Cache-Control": "no-store" };

function control(env: Env) { return env.DeployLensControl.getByName("global") as DurableObjectStub<DeployLensControl>; }

function cookieValue(request: Request, name: string): string | null {
  const item = request.headers.get("Cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : null;
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cookie(request: Request, name: string, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function requestSession(request: Request, env: Env): Promise<{ principal: Principal; tokenHash: string } | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await digest(token);
  const principal = await control(env).resolveSession(tokenHash);
  return principal ? { principal, tokenHash } : null;
}

async function newDemoSession(request: Request, env: Env): Promise<{ principal: Principal; tokenHash: string; setCookie: string }> {
  const token = randomSecret();
  const tokenHash = await digest(token);
  const principal = await control(env).createSession(tokenHash, "demo", null);
  return { principal, tokenHash, setCookie: cookie(request, SESSION_COOKIE, token, Math.max(1, Math.floor((principal.expiresAt - Date.now()) / 1000))) };
}

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return Response.json(data, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

function failure(message: string, status: number): Response { return json({ error: message }, status); }

function githubConfig(env: Env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return null;
  return {
    as: {
      issuer: "https://github.com",
      authorization_endpoint: "https://github.com/login/oauth/authorize",
      token_endpoint: "https://github.com/login/oauth/access_token"
    } satisfies oauth.AuthorizationServer,
    client: { client_id: env.GITHUB_CLIENT_ID } satisfies oauth.Client,
    redirectUri: `${env.PUBLIC_ORIGIN}/auth/github/callback`
  };
}

export async function handleAppRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const c = control(env);

  if (path === "/auth/github" && request.method === "GET") {
    const config = githubConfig(env);
    if (!config) return failure("GitHub sign-in is not configured yet. The synthetic demo remains available.", 503);
    if (url.origin !== env.PUBLIC_ORIGIN) return failure("Open DeployLens at its configured origin to sign in.", 400);
    const state = oauth.generateRandomState();
    const verifier = oauth.generateRandomCodeVerifier();
    const challenge = await oauth.calculatePKCECodeChallenge(verifier);
    await c.saveOAuthState(await digest(state), verifier);
    const authorization = new URL(config.as.authorization_endpoint);
    authorization.searchParams.set("client_id", config.client.client_id);
    authorization.searchParams.set("redirect_uri", config.redirectUri);
    authorization.searchParams.set("state", state);
    authorization.searchParams.set("code_challenge", challenge);
    authorization.searchParams.set("code_challenge_method", "S256");
    return new Response(null, { status: 302, headers: {
      Location: authorization.toString(),
      "Set-Cookie": cookie(request, STATE_COOKIE, state, 600),
      "Cache-Control": "no-store"
    } });
  }

  if (path === "/auth/github/callback" && request.method === "GET") {
    const config = githubConfig(env);
    if (!config) return failure("GitHub sign-in is not configured.", 503);
    if (url.origin !== env.PUBLIC_ORIGIN) return failure("Sign-in callback origin did not match configuration.", 400);
    const state = cookieValue(request, STATE_COOKIE);
    const responseHeaders = new Headers(NO_STORE);
    responseHeaders.append("Set-Cookie", cookie(request, STATE_COOKIE, "", 0));
    if (!state || !/^[A-Za-z0-9_-]{16,256}$/.test(state)) return json({ error: "Sign-in state is missing or invalid. Start again." }, 400, { "Set-Cookie": cookie(request, STATE_COOKIE, "", 0) });
    const verifier = await c.consumeOAuthState(await digest(state));
    if (!verifier) return json({ error: "Sign-in state expired or was already used. Start again." }, 400, { "Set-Cookie": cookie(request, STATE_COOKIE, "", 0) });
    try {
      const params = oauth.validateAuthResponse(config.as, config.client, url, state);
      const tokenResponse = await oauth.authorizationCodeGrantRequest(config.as, config.client, oauth.ClientSecretPost(env.GITHUB_CLIENT_SECRET!), params, config.redirectUri, verifier);
      const token = await oauth.processAuthorizationCodeResponse(config.as, config.client, tokenResponse);
      const profileResponse = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "DeployLens" }
      });
      if (!profileResponse.ok) throw new Error("GitHub identity lookup failed.");
      const profile: unknown = await profileResponse.json();
      if (!profile || typeof profile !== "object" || !("id" in profile) || !Number.isSafeInteger(profile.id)) throw new Error("GitHub did not return a stable user ID.");
      const previous = await requestSession(request, env);
      if (previous) await c.revokeSession(previous.tokenHash);
      const sessionToken = randomSecret();
      const principal = await c.createSession(await digest(sessionToken), "private", `github:${profile.id}`);
      responseHeaders.append("Set-Cookie", cookie(request, SESSION_COOKIE, sessionToken, Math.max(1, Math.floor((principal.expiresAt - Date.now()) / 1000))));
      responseHeaders.set("Location", config.redirectUri.replace("/auth/github/callback", "/"));
      return new Response(null, { status: 302, headers: responseHeaders });
    } catch {
      return json({ error: "GitHub sign-in failed. Try again; no investigation was changed." }, 400, { "Set-Cookie": cookie(request, STATE_COOKIE, "", 0) });
    }
  }

  if (!path.startsWith("/api/") && !path.startsWith("/agents/")) return null;
  const mutating = !["GET", "HEAD"].includes(request.method) || request.headers.get("Upgrade")?.toLowerCase() === "websocket";
  if (mutating && !originAllowed(request)) return failure("Cross-site requests are not allowed.", 403);

  if (path === "/api/session" && request.method === "GET") {
    const session = await requestSession(request, env);
    if (session) return json({ kind: session.principal.kind, expiresAt: session.principal.expiresAt, githubConfigured: !!githubConfig(env) });
    try {
      const created = await newDemoSession(request, env);
      return json({ kind: "demo", expiresAt: created.principal.expiresAt, githubConfigured: !!githubConfig(env) }, 200, { "Set-Cookie": created.setCookie });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Demo session creation limit")) return failure(error.message, 429);
      throw error;
    }
  }

  if (path === "/api/logout" && request.method === "POST") {
    const session = await requestSession(request, env);
    if (session) await c.revokeSession(session.tokenHash);
    return json({ ok: true }, 200, { "Set-Cookie": cookie(request, SESSION_COOKIE, "", 0) });
  }

  const session = await requestSession(request, env);
  if (!session) return failure("Session expired. Refresh the page or sign in again.", 401);

  if (path === "/api/investigations") {
    if (request.method === "GET") return json({ investigations: await c.listInvestigations(session.tokenHash) });
    if (request.method === "POST") {
      try { return json(await c.createInvestigation(session.tokenHash), 201); }
      catch (error) { return failure(error instanceof Error ? error.message : "Could not create investigation.", 429); }
    }
  }

  const deletion = /^\/api\/investigations\/([^/]+)$/.exec(path);
  if (deletion && request.method === "GET") {
    const id = deletion[1] ?? "";
    const principal = await c.authorize(session.tokenHash, id);
    return principal ? json({ id, kind: principal.kind }) : failure("Investigation not found or access denied.", 404);
  }
  if (deletion && request.method === "DELETE") {
    const id = deletion[1] ?? "";
    if (!isInvestigationId(id)) return failure("Investigation not found.", 404);
    try { await c.beginDeletion(session.tokenHash, id); return json({ ok: true }); }
    catch (error) { return failure(error instanceof Error ? error.message : "Deletion failed; access remains blocked.", 403); }
  }

  if (path.startsWith("/agents/")) {
    const id = isAgentPath(path);
    if (!id || !await c.authorize(session.tokenHash, id)) return failure("Investigation not found or access denied.", 404);
    return null;
  }
  return failure("Not found.", 404);
}

export async function principalForAgentRequest(request: Request, env: Env, id: string): Promise<Principal | null> {
  const session = await requestSession(request, env);
  return session ? control(env).authorize(session.tokenHash, id) : null;
}
