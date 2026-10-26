import { newBlock, ordered, depth, textStyle, type Block } from './workpad';

// The existing journal_notes.content remains Markdown. A versioned, invisible
// footer retains block identities/layout; body text is stored exactly once.
// Keep it after the body to preserve existing bounded NOTE SYS excerpts.
const PREFIX = '\n<!--workpad:v1:';
type Layout = Omit<Block, 'content'> & { length:number; prefix:string };
export const isWorkpadNote = (content:string) => /\n<!--workpad:v\d+:/.test(content);
export function noteMarkdown(content:string) {
  return isWorkpadNote(content) ? content.slice(0,content.lastIndexOf(PREFIX)) : content;
}
function stableId(seed:string) {
  const words=[0,1,2,3].map(s=>{let h=2166136261+s;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16).padStart(8,'0');}).join('');
  return `${words.slice(0,8)}-${words.slice(8,12)}-4${words.slice(13,16)}-a${words.slice(17,20)}-${words.slice(20)}`;
}
export function readNoteBlocks(content:string,noteId:string):Block[] {
  if(isWorkpadNote(content)) {
    if(!content.includes(PREFIX))throw new Error('This note uses a newer Workpad format; original content is retained.');
    const end=content.lastIndexOf(PREFIX);
    if(!content.endsWith('-->'))throw new Error('Incomplete Workpad note; original content is retained.');
    const layout:Layout[]=JSON.parse(decodeURIComponent(content.slice(end+PREFIX.length,-3)));
    let at=0;
    const blocks=layout.map(({length,prefix,...block})=>{
      if(!Number.isSafeInteger(length)||length<0||typeof prefix!=='string'||!block.id||!block.metadata)throw new Error('Invalid Workpad note layout; original content is retained.');
      if(content.slice(at,at+prefix.length)!==prefix)throw new Error('Workpad note Markdown changed outside its editor; original content is retained.');
      at+=prefix.length;const text=content.slice(at,at+length);at+=length;
      if(content.slice(at,at+2)!=='\n\n')throw new Error('Incomplete Workpad block; original content is retained.');at+=2;
      return {...block,content:text};
    });
    if(at!==end||new Set(blocks.map(b=>b.id)).size!==blocks.length||ordered(blocks).length!==blocks.length)throw new Error('Invalid Workpad note tree; original content is retained.');
    return ordered(blocks);
  }
  // Conservative legacy import. Unsupported Markdown (tables, code, HTML, media)
  // stays verbatim in a text block. Merely opening a note never rewrites it.
  if(!content)return [];
  const blocks:Block[]=[],parents:{indent:number;id:string}[]=[];
  const chunks=content.split(/\n\n/);let offset=0;
  for(const chunk of chunks) {
    const media=/^:::images ([^\n]+)\n:::$/.exec(chunk);
    if(media) {
      try {
        const row=JSON.parse(media[1]);
        if(Array.isArray(row.images)&&row.images.length&&row.images.every((image:{src?:string})=>/^media:[0-9a-f-]{36}$/i.test(image.src??''))) {
          const block=newBlock(row.images.length>1?'IMAGE_GROUP':'IMAGE');block.id=stableId(noteId+':'+offset);block.order=blocks.length;
          block.metadata={images:row.images.map((image:{src:string;caption?:string;ratio?:number})=>({id:image.src.slice(6),caption:image.caption??'',width:row.width??100,ratio:image.ratio})),align:row.align??'left'};
          blocks.push(block);offset+=chunk.length+2;continue;
        }
      }catch{/* Keep malformed or external-image directives verbatim. */}
    }
    const lines=/^\s*(?:[-*+] |\d+[.)] )/m.test(chunk)&&!/^\s*(```|~~~|:::)/m.test(chunk)?chunk.split('\n'):[chunk];
    for(const line of lines) {
      const match=/^(\s*)(?:(#{1,3}) |([-*+]|\d+[.)]) (?:\[([ xX])\] )?)([\s\S]*)$/.exec(line);
      const indent=match?.[1].length??0;while(parents.length&&parents.at(-1)!.indent>=indent)parents.pop();
      const type=match?.[2]?`H${match[2].length}`:match?.[4]!==undefined?'CHECKLIST':match?.[3]?(/^\d/.test(match[3])?'NUMBERED':'BULLET'):'TEXT';
      const block=newBlock(type as Block['type'],match?match[5]:line,match&&indent?parents.at(-1)?.id??null:null);
      block.id=stableId(noteId+':'+offset);block.order=blocks.length;block.checked=/[xX]/.test(match?.[4]??'');
      blocks.push(block);if(match)parents.push({indent,id:block.id});offset+=line.length+1;
    }
    offset++;
  }
  return ordered(blocks);
}
export function writeNoteBlocks(blocks:Block[]):string {
  const rows=ordered(blocks),layout:Layout[]=[],body:string[]=[];
  for(const block of rows) {
    const {content,...data}=block;
    const style=textStyle(block),indent='  '.repeat(depth(rows,block.id));
    const images=block.metadata.images;
    const imagePrefix=images?.length?':::images '+JSON.stringify({images:images.map(image=>({src:'media:'+image.id,caption:image.caption??'',ratio:image.ratio??1})),width:images[0].width??100,align:block.metadata.align??'left'})+'\n:::\n':'';
    const prefix=imagePrefix+indent+(block.type==='CHECKLIST'?`- [${block.checked?'x':' '}] `:style.startsWith('H')?'#'.repeat(Number(style.slice(1)))+' ':block.type==='BULLET'?'- ':block.type==='NUMBERED'?'1. ':block.type==='CALLOUT'?'> ':block.type==='DIVIDER'?'---':'');
    layout.push({...data,length:content.length,prefix});body.push(prefix+content+'\n\n');
  }
  return body.join('')+PREFIX+encodeURIComponent(JSON.stringify(layout))+'-->';
}
