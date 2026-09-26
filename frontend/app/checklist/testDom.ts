// Test-only preload: React DOM decides at import time whether the native `input`
// event exists (it checks for a document). Import this first so controlled inputs'
// onChange fires in JSDOM; each test still installs its own fresh JSDOM window.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
