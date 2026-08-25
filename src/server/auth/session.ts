/**
 * Sessions.
 *
 * A signed JWT in an httpOnly cookie. Stateless on purpose: there is no session
 * table to migrate, nothing to clean up, and it verifies inside Next's edge
 * middleware, which a database lookup could not do.
 *
 * The trade-off is that signing out cannot invalidate a token that has already
 * been issued elsewhere; the cookie is simply cleared. For a single-tenant
 * curation app that is the right side of the trade.
 *
 * This module is deliberately free of node: imports so the middleware can use it.
 */
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "curated_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const DEV_SECRET = "curated-development-secret-change-me-in-production";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
}

/**
 * Read from process.env directly rather than through the validated env module,
 * which pulls in server-only code the edge runtime cannot load.
 */
function secretKey(): Uint8Array {
  const raw = process.env.AUTH_SECRET?.trim();
  if (!raw || raw.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET must be set to a random string of at least 16 characters in production.",
      );
    }
    return new TextEncoder().encode(DEV_SECRET);
  }
  return new TextEncoder().encode(raw);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Returns null for anything that is not a currently valid token. */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : "You",
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge: number = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
