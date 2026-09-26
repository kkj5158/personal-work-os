import web from '../money/web-adapter.mjs';
import path from 'node:path';
export default {
 ...web, system:'money-performance', testMatch:'**/foundation.spec.mjs',
 scenarios:['money.performance.foundation'], processingEnabled:false, browserTimeout:600000,
 async prepare(ctx) {
  const env=await web.prepare(ctx);
  await ctx.run('performance-seed','java',['-cp',ctx.classpath,path.join(ctx.toolRoot,'qa/suites/money-performance/PerfSeed.java')],path.join(ctx.target,'backend'),{...ctx.javaEnv,...env},90000);
  return env;
 }
};
