"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

// Browser-side Supabase client — used only for auth (sign-in/sign-out,
// reading the current session's access token). Never used for direct data
// access: business tables are only ever reached through the Spring Boot
// backend (see CLAUDE.md's architecture rule), so no RLS-dependent query
// ever runs through this client. Returns null when Supabase env vars
// aren't configured (e.g. local dev without auth set up) — callers must
// treat that as "not authenticated" rather than throwing, so dev keeps
// working without requiring Supabase credentials.
export function createSupabaseBrowserClient() {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createBrowserClient(env.url, env.publishableKey);
}
