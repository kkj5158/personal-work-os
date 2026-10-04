"use client";
import { useRef, useEffect, useState } from "react";
import type { Account } from "@/lib/money/model";
import { groupedWebAccounts } from "@/lib/money/accounts";

function GroupCheckbox({checked,partial,onChange,label}:{checked:boolean;partial:boolean;onChange:()=>void;label:string}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if(ref.current) ref.current.indeterminate = partial; },[partial]);
  return <label><input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label}/>{label}</label>;
}
export function GroupedAccountFilter({accounts,value,onChange}:{accounts:Account[];value:string[]|null;onChange:(ids:string[]|null)=>void}) {
  const [archived,setArchived] = useState(false);
  const selected = new Set(value ?? accounts.map(a=>a.id));
  const toggle = (ids:string[]) => {
    const next = new Set(selected);
    const remove = ids.every(id=>next.has(id));
    ids.forEach(id=>remove?next.delete(id):next.add(id));
    onChange([...next]);
  };
  return <section className="money-grouped-filter" aria-label="그룹별 계좌 필터">
    <header><strong>계좌</strong><button onClick={()=>onChange(null)}>전체 선택</button><button onClick={()=>onChange([])}>전체 해제</button>
      <label><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/>보관 계좌 표시</label></header>
    {groupedWebAccounts(accounts.filter(a=>archived||!a.archived||value?.includes(a.id))).filter(g=>g.accounts.length).map(g=>{
      const ids=g.accounts.map(a=>a.id), count=ids.filter(id=>selected.has(id)).length;
      return <div className="money-account-filter-group" key={g.id}>
        <GroupCheckbox checked={count===ids.length} partial={count>0&&count<ids.length} onChange={()=>toggle(ids)} label={g.label}/>
        <div>{g.accounts.map(a=><button key={a.id} aria-pressed={selected.has(a.id)} onClick={()=>toggle([a.id])}>{a.displayName}{a.archived?" · 보관":""}</button>)}</div>
        <button onClick={()=>{onChange([...new Set([...selected,...ids])]);}}>선택</button><button onClick={()=>onChange([...selected].filter(id=>!ids.includes(id)))}>해제</button>
      </div>;
    })}
    {value?.length===0&&<p className="money-muted">선택한 계좌가 없어 결과가 비어 있습니다.</p>}
  </section>;
}
