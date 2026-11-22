"use client";
import {useEffect,useState} from "react";
import {apiClient} from "@/lib/api/client";
import type {EngineJob} from "@/lib/study/engine";

type Item = {digest:string;part:string; stage:string; question:{id:string;prompt:string;context?:string;options?:{id:string;text:string}[]};reading:{pageIndex:number;pageLabel?:string;text:string}[];key?:{model:string;explanation:string;rubric:string[];hints:string[]};finding?:{repair?:string}|string};
const issues:Record<string,string>={SOURCE_UNSUITABLE:"학습 목표에 맞는 본문 필요",HIDDEN_PREMISE:"해설의 숨은 전제 확인",DISAGREEMENT:"풀이와 심사 결과 대조",SCHEMA:"문항 형식 보완",AMBIGUOUS:"선택 근거 보완",SHORTCUT:"단일 단서로 풀리는 문제 보완",HINT_LEAK:"힌트에서 정답 단서 제거",RUBRIC:"채점 기준 보완",SOURCE_QUOTE_MISMATCH:"인용 구절 재확인"};
function PreviewHint({binding,level,text}:{binding:string;level:number;text:string}){
 const storageKey="study-draft-hint/"+binding+"/"+level;
 const [open,setOpen]=useState(()=>{try{return sessionStorage.getItem(storageKey)==="open";}catch{return false;}});
 return <details open={open} onToggle={e=>{
   const value=e.currentTarget.open;setOpen(value);
   try{if(value)sessionStorage.setItem(storageKey,"open");else sessionStorage.removeItem(storageKey);}catch{/* Storage can be disabled. */}
 }}><summary>미리보기 힌트 {level}</summary>{text}</details>;
}
export function CampaignPreview({job}:{job:EngineJob}){
 const [items,setItems]=useState<Item[]>([]);
 const [error,setError]=useState("");
 const [pdf,setPdf]=useState("");
 useEffect(()=>()=>{if(pdf)URL.revokeObjectURL(pdf);},[pdf]);
 const campaign=job.campaign;
 if(!campaign)return null;
 const base="/api/study/engine/jobs/"+encodeURIComponent(job.id)+"/draft";
 async function inspect(answers:boolean){
  try{setError("");setPdf("");const v=await apiClient.get<{items:Item[]}>(base+"?answers="+answers);setItems(v.items);}catch{setError("초안을 불러올 수 없습니다.");}
 }
 async function download(answers:boolean){
  try{setError("");setPdf(URL.createObjectURL(await apiClient.blob(base+".pdf?answers="+answers)));}catch{setError("초안 PDF를 준비할 수 없습니다.");}
 }
 return <section aria-label="소유자 초안 검토"><h4>문항별 출제 현황</h4>
 <p>{campaign.slots.filter(s=>s.stage==="ACCEPTED").length}문항 통과 · 모델 호출 {campaign.calls}/40 · 관측 토큰 {campaign.tokens.toLocaleString()}</p>
 <ul>{campaign.slots.map(s=><li key={s.kind+s.order}>{s.kind==="single_choice"?"객관식":s.kind==="essay"?"서술형":"확장 사례"} {s.order}번 · {s.stage==="ACCEPTED"?"통과":s.stage==="UNRESOLVED"?"보완 필요":s.stage==="PLANNED"?"출처 계획 대기":"검토 중"} · 보완 기회 {Math.min(2,3-s.cycles)}회 · 출처 재선정 {1-s.replans}회{ s.issue?" · "+(issues[s.issue]??"문항 근거 보완"):""}</li>)}</ul>
 <button onClick={()=>void inspect(false)}>학습자 보기</button> <button onClick={()=>void inspect(true)}>소유자 해설 보기</button>
 <button onClick={()=>void download(false)}>초안 문제지 PDF</button> <button onClick={()=>void download(true)}>초안 해설지 PDF</button>
 {pdf&&<a href={pdf} download="study-private-draft.pdf">준비된 초안 내려받기</a>}
 {error&&<p role="alert">{error}</p>}
 {items.map((i,n)=><article key={n}><h5>{i.question.prompt}</h5><p>{i.question.context}</p>{i.question.options?.map(o=><p key={o.id}>{o.id}. {o.text}</p>)}
 {i.reading.map((r,k)=><details key={k}><summary>근거 자료 · PDF {r.pageIndex}쪽</summary><p>{r.text}</p></details>)}
 {i.key&&<><p>{i.key.model}</p><p>{i.key.explanation}</p><ul>{i.key.rubric.map((v,k)=><li key={k}>{v}</li>)}</ul>{i.key.hints.map((v,k)=><PreviewHint key={i.digest+"/"+k} binding={job.id+"/"+i.digest} level={k+1} text={v}/>)}</>}
 {typeof i.finding==="object"&&<p>{i.finding?.repair}</p>}</article>)}</section>;
}
