import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseProxyClient } from "./lib/supabase/proxyClient";
import { isAuthRequired } from "./lib/supabase/env";
import { getSafeRedirectTarget } from "./app/login/safeRedirect";

const PUBLIC_PATHS = ["/login"];

// Session refresh + login gate. Only enforced when NEXT_PUBLIC_APP_ENV is
// explicitly "prod" (see lib/supabase/env.ts) — DEV keeps its existing
// no-login convenience, since the DEV backend profile ignores
// authentication entirely (DevCurrentUserProvider). In prod, an
// unauthenticated request to any non-public route is redirected to
// /login; an authenticated request resumes the safe requested app context.
export async function proxy(request: NextRequest) {
  if (!isAuthRequired()) {
    return NextResponse.next();
  }

  const client = createSupabaseProxyClient(request);
  const redirectUrl = new URL("/login", request.url);
  redirectUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (!client) {
    // Auth is required but Supabase isn't configured — fail closed rather
    // than silently letting every request through.
    return new NextResponse("인증 설정을 사용할 수 없습니다. 현재 주소에서 다시 시도하세요.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const { supabase, getResponse } = client;
  const {
    data: { user }, error,
  } = await supabase.auth.getUser();

  // An unavailable identity service is not proof of an expired session. Fail
  // closed at the requested URL so retry never loses the user's destination.
  if (error && (error.status === undefined || error.status === 0 || error.status === 429 || error.status >= 500)) {
    return new NextResponse("인증 서비스를 일시적으로 사용할 수 없습니다. 현재 주소에서 다시 시도하세요.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "5", "Cache-Control": "no-store" },
    });
  }

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!user && !isPublicPath) {
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL(getSafeRedirectTarget(request.nextUrl.searchParams.get("next")), request.url));
  }

  return getResponse();
}

export const config = {
  matcher: [
    // Every route except static assets and Next's own internals — an
    // auth gate must never accidentally exclude a real page route.
    "/((?!_next/static|_next/image|favicon\\.ico$|manifest\\.webmanifest$|icons/orbit-(?:180|192|512)\\.png$).*)",
  ],
};
