import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseProxyClient } from "./lib/supabase/proxyClient";
import { isAuthRequired } from "./lib/supabase/env";

const PUBLIC_PATHS = ["/login"];

// Session refresh + login gate. Only enforced when NEXT_PUBLIC_APP_ENV is
// explicitly "prod" (see lib/supabase/env.ts) — DEV keeps its existing
// no-login convenience, since the DEV backend profile ignores
// authentication entirely (DevCurrentUserProvider). In prod, an
// unauthenticated request to any non-public route is redirected to
// /login; an authenticated request to /login is sent to /worklog instead.
export async function proxy(request: NextRequest) {
  if (!isAuthRequired()) {
    return NextResponse.next();
  }

  const client = createSupabaseProxyClient(request);
  if (!client) {
    // Auth is required but Supabase isn't configured — fail closed rather
    // than silently letting every request through.
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { supabase, getResponse } = client;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!user && !isPublicPath) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/worklog", request.url));
  }

  return getResponse();
}

export const config = {
  matcher: [
    // Every route except static assets and Next's own internals — an
    // auth gate must never accidentally exclude a real page route.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
