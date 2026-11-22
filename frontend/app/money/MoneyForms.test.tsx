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

test("manual refund selected by policy ID stays pending until the owner verifies a purchase",async()=>{
 const {EntryForm}=await import("./MoneyForms"),{MoneyDataProvider}=await import("./MoneyDataProvider");
 const {moneyApi}=await import("@/lib/money/model");
 const dom=new JSDOM('<div id="root"></div>',{url:'https://money.test/money/bookkeeping'});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,ResizeObserver:class{observe(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 dom.window.HTMLDialogElement.prototype.close=function(){};
 const root=createRoot(document.getElementById("root")!);
 const get=moneyApi.get,commands:Record<string,unknown>[]=[];
 moneyApi.get=async<T,>()=>[] as T;
 const category={id:"bound-refund",name:"반품 정산",kind:"INCOME" as const,archived:false,color:"#778899",version:3,semanticCode:"REFUND" as const,semanticPolicyVersion:1};
 try{
  await act(()=>root.render(<MoneyDataProvider><EntryForm value={{type:'INCOME',toAccountId:'fixture',amount:30000}}
   accounts={[account]} categories={[category]} refunds={[]} onSave={async body=>{commands.push(body);}} onClose={()=>{}}/></MoneyDataProvider>));
  const button=(label:string)=>document.querySelector<HTMLButtonElement>('[aria-label="'+label+'"]')!;
  await act(()=>button('수입 카테고리').click());
  await act(()=>button('반품 정산 직접 지정').click());
  assert.equal(commands.length,0);assert.match(document.body.textContent!,/원소비 검색/);
  const submit=()=>act(()=>{document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));});
  await submit();assert.equal(commands.length,1);assert.equal(commands[0].type,'INCOME');assert.equal(commands[0].semanticCategoryId,'bound-refund');
  assert.equal(commands[0].semanticPolicyVersion,1);assert.equal(commands[0].categoryId,null);
  const approve=[...document.querySelectorAll('label')].find(el=>el.textContent?.includes('관계와 금액을 확인'))!.querySelector('input')!;
  await act(()=>approve.click());await submit();assert.equal(commands.length,1);assert.match(document.querySelector('[role=alert]')!.textContent!,/원소비/);
 }finally{moneyApi.get=get;await act(()=>root.unmount());dom.window.close();}
});
