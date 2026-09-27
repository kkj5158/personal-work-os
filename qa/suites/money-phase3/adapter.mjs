import phase2 from '../money-phase2/adapter.mjs';
export default {
 ...phase2,system:'money-phase3',testMatch:'**/meaning.spec.mjs',browserTimeout:900000,
 scenarios:[...phase2.scenarios,'money.phase3.seed','money.phase3.tracking','money.phase3.bookkeeping','money.phase3.categories','money.phase3.rules','money.phase3.history','money.phase3.review','money.phase3.raw-review','money.phase3.settings']
};
