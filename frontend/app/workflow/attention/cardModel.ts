import type {AttentionItem,SummaryOrigin} from '../../../lib/api/attention';

const origins:SummaryOrigin[]=['SOURCE_PROVIDED','LOCAL_EXTRACTIVE','EVENT_METADATA'];
export function groundedSummary(item:AttentionItem){
 const candidates=[{text:item.summary,origin:item.summaryOrigin},{text:item.source.summary,origin:item.source.summaryOrigin}];
 for(const origin of origins){const found=candidates.find(value=>value.origin===origin&&value.text?.trim()&&value.text.trim()!==item.action.trim());if(found)return {text:found.text!,origin};}
 return {text:'요약 정보 없음',origin:'TITLE_FALLBACK' as SummaryOrigin};
}
export const originLabel:Record<SummaryOrigin,string>={SOURCE_PROVIDED:'출처 요약',LOCAL_EXTRACTIVE:'응답 발췌',EVENT_METADATA:'이벤트 정보',TITLE_FALLBACK:'제목 정보'};
export function eventBadge(intent:string){return ({RESPONSE_COMPLETED:'응답 완료',COMPLETED:'작업 완료',NEEDS_USER_INPUT:'입력 필요',BLOCKED:'진행 막힘',FAILED:'실패',REVIEW_REQUIRED:'검토 필요'} as Record<string,string>)[intent]??null;}
export function sourceLabel(kind:string){return ({CHATGPT:'GPT',CODEX_DESKTOP:'Codex',TEAM_KAFKA:'TEAM KAFKA',CLAUDE_CODE:'Claude',LOCAL_APP:'메모',WEB:'Web'} as Record<string,string>)[kind]??kind;}
export function memoKeyAction(key:string,shift:boolean,composing:boolean,keyCode:number){return composing||keyCode===229?'compose':key==='Escape'?'cancel':key==='Enter'&&!shift?'save':'type';}
export function dragStartAllowed(target:Element){return !target.closest('button,a,input,textarea,select,fieldset[disabled],[contenteditable="true"],[role="menu"],[role="menuitem"],[data-no-drag]')&&(!target.closest('[role="button"]')||!!target.closest('[data-memo-preview]'));}
export function snapshotScope(etag:string|null|undefined){return etag?.match(/^"attention-([a-f0-9]{16})-/)?.[1]??null;}

export const GROUPS=[{id:'ACTIVE',name:'진행중'},{id:'COMPLETED',name:'완료'},{id:'DEFERRED',name:'나중에 확인'}] as const;
export function genericTitle(action:string){return !action.trim()||/^(GPT 응답 확인|ChatGPT 응답 확인|응답 확인|작업 확인)$/.test(action.trim());}
export function incompleteInformation(item:AttentionItem){return genericTitle(item.action)||groundedSummary(item).origin==='TITLE_FALLBACK';}
export function chronological(a:AttentionItem,b:AttentionItem){
 const time=Date.parse(b.createdAt)-Date.parse(a.createdAt);if(time)return time;
 // PostgreSQL retains microseconds that Date.parse truncates. Preserve their order too.
 const fraction=(value:string)=>(value.match(/\.(\d+)Z$/)?.[1]??'').padEnd(9,'0');
 const af=fraction(a.createdAt),bf=fraction(b.createdAt);return af<bf?1:af>bf?-1:a.id<b.id?1:a.id>b.id?-1:0;
}
export function itemGroup(item:AttentionItem){return item.queueGroup??(item.status==='COMPLETED'?'COMPLETED':'ACTIVE');}
