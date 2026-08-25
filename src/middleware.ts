/**
 * The gate.
 *
 * Runs before every page and API request. Pages redirect to /login when there
 * is no valid session; API routes are left alone, because `currentUserId()`
 * already refuses them with a typed 401 and a redirect would turn a clean
 * error into an HTML page arriving where JSON was expected.
 *
 * Only the signature is checked here. Confirming the user row still exists
 * needs the database, which the edge runtime cannot reach — `currentSession()`
 * does that on the server side of each request.
 */
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/server/auth/session";

const PUBLIC_PAGES = new Set(["/login"]);

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (PUBLIC_PAGES.has(pathname)) {
    // Already signed in? Don't make them look at a sign-in form.
    if (session) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (session) return NextResponse.next();

  const login = new URL("/login", request.url);
  // Remember where they were headed so sign-in lands there instead of the root.
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  /**
   * Everything except API routes, Next's own assets, and static files.
   * The file-extension clause keeps images and fonts out of the auth path.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
