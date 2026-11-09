import { sha256 } from "@noble/hashes/sha2.js";
import { apiClient, ApiError } from "../api/client";
import { createSupabaseBrowserClient } from "../supabase/client";
import { emptySnapshot } from "./fixtures";
import { responseKey, validatePackage, validateResponse, type StudyDataPort, type StudySnapshot, type StudyCapabilities, type StudyAsset, type HandwrittenAttachmentMetadata, type Binding, type Response, type AnswerKey } from "./model";

type Pending = { run: () => Promise<void>; resolve: () => void; reject: (error: unknown) => void };
/** One queue per signed-in workspace; failed writes remain retryable with the same operation ID. */
export function createServerStudyPort(): StudyDataPort & { dispose(): void; refresh(): Promise<void>; retry(): Promise<void> } {
  let snapshot: StudySnapshot = { ...emptySnapshot(), connection: { state: "loading" } };
  let capabilities: StudyCapabilities | undefined, running = false, disposed = false, owner: string | undefined, conflict = false;
  const listeners = new Set<() => void>(), queue: Pending[] = [], optimistic = new Map<string, { binding: Binding; response: Response; updatedAt: string }>();
  const timers=new Map<string,ReturnType<typeof setTimeout>>();
  const emit = () => { if (!disposed) listeners.forEach(fn => fn()); };
  const connection = (state: NonNullable<StudySnapshot["connection"]>["state"], message?: string) => { snapshot = { ...snapshot, connection: { state, message } }; emit(); };
  const adopt = (server: StudySnapshot) => { if (owner && server.ownerId !== owner) throw new ApiError(401,"로그인 계정이 변경되었습니다."); owner = server.ownerId; snapshot = { ...server, drafts: { ...server.drafts, ...Object.fromEntries(optimistic) }, connection: { state: queue.length ? "saving" : "ready" } }; emit(); };
  const get = <T>(path: string) => owner ? apiClient.scoped<T>(owner,path) : apiClient.get<T>(path);
  const post = <T>(path: string, data: unknown) => { if (!owner) throw new ApiError(401,"학습 데이터를 먼저 불러오세요."); return apiClient.scoped<T>(owner,path,"POST",data); };
  const reload = async () => { adopt(await get<StudySnapshot>("/api/study/snapshot")); };
  const fail = (error: unknown) => { const unauthorized = error instanceof ApiError && error.status === 401; if (unauthorized) { optimistic.clear(); snapshot = { ...emptySnapshot(), connection: { state: "unauthorized" } }; } connection(unauthorized ? "unauthorized" : "error", String(error)); };
  const drain = async () => {
    if (running || disposed) return;
    running = true;
    try {
      while (queue.length && !disposed) {
        const item = queue[0]; connection("saving");
        try { await item.run(); queue.shift(); item.resolve(); }
        catch (error) { conflict=error instanceof ApiError && error.status===409;if(error instanceof ApiError&&error.status>=400&&error.status<500&&!conflict){queue.shift();try{await reload();}catch{}} fail(error); item.reject(error); return; }
      }
      connection("ready");
    } finally { running = false; }
  };
  const enqueue = (run: () => Promise<void>) => {
    const promise = new Promise<void>((resolve,reject) => queue.push({run,resolve,reject}));
    // Event handlers may intentionally use void APIs (autosave); failures remain visible and queued.
    void promise.catch(() => {}); if(snapshot.connection?.state!=="error")void drain(); return promise;
  };
  const envelope = (action: string, data: unknown) => ({ operationId: crypto.randomUUID(), expectedRevision: snapshot.revision ?? 0, action, data });
  const command = (action: string, data: unknown, after?: () => void) => {
    let request: ReturnType<typeof envelope> | undefined;
    return enqueue(async () => { request ??= envelope(action,data); const next=await post<StudySnapshot>("/api/study/commands",request); after?.(); adopt(next); });
  };
  const sendDraft=(key:string)=>{timers.delete(key);const value=optimistic.get(key);if(value)void command("draft.save",{binding:value.binding,response:value.response},()=>{if(optimistic.get(key)===value)optimistic.delete(key);});};
  const flushDrafts=()=>{for(const [key,timer] of timers){clearTimeout(timer);sendDraft(key);}};
  let unsubscribe:(()=>void)|undefined;
  const watchAuth=()=>{if(unsubscribe||typeof window==="undefined")return;const auth=createSupabaseBrowserClient()?.auth.onAuthStateChange((_event,session) => {
    if (owner && session?.user.id !== owner) { disposed = true; optimistic.clear(); queue.splice(0).forEach(item => item.reject(new ApiError(401,"로그인 계정이 변경되었습니다."))); snapshot = { ...emptySnapshot(), connection: { state: "unauthorized", message: "다시 로그인한 뒤 새로고침하세요." } }; listeners.forEach(fn => fn()); }
  });unsubscribe=()=>auth?.data.subscription.unsubscribe();};
  return {
    mode: "server", get capabilities(){ return capabilities; },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getSnapshot: () => snapshot,
    dispose(){ flushDrafts(); unsubscribe?.();unsubscribe=undefined; },
    async refresh(){ watchAuth();try { connection("loading"); capabilities=await get<StudyCapabilities>("/api/study/capabilities"); await reload(); } catch(error){ fail(error); } },
    async retry(){ if(conflict){queue.splice(0).forEach(item=>item.reject(new Error("서버 버전 충돌 · 최신 데이터를 확인한 뒤 다시 입력하세요.")));optimistic.clear();conflict=false;await reload();connection("ready","서버 최신 버전을 불러왔습니다. 충돌한 입력을 확인하고 다시 저장하세요.");return;} if (queue.length) { await drain(); } else { try { await reload(); } catch(error){ fail(error); } } },
    readPackage: id => snapshot.packages.filter(p=>p.id===id).sort((a,b)=>b.version-a.version)[0],
    saveDraft(binding,response){
      const pkg=snapshot.packages.find(p=>p.id===binding.workbookId&&p.version===binding.workbookVersion), q=pkg?.[binding.part].find(q=>q.id===binding.questionId&&q.version===binding.questionVersion);
      const empty=!!q && (("text" in response && response.text.trim()==="") || ("selected" in response && Array.isArray(response.selected) && !response.selected.length));
      if (!q || (!empty&&!validateResponse(q,response))) throw new Error("문항 응답을 확인하세요.");
      const key=responseKey(binding), value={binding,response,updatedAt:new Date().toISOString()}; optimistic.set(key,value);
      snapshot={...snapshot,drafts:{...snapshot.drafts,[key]:value},connection:{state:"saving"}};if(empty)delete snapshot.drafts[key];emit();
      clearTimeout(timers.get(key));timers.set(key,setTimeout(()=>sendDraft(key),500));
    },
    discardDrafts: (workbookId,workbookVersion,part)=>{flushDrafts();return command("draft.discard",{workbookId,workbookVersion,part});},
    recordAttempt(input){flushDrafts(); const pkg=snapshot.packages.find(p=>p.id===input.workbookId&&p.version===input.workbookVersion);if(!pkg||validatePackage(pkg).length)throw new Error("문제집 버전을 확인하세요.");return command("attempt.submit",{...input,note:input.note==="로컬 샘플 제출 · 채점 없음"?"온라인 제출 · 미채점":input.note}); },
    async readAnswerKeys(id,version,part){flushDrafts(); let keys: AnswerKey[]=[];await enqueue(async()=>{ keys=await post<AnswerKey[]>(`/api/study/workbooks/${encodeURIComponent(id)}/${version}/review?part=${part}`,{}); await reload(); });return keys; },
    updateSource(source){const { version: _version,...data }=source;void _version;return command("material.save",data);},
    addFeedback: text=>command("feedback.add",{text}), propose: (change,scope="ongoing")=>command("policy.propose",{change,scope}),
    decideProposal: (id,approve)=>command("policy.decide",{id,approve}), rollbackPolicy: version=>command("policy.rollback",{version}),
    configureAutomation: enabled=>command("automation.configure",{enabled}), retryPreview(){connection("ready","AI·PDF 생성·스케줄러가 연결되지 않았습니다. 실행된 작업이 없습니다.");},
    async importWorkbook(workbook,answerKeys){await command("workbook.import",{workbook,answerKeys});},
    async publishWorkbook(id,version,questionAssetId,answerAssetId){let request: ReturnType<typeof envelope>|undefined;await enqueue(async()=>{request??=envelope("publish",{questionAssetId,answerAssetId});adopt(await post<StudySnapshot>(`/api/study/workbooks/${encodeURIComponent(id)}/${version}/publish`,request));});},
    listAssets: ()=>get<StudyAsset[]>("/api/study/assets"),
    async uploadFile(file,context){
      if(capabilities?.storage!=="connected")throw new Error("비공개 파일 저장소 BLOCKED · 업로드되지 않았습니다.");
      const max=context.purpose==="handwritten"?capabilities.handwrittenMaxBytes:capabilities.materialMaxBytes;
      if(file.size<=0||file.size>max)throw new Error("파일 크기 제한을 확인하세요.");
      const hash=sha256.create();for await(const chunk of file.stream() as unknown as AsyncIterable<Uint8Array>)hash.update(chunk);const digest=Array.from(hash.digest()).map(v=>v.toString(16).padStart(2,"0")).join("");
      let ticket:(HandwrittenAttachmentMetadata & {url:string;headers:Record<string,string>})|undefined,bytesPut=false;
      let result: HandwrittenAttachmentMetadata | undefined, init: ReturnType<typeof envelope>|undefined, finish: ReturnType<typeof envelope>|undefined;
      await enqueue(async()=>{
        init??=envelope("upload",{...context,name:file.name,size:file.size,type:file.type,sha256:digest});
        if(!ticket){ticket=await post<HandwrittenAttachmentMetadata & {url:string;headers:Record<string,string>}>("/api/study/assets",init);await reload();}
        if(!bytesPut){const upload=await fetch(ticket.url,{method:"PUT",headers:ticket.headers,body:file,credentials:"omit"});if(!upload.ok)throw new Error("파일 전송에 실패했습니다. 재시도하세요.");bytesPut=true;}
        finish??=envelope("finalize",{});result=await post<HandwrittenAttachmentMetadata>(`/api/study/assets/${ticket.id}/complete`,finish);await reload();
      });
      return result!;
    },
    async downloadFile(id){
      const supabase=createSupabaseBrowserClient(), { data }=supabase?await supabase.auth.getSession():{data:{session:null}};
      if(owner&&data.session&&data.session.user.id!==owner)throw new ApiError(401,"로그인 계정이 변경되었습니다.");
      const response=await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL??"http://localhost:8080"}/api/study/assets/${encodeURIComponent(id)}/content`,{headers:data.session?{Authorization:`Bearer ${data.session.access_token}`}:{},cache:"no-store"});
      if(!response.ok)throw new ApiError(response.status,"파일을 열 수 없습니다.");return response.blob();
    },
  };
}
