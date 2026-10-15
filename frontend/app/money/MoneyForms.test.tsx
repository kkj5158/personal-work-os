import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import * as nodeModule from "node:module";
const {registerHooks}=nodeModule as unknown as {registerHooks:(hooks:{load:(url:string,context:unknown,next:(url:string,context:unknown)=>unknown)=>unknown})=>unknown};
registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return next(url,context);}});
const account = {
  id: "fixture",
  provider: "CASH",
  displayName: "Fixture cash",
  role: "CASH" as const,
  maskedReference: null,
  suffix: null,
  archived: false,
  version: 0,
  emoji: null,
  imageData: null,
  fundingAccountId: null,
};
test("account setup submits manual cash without bank identity and keeps save failures visible", async () => {
  const {AccountForm}=await import("./MoneyForms");
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, {
    React,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const root = createRoot(document.getElementById("root")!);
  let submitted: unknown;
  try {
    await act(() =>
      root.render(
        <AccountForm
          value={account}
          accounts={[]}
          onClose={() => {}}
          onSave={async (v) => {
            submitted = v;
            throw Error("Version conflict");
          }}
        />,
      ),
    );
    assert.equal(
      document.querySelector('input[placeholder="알림에 표시되는 끝자리"]'),
      null,
    );
    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        );
      await Promise.resolve();
    });
    assert.equal((submitted as { provider: string }).provider, "CASH");
    assert.equal((submitted as { suffix: null }).suffix, null);
    assert.match(
      document.querySelector("[role=alert]")!.textContent!,
      /Version conflict/,
    );
  } finally {
    await act(() => root.unmount());
    dom.window.close();
  }
});
test("manual transfer form keeps two account sides and submits one ledger record", async () => {
  const {EntryForm}=await import("./MoneyForms");
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, {
    React,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {};
  const root = createRoot(document.getElementById("root")!);
  let submitted: Record<string, unknown> | undefined;
  try {
    await act(() =>
      root.render(
        <EntryForm
          value={{
            type: "TRANSFER",
            fromAccountId: "fixture",
            toAccountId: "other",
            amount: 100,
            occurredAt: "2026-09-24T01:00:29.123Z",
          }}
          accounts={[account, { ...account, id: "other" }]}
          categories={[]}
          refunds={[]}
          onClose={() => {}}
          onSave={async (v) => {
            submitted = v;
          }}
        />,
      ),
    );
    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        );
      await Promise.resolve();
    });
    assert.equal(submitted?.type, "TRANSFER");
    assert.equal(submitted?.fromAccountId, "fixture");
    assert.equal(submitted?.toAccountId, "other");
    assert.equal(submitted?.amount, 100);
    assert.equal(submitted?.occurredAt, "2026-09-24T01:00:29.123Z");
  } finally {
    await act(() => root.unmount());
    dom.window.close();
  }
});
