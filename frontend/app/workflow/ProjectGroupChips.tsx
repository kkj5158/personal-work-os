'use client';
import type {ReactNode} from 'react';
import type {Project} from '@/lib/api/workflow';
import type {ProjectGroupSection} from '@/lib/workflow/catalog';

/**
 * Projects grouped the way the Projects page groups them (group order → Project order), as compact inline clusters.
 * Shared by Waiting (project contexts and the 전체 project filter) and All To-dos (project filter) so both read as one
 * WORK FLOW system. Values are always Project ids; a group is only presentation, or — when `onToggleGroup` is given —
 * a shortcut that selects / clears every Project of that group.
 */
export function ProjectGroupChips({sections,pressed,onPick,onToggleGroup,count,note,leading,trailing,chipClassName=''}:{
 sections:ProjectGroupSection[];pressed:(id:string)=>boolean;onPick:(id:string)=>void;onToggleGroup?:(ids:string[])=>void;
 count?:(id:string)=>number;note?:(project:Project)=>string|undefined;leading?:ReactNode;trailing?:ReactNode;chipClassName?:string;
}){
 return <div className="wf-pgroups">
  {leading}
  {sections.map(section=>{
   const ids=section.projects.map(project=>project.id),all=ids.every(pressed);
   return <span key={section.key} className="wf-pgroup" role="group" aria-label={`${section.name} 그룹`}>
    {onToggleGroup?<button type="button" className="wf-pgroup-name is-toggle" aria-pressed={all} aria-label={`${section.name} 그룹 전체`} title={all?`${section.name}의 프로젝트 선택 해제`:`${section.name}의 프로젝트 모두 선택`} onClick={()=>onToggleGroup(ids)}>{section.name}</button>
     :<span className="wf-pgroup-name" title={section.name}>{section.name}</span>}
    {section.projects.map(project=>{const extra=note?.(project);return <button key={project.id} type="button" className={`wf-pchip ${chipClassName}`} aria-pressed={pressed(project.id)} title={extra?`${project.title} · ${extra}`:project.title} onClick={()=>onPick(project.id)}>
     <span className="wf-filter-dot" style={{background:project.color||'#0969da'}} aria-hidden/><span className="wf-pchip-name">{project.title}</span>
     {extra&&<small className="wf-pchip-note">{extra}</small>}{count&&<small className="wf-pchip-count">{count(project.id)}</small>}
    </button>;})}
   </span>;
  })}
  {trailing}
 </div>;
}

/** Group → Project filter row (All To-dos, Waiting 전체): 전체 / 프로젝트 없음 first, then the Projects-page groups. */
export function ProjectGroupFilter({sections,selected,onChange,unassigned,count}:{sections:ProjectGroupSection[];selected:string[];onChange:(next:string[])=>void;unassigned:string;count?:(id:string)=>number}){
 const toggle=(id:string)=>onChange(selected.includes(id)?selected.filter(item=>item!==id):[...selected,id]);
 const toggleGroup=(ids:string[])=>onChange(ids.every(id=>selected.includes(id))?selected.filter(id=>!ids.includes(id)):[...new Set([...selected,...ids])]);
 return <div className="wf-filter-row" role="group" aria-label="프로젝트 필터"><span className="wf-filter-label">프로젝트</span>
  <div className="wf-filter-buttons wf-project-filter">
   <ProjectGroupChips sections={sections} pressed={id=>selected.includes(id)} onPick={toggle} onToggleGroup={toggleGroup} count={count}
    leading={<span className="wf-pgroup is-plain"><button type="button" className="wf-pchip" aria-pressed={!selected.length} onClick={()=>onChange([])}>전체</button>
     <button type="button" className="wf-pchip" aria-pressed={selected.includes(unassigned)} onClick={()=>toggle(unassigned)}><span className="wf-filter-dot" style={{background:'#8c959f'}} aria-hidden/>프로젝트 없음{count&&<small className="wf-pchip-count">{count(unassigned)}</small>}</button></span>}/>
  </div>
 </div>;
}
