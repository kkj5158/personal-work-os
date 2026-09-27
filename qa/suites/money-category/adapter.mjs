import phase3 from '../money-phase3/adapter.mjs';
export const scenarios=['money.category.seed','money.category.management','money.category.picker-filter','money.category.move-lifecycle','money.category.rules-review','money.category.overview'];
export default {...phase3,system:'money-category',testMatch:'**/full.spec.mjs',scenarios:[...phase3.scenarios,...scenarios]};
