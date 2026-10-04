import path from 'node:path';
import web from '../money/web-adapter.mjs';
export default {
 ...web, system:'money-revision',sensitive:false,processingEnabled:true,
 testMatch:['**/core.spec.mjs','**/category.spec.mjs','**/review.spec.mjs'],browserTimeout:800000,
 scenarios:[
  'money.revision.overview-preferences','money.revision.stock-scopes','money.revision.transactions-rails',
  'money.revision.accounts-loans','money.revision.reconciliation','money.revision.nonhappy','money.revision.mobile-regression',
  'money.revision.category.manage-icons','money.revision.category.filter','money.revision.category.edit','money.revision.category.narrow',
  'money.revision.bookkeeping-ranges','money.revision.bookkeeping-inline-audit','money.revision.review-confirm-change-undo',
  'money.revision.review-raw-defer','money.revision.review-posted-nontransaction','money.revision.review-evidence-responsive',
 ],
 apiChecks:['/api/money/accounts','/api/money/category-groups','/api/money/overview/preferences','/api/money/overview/current-stock','/api/money/reconciliation'],
 async prepare(ctx){const changed=await web.prepare(ctx);await ctx.run('money-regression','cmd.exe',['/d','/c','gradlew.bat','test','--rerun','--no-daemon','--console=plain','--tests','com.kafka.backend.money.*','--tests','*ProdCurrentUserProviderTest','--tests','*ProdSecurityConfigJwtDecoderTest','--tests','*SecurityProfileIsolationTest'],path.join(ctx.target,'backend'),{...ctx.javaEnv,...changed},600000);return changed;},
};
