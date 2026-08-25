/**
 * Who is making this request.
 *
 * Every user-scoped route calls `currentUserId()`. It reads the signed session
 * cookie and throws a 401 when there is not a valid one, which the route
 * wrapper turns into a typed `UNAUTHENTICATED` response. Nothing downstream
 * needs to know how identity is established.
 *
 * The row is confirmed to still exist on each request rather than trusted from
 * the token alone: a token outlives a deleted account, and a foreign-key error
 * deep inside a service is a far worse failure than a clean sign-in prompt.
 */
import { cookies } from "next/headers";

import { unauthenticated } from "@/server/lib/errors";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "@/server/auth/session";
import { getUserById } from "@/server/services/users";

export type { SessionPayload };

/** The session for this request, or null when signed out. */
export async function currentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  const user = await getUserById(session.userId);
  if (!user) return null;

  return { userId: user.id, email: user.email, name: user.name };
}

/** The signed-in user's id. Throws 401 when there is no valid session. */
export async function currentUserId(): Promise<string> {
  const session = await currentSession();
  if (!session) throw unauthenticated();
  return session.userId;
}
