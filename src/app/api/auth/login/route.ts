import { cookies } from "next/headers";
import { z } from "zod";

import { readJson, route } from "@/server/http/handler";
import { authenticateUser } from "@/server/services/users";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
  signSession,
} from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The password is only bounded, never shape-checked: telling someone their
 * password "looks wrong" at sign-in leaks the rules for no benefit.
 */
const schema = z.object({
  email: z.string().trim().min(3).max(320),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const POST = route("auth.login", async (request) => {
  const body = await readJson(request, schema);
  const user = await authenticateUser(body);

  const token = await signSession({ userId: user.id, email: user.email, name: user.name });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));

  return { user: { id: user.id, email: user.email, name: user.name } };
});
