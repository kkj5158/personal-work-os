import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

// Cookie-backed Supabase client for proxy.ts (the renamed middleware.js —
// see AGENTS.md) — refreshes the session cookie on every request so a
// client component's later getSession() call sees a current session
// without every page needing its own refresh logic. Returns null when
// Supabase env vars aren't configured, matching client.ts's convention.
export function createSupabaseProxyClient(request: NextRequest) {
  const env = getSupabaseEnv();
  if (!env) return null;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  return { supabase, getResponse: () => response };
}
