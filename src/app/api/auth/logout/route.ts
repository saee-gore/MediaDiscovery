import { cookies } from "next/headers";

import { route } from "@/server/http/handler";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Clearing the cookie is the whole of signing out; the token is stateless. */
export const POST = route("auth.logout", async () => {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return { ok: true };
});
