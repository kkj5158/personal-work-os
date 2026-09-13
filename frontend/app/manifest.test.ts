import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import manifest from "./manifest";
import { config } from "../proxy";

test("Orbit manifest has stable standalone identity and real matching PNG icons", async () => {
  const app = manifest();
  assert.equal(app.id, "/"); assert.equal(app.start_url, "/worklog"); assert.equal(app.scope, "/");
  assert.equal(app.name, "Orbit"); assert.equal(app.short_name, "Orbit"); assert.equal(app.display, "standalone");
  assert.equal(app.theme_color, "#f7f8fa");
  for (const icon of app.icons!) {
    const data = await readFile(`public${icon.src}`);
    assert.equal(data.subarray(1, 4).toString(), "PNG");
    assert.equal(icon.sizes, `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`);
  }
  const favicon = await readFile("app/favicon.ico");
  assert.equal(favicon.readUInt16LE(2), 1);
  assert.equal(favicon[6], 32); assert.equal(favicon[7], 32);
});
test("install metadata is public while app routes retain the production login gate", () => {
  for (const url of ["/manifest.webmanifest", "/icons/orbit-192.png", "/icons/orbit-512.png", "/icons/orbit-180.png"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url }), false, url);
  }
  for (const url of ["/worklog", "/notes?workspace=one&note=reflection", "/calendar", "/life/categories", "/icons/private", "/manifest.webmanifest/private"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url }), true, url);
  }
});
