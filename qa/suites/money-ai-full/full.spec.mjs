import {test} from '../../helpers/browser.mjs';
// Existing financial acceptance intentionally exercises the retained prior workbench.
test.beforeEach(async({page})=>{const goto=page.goto.bind(page);page.goto=(url,options)=>goto(url==='/money/review'?url+'?legacy=1':url,options);});
import '../money-trust/full.spec.mjs';
import '../money-ai/ai.spec.mjs';
