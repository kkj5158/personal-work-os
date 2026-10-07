import test from "node:test";
import assert from "node:assert/strict";
import {groupedWebAccounts, moneyAmount, orderedRepresentatives, periodWaterfall, repaymentProgress} from "./accounts";
import type {Account} from "./model";
const account=(id:string,role:string,fundOrder=0)=>({id,role,fundOrder} as Account);
test("Web role grouping preserves API order, CASH other, unknown last independent of fund order",()=>{
  const rows=[account("b","SPENDING",0),account("a","SPENDING",99),account("cash","CASH"),account("unknown","NEW_ROLE"),account("hub","INCOME_HUB")];
  assert.deepEqual(groupedWebAccounts(rows).map(g=>g.accounts.map(a=>a.id)),[["hub"],["b","a"],[],["cash"],["unknown"]]);
});
test("representatives show first five or all ten in explicit order including archived",()=>{
  const accounts=Array.from({length:10},(_,i)=>account(String(i),"SPENDING"));accounts[4].archived=true;
  const ids=accounts.map(a=>a.id).reverse();
  assert.deepEqual(orderedRepresentatives(ids,accounts,false).map(a=>a.id),["9","8","7","6","5"]);
  assert.deepEqual(orderedRepresentatives(ids,accounts,true).map(a=>a.id),ids);
});
test("waterfall preserves negative savings/remainder and only subtracts confirmed principal once",()=>{
  assert.equal(periodWaterfall(3200000,1700000,800000,400000).at(-1)?.end,300000);
  assert.equal(periodWaterfall(3200000,1700000,-200000,400000).at(-1)?.end,1300000);
  assert.equal(periodWaterfall(3200000,3700000,800000,400000).at(-1)?.end,-1700000);
});
test("loan progress means repaid proportion and unknown/invalid principal remains unavailable",()=>{
  assert.equal(repaymentProgress(5000000,3600000),28.000000000000004);
  for(const [original,remaining] of [[null,5],[0,0],[10,11],[10,-1]] as const)assert.equal(repaymentProgress(original,remaining),null);
  assert.equal(repaymentProgress(100,0),100);
});
test("financial format preserves unknown, signed values and original currency",()=>{
  assert.equal(moneyAmount(null),"—");assert.equal(moneyAmount(-1000),"-1,000원");assert.equal(moneyAmount(10,"USD"),"10 USD");
  for(const missing of [undefined,null,""," "])assert.equal(moneyAmount(3500,missing),"3,500원");
  assert.equal(moneyAmount(3500,"JPY"),"3,500 JPY");assert.equal(moneyAmount(Number.NaN),"—");
});
