/** Reorder only occupied slots in one presentation group, preserving other groups. */
export function reorderCategorySlots<T extends {id:string}>(items:T[],id:string,target:string,after:boolean,scope:(item:T)=>string):T[] {
  const moved=items.find(item=>item.id===id),over=items.find(item=>item.id===target);
  if(!moved||!over||id===target||scope(moved)!==scope(over))return items;
  const siblings=items.filter(item=>scope(item)===scope(moved)).filter(item=>item.id!==id);
  siblings.splice(siblings.findIndex(item=>item.id===target)+(after?1:0),0,moved);
  let at=0;return items.map(item=>scope(item)===scope(moved)?siblings[at++]:item);
}
