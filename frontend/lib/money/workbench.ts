/** The UI only routes server states; eligibility and commit guards remain on the server. */
export type WorkbenchAction = 'LOOKUP_SAVE'|'LOOKUP_RECOMMENDATION'|'SAVE_CHOICE'|'ADOPT'|'RETRY_KNOWN'|'REQUEST'|'WAIT'|'COMPARE';
export function workbenchAction(input:{saveStatus?:string;recommendationStatus?:string;hasChoice:boolean;adoptable:boolean;hasDraft:boolean;conflict?:boolean}):WorkbenchAction {
 if(['QUEUED','OUTCOME_UNKNOWN'].includes(input.saveStatus??''))return 'LOOKUP_SAVE';
 if(input.recommendationStatus==='EXTERNAL_OUTCOME_UNKNOWN')return 'LOOKUP_RECOMMENDATION';
 if(input.conflict||input.saveStatus==='STALE_CONFLICT')return 'COMPARE';
 if(input.hasChoice)return 'SAVE_CHOICE';
 if(input.adoptable)return 'ADOPT';
 if(input.recommendationStatus==='FAILED_KNOWN')return 'RETRY_KNOWN';
 if(input.hasDraft||['QUEUED','RUNNING','BUDGET_WAIT'].includes(input.recommendationStatus??''))return 'WAIT';
 return 'REQUEST';
}
export function previewCanConfirm(selected:number,ready:number,excluded:number,busy:boolean){return !busy&&ready>0&&selected===ready+excluded;}
