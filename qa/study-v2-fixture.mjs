// Deterministic model boundary ONLY for explicitly enabled isolated test environments.
import {VERSION} from '../ops/study-worker/schema.mjs';
export class TestOnlyStudyAdapter {
 async generate(job){
  if(job.kind==='COACH')return {classification:'policy_change',scope:'next_week_only',changes:{explanation:'intuitive'},reason:'합성 피드백은 직관적인 비유를 요청합니다.',provenance:{provider:'test_fake',model:'test-only',promptVersion:VERSION}};
  const p=job.input,s=p.passages[0],out={topic:'합성 자료의 작은 실험',required:[],extension:[],keys:[],provenance:{provider:'test_fake',model:'test-only',promptVersion:VERSION}};
  for(const part of ['required','extension'])for(const [kind,count]of Object.entries(p.questionFormat[part]))for(let i=0;i<count;i++){
   const order=out[part].length+1,id=part+'-'+order,q={id,version:1,order,kind,prompt:`${p.date} ${job.id.slice(0,8)} ${part} ${order}. 작은 실험으로 가설을 어떻게 확인할까요?`,responseSchema:{single_choice:'option',multiple_choice:'options',true_false:'boolean',short_answer:'text',essay:'text',case_analysis:'text',diagram:'attachment'}[kind],source:{materialId:s.materialId,section:`PDF ${s.pageIndex} / ${s.id}`}};
   if(kind.endsWith('choice'))q.options=[{id:'A',text:'관찰 결과를 가설과 비교합니다.'},{id:'B',text:'확인 없이 정답이라고 가정합니다.'}];if(kind==='case_analysis')q.context='본인이 운영하는 합성 프로젝트에서 결과를 관찰하는 상황입니다.';out[part].push(q);
   out.keys.push({part,questionId:id,model:'가설과 관찰 결과를 비교합니다.',explanation:'지도에서 위치를 확인하듯 작은 실험은 가설을 검증합니다. 실제 프로젝트의 작은 시도로 적용합니다.',rubric:['자료의 가설 검증과 관찰을 연결합니다.'],followUp:Array.from({length:10},(_,n)=>`실험에 관한 추가 질문 ${n+1}은 무엇인가요?`),answer:kind==='multiple_choice'?['A']:kind==='single_choice'?'A':kind==='true_false'?false:'가설과 관찰을 비교합니다.',...(kind.endsWith('choice')?{incorrectReasons:{B:'검증하지 않은 믿음은 관찰과 다릅니다.'}}:{}),citations:[{excerptId:s.id,quote:s.text.slice(0,24)}]});
  }return out;
 }
}
