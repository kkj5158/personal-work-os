import web from '../money/web-adapter.mjs';
import {scenarios} from '../money-category/adapter.mjs';
export default {...web,system:'money-category-focused',testMatch:'**/focused.spec.mjs',scenarios};
