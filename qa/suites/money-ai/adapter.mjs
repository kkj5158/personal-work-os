import web from '../money/web-adapter.mjs';
export const scenarios=['money.ai.seed','money.ai.review-evidence-undo','money.ai.stale-and-noise','money.ai.transfer','money.ai.merchant','money.ai.category-merge','money.ai.operations'];
export default {...web,system:'money-ai',testMatch:'**/ai.spec.mjs',processingEnabled:true,scenarios,apiChecks:[...web.apiChecks,'/api/money/ai/workbench','/api/money/ai/settings','/api/money/ai/operations','/api/money/ai/categories/proposals'],browserTimeout:600000};
