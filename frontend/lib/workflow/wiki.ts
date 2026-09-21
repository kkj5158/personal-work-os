import { normalize } from '../notes/model';
export type WikiLink = {name:string; ordinal:number; noteId:string};
export function wikiQuery(content:string,cursor:number) {
  const match=/\[\[([^\[\]\n]*)$/.exec(content.slice(0,cursor));
  return match ? {query:match[1],start:cursor-match[0].length,cursor} : null;
}
export function wikiOccurrences(content:string) {
  const counts=new Map<string,number>();
  return [...content.matchAll(/(?<![\\\[])\[\[([^\[\]\r\n]{1,240})\]\]/g)].map(m=>{
    const name=m[1].trim(),key=normalize(name),ordinal=counts.get(key)??0;counts.set(key,ordinal+1);
    return {name,ordinal,start:m.index!,end:m.index!+m[0].length};
  });
}
export function retainedLinks(content:string,links:WikiLink[]) {
  const occurrences=wikiOccurrences(content);
  return links.filter(link=>occurrences.some(o=>o.name===link.name&&o.ordinal===link.ordinal));
}

/** Move existing resolved occurrences through one text edit, never rebind by name. */
export function reconcileLinks(before:string,after:string,links:WikiLink[],edit?:{start:number;end:number}) {
  if(before===after)return retainedLinks(after,links);
  let start=0,end=before.length;
  if(edit){start=edit.start;end=edit.end;}
  else {
    while(start<before.length&&start<after.length&&before[start]===after[start])start++;
    let suffix=0;while(suffix<before.length-start&&suffix<after.length-start&&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
    end=before.length-suffix;
  }
  const delta=after.length-before.length,next=wikiOccurrences(after);
  return wikiOccurrences(before).flatMap(old=>{
    const link=links.find(l=>l.name===old.name&&l.ordinal===old.ordinal);if(!link)return [];
    const position=old.end<=start?old.start:old.start>=end?old.start+delta:-1;
    const target=next.find(n=>n.start===position&&n.name===old.name);
    return target?[{...link,ordinal:target.ordinal}]:[];
  });
}
