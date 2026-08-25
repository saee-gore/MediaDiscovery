import { cookies } from "next/headers";
import { z } from "zod";

import { readJson, route } from "@/server/http/handler";
import { registerUser } from "@/server/services/users";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
  signSession,
} from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().min(3).max(320).email("Enter a valid email address."),
  password: z.string().min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters.`).max(200),
  name: z.string().trim().max(80).optional(),
});

/** Create an account and sign straight in — a second form to fill would be friction with no purpose. */
export const POST = route("auth.register", async (request) => {
  const body = await readJson(request, schema);
  const user = await registerUser(body);

  const token = await signSession({ userId: user.id, email: user.email, name: user.name });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));

  return { user: { id: user.id, email: user.email, name: user.name } };
});
