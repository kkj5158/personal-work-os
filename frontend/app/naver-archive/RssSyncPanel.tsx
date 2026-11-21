"use client";
import {useCallback,useEffect,useState} from "react";
import {naverArchive as api,type RssItem,type RssStatus} from "@/lib/api/naverArchive";

const when=(value:string|null|undefined)=>value?new Date(value).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}):"아직 없음";
type Props={refreshToken:number;onComplete:(item:RssItem)=>void;onOpenExisting:(id:string)=>void};
export function RssSyncPanel({refreshToken,onComplete,onOpenExisting}:Props){
 const [status,setStatus]=useState<RssStatus|null>(null),[items,setItems]=useState<RssItem[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [confirm,setConfirm]=useState<{item:RssItem;post:RssItem["duplicateCandidates"][number]}|null>(null);
 const load=useCallback(async()=>{const [s,p]=await Promise.all([api.rssStatus(),api.rssItems()]);setStatus(s);setItems(p.items);setCursor(p.nextCursor);},[]);
 useEffect(()=>{let alive=true;void Promise.all([api.rssStatus(),api.rssItems()]).then(([s,p])=>{if(alive){setStatus(s);setItems(p.items);setCursor(p.nextCursor);}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[refreshToken]);
 async function action(work:()=>Promise<unknown>,refresh=true){setBusy(true);setError("");try{await work();if(refresh)await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function checkNow(){await action(async()=>{const result=await api.rssRun(crypto.randomUUID());setMessage(result.state==="SUCCESS_RSS_ONLY"||result.state==="PARTIAL"?`RSS 확인 · 새 발견 ${result.discovered??0}건 · 원문 필요 ${result.partial??0}건 · 전체 보관 ${result.inserted??0}건`:({MINIMUM_INTERVAL:"방금 확인했습니다. 1분 뒤 다시 확인할 수 있습니다.",RETRY_LATER:"서버가 안내한 재시도 시각까지 기다립니다.",POLICY_BLOCKED:"플랫폼 접근이 차단됐습니다. 운영 검토가 필요합니다.",SKIPPED_OVERLAP:"다른 확인 작업이 실행 중입니다.",DISABLED:"서버에서 RSS 확인이 비활성화돼 있습니다."} as Record<string,string>)[result.state]??`확인 상태: ${result.state}`);});}
 return <details className="na-rss" aria-label="RSS 자동 확인">
  <summary>RSS 자동 확인 · {status?.enabled?"10분마다 확인 중":"꺼짐"}{status?` · 원문 필요 ${status.backlog}건`:""}</summary>
  <p className="na-rss-boundary">RSS는 요약일 수 있습니다. 현재는 새 글을 발견해 원문 보완 대기함에 넣으며, 전체 본문 자동 보관은 지원하지 않습니다.</p>
  {status&&<><div className="na-rss-status"><span>블로그 {status.blogId}</span><span>최근 RSS 확인 {when(status.lastSuccessAt)}</span><span>최근 시도 {when(status.lastAttemptAt)}</span><span>최근 전체 보관 {status.lastRun?.inserted??0}건</span></div>
   <div className="na-rss-actions"><button disabled={busy||!status.available||status.policyBlocked} onClick={()=>void action(()=>api.rssConfigure(!status.enabled,status.version,crypto.randomUUID()))}>{status.enabled?"자동 확인 끄기":"10분 자동 확인 켜기"}</button><button disabled={busy||!status.available||status.policyBlocked} onClick={()=>void checkNow()}>지금 RSS 확인</button><button disabled={busy} onClick={()=>void action(load)}>상태 새로고침</button></div>
   {!status.available&&<p>서버에서 자동 확인을 사용하지 않도록 설정돼 있습니다.</p>}
   {status.lastErrorCategory&&<p role="status">최근 오류: {status.lastErrorCategory} · 다음 확인 가능 {when(status.nextRetryAt)}</p>}
   {status.coverageGap&&<p role="status">확인 공백이 RSS 보관 범위를 넘었습니다. 그 사이 누락은 소유자 백업으로 대조해주세요.</p>}
  </>}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
  <details><summary>원문 보완 대기함 ({status?.backlog??0})</summary>
   <p>처음에는 최근 7일의 새 글을 대기함에 넣습니다. 원문을 보완하면 다음 RSS 확인 때 연결됩니다. RSS의 최신 글만 확인합니다. RSS에 없는 비공개·이웃 공개 글은 자동 발견할 수 없습니다. 요약은 본문 검색·원문 목록에 넣지 않습니다.</p>
   {items.map(item=><article className="na-rss-item" key={item.externalPostId}>
    <strong>{item.title}</strong><small>{when(item.publishedAt)} · {item.category||"분류 미확인"} · {item.state==="SOURCE_EDIT_REVIEW"?"원본 변경 대조 필요":item.state==="POSSIBLE_DUPLICATE_REVIEW"?"기존 글 중복 후보 확인 필요":"전체 원문 필요"}</small>
    <details><summary>RSS 요약 보기 · 전체 본문 아님</summary><p style={{whiteSpace:"pre-wrap"}}>{item.excerpt}</p><p>이미지·첨부 완전성 미확인</p></details>
    <div className="na-rss-actions"><a href={item.originalUrl} target="_blank" rel="noopener noreferrer">네이버에서 직접 확인</a>{item.state==="PARTIAL_NEEDS_SOURCE"&&<button disabled={busy} onClick={()=>onComplete(item)}>전체 원문 직접 입력</button>}{item.linkedPostId&&<button onClick={()=>onOpenExisting(item.linkedPostId!)}>보관한 원문 열기</button>}{item.state==="SOURCE_EDIT_REVIEW"&&<button disabled={busy} onClick={()=>{if(window.confirm("보관한 원문과 원본의 변경을 직접 대조했나요? 이 확인은 보관된 본문을 바꾸지 않습니다."))void action(()=>api.rssAcknowledge(item.externalPostId,item.sourceSha256,crypto.randomUUID()));}}>원문 대조 후 변경 확인</button>}</div>
    {item.duplicateCandidates.map(post=><div key={post.id}><span>기존 글 후보: {post.title} · {when(post.originalPublishedAt)}</span><button onClick={()=>onOpenExisting(post.id)}>기존 원문 열기</button><button disabled={busy} onClick={()=>setConfirm({item,post})}>이 원문과 연결</button></div>)}
   </article>)}
   {!items.length&&<p>원문 보완 대기 항목이 없습니다.</p>}{cursor&&<button disabled={busy} onClick={()=>void action(async()=>{const page=await api.rssItems(cursor);setItems(old=>[...old,...page.items]);setCursor(page.nextCursor);},false)}>다음 대기 글 보기</button>}
   <p>HTML·이미지 백업은 위의 ‘백업 미리보기’로 가져오고 정확한 내용을 확인한 뒤 승인하세요. PDF나 직접 입력한 원문은 내용을 확인해 기존 편집기로 보완할 수 있습니다. RSS 공개를 위해 공개 글의 검색 허용·외부 보내기 설정을 확인하세요.</p>
  </details>
  {confirm&&<div role="dialog" aria-label="기존 원문 연결 확인"><p>‘{confirm.item.title}’을 기존 ‘{confirm.post.title}’과 연결할까요? 본문·게시일·첨부는 유지하고 원본 ID와 URL만 연결합니다.</p><button disabled={busy} onClick={()=>{const chosen=confirm;void action(async()=>{await api.rssLink(chosen.item.externalPostId,chosen.post.id,chosen.post.version,crypto.randomUUID());setConfirm(null);});}}>확인하고 연결</button><button onClick={()=>setConfirm(null)}>취소</button></div>}
 </details>;
}
