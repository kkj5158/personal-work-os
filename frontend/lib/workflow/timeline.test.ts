import assert from 'node:assert/strict';
import {test} from 'node:test';
import {changeRange,monthDates,timelineRows} from './timeline';
import type {Project,Phase,WorkTask} from '../api/workflow';
test('month-only grid handles leap days and one-day snapping across month boundaries',()=>{
 assert.equal(monthDates('2028-02').length,29);assert.equal(monthDates('2026-09').length,30);
 const range={start:'2026-09-29',end:'2026-10-03'};
 assert.deepEqual(changeRange(range,'move',1.7),{start:'2026-10-01',end:'2026-10-05'});
 assert.deepEqual(changeRange(range,'start',-2),{start:'2026-09-27',end:range.end});
 assert.deepEqual(changeRange(range,'end',3),{start:range.start,end:'2026-10-06'});
 assert.deepEqual(changeRange(range,'start',100),{start:range.end,end:range.end});
 assert.deepEqual(changeRange(range,'end',-100),{start:range.start,end:range.start});
});
test('project/phase changes leave child dates intact; hierarchy collapses without inferring parent dates',()=>{
 const project:Project={id:'p',title:'P',status:'ACTIVE',startDate:'2026-09-01',endDate:'2026-09-05',color:'#4477aa',memo:null,order:0};
 const phase:Phase={id:'h',projectId:'p',title:'H',status:'TODO',startDate:'2026-09-03',endDate:'2026-09-10',memo:null,order:0};
 const task:WorkTask={id:'t',projectId:'p',phaseId:'h',title:'T',status:'TODO',startDate:'2026-09-12',dueDate:'2026-09-15',priority:'NORMAL',memo:null,order:0};
 const rows=timelineRows([project],[phase],[task],new Set());assert.deepEqual(rows.map(r=>r.depth),[0,1,2]);
 changeRange({start:rows[0].start!,end:rows[0].end!},'move',5);changeRange({start:rows[1].start!,end:rows[1].end!},'move',5);
 assert.equal(phase.startDate,'2026-09-03');assert.equal(task.startDate,'2026-09-12');assert.equal(rows[0].end,'2026-09-05');
 assert.equal(timelineRows([project],[phase],[task],new Set(['p'])).length,1);assert.equal(timelineRows([project],[phase],[task],new Set(['h'])).length,2);
});
