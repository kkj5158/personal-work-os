import type {BookRow,BookFields} from '../../app/money/MoneyWebData';
type Outcome<T>={requestId:string;status:'APPLIED'|'NOT_APPLIED'|'UNKNOWN';result:T&{message?:string;reason?:string}};
type Transport={get:<T>(path:string)=>Promise<T>;post:<T>(path:string,body:unknown)=>Promise<T>};
type Pending={path:string;body:Record<string,unknown>;requestId:string};
export class MoneyRowCoordinator {
 private tails=new Map<string,Promise<unknown>>();
 private saved=new Map<string,BookRow>();
 private unresolved=new Map<string,Pending>();
 private failures=new Map<string,string>();
 private bundlePending=new Map<string,Pending>();
 private drafts=new Map<string,Map<string,()=>Promise<void>>>();
 private active=true;
 private draftValues=new Map<string,unknown>();
 private listeners=new Map<string,Set<()=>void>>();
 constructor(private api:Transport,private uuid=()=>crypto.randomUUID()){}
 activate(){this.active=true;}
 snapshot(id:string){return this.saved.get(id)??null;}
 subscribe(id:string,listener:()=>void){const group=this.listeners.get(id)??new Set();group.add(listener);this.listeners.set(id,group);return()=>{group.delete(listener);if(!group.size)this.listeners.delete(id);};}
 private accept(row:BookRow){if(!this.active)return;this.saved.set(row.id,row);this.listeners.get(row.id)?.forEach(listener=>listener());}
 dispose(){this.active=false;this.saved.clear();this.unresolved.clear();this.bundlePending.clear();this.failures.clear();this.drafts.clear();this.draftValues.clear();this.listeners.clear();}
 draft<T>(id:string,field:string){return this.draftValues.get(id+':'+field) as T|undefined;}
 keepDraft(id:string,field:string,value:unknown){if(this.active)this.draftValues.set(id+':'+field,value);}
 discardDraft(id:string,field:string){this.draftValues.delete(id+':'+field);}
 registerDraft(id:string,source:string,flush:()=>Promise<void>){const group=this.drafts.get(id)??new Map();group.set(source,flush);this.drafts.set(id,group);return()=>{if(group.get(source)===flush)group.delete(source);if(!group.size)this.drafts.delete(id);};}
 private async flushDrafts(ids:string[],source?:string){for(const id of ids)for(const [key,flush] of this.drafts.get(id)??[])if(key!==source)await flush();}
 private async command<T>(path:string,body:Record<string,unknown>,pending?:Pending):Promise<T>{
  if(!this.active)throw Error('이전 세션의 변경 요청은 적용하지 않습니다.');
  const request=pending??{path,body,requestId:this.uuid()};
  let outcome:Outcome<T>;
  if(pending){try{outcome=await this.api.get<Outcome<T>>('/ai/classification/outcomes/'+request.requestId);}catch{throw Object.assign(Error('저장 결과 조회가 실패했습니다. 초안을 유지했습니다.'),{pending:request});}if(outcome.status==='UNKNOWN'){try{outcome=await this.api.post<Outcome<T>>(request.path,{...request.body,requestId:request.requestId});}catch{try{outcome=await this.api.get<Outcome<T>>('/ai/classification/outcomes/'+request.requestId);}catch{throw Object.assign(Error('같은 요청의 저장 결과를 확인하지 못했습니다. 초안을 유지했습니다.'),{pending:request});}}if(outcome.status==='UNKNOWN')throw Object.assign(Error('같은 요청의 저장 결과가 아직 확인되지 않았습니다. 초안을 유지했습니다.'),{pending:request});}}
  else{try{outcome=await this.api.post<Outcome<T>>(path,{...body,requestId:request.requestId});}catch{
   try{outcome=await this.api.get<Outcome<T>>('/ai/classification/outcomes/'+request.requestId);}catch{throw Object.assign(Error('저장 결과를 확인하지 못했습니다. 초안을 유지했습니다.'),{pending:request});}
   if(outcome.status==='UNKNOWN')throw Object.assign(Error('저장 결과가 아직 확인되지 않았습니다. 결과 확인 후 다시 저장해 주세요.'),{pending:request});
  }}
  if(!this.active)throw Error('세션이 변경되어 이전 저장 응답을 표시하지 않습니다.');
  if(outcome.status!=='APPLIED')throw Object.assign(Error(outcome.result?.message??'변경을 적용하지 않았습니다. 최신 상태와 초안을 확인해 주세요.'),{settled:true});return outcome.result;
 }
 private serial<T>(id:string,operation:()=>Promise<T>){const previous=this.tails.get(id)??Promise.resolve();const next=previous.catch(()=>{}).then(operation);this.tails.set(id,next);void next.finally(()=>{if(this.tails.get(id)===next)this.tails.delete(id);}).catch(()=>{});return next;}
 latest(row:BookRow){const saved=this.saved.get(row.id);return saved&&saved.version>row.version&&saved.transactionVersion===row.transactionVersion&&saved.projectionVersion===row.projectionVersion&&(saved.classificationVersion??0)>=(row.classificationVersion??0)?saved:row;}
 async edit(row:BookRow,patch:Partial<BookFields>,resetFields:string[]=[],source='inline'):Promise<BookRow>{
 if('categoryId' in patch||resetFields.includes('categoryId'))await this.flushDrafts([row.id],source);
 return this.serial(row.id,async()=>{
  const unresolved=this.unresolved.get(row.id);
  if(unresolved){try{const resolved=await this.command<{book:BookRow}>(unresolved.path,unresolved.body,unresolved);this.unresolved.delete(row.id);this.accept(resolved.book);this.failures.delete(row.id);if(JSON.stringify(unresolved.body.patch)===JSON.stringify(patch)&&JSON.stringify(unresolved.body.resetFields)===JSON.stringify(resetFields))return resolved.book;}catch(error){if(error&&typeof error==='object'&&'settled' in error){this.unresolved.delete(row.id);this.failures.set(row.id,'이전 요청은 적용되지 않았습니다. 최신값을 확인해 주세요.');}throw error;}}
  const base=this.latest(row);
  if(this.failures.has(row.id)){
   const current=await this.api.get<BookRow>('/bookkeeping/'+row.id);this.accept(current);this.failures.delete(row.id);
   throw Error('다른 저장이 실패했습니다. 서버 최신값을 확인했으며 초안은 유지했습니다. 의도한 변경을 다시 저장해 주세요.');
  }
  const body={id:base.id,transactionVersion:base.transactionVersion,overrideVersion:base.version,projectionVersion:base.projectionVersion,patch,resetFields};
  try{const result=await this.command<{book:BookRow}>('/ai/classification/edit',body);this.accept(result.book);this.failures.delete(row.id);return result.book;}
  catch(error){if(error&&typeof error==='object'&&'pending' in error)this.unresolved.set(row.id,error.pending as Pending);else this.failures.set(row.id,error instanceof Error?error.message:'저장 실패');throw error;}
 });}
 /** Explicit conflict review acknowledges the fresh versions without discarding caller-owned drafts. */
 acknowledge(row:BookRow){if(this.unresolved.has(row.id))throw Error('먼저 이전 요청의 저장 결과를 확인해 주세요.');this.accept(row);this.failures.delete(row.id);}
 async execute<T>(key:string,path:string,body:Record<string,unknown>):Promise<T>{const pending=this.bundlePending.get(key);try{const result=await this.command<T>(path,body,pending);this.bundlePending.delete(key);if(pending&&JSON.stringify(pending.body)!==JSON.stringify(body))throw Error('이전 요청의 저장 결과를 확인했습니다. 새 초안은 유지했으니 최신 상태와 비교해 주세요.');return result;}catch(error){if(error&&typeof error==='object'&&'pending' in error)this.bundlePending.set(key,error.pending as Pending);else this.bundlePending.delete(key);throw error;}}
 async settle(ids:string[]){for(const id of ids){await this.tails.get(id);if(this.unresolved.has(id)||this.failures.has(id))throw Error('제목·메모 저장 결과를 먼저 확인해 주세요. 분류 묶음은 적용하지 않았습니다.');}}
 async flush(ids:string[]){await this.flushDrafts(ids);await this.settle(ids);}
 async classify(items:Record<string,unknown>[]){
  const ids=items.map(item=>String(item.id));await this.flushDrafts(ids);await this.settle(ids);const key=[...ids].sort().join(',');
  const pending=this.bundlePending.get(key);for(const other of this.bundlePending.keys())if(other!==key&&other.split(',').some(id=>ids.includes(id)))throw Error('겹치는 이전 묶음의 저장 결과를 먼저 확인해 주세요.');
  const coordinated=items.map(item=>{const saved=this.saved.get(String(item.id));return saved&&saved.version>=Number(item.overrideVersion)&&saved.transactionVersion===item.transactionVersion&&saved.projectionVersion===item.projectionVersion?{...item,overrideVersion:saved.version}:item;});
  try{const result=await this.command<{items:{id:string;book:BookRow;eventId:string}[];completed:number;bundleId:string}>('/ai/classification/save',{items:coordinated},pending);this.bundlePending.delete(key);for(const item of result.items)this.accept(item.book);if(pending&&JSON.stringify(pending.body.items)!==JSON.stringify(coordinated))throw Error('이전 묶음은 저장되었습니다. 현재 선택 초안은 유지했으니 최신값과 비교한 후 다시 저장해 주세요.');return result;}
  catch(error){if(error&&typeof error==='object'&&'pending' in error)this.bundlePending.set(key,error.pending as Pending);else this.bundlePending.delete(key);throw error;}
 }
}
