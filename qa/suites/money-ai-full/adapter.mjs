import full from '../money-trust/adapter.mjs';
import {scenarios} from '../money-ai/adapter.mjs';
export default {...full,system:'money-ai-full',testMatch:'**/full.spec.mjs',scenarios:[...full.scenarios,...scenarios],apiChecks:[...full.apiChecks,'/api/money/ai/workbench','/api/money/ai/settings','/api/money/ai/operations','/api/money/ai/categories/proposals'],browserTimeout:900000};
