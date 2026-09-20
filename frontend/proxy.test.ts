import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

test("missing auth configuration fails closed at the requested URL without redirect loops", async () => {
  const previous = process.env.NEXT_PUBLIC_APP_ENV;
  process.env.NEXT_PUBLIC_APP_ENV = "prod";
  try {
    const response = await proxy(new NextRequest("https://orbit.local/notes?workspace=one&note=draft"));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("location"), null);
    assert.match(await response.text(), /다시 시도/);
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_ENV; else process.env.NEXT_PUBLIC_APP_ENV = previous; }
});
