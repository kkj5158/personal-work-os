export type RepresentativeRow = {id:string;name:string|null;accountIds:string[]};
export type RepresentativeLayout = {layoutVersion:1;rows:RepresentativeRow[]};
export type RepresentativePreferences = {accountIds:string[];version:number;layout:RepresentativeLayout|null};
// Legacy rendering is a read-only projection; it never persists preferences.
export function legacyRows(ids:string[]):RepresentativeRow[]{
  return Array.from({length:Math.ceil(ids.length/3)},(_,i)=>({id:`legacy-${i}`,name:null,accountIds:ids.slice(i*3,i*3+3)}));
}
export function visibleRows(preferences:RepresentativePreferences,expanded:boolean){
  let remaining=expanded?10:5;
  return (preferences.layout?.rows??legacyRows(preferences.accountIds)).map(row=>{
    const accountIds=row.accountIds.slice(0,remaining);remaining-=accountIds.length;
    return {...row,accountIds};
  }).filter(row=>row.accountIds.length>0);
}
export function layoutError(rows:RepresentativeRow[],available:ReadonlySet<string>):string{
  const ids=rows.flatMap(r=>r.accountIds);
  if(rows.length>5)return '최대 다섯 행으로 배치해 주세요.';
  if(rows.some(r=>r.accountIds.length>3))return '한 행에는 최대 세 계좌를 배치해 주세요.';
  if(ids.length>10||new Set(ids).size!==ids.length)return '서로 다른 계좌를 최대 10개 선택해 주세요.';
  if(ids.some(id=>!available.has(id)))return '사용 불가 계좌를 배치에서 제거해 주세요.';
  if(rows.some(r=>(r.name?.length??0)>80))return '행 이름은 80자 이내로 입력해 주세요.';
  return '';
}
export function relocate(rows:RepresentativeRow[],id:string,target:string,before?:string):RepresentativeRow[]{
  const destination=rows.find(r=>r.id===target);const origin=rows.find(r=>r.accountIds.includes(id));
  if(!destination||!origin||before===id||destination!==origin&&destination.accountIds.length>=3)return rows;
  return rows.map(row=>{const ids=row.accountIds.filter(value=>value!==id);if(row.id===target){const at=before?ids.indexOf(before):-1;ids.splice(at<0?ids.length:at,0,id);}return {...row,accountIds:ids};});
}
