// Whether this frontend build enforces real Supabase Auth login. Mirrors
// the backend's SPRING_PROFILES_ACTIVE dev/prod split — DEV keeps the
// existing no-login convenience (the backend's DevCurrentUserProvider
// ignores any Authorization header entirely), so the login gate in proxy.ts
// only activates when this is explicitly "prod". Never inferred from
// NODE_ENV, which is also "production" for a local `next build`/`next
// start` test — an explicit flag avoids accidentally locking out local
// development.
export function isAuthRequired(): boolean {
  return process.env.NEXT_PUBLIC_APP_ENV === "prod";
}

export function getSupabaseEnv(): { url: string; publishableKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
