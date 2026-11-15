import type {WorkpadBlock} from '@/lib/api/workflow';

/** Reset/undo patches only check state, including descendants in the canonical flat tree. */
export function routineProgress(blocks:WorkpadBlock[]) {
  const checks=blocks.filter(b=>b.type==='CHECKLIST');
  return {total:checks.length,completed:checks.filter(b=>b.checked).length};
}
export function clearRoutineChecks(blocks:WorkpadBlock[]) {
  const ids=blocks.filter(b=>b.type==='CHECKLIST'&&b.checked).map(b=>b.id);
  return {ids,blocks:blocks.map(b=>ids.includes(b.id)?{...b,checked:false}:b)};
}
export function restoreRoutineChecks(blocks:WorkpadBlock[],ids:string[]) {
  return blocks.map(b=>b.type==='CHECKLIST'&&ids.includes(b.id)?{...b,checked:true}:b);
}
