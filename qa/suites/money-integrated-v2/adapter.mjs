import integrated from '../money-integrated/adapter.mjs';
import path from 'node:path';
export default {
 ...integrated, system:'money-integrated-v2', route:'/money/bookkeeping',
 testMatch:['**/v2.spec.mjs','**/monthly-accounts.spec.mjs','**/workbench.spec.mjs'], browserTimeout:1800000,
 scenarios:['money.v2.monthly-savings','money.v2.donut-filter','money.v2.account-panel-icons','money.v2.account-history','money.v2.workbench-stages','money.v2.recommendation-snapshot','money.v2.adopt-without-save','money.v2.direct-choice-save','money.v2.partial-conflict-recovery','money.v2.review-bulk-undo','money.v2.review-unknown-recovery','money.v2.responsive'],
 async prepare(ctx){const changed=await integrated.prepare({...ctx,ownedBackendRegression:true});await ctx.run('v2-review-owned-fixture','java',['-cp',ctx.classpath,path.join(ctx.toolRoot,'qa/suites/money-integrated-v2/ReviewFixture.java')],path.join(ctx.target,'backend'),{...ctx.javaEnv,...changed},60000);return changed;},
};
