// Guards against an open redirect via the login page's `next` query param
// (e.g. /login?next=https://evil.example.com or ?next=//evil.example.com).
// Only an internal, same-origin application path is ever handed to
// router.replace() — anything else falls back to DEFAULT_REDIRECT_TARGET.
export const DEFAULT_REDIRECT_TARGET = "/worklog";

// Resolving `next` against an arbitrary internal placeholder origin (never
// actually requested) and then comparing the resulting origin back to that
// same placeholder is what makes this robust rather than a regex
// blocklist: the WHATWG URL parser itself resolves every trick a regex
// would have to enumerate by hand — an absolute http(s) URL overrides the
// base outright (different origin), a protocol-relative "//evil.example.com"
// inherits the base's scheme but not its host (different origin), a
// javascript:/data:/custom scheme replaces the whole URL (different or
// opaque origin), and a backslash trick ("/\evil.com") is normalized to
// "//evil.com" by the parser itself for special schemes like https (again a
// different origin) — so a single origin comparison catches all of them
// without needing to special-case any one of them.
const SAFE_BASE_ORIGIN = "https://login-safe-redirect.invalid";

export function getSafeRedirectTarget(next: string | null | undefined): string {
  if (!next) return DEFAULT_REDIRECT_TARGET;
  // Only ever consider a same-origin path reference to begin with — a bare
  // "evil.com" (no leading slash) would otherwise resolve relative to the
  // placeholder base's own path and pass the origin check below while not
  // looking like one of the internal paths this is meant to accept.
  if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_REDIRECT_TARGET;

  let url: URL;
  try {
    url = new URL(next, SAFE_BASE_ORIGIN);
  } catch {
    return DEFAULT_REDIRECT_TARGET;
  }

  if (url.origin !== SAFE_BASE_ORIGIN) return DEFAULT_REDIRECT_TARGET;

  const target = `${url.pathname}${url.search}${url.hash}`;
  return target || DEFAULT_REDIRECT_TARGET;
}
