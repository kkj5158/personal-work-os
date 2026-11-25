import {check} from './money-tools.mjs';

export const STUDY_READ='orbit:read:study', STUDY_WRITE='orbit:write:study';
const text=maxLength=>({type:'string',maxLength});
const integer=(minimum,maximum)=>({type:'integer',minimum,maximum});
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const array=(items,maxItems,minItems=0)=>({type:'array',items,minItems,maxItems});
const uuid={...text(36),pattern:'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$'};
const date={...text(10),pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'};
const topics=array(text(500),30);
const summary=object({title:text(200),topics,summary:text(8000),keyTakeaways:topics,userInsights:topics,
    openQuestions:topics,nextStudyPoint:{anyOf:[text(2000),{type:'null'}]},
    summaryCoverage:{type:'string',enum:['AVAILABLE_CONTEXT','PARTIAL_CONTEXT']}},
    ['title','topics','summary','keyTakeaways','userInsights','openQuestions','summaryCoverage']);
const allocations=array(object({date,effectiveSeconds:integer(0,86400)},['date','effectiveSeconds']),93,1);
const span={effectiveStart:text(40),effectiveEnd:text(40),allocations};
const cmd={operationKey:uuid}, target={sessionId:uuid,...cmd,expectedRevision:integer(1,Number.MAX_SAFE_INTEGER)};
const reason=text(500), base='learning-sessions', item=base+'/:id';
const definitions=[];
function add(name,method,path,props,required,description,destructive=false){
    const read=method==='GET', scope=read?STUDY_READ:STUDY_WRITE;
    const securitySchemes=[{type:'oauth2',scopes:['orbit:read',scope]}];
    definitions.push({name:'study_'+name,method,path,scope,inputSchema:object(props,required),description:description+
        (read?'':' Require explicit intent. Preserve operationKey and exact body. After unknown outcome, look up the original operationKey via get_current_learning_session before replay.'),
        annotations:{readOnlyHint:read,destructiveHint:destructive,idempotentHint:true,openWorldHint:false},securitySchemes,_meta:{securitySchemes}});
}
add('start_learning_session','POST',base,{...cmd,title:text(200),topics},['operationKey'],'Start workbook-independent learning or recover the existing open session. For automatic time bind the intended chat through Study History and the Chrome popup.');
add('get_current_learning_session','GET',base+'/current',{operationKey:uuid},[],'Get current session, checkpoint and provisional evidence. Supply operationKey to retrieve its durable receipt after an uncertain write.');
function transition(name,suffix,extra={},required=[],description='',destructive=false){
    add(name,'POST',item+'/'+suffix,{...target,...extra},[...Object.keys(target),...required],description,destructive);
}
transition('pause_learning_session','pause',{},[],'Manually pause collection accounting.');
transition('resume_learning_session','resume',{},[],'Resume eligible collection after a manual pause.');
transition('complete_learning_session','complete',{summary},['summary'],'Summarize visible dialogue and saved checkpoint. Attribute only actual user insights, mark partial context. Report success and coverage only from the frozen receipt.');
transition('cancel_learning_session','cancel',{reason},['reason'],'Cancel one open session on explicit request.',true);
transition('save_learning_checkpoint','checkpoints',{summary,lastQuestion:text(2000)},['summary'],'Save a partial summary at a meaningful transition or on request.');
add('get_learning_context','GET','learning-context',{recentLimit:integer(0,10),topic:text(200)},[],'Read latest checkpoint and bounded recent summaries in a new chat. Unsaved dialogue is unavailable. Explicitly rebind the new chat.');
add('list_learning_sessions','GET',base,{from:date,to:date,cursor:text(80),limit:integer(1,50),includeDeleted:{type:'boolean'}},['from','to'],'Page effective records intersecting a half-open KST date range up to 93 days.');
add('get_learning_session','GET',item,{sessionId:uuid},['sessionId'],'Read one exact session with original and effective time, summary, coverage and revisions.');
add('get_learning_statistics','GET','statistics',{month:text(7),from:date,to:date},[],'Read daily and aggregate completed effective time. Supply a month or half-open KST range.');
add('update_learning_session','PATCH',item,{...target,summary,...span,reason},[...Object.keys(target),'reason'],'Correct the exact approved summary or explicit bounded daily allocations and preserve originals.',true);
add('create_manual_session','POST',base+'/manual',{...cmd,...span,reason,summary},['operationKey',...Object.keys(span),'reason','summary'],'Create one explicitly requested historical manual record, with UTC instants and KST allocations.');
add('delete_learning_session','DELETE',item,{...target,reason},[...Object.keys(target),'reason'],'Soft-delete one exact completed record on explicit instruction.',true);
transition('restore_learning_session','restore',{reason},['reason'],'Restore one explicitly identified deleted record after overlap checks.');

export const studyDefinition=name=>definitions.find(d=>d.name===name);
export const studyTools=definitions.map(({method,path,scope,...tool})=>tool);
export function validateStudy(name,args){
    const d=studyDefinition(name);if(!d)throw Error('VALIDATION');
    check(d.inputSchema,args);
    if(Buffer.byteLength(JSON.stringify(args))>32768)throw Error('VALIDATION');
    return d;
}
export async function callStudy(name,args,{origin,token,proof,fetcher=fetch}){
    const d=validateStudy(name,args);
    if(!token||!['https://workflow-api-development-development.up.railway.app','https://personal-work-os-prod-production.up.railway.app'].includes(origin))throw Error('FORBIDDEN');
    const {sessionId,...values}=args;
    const lookup=name==='study_get_current_learning_session'&&values.operationKey;
    const path=lookup?'learning-operations/'+values.operationKey:d.path.replace(':id',sessionId??'');
    const url=new URL('/api/study/'+path,origin);
    const body=d.method==='GET'?'':JSON.stringify(values);
    if(!body&&!lookup)for(const [k,v] of Object.entries(values))url.searchParams.set(k,String(v));
    const signed=await proof({method:d.method,path:url.pathname+url.search,body});
    const response=await fetcher(url,{method:d.method,headers:{Authorization:'Bearer '+token,'X-Orbit-Study-Proof':signed,
        Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body}:{}),
        redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>524288)throw Error('OUTCOME_UNKNOWN');chunks.push(chunk);}
    if(!response.ok)throw Error([401,403].includes(response.status)?'FORBIDDEN':response.status===409?'CONFLICT':response.status===429?'RATE_LIMIT':response.status>=500?'OUTCOME_UNKNOWN':'VALIDATION');
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
