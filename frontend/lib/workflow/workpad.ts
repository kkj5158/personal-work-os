import { reconcileLinks, type WikiLink } from "./wiki";
import type { WorkpadBlock } from "../api/workflow";

export type Block = WorkpadBlock;
export const BLOCK_MIME = "application/x-personal-os-workpad";
export const COMMANDS = [
  ["text", "TEXT", "Text"], ["bullet", "BULLET", "Bullet"], ["number", "NUMBERED", "Numbered list"],
  ["check", "CHECKLIST", "Checklist"], ["h1", "H1", "Heading 1"],
  ["h2", "H2", "Heading 2"], ["h3", "H3", "Heading 3"],
  ["callout", "CALLOUT", "Callout"], ["image", "IMAGE", "Image / Image Group"],
  ["divider", "DIVIDER", "Divider"], ["task", "CHECKLIST", "Promote to WorkTask"],
] as const;

export function newBlock(type: Block["type"] = "TEXT", content = "", parentId: string | null = null): Block {
  return { id: crypto.randomUUID(), parentId, order: 0, type, content, checked: false, workTaskId: null, sourceBlockId: null, sourceDate: null, metadata: {} };
}

/** A depth-first list is the editor's one canonical display order. */
export function ordered(blocks: Block[]): Block[] {
  const result: Block[] = [], seen = new Set<string>();
  function visit(parent: string | null) {
    blocks.filter(b => b.parentId === parent).sort((a, b) => a.order - b.order).forEach(b => {
      if (seen.has(b.id)) return;
      seen.add(b.id); result.push(b); visit(b.id);
    });
  }
  visit(null);
  return result;
}

/** Number contiguous sibling lists; descendants have their own independent runs. */
export function numberedOrdinals(blocks: Block[]): Map<string, number> {
  const counts = new Map<string | null, number>(), ordinals = new Map<string, number>();
  for (const block of ordered(blocks)) {
    const ordinal = block.type === "NUMBERED" ? (counts.get(block.parentId) ?? 0) + 1 : 0;
    counts.set(block.parentId, ordinal);
    if (ordinal) ordinals.set(block.id, ordinal);
  }
  return ordinals;
}

export function normalize(blocks: Block[]): Block[] {
  const counts = new Map<string | null, number>();
  return blocks.map(b => {
    const order = counts.get(b.parentId) ?? 0;
    counts.set(b.parentId, order + 1);
    return { ...b, order };
  });
}

export function depth(blocks: Block[], id: string): number {
  const byId = new Map(blocks.map(b => [b.id, b]));
  let parent = byId.get(id)?.parentId, level = 0;
  const seen = new Set<string>();
  while (parent && !seen.has(parent)) { seen.add(parent); level++; parent = byId.get(parent)?.parentId; }
  return level;
}

export function subtreeIds(blocks: Block[], ids: Iterable<string>): Set<string> {
  const selected = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of blocks) if (b.parentId && selected.has(b.parentId) && !selected.has(b.id)) { selected.add(b.id); changed = true; }
  }
  return selected;
}

export function selectedRoots(blocks: Block[], ids: Iterable<string>): Block[] {
  const selected = subtreeIds(blocks, ids);
  return blocks.filter(b => selected.has(b.id) && (!b.parentId || !selected.has(b.parentId)));
}

export function selectBlocks(blocks: Block[], selected: string[], anchor: string | null, id: string, shift: boolean, additive: boolean): string[] {
  if (shift && anchor) {
    const a = blocks.findIndex(b => b.id === anchor), z = blocks.findIndex(b => b.id === id);
    if (a >= 0 && z >= 0) return [...new Set([...(additive ? selected : []), ...blocks.slice(Math.min(a, z), Math.max(a, z) + 1).map(b => b.id)])];
  }
  return additive ? selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id] : [id];
}

export function insertAfter(blocks: Block[], id: string | null, incoming: Block[]): Block[] {
  const index = blocks.findIndex(b => b.id === id);
  if (index < 0) return normalize([...blocks, ...incoming]);
  const subtree = subtreeIds(blocks, [id!]);
  let end = index + 1;
  while (end < blocks.length && subtree.has(blocks[end].id)) end++;
  const parent = blocks[index].parentId;
  const next = incoming.map(b => b.parentId === null ? { ...b, parentId: parent } : b);
  return normalize([...blocks.slice(0, end), ...next, ...blocks.slice(end)]);
}

export function enterBlock(blocks: Block[], id: string, cursor?: number): { blocks: Block[]; id: string } {
  const block = blocks.find(b => b.id === id)!;
  if (!block.content && !block.workTaskId && ["CHECKLIST", "BULLET", "NUMBERED", "CALLOUT"].includes(block.type)) return { blocks: blocks.map(b => b.id === id ? { ...b, type: "TEXT", checked: false } : b), id };
  const type = ["CHECKLIST", "BULLET", "NUMBERED"].includes(block.type) || /^H[123]$/.test(block.type) && cursor !== undefined && cursor < block.content.length ? block.type : "TEXT";
  const split = cursor !== undefined && !block.workTaskId;
  const next = newBlock(type, split ? block.content.slice(cursor) : "");
  if(split)next.metadata={...block.metadata,wikiLinks:reconcileLinks(block.content,next.content,(block.metadata.wikiLinks??[]) as WikiLink[],{start:0,end:cursor})};
  return { blocks: insertAfter(split ? blocks.map(b => b.id === id ? { ...b, content: b.content.slice(0, cursor),metadata:{...b.metadata,wikiLinks:reconcileLinks(b.content,b.content.slice(0,cursor),(b.metadata.wikiLinks??[]) as WikiLink[],{start:cursor!,end:b.content.length})} } : b) : blocks, id, [next]), id: next.id };
}

/** Move selected roots together; descendants retain their own parent links. */
export function indentBlocks(blocks: Block[], ids: string[], outdent = false): Block[] {
  let result = [...blocks];
  const roots = selectedRoots(blocks, ids);
  if (outdent) {
    // Reverse iteration preserves the order when siblings are moved after their parent.
    for (const root of [...roots].reverse()) {
      const parent = result.find(b => b.id === root.parentId);
      if (!parent) continue;
      const tree = subtreeIds(result, [root.id]);
      const moving = result.filter(b => tree.has(b.id)).map(b => b.id === root.id ? { ...b, parentId: parent.parentId } : b);
      const rest = result.filter(b => !tree.has(b.id));
      const family = subtreeIds(rest, [parent.id]);
      let at = rest.findIndex(b => b.id === parent.id) + 1;
      while (at < rest.length && family.has(rest[at].id)) at++;
      result = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
    }
  } else {
    const rootIds = new Set(roots.map(b => b.id));
    for (const root of roots) {
      const at = result.findIndex(b => b.id === root.id);
      const previous = result.slice(0, at).filter(b => b.parentId === root.parentId && !rootIds.has(b.id)).at(-1);
      if (previous) result = result.map(b => b.id === root.id ? { ...b, parentId: previous.id } : b);
    }
  }
  return normalize(result);
}

/** Structural sections include headings and every indented descendant in their span. */
export function structuralIds(blocks: Block[], ids: Iterable<string>): Set<string> {
  const result = subtreeIds(blocks, ids);
  for (let i = 0; i < blocks.length; i++) {
    if (!result.has(blocks[i].id)) continue;
    const level = /^H[123]$/.test(blocks[i].type) ? Number(blocks[i].type[1]) : 0;
    if (!level) continue;
    for (let j = i + 1; j < blocks.length; j++) {
      const nextLevel = /^H[123]$/.test(blocks[j].type) ? Number(blocks[j].type[1]) : 0;
      if (nextLevel && nextLevel <= level && !subtreeIds(blocks, [blocks[i].id]).has(blocks[j].id)) break;
      result.add(blocks[j].id);
    }
  }
  return subtreeIds(blocks, result);
}
export function structuralRoots(blocks: Block[], ids: string[]): Block[] {
  const selected = new Set(ids), covered = new Set<string>();
  return blocks.filter(b => {
    if (!selected.has(b.id) || covered.has(b.id)) return false;
    structuralIds(blocks, [b.id]).forEach(id => covered.add(id)); return true;
  });
}
export function moveBlocks(blocks: Block[], ids: string[], targetId: string, before = true): Block[] {
  const roots = structuralRoots(blocks, ids), tree = structuralIds(blocks, roots.map(b => b.id));
  const target = blocks.find(b => b.id === targetId);
  // Reorder never reparents. Indent/outdent is the explicit hierarchy operation.
  if (!target || tree.has(targetId) || roots.some(b => b.parentId !== target.parentId)) return blocks;
  const moving = blocks.filter(b => tree.has(b.id)), rest = blocks.filter(b => !tree.has(b.id));
  let at = rest.findIndex(b => b.id === targetId);
  if (!before) { const family = structuralIds(rest, [targetId]); at++; while (at < rest.length && family.has(rest[at].id)) at++; }
  return normalize([...rest.slice(0, at), ...moving, ...rest.slice(at)]);
}
export function moveStructural(blocks: Block[], ids: string[], direction: -1 | 1): Block[] {
  const roots = structuralRoots(blocks, ids); if (!roots.length) return blocks;
  const family = structuralIds(blocks, roots.map(b => b.id));
  const edge = direction < 0 ? blocks.findIndex(b => family.has(b.id)) : blocks.findLastIndex(b => family.has(b.id));
  const candidates = direction < 0 ? blocks.slice(0, edge).reverse() : blocks.slice(edge + 1);
  const level=/^H[123]$/.test(roots[0].type)?Number(roots[0].type[1]):0;
  const target = candidates.find(b => b.parentId === roots[0].parentId && !family.has(b.id) && (!level || /^H[123]$/.test(b.type)&&Number(b.type[1])<=level));
  return target ? moveBlocks(blocks, ids, target.id, direction < 0) : blocks;
}
export function emptyBackspace(blocks: Block[], id: string): { blocks: Block[]; id: string; cursor: number } | null {
  const at = blocks.findIndex(b => b.id === id), block = blocks[at];
  if (!block || block.content !== "" || block.workTaskId || ["IMAGE", "IMAGE_GROUP", "DIVIDER"].includes(block.type) || structuralIds(blocks, [id]).size > 1) return null;
  const rest = blocks.filter(b => b.id !== id);
  if (!rest.length) rest.push(newBlock());
  const editable = (b: Block) => !["IMAGE", "IMAGE_GROUP", "DIVIDER"].includes(b.type);
  const previous = rest.slice(0, at).findLast(editable), next = previous ?? rest.slice(at).find(editable) ?? newBlock();
  if (!rest.includes(next)) rest.push(next);
  return { blocks: normalize(rest), id: next.id, cursor: previous ? previous.content.length : 0 };
}
export function markdownStart(content: string): { type: Block["type"]; content: string; checked?: boolean } | null {
  const match = /^(#{1,3}|[-*] \[[ xX]\]|[-*]|>|\d+\.) ([\s\S]*)$/.exec(content);
  if (!match) return null;
  const marker = match[1];
  return { type: marker[0] === "#" ? ("H" + marker.length) as Block["type"] : /\[/.test(marker) ? "CHECKLIST" : marker === ">" ? "CALLOUT" : /^\d/.test(marker) ? "NUMBERED" : "BULLET", content: match[2], checked: /\[[xX]\]/.test(marker) };
}

export function copyBlocks(blocks: Block[], ids: string[]): Block[] {
  const selected = subtreeIds(blocks, ids);
  return structuredClone(blocks.filter(b => selected.has(b.id))).map(b => ({ ...b, parentId: b.parentId && selected.has(b.parentId) ? b.parentId : null }));
}

export function cloneBlocks(blocks: Block[]): Block[] {
  const ids = new Map(blocks.map(b => [b.id, crypto.randomUUID()]));
  // A copied linked checklist deliberately keeps the same WorkTask reference.
  return normalize(structuredClone(blocks).map(b => ({ ...b, id: ids.get(b.id)!, parentId: b.parentId ? ids.get(b.parentId) ?? null : null })));
}

export function textBlocks(text: string): Block[] {
  const stack: { indent: number; id: string }[] = [], blocks: Block[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const indent = line.match(/^\s*/)?.[0].replace(/\t/g, "    ").length ?? 0;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    let content = line.trimStart();
    const check = /^(?:[-*]\s+)?\[([ xX])\]\s?(.*)$/.exec(content);
    const bullet = /^[-*•]\s+(.*)$/.exec(content);
    const markdown = markdownStart(content);
    const type = check ? "CHECKLIST" : bullet ? "BULLET" : markdown?.type ?? "TEXT";
    if (check) content = check[2]; else if (bullet) content = bullet[1]; else if (markdown) content = markdown.content;
    const block = newBlock(type, content, stack.at(-1)?.id ?? null);
    if (check) block.checked = check[1].toLowerCase() === "x";
    blocks.push(block); stack.push({ indent, id: block.id });
  }
  return normalize(blocks);
}

export function blockText(blocks: Block[]): string {
  const numbers=numberedOrdinals(blocks);
  return blocks.map(b => `${"  ".repeat(depth(blocks, b.id))}${b.type === "CHECKLIST" ? b.checked ? "- [x] " : "- [ ] " : b.type === "BULLET" ? "- " : b.type === "NUMBERED" ? `${numbers.get(b.id)}. ` : /^H[123]$/.test(b.type) ? "#".repeat(Number(b.type[1]))+" " : b.type === "CALLOUT" ? "> " : ""}${b.content}`).join("\n");
}

/** Text deletion reparents surviving children; only explicit structural Delete removes subtrees. */
export function replaceTextRange(blocks:Block[],first:string,start:number,last:string,end:number,text="",editableIds?:Set<string>){
  const a=blocks.findIndex(b=>b.id===first),z=blocks.findIndex(b=>b.id===last);
  if(a<0||z<a)return blocks;
  const removed=new Set(blocks.slice(a+1,z+1).filter(b=>!editableIds||editableIds.has(b.id)).map(b=>b.id));
  const content=blocks[a].content.slice(0,start)+text+blocks[z].content.slice(end);
  return normalize(blocks.filter(b=>!removed.has(b.id)).map(b=>b.id===first?{...b,content}:removed.has(b.parentId??"")?{...b,parentId:first}:b));
}
/** Alt+X: toggle the existing block `metadata.strike` completion mark across a text range; all struck → clear, otherwise mark all. */
export function toggleStrike(blocks:Block[],first:string,last:string=first):Block[]{
  const a=blocks.findIndex(b=>b.id===first),z=blocks.findIndex(b=>b.id===last);
  if(a<0||z<a)return blocks;
  const ids=new Set(blocks.slice(a,z+1).filter(b=>!["IMAGE","IMAGE_GROUP","DIVIDER"].includes(b.type)).map(b=>b.id));
  if(!ids.size)return blocks;
  const strike=!blocks.every(b=>!ids.has(b.id)||b.metadata.strike);
  return blocks.map(b=>ids.has(b.id)?{...b,metadata:{...b.metadata,strike}}:b);
}
export function boundaryDelete(blocks:Block[],id:string,backward:boolean){
  const at=blocks.findIndex(b=>b.id===id),b=blocks[at];if(!b)return null;
  if(backward&&b.parentId)return{blocks:indentBlocks(blocks,[id],true),id,cursor:0};
  if(backward&&b.type!=="TEXT"&&!b.workTaskId)return{blocks:blocks.map(row=>row.id===id?{...row,type:"TEXT" as const,checked:false}:row),id,cursor:0};
  const front=backward?blocks[at-1]:b,back=backward?b:blocks[at+1];
  if(!front||!back||front.workTaskId||back.workTaskId||[front,back].some(v=>["IMAGE","IMAGE_GROUP","DIVIDER"].includes(v.type)))return null;
  return{blocks:replaceTextRange(blocks,front.id,front.content.length,back.id,0),id:front.id,cursor:front.content.length};
}
export type DropZone="before"|"after"|"child"|"sibling";
export function dropBlocks(blocks:Block[],ids:string[],targetId:string,zone:DropZone):Block[]{
  const roots=selectedRoots(blocks,ids),tree=subtreeIds(blocks,roots.map(b=>b.id)),target=blocks.find(b=>b.id===targetId);
  if(!target||!roots.length||tree.has(targetId))return blocks;
  const parent=zone==="child"?target.id:zone==="sibling"?(blocks.find(b=>b.id===target.parentId)?.parentId??null):target.parentId;
  const rootIds=new Set(roots.map(b=>b.id)),moving=blocks.filter(b=>tree.has(b.id)).map(b=>rootIds.has(b.id)?{...b,parentId:parent}:b),rest=blocks.filter(b=>!tree.has(b.id));
  let at=rest.findIndex(b=>b.id===targetId);
  if(zone!=="before"){const family=subtreeIds(rest,[zone==="sibling"?(target.parentId??target.id):target.id]);at++;while(at<rest.length&&family.has(rest[at].id))at++;}
  const next=normalize([...rest.slice(0,at),...moving,...rest.slice(at)]);
  return JSON.stringify(next)===JSON.stringify(blocks)?blocks:next;
}

export type Shortcut = "enter" | "indent" | "outdent" | "toggle" | "promote" | "undo" | "redo" | null;
export function shortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; isComposing?: boolean }): Shortcut {
  if (event.isComposing) return null;
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === "z") return event.shiftKey ? "redo" : "undo";
  if (event.key === "Tab") return event.shiftKey ? "outdent" : "indent";
  if (event.key === "Enter") return mod ? event.shiftKey ? "promote" : "toggle" : event.shiftKey ? null : "enter";
  return null;
}

export function slashQuery(content: string, cursor: number): string | null {
  return /(?:^|\s)\/([a-z0-9]*)$/.exec(content.slice(0, cursor))?.[1] ?? null;
}

export function imageWidth(value: number): number { return Math.max(20, Math.min(100, Math.round(value))); }
