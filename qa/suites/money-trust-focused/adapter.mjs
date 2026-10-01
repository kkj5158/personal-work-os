import web from '../money/web-adapter.mjs';
import {scenarios} from '../money-trust/adapter.mjs';
// Trust Pass scenarios only; uses the same isolated schema, scheduler and cleanup as the MONEY web adapter.
export default {...web,system:'money-trust-focused',testMatch:'**/focused.spec.mjs',apiChecks:[...web.apiChecks,'/api/money/reconciliation','/api/money/review/queue?lane=DECISION'],scenarios};
