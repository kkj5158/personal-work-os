"use client";
import {useEffect,useRef,useState} from "react";
import {apiClient} from "@/lib/api/client";
import type {EngineJob} from "@/lib/study/engine";

type Item = {digest:string;part:string; stage:string; question:{id:string;prompt:string;context?:string;guidance?:string;options?:{id:string;text:string}[]};reading:{pageIndex:number;pageLabel?:string;text:string}[];key?:{answer?:string;model:string;explanation:string;rubric:string[];hints:string[];incorrectReasons?:Record<string,string>;citations?:{quote:string}[]};finding?:{repair?:string}|string};
const issues:Record<string,string>={RUBRIC_COUNT:"서로 다른 평가 기준 보완",CITATION_LIMIT:"겹치는 출처 인용 정리",CITATION_SUPPORT:"기존 자료에서 필요한 인용 보완",SOURCE_UNSUITABLE:"학습 목표에 맞는 본문 필요",HIDDEN_PREMISE:"해설의 숨은 전제 확인",DISAGREEMENT:"풀이와 심사 결과 대조",SCHEMA:"문항 형식 보완",AMBIGUOUS:"선택 근거 보완",SHORTCUT:"단일 단서로 풀리는 문제 보완",HINT_LEAK:"힌트에서 정답 단서 제거",RUBRIC:"채점 기준 보완",SOURCE_QUOTE_MISMATCH:"인용 구절 재확인"};
function PreviewHint({binding,level,text}:{binding:string;level:number;text:string}){
 const storageKey="study-draft-hint/"+binding+"/"+level;
 const [open,setOpen]=useState(()=>{try{return sessionStorage.getItem(storageKey)==="open";}catch{return false;}});
 return <details open={open} onToggle={e=>{
   const value=e.currentTarget.open;setOpen(value);
   try{if(value)sessionStorage.setItem(storageKey,"open");else sessionStorage.removeItem(storageKey);}catch{/* Storage can be disabled. */}
 }}><summary>미리보기 힌트 {level}</summary>{text}</details>;
}
export function CampaignPreview({job,standalone=false}:{job:Pick<EngineJob,"id"|"campaign">;standalone?:boolean}){
 const inspection=useRef(0);
 const [followUps,setFollowUps]=useState<string[]>([]);
 const [items,setItems]=useState<Item[]>([]);
 const [findings,setFindings]=useState<{reference:string;expected?:string;accepted?:boolean;issue?:string;evidence?:string;repair?:string;uncertainty?:string}[]>([]);
 const [error,setError]=useState("");
 const [pdf,setPdf]=useState("");
 useEffect(()=>()=>{if(pdf)URL.revokeObjectURL(pdf);},[pdf]);
 const [continuing,setContinuing]=useState(false);
 async function continueDraft(){
   setContinuing(true);setError("");
   try{
     const next=await apiClient.post<{id:string}>("/api/study/engine/jobs/"+encodeURIComponent(job.id)+"/education-continuation",{});
     window.location.assign("/study/review/"+encodeURIComponent(next.id));
   }catch{setError("후속 작업을 열 수 없습니다. 기존 캠페인 상태를 확인하세요.");setContinuing(false);}
 }
 const campaign=job.campaign;
 if(!campaign)return null;
 const base="/api/study/engine/jobs/"+encodeURIComponent(job.id)+"/draft";
 async function inspect(answers:boolean){
  const request=++inspection.current;
  setError("");setPdf("");setItems([]);setFindings([]);setFollowUps([]);
  try{const v=await apiClient.get<{items:Item[];calibration?:typeof findings;followUps?:string[]}>(base+"?answers="+answers);
    if(request===inspection.current){setItems(v.items);setFindings(v.calibration??[]);setFollowUps(v.followUps??[]);}
  }catch{if(request===inspection.current)setError("초안을 불러올 수 없습니다.");}
 }
 async function download(answers:boolean){
  try{setError("");setPdf(URL.createObjectURL(await apiClient.blob(base+".pdf?answers="+answers)));}catch{setError("초안 PDF를 준비할 수 없습니다.");}
 }
 return <section aria-label="소유자 초안 검토"><h4>문항별 출제 현황</h4>
 {!standalone&&<a href={"/study/review/"+encodeURIComponent(job.id)}>이 초안 검토 열기</a>}
 {campaign.status==="BUDGET_PAUSED"&&<p>사용량 한도에 도달해 출제를 멈췄습니다. 저장된 문항은 아래에서 검토할 수 있습니다.</p>}
 {campaign.canRepairKey&&<button disabled={continuing} onClick={()=>void continueDraft()}>같은 읽기 자료로 인용·채점 기준 보완</button>}
 {campaign.status==="BUDGET_PAUSED"&&campaign.calls===40&&campaign.tokens===966552&&<button disabled={continuing} onClick={()=>void continueDraft()}>승인 정책으로 이어서 검토</button>}
 {campaign.status==="GOLDEN_SEMANTIC_DISPUTE"&&campaign.calls===44&&campaign.tokens===1085043&&<button disabled={continuing} onClick={()=>void continueDraft()}>승인 해설로 독립 재심</button>}
 {campaign.status==="GOLDEN_SEMANTIC_DISPUTE"&&campaign.calls===42&&campaign.tokens===1025580&&<button disabled={continuing} onClick={()=>void continueDraft()}>동결 승인본으로 독립 검증</button>}
 {campaign.status==="GOLDEN_SEMANTIC_DISPUTE"&&<p>승인 예시와 독립 심사 결과에 이견이 있어 문항 보완을 중단했습니다. 소유자 해설에서 판정 근거를 확인하세요.</p>}
 {campaign.slots.some(s=>s.previouslyAccepted)&&<p>이전 심사에서 통과한 {campaign.slots.filter(s=>s.previouslyAccepted).length}문항의 내용과 영수증을 보존했습니다.</p>}
 <p>{campaign.authoringPolicy&&"현 정책 심사 "}{campaign.slots.filter(s=>s.stage==="ACCEPTED").length}문항 통과 · 모델 호출 {campaign.calls}{campaign.authoringPolicy ? "회" : "/40"} · 관측 토큰 {campaign.tokens.toLocaleString()}</p>
 <ul>{campaign.slots.map(s=><li key={s.kind+s.order}>{s.kind==="single_choice"?"객관식":s.kind==="essay"?"서술형":"확장 사례"} {s.order}번 {s.previouslyAccepted&&"· 이전 심사 통과 "}{s.objectiveTier && (({basic_application:"· 기초 적용",cause_analysis:"· 원인 분석",advanced_integration:"· 심화 비교",open_reasoning:"· 서술 추론"} as Record<string,string>)[s.objectiveTier])} · {s.stage==="ACCEPTED"?"통과":s.stage==="UNRESOLVED"||s.issue?"보완 필요":s.stage==="PLANNED"?"출처 계획 대기":"검토 중"} · 보완 기회 {Math.min(2,3-s.cycles)}회 · 출처 재선정 {1-s.replans}회{ s.issue?" · "+(issues[s.issue]??"문항 근거 보완"):""}</li>)}</ul>
 <button onClick={()=>void inspect(false)}>학습자 보기</button> <button onClick={()=>void inspect(true)}>소유자 해설 보기</button>
 <button onClick={()=>void download(false)}>초안 문제지 PDF</button> <button onClick={()=>void download(true)}>초안 해설지 PDF</button>
 {pdf&&<a href={pdf} download="study-private-draft.pdf">준비된 초안 내려받기</a>}
 {error&&<p role="alert">{error}</p>}
 {campaign.authoringPolicy&&findings.length>0&&<details><summary>승인 예시와 대조군 심사 결과</summary>{findings.map(f=><section key={f.reference}>
 <h5>{f.reference} · {f.expected==="pass"?"승인 예시":"음성 대조군"}</h5>
 <p>{f.accepted===undefined?"유효 판정 대기":f.accepted?"심사 통과":"심사 보류"}{f.issue&&f.issue!=="none"?" · "+f.issue:""}</p>
 {f.evidence&&<p>{f.evidence}</p>}{f.uncertainty&&<p>{f.uncertainty}</p>}{f.repair&&<p>{f.repair}</p>}
 </section>)}</details>}
 {!campaign.authoringPolicy&&findings.some(f=>f.issue&&f.issue!=="none")&&<details><summary>평가 기준 대조 결과</summary>{findings.filter(f=>f.issue&&f.issue!=="none").map(f=><p key={f.reference}>{f.reference} · {f.evidence} {f.repair}</p>)}</details>}
 {items.map((i,n)=><article key={n}><h5>{i.question.prompt}</h5><p>{i.question.context}</p>{i.question.guidance&&<p>{i.question.guidance}</p>}{i.question.options?.map(o=><p key={o.id}>{o.id}. {o.text}</p>)}
 {i.reading.map((r,k)=><details key={k}><summary>근거 자료 · PDF {r.pageIndex}쪽</summary><p>{r.text}</p></details>)}
 {i.key&&<>{i.question.options?.length&&i.key.answer?<p>정답 선택지 {i.key.answer}</p>:null}<p>{i.key.model}</p><p>{i.key.explanation}</p>{Object.entries(i.key.incorrectReasons??{}).map(([option,reason])=><p key={option}>오답 {option} · {reason}</p>)}{i.key.citations?.map((ref,k)=><blockquote key={k}>{ref.quote}</blockquote>)}<ul>{i.key.rubric.map((v,k)=><li key={k}>{v}</li>)}</ul>{i.key.hints.map((v,k)=><PreviewHint key={i.digest+"/"+k} binding={job.id+"/"+i.digest} level={k+1} text={v}/>)}</>}
 {i.stage!=="ACCEPTED"&&typeof i.finding==="object"&&<p>{i.finding?.repair}</p>}</article>)}{followUps.length>0&&<section><h4>후속 질문</h4><ol>{followUps.map(q=><li key={q}>{q}</li>)}</ol></section>}</section>;
}
