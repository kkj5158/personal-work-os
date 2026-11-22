import type {Excerpt} from '@/lib/api/attention';
export function CapturedText({request,response}:{request?:Excerpt|null;response?:Excerpt|null}){
  const fields:[string,Excerpt|null|undefined][]=[['사용자 요청',request],['AI 최종 답변 · 보고됨',response]];
  return <dl>{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{value?.text??'미수집'}{value?.truncated&&<small> · 전체 {value.originalLength}자 중 {value.text.length}자 발췌</small>}</dd></div>)}</dl>;
}
