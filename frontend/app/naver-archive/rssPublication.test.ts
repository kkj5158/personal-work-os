import {test} from "node:test";
import assert from "node:assert/strict";
import {rssCompletionPublication} from "./rssPublication";
test("owner completion preserves the verified RSS time unless the owner changes its date or identity",()=>{
 const source={externalPostId:"224481843682",publishedAt:"2026-11-18T03:40:38Z"};
 assert.equal(rssCompletionPublication("2026-11-18",source.externalPostId,source),source.publishedAt);
 assert.equal(rssCompletionPublication("2026-11-19",source.externalPostId,source),"2026-11-19T00:00:00+09:00");
 assert.equal(rssCompletionPublication("2026-11-18","different",source),"2026-11-18T00:00:00+09:00");
 assert.equal(rssCompletionPublication("","1",{externalPostId:"1",publishedAt:null}),null);
 assert.equal(rssCompletionPublication("2026-11-19","1",null),"2026-11-19T00:00:00+09:00");
});
