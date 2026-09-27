import '../money-phase3/meaning.spec.mjs';
import {test} from '../../helpers/browser.mjs';
import {scenarios} from './adapter.mjs';
// Reuse canonical assertions and their seed prerequisites without rerunning
// unrelated financial/Bridge scenarios during a focused hierarchy correction.
test.beforeEach(({},info)=>test.skip(!scenarios.includes(info.title),'Outside affected category regression'));
