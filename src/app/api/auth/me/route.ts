import { route } from "@/server/http/handler";
import { currentSession } from "@/server/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns `{ user: null }` rather than a 401 when signed out: this is the
 * endpoint the shell uses to *ask* whether anyone is signed in, so "no" is a
 * successful answer, not an error.
 */
export const GET = route("auth.me", async () => {
  const session = await currentSession();
  return { user: session };
});
