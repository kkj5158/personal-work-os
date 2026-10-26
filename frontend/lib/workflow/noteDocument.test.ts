import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readNoteBlocks,writeNoteBlocks,noteMarkdown} from './noteDocument';
import {newBlock} from './workpad';

test('note Markdown roundtrip retains block IDs, nested hierarchy, wiki targets and all existing metadata',()=>{
  const root=newBlock('H2','**기획** [[워크패드]]'),child=newBlock('CHECKLIST','점검\n두 번째 줄',root.id),grandchild=newBlock('BULLET','`코드`',child.id);
  root.metadata={wikiLinks:[{name:'워크패드',ordinal:0,noteId:'stable-note'}],numbered:true};child.checked=true;child.metadata={strike:true};
  const rows=[root,child,grandchild];
  const content=writeNoteBlocks(rows);
  assert.deepEqual(readNoteBlocks(content,'note'),rows);
  assert.match(noteMarkdown(content),/## \*\*기획\*\* \[\[워크패드\]\]/);
  assert.equal(noteMarkdown(content).includes('workpad:v1'),false);
  assert.deepEqual(readNoteBlocks(writeNoteBlocks([]),'empty'),[]);
});
test('legacy Markdown parses supported blocks, keeps unsupported formatting verbatim and has stable IDs',()=>{
  const markdown='# 제목\n\n- 부모\n  - [x] 자식\n    - 손자\n\n```js\nconst text = "[[not-a-link]]";\n```\n\n| 표 | 값 |\n|---|---|\n| a | b |';
  const rows=readNoteBlocks(markdown,'legacy');
  assert.equal(rows[0].type,'H1');assert.equal(rows[2].type,'CHECKLIST');assert.equal(rows[2].checked,true);
  assert.equal(rows[2].parentId,rows[1].id);assert.equal(rows[3].parentId,rows[2].id);
  assert.equal(rows[4].content,'```js\nconst text = "[[not-a-link]]";\n```');
  assert.match(rows[5].content,/\| 표 \| 값 \|/);
  assert.deepEqual(readNoteBlocks(markdown,'legacy'),rows);
});
test('invalid or externally truncated block content fails closed without a destructive fallback',()=>{
  const content=writeNoteBlocks([newBlock('TEXT','기존 내용')]);
  assert.throws(()=>readNoteBlocks(content.slice(0,-3),'note'),/Incomplete/);
  assert.throws(()=>readNoteBlocks('\n<!--workpad:v1:unknown-->','note'));
});

test('legacy image directives retain canonical media identity and captions',()=>{
  const id=crypto.randomUUID(),markdown=':::images '+JSON.stringify({images:[{src:'media:'+id,caption:'기존 이미지',ratio:1.5}],width:75,align:'center'})+'\n:::';
  const rows=readNoteBlocks(markdown,'media-note');
  assert.equal(rows[0].type,'IMAGE');assert.equal(rows[0].metadata.images?.[0].id,id);
  const saved=writeNoteBlocks(rows);assert.match(noteMarkdown(saved),new RegExp('media:'+id));
  assert.deepEqual(readNoteBlocks(saved,'media-note'),rows);
  assert.throws(()=>readNoteBlocks('text\n<!--workpad:v2:unknown-->','future-note'),/newer Workpad/);
});
