import type {ManagedContent} from '@/lib/api/attention';

const labels:Record<string,string>={
  SUCCEEDED:'성공',PARTIAL:'부분 완료',FAILED:'실패',CANCELLED:'취소',BLOCKED:'진행 막힘',UNKNOWN:'미확인',
  QUESTION:'질문',APPROVAL:'승인 필요',BLOCKER:'진행 막힘',NEXT_ACTION:'다음 행동',MISSING_VALIDATION:'검증 필요',
  PASSED:'통과 확인',FAILED_PROOF:'실패 확인',EXISTS:'존재 확인',OPEN:'미해결',RESOLVED:'해결',AGENT_REPORTED:'Codex 보고',EVENT_METADATA:'실행기 관찰',USER_EDITED:'승인한 요청',
};

export function WorkContent({content,full=false}:{content:ManagedContent;full?:boolean}){
  const {outcome,performed,evidence,remaining}=content;
  const list=(items:string[]|undefined,empty:string)=>items?.length? <ul>{items.map((value,index)=><li key={index}>{value}</li>)}</ul>:empty;
  return <dl className="aq-work-content" data-content-revision={content.contentRevision}>
    <dt>요청</dt><dd>{content.request.text}</dd>
    <dt>수행</dt><dd>{list(performed?.map(f=>f.text),'수행 내역 미수집')}</dd>
    <dt>결과</dt><dd>{outcome?<><span className="aq-outcome-label">{labels[outcome.fact.origin]} · {labels[outcome.state]}</span> {outcome.fact.text}</>: '보고서 대기'}</dd>
    <dt>근거</dt><dd>{list(evidence?.map(e=>e.label+' · '+(e.verification==='SOURCE_VERIFIED'?'출처 검증 · '+labels[e.verifiedResult==='FAILED'?'FAILED_PROOF':e.verifiedResult??'EXISTS']:'보고됨 · 미검증')+(full&&e.reference?' · '+e.reference:'')),'검증 정보 없음')}</dd>
    <dt>남은 일</dt><dd>{list(remaining?.map(r=>labels[r.state]+' · '+labels[r.kind]+' · '+r.fact.text),content.quality==='REPORTED'?'보고된 항목 없음':'수집된 정보 없음')}</dd>
    {full&&!!content.limitations?.length&&<><dt>제한</dt><dd>{list(content.limitations.map(f=>f.text),'')}</dd></>}
    {full&&content.receivedAt&&<><dt>보고서 수신</dt><dd><time dateTime={content.receivedAt}>{new Date(content.receivedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</time> · 개정 {content.contentRevision}</dd></>}
    {full&&content.sessionId&&<><dt>Codex 세션</dt><dd><button type="button" onClick={()=>void navigator.clipboard.writeText(content.sessionId!)}>세션 참조 복사</button></dd></>}
  </dl>;
}

