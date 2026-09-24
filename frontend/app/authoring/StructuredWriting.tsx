"use client";
import { Button } from "@/components/ui/Button";
import type { Answer, Epoch, Experience, Goal, Question, QuestionType } from "@/lib/authoring/types";

export const emptyEpochs = (): Epoch[] => Array.from({length:7}, (_,i) => ({id:`epoch-${i+1}`,title:"",experiences:[]}));
export const emptyGoal = (plan = false): Goal => plan ? {id:crypto.randomUUID(),title:"",description:"",plan:""}
  : {id:crypto.randomUUID(),title:"",description:"",why:"",impact:"",strategy:"",obstacles:"",benchmark:""};
const deepDive = [
  {key:"why",title:"WHY",prompt:"이 목표는 왜 나에게 중요한가요?",guide:"내가 원하는 목표인가요, 외부의 기대인가요? 결과와 과정은 어떤 의미가 있나요?"},
  {key:"impact",title:"IMPACT",prompt:"이 목표는 나와 내 삶에 어떤 영향을 주나요?",guide:"나를 보는 시선, 삶의 다른 영역, 주변 사람들에게 미칠 영향을 함께 생각해보세요."},
  {key:"strategy",title:"STRATEGY",prompt:"어떻게 이 목표를 실행할 수 있나요?",guide:"매일·매주 무엇을 하나요? 언제, 얼마나 자주, 어디서 하나요? 가장 작은 시작은 무엇인가요?"},
  {key:"obstacles",title:"OBSTACLES",prompt:"어떤 장애물이 있고 어떻게 대응할 수 있나요?",guide:"나의 방해 습관, 현실 조건, 관계를 살펴보세요. 막혔을 때의 대안은 무엇인가요?"},
  {key:"benchmark",title:"BENCHMARK",prompt:"진전했다는 것을 무엇으로 확인할 수 있나요?",guide:"목표 날짜, 관찰 가능한 변화, 점검 주기, 나만의 측정 기준을 적어보세요."},
] as const;
export function GoalsWriting({type,value,change,guides,metadata}:{type:QuestionType;value?:Answer;change:(value:Answer)=>void;guides?:Record<string,string>;metadata?:Question["metadata"]}) {
  const goals=(Array.isArray(value)?value:[]) as Goal[];
  const max=metadata?.maxItems ?? 8, plan=!!metadata?.plan, range=metadata?.recommendation ?? `${metadata?.minItems ?? 6}–${max}개`;
  const update=(id:string,patch:Partial<Goal>)=>change(goals.map(g=>g.id===id?{...g,...patch}:g));
  function move(index:number,delta:number) {
    const next=[...goals]; [next[index],next[index+delta]]=[next[index+delta],next[index]];change(next);
  }
  return <div className="authoring-structured"><p className="authoring-muted">목표 {goals.length}개 · {range} · 순서를 바꿔도 작성한 {plan ? "계획은" : "분석은"} 함께 보존됩니다.</p>
    {goals.map((goal,index)=><section className="authoring-writing-card" key={goal.id}>
      <h3>{index+1}. {goal.title || "새 목표"}</h3>
      {type === "GOALS" ? <>
        <label className="authoring-field">목표 {index+1} 제목<input value={goal.title} onChange={e=>update(goal.id,{title:e.target.value})} /></label>
        <label className="authoring-field">목표 {index+1} 설명{plan && " (선택)"}<textarea rows={plan ? 3 : 5} value={goal.description ?? ""} onChange={e=>update(goal.id,{description:e.target.value})} /></label>
        {plan && <label className="authoring-field authoring-goal-plan"><strong>목표 {index+1} 계획</strong>{!!metadata?.planGuides?.length && <ul className="authoring-help">{metadata.planGuides.map(guide=><li key={guide}>{guide}</li>)}</ul>}<textarea aria-label={`목표 ${index+1} 계획`} rows={10} value={goal.plan ?? ""} onChange={e=>update(goal.id,{plan:e.target.value})} /></label>}
        <div className="authoring-row-actions"><Button type="button" disabled={index===0} onClick={()=>move(index,-1)} aria-label={`목표 ${index+1} 위로`}>↑ 위로</Button><Button type="button" disabled={index===goals.length-1} onClick={()=>move(index,1)} aria-label={`목표 ${index+1} 아래로`}>↓ 아래로</Button><Button type="button" variant="ghost" onClick={()=>{if(window.confirm(plan ? "이 목표와 작성한 계획을 삭제할까요?" : "이 목표와 연결된 분석을 삭제할까요?"))change(goals.filter(g=>g.id!==goal.id));}}>목표 {index+1} 삭제</Button></div>
      </> : <>
        <p className="authoring-answer">{goal.description}</p>
        {deepDive.map(field=><label className="authoring-field authoring-deep-dive" key={field.key}><strong>{field.title} · {field.prompt}</strong><span className="authoring-help">{guides?.[field.key] ?? field.guide}</span><textarea aria-label={`${goal.title || `목표 ${index+1}`} ${field.title}`} rows={8} value={goal[field.key] ?? ""} onChange={e=>update(goal.id,{[field.key]:e.target.value})} /></label>)}
      </>}
    </section>)}
    {type === "GOALS" ? <Button type="button" disabled={goals.length>=max} onClick={()=>change([...goals,emptyGoal(plan)])}>+ 목표 추가</Button> : !goals.length && <p>GOALS에서 목표를 먼저 작성하세요.</p>}
  </div>;
}
export function PastWriting({type,value,change,metadata}:{type:QuestionType;value?:Answer;change:(value:Answer)=>void;metadata?:Question["metadata"]}) {
  // Later definitions supply their own per-experience wording; 2026-09-21 keeps its original copy.
  const itemPrompt=metadata?.itemPrompt, itemHelp=metadata?.itemHelp;
  const epochs=(Array.isArray(value)&&value.length?value:emptyEpochs()) as Epoch[];
  const update=(id:string,patch:Partial<Epoch>)=>change(epochs.map(e=>e.id===id?{...e,...patch}:e));
  const updateExperience=(epoch:Epoch,id:string,patch:Partial<Experience>)=>update(epoch.id,{experiences:epoch.experiences.map(x=>x.id===id?{...x,...patch}:x)});
  const criticalCount=epochs.flatMap(e=>e.experiences).filter(x=>x.critical).length;
  return <div className="authoring-structured">
    {type === "CRITICAL" && <p role="status">중요한 경험 {criticalCount} / 최대 10개 · 선택을 해제해도 사건과 분석은 보존됩니다.</p>}
    {epochs.map((epoch,index)=><section key={epoch.id} className="authoring-writing-card">
      <h3>Epoch {index+1}{epoch.title && ` · ${epoch.title}`}</h3>
      {type === "EPOCHS" ? <label className="authoring-field">Epoch {index+1} 제목<input value={epoch.title} onChange={e=>update(epoch.id,{title:e.target.value})} /></label> : <>
        {!epoch.experiences.length && <p className="authoring-muted">아직 작성한 경험이 없습니다.</p>}
        {epoch.experiences.map((experience,n)=><div className="authoring-experience" key={experience.id}>
          {type === "EXPERIENCES" ? <>
            <label className="authoring-field">Epoch {index+1} 경험 {n+1} 제목<input value={experience.title} onChange={e=>updateExperience(epoch,experience.id,{title:e.target.value})} /></label>
            <label className="authoring-field">{itemPrompt ?? "무슨 일이 있었나요?"}{(itemHelp ?? "사건 자체를 충분히 적으세요. 이유와 현재에 미친 영향은 다음 단계에서 살펴봅니다.") && <span className="authoring-help">{itemHelp ?? "사건 자체를 충분히 적으세요. 이유와 현재에 미친 영향은 다음 단계에서 살펴봅니다."}</span>}<textarea rows={10} aria-label={`Epoch ${index+1} 경험 ${n+1} 사건`} value={experience.event} onChange={e=>updateExperience(epoch,experience.id,{event:e.target.value})} /></label>
            <Button type="button" variant="ghost" onClick={()=>{if(window.confirm("이 경험과 영향 분석을 삭제할까요?"))update(epoch.id,{experiences:epoch.experiences.filter(x=>x.id!==experience.id)});}}>경험 {n+1} 삭제</Button>
          </> : type === "EFFECTS" ? <>
            <h4>{experience.title || `경험 ${n+1}`}</h4><details className="authoring-source"><summary>작성한 사건 보기</summary><p>{experience.event}</p></details>
            <label className="authoring-field">{itemPrompt ?? "이 경험은 당신의 삶을 어떻게 형성했고, 지금의 당신을 만드는 데 어떤 영향을 주었나요?"}{(itemHelp ?? "다른 사람을 바라보는 방식, 세상을 바라보는 방식에 미친 영향을 함께 적어보세요.") && <span className="authoring-help">{itemHelp ?? "다른 사람을 바라보는 방식, 세상을 바라보는 방식에 미친 영향을 함께 적어보세요."}</span>}<textarea rows={10} aria-label={`Epoch ${index+1} 경험 ${n+1} 영향`} value={experience.effects} onChange={e=>updateExperience(epoch,experience.id,{effects:e.target.value})} /></label>
          </> : <label className="authoring-critical"><input type="checkbox" checked={experience.critical} disabled={!experience.critical && criticalCount>=10} onChange={e=>updateExperience(epoch,experience.id,{critical:e.target.checked})} /><span>{experience.title || `경험 ${n+1}`}<small>Epoch {index+1} · {epoch.title}</small></span></label>}
        </div>)}
        {type === "EXPERIENCES" && <Button type="button" disabled={epoch.experiences.length>=6} onClick={()=>update(epoch.id,{experiences:[...epoch.experiences,{id:crypto.randomUUID(),title:"",event:"",effects:"",critical:false}]})}>Epoch {index+1} 경험 추가 ({epoch.experiences.length}/6)</Button>}
      </>}
    </section>)}
  </div>;
}
export function StructuredAnswer({value,type}:{value?:Answer;type:QuestionType}) {
  if (!Array.isArray(value) || !value.length) return <p className="authoring-empty">아직 작성하지 않음</p>;
  if (type === "GOALS" || type === "GOAL_DEEP_DIVE") return <div>{(value as Goal[]).map((goal,index)=><section className="authoring-writing-card" key={goal.id}><h4>{index+1}. {goal.title || "제목 미작성"}</h4>{goal.description && <p className="authoring-answer">{goal.description}</p>}{goal.plan && <p className="authoring-answer">{goal.plan}</p>}{type === "GOAL_DEEP_DIVE" && deepDive.map(field=><div key={field.key}><strong>{field.title}</strong><p className="authoring-answer">{goal[field.key] || "아직 작성하지 않음"}</p></div>)}</section>)}</div>;
  return <div>{(value as Epoch[]).map((epoch,index)=><section className="authoring-writing-card" key={epoch.id}><h4>Epoch {index+1} · {epoch.title || "제목 미작성"}</h4>{type !== "EPOCHS" && epoch.experiences.filter(x=>type !== "CRITICAL" || x.critical).map(experience=><div key={experience.id} className="authoring-experience"><strong>{experience.title || "경험 제목 미작성"}</strong>{type !== "CRITICAL" && <p className="authoring-answer">{type === "EFFECTS" ? experience.effects : experience.event}</p>}</div>)}</section>)}</div>;
}
