import test from "node:test";
import assert from "node:assert/strict";
import {groupedWebAccounts, groupedFundAccounts, accountUpdatePayload, toggleRepresentative, moneyAmount, orderedRepresentatives, periodWaterfall, repaymentProgress} from "./accounts";
import type {Account} from "./model";
const account=(id:string,role:string,fundOrder=0)=>({id,role,fundOrder} as Account);
test("V2 independent fund groups retain API ordering and never derive group from role",()=>{
  const a={...account("first","SAVINGS",99),fundGroup:"LIVING" as const},b={...account("second","SPENDING"),fundGroup:"LIVING" as const},c={...account("third","CASH"),fundGroup:"SAVINGS" as const};
  assert.deepEqual(groupedFundAccounts([a,c,b]).map(g=>[g.id,g.accounts.map(a=>a.id)]),[["LIVING",["first","second"]],["SAVINGS",["third"]],["OTHER",[]]]);
});
test("one-field updates preserve persisted icons, bank identity, funding, inclusion and memo",()=>{
  const a={...account("id","PURPOSE_INSTALLMENT"),provider:"KAKAO",displayName:"before",version:9,emoji:"🌿",imageData:"data:image/png;base64,custom",suffix:"0123",maskedReference:"123***",fundingAccountId:"parent",memo:"memo",includeInAssets:false,includeInStatistics:false};
  const payload=accountUpdatePayload(a,{displayName:"after"});
  assert.equal(payload.expectedVersion,9);assert.equal(payload.account.displayName,"after");
  for(const key of ["provider","role","emoji","imageData","suffix","maskedReference","fundingAccountId","memo","includeInAssets","includeInStatistics"] as const)assert.equal(payload.account[key],a[key]);
});
test("representative toggles preserve custom layout and fail existing caps without mutation",()=>{
  const current={accountIds:["a","b"],version:4,layout:{layoutVersion:1,rows:[{id:"custom",name:"My row",accountIds:["a","b"]}]}};
  assert.deepEqual(toggleRepresentative(current,"c",true),{accountIds:["a","b","c"],expectedVersion:4,layout:{layoutVersion:1,rows:[{id:"custom",name:"My row",accountIds:["a","b","c"]}]}});
  assert.deepEqual(toggleRepresentative(current,"a",false).layout?.rows[0],{id:"custom",name:"My row",accountIds:["b"]});
  assert.deepEqual(current.layout.rows[0].accountIds,["a","b"]);
  assert.throws(()=>toggleRepresentative({accountIds:Array.from({length:10},(_,i)=>String(i)),version:1},"new",true),/10/);
});
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
