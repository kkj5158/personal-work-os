// Regression coverage for the login open-redirect fix. Same rationale as
// lib/seoulDate.test.ts and app/worklog/criteriaSave.test.ts: no test
// runner is installed in this frontend, so this is a small assert-based
// script runnable directly via `node app/login/safeRedirect.test.ts`
// (Node 22.6+), exercising the real getSafeRedirectTarget used by
// app/login/page.tsx.
import assert from "node:assert/strict";
import { DEFAULT_REDIRECT_TARGET, getSafeRedirectTarget } from "./safeRedirect.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const SAFE_CASES = ["/worklog", "/planning", "/worklog?foo=bar", "/worklog#section", "/", "/a/b/c?x=1&y=2"];

for (const next of SAFE_CASES) {
  test(`accepts safe same-origin path: ${next}`, () => {
    assert.equal(getSafeRedirectTarget(next), next);
  });
}

const UNSAFE_CASES: Array<[string, string]> = [
  ["absolute http URL", "http://evil.example.com"],
  ["absolute https URL", "https://evil.example.com"],
  ["absolute https URL with a same-looking path", "https://evil.example.com/worklog"],
  ["protocol-relative URL", "//evil.example.com"],
  ["protocol-relative URL with path", "//evil.example.com/worklog"],
  ["javascript scheme", "javascript:alert(1)"],
  ["data scheme", "data:text/html,<script>alert(1)</script>"],
  ["custom scheme", "myapp://evil.example.com"],
  ["backslash trick", "/\\evil.example.com"],
  ["backslash trick, double", "\\\\evil.example.com"],
  ["no leading slash (bare host-looking string)", "evil.example.com"],
  ["whitespace-prefixed absolute URL", " https://evil.example.com"],
];

for (const [label, next] of UNSAFE_CASES) {
  test(`rejects unsafe target (${label}) and falls back to ${DEFAULT_REDIRECT_TARGET}`, () => {
    assert.equal(getSafeRedirectTarget(next), DEFAULT_REDIRECT_TARGET);
  });
}

test("missing next falls back to the default target", () => {
  assert.equal(getSafeRedirectTarget(null), DEFAULT_REDIRECT_TARGET);
  assert.equal(getSafeRedirectTarget(undefined), DEFAULT_REDIRECT_TARGET);
  assert.equal(getSafeRedirectTarget(""), DEFAULT_REDIRECT_TARGET);
});
