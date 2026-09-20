import assert from "node:assert/strict";
import { test } from "node:test";
import { apiClient, ApiError } from "./client";
test("recoverable mutation and network failures retain the current URL and expose the error", async () => {
  const original = globalThis.fetch;
  const windowOriginal = globalThis.window;
  const location = { href: "https://orbit.local/notes?note=draft", pathname: "/notes", search: "?note=draft" };
  Object.assign(globalThis, { window: { location } });
  try {
    for (const status of [400, 403, 404, 409, 422, 500, 503]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ message: "저장 실패. 다시 시도하세요." }), { status });
      await assert.rejects(apiClient.put("/test", { draft: "keep" }), (error: unknown) => error instanceof ApiError && error.status === status);
      assert.equal(location.href, "https://orbit.local/notes?note=draft");
    }
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await assert.rejects(apiClient.post("/test", {}), /Failed to fetch/);
    assert.equal(location.href, "https://orbit.local/notes?note=draft");
  } finally { globalThis.fetch = original; Object.assign(globalThis, { window: windowOriginal }); }
});

test("real authentication rejection still redirects to login with the full return context", async () => {
  const original = globalThis.fetch, originalWindow = globalThis.window, env = process.env.NEXT_PUBLIC_APP_ENV;
  process.env.NEXT_PUBLIC_APP_ENV = "prod";
  const location = { href: "https://orbit.local/notes?note=draft#section", origin: "https://orbit.local", pathname: "/notes", search: "?note=draft", hash: "#section" };
  Object.assign(globalThis, { window: { location } });
  globalThis.fetch = async () => new Response("Expired session", { status: 401 });
  try {
    await assert.rejects(apiClient.get("/test"), (error: unknown) => error instanceof ApiError && error.status === 401);
    assert.equal(new URL(location.href).pathname, "/login");
    assert.equal(new URL(location.href).searchParams.get("next"), "/notes?note=draft#section");
  } finally {
    globalThis.fetch = original; Object.assign(globalThis, { window: originalWindow });
    if (env === undefined) delete process.env.NEXT_PUBLIC_APP_ENV; else process.env.NEXT_PUBLIC_APP_ENV = env;
  }
});
