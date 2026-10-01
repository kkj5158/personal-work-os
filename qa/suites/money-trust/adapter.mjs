import category from '../money-category/adapter.mjs';
export const scenarios=['money.trust.seed','money.trust.noise-lanes','money.trust.transfer-pair','money.trust.posted-pair','money.trust.reconciliation','money.trust.opening-balance','money.trust.archived-accounts'];
// Full MONEY acceptance plus the Trust Pass: noise lanes, transfer-pair resolution, reconciliation,
// opening-balance lifecycle and archived-account history, all against the real isolated scheduler.
export default {...category,system:'money-trust',testMatch:'**/full.spec.mjs',scenarios:[...category.scenarios,...scenarios]};
