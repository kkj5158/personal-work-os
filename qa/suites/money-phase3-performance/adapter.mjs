import web from '../money/web-adapter.mjs';
import path from 'node:path';
export default {
 ...web,system:'money-phase3-performance',testMatch:'**/meaning-performance.spec.mjs',scenarios:['money.performance.phase3'],processingEnabled:false,browserTimeout:900000,
 async prepare(ctx){const env=await web.prepare(ctx);await ctx.run('meaning-performance-seed','java',['-cp',ctx.classpath,path.join(ctx.toolRoot,'qa/suites/money-phase3-performance/MeaningPerfSeed.java')],path.join(ctx.target,'backend'),{...ctx.javaEnv,...env},90000);return env;}
};
