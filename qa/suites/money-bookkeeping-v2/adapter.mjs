import web from '../money/web-adapter.mjs';
export default {
 ...web,system:'money-bookkeeping-v2',sensitive:false,processingEnabled:false,
 route:'/money/bookkeeping',testMatch:['**/bookkeeping-v2.spec.mjs'],browserTimeout:1800000,
 scenarios:Array.from({length:15},(_,i)=>'money.bookkeeping.BK-Q'+String(i+1).padStart(2,'0')),
 apiChecks:['/api/money/accounts','/api/money/ai/classification/recommendations/drafts','/api/money/ai/classification/recommendations/runs','/api/money/ai/classification/recommendations/usage'],
 backendArgs:[...web.backendArgs,'--money.ai.classification-provider-enabled=false','--money.ai.bookkeeping-worker-enabled=true'],
 backgroundValidation:'Only V2 workers against an owned synthetic schema. Real providers and legacy classification workers stay disabled; shared purchase-context rules supply deterministic recommendations.',
};
