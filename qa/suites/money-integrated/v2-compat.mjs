import {expect} from '../../helpers/browser.mjs';
// Approved V2 contract: choosing creates a durable draft; only the reviewed save writes classification.
export const bookRow=(page,title)=>page.locator('.money-book-ledger tbody tr').filter({hasText:title});
export async function pickCategory(page,title,root,child=null){
 await bookRow(page,title).getByRole('button',{name:title+' 직접 분류',exact:true}).click();
 const picker=page.getByRole('dialog',{name:title+' 카테고리 선택',exact:true});
 await picker.getByRole('button',{name:root.name,exact:false}).click();
 await picker.getByRole('button',{name:child?child.name:'소분류 없음',exact:!child}).click();
 await picker.getByRole('button',{name:'선택 초안 적용 · 미저장',exact:true}).click();
 await expect(picker).toHaveCount(0);
}
export async function saveChoice(page,title){
 await bookRow(page,title).getByRole('button',{name:'초안 저장',exact:true}).click();
 const review=page.getByRole('dialog',{name:'분류 저장 전 검토',exact:true});
 await review.getByRole('button',{name:'1건 저장',exact:true}).click();
 await expect(review).toHaveCount(0);
}
