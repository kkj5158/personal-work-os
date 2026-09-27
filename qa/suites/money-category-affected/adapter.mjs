import web from '../money/web-adapter.mjs';
export const scenarios=['money.phase2.seed','money.phase3.seed','money.phase3.tracking','money.phase3.bookkeeping','money.phase3.categories','money.phase3.rules','money.phase3.history','money.phase3.review'];
export default {...web,system:'money-category-affected',testMatch:'**/affected.spec.mjs',scenarios,browserTimeout:600000};
