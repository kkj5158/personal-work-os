"use client";
import { useEffect, useState, useContext } from "react";
import "./money-account-v2.css";
import { type Account, type AccountBalance, type Reconciliation, type Transaction, moneyApi as api, providers, roles, reconciliationStatus, seoul } from "@/lib/money/model";
import { fundLabels, moneyAmount, accountUpdatePayload, toggleRepresentative, type AccountPreferences } from "@/lib/money/accounts";
import type { Tracking } from "@/lib/money/meaning";
import { useMoneyData, LoadState } from "./MoneyWebData";
import { useMoneyCache } from "./MoneyDataProvider";
import { MoneyPanel, PanelContext } from "./MoneyPanel";
import { MoneyDialog } from "./MoneyDialog";
import { OpeningBalance, type Props as EditorProps } from "./MoneyEditors";
import { BalanceObservations } from "./MoneyBalanceObservations";
import { type ReconciliationInvestigation, AccountIcon } from "./MoneyWebViews";

export { AccountsV3 as RevisionAccounts, ReconciliationV3 as RevisionReconciliation } from "./MoneyAccountsV3";

type ProviderImpact = {
  currentProvider: string;
  nextProvider: string;
  version: number;
  transactions: number;
  linkedAlerts: number;
  preservedObservations: number;
  reviewAlerts: number;
  scheduledAlerts: number;
  collision: boolean;
  fingerprint: string;
};

/** Account administration uses the existing dock, with independent versioned saves. */
export function RevisionAccountPanel(p:EditorProps & {value:Account|null}) {
  const [account,setAccount]=useState(p.value),[name,setName]=useState(p.value?.displayName??""),[provider,setProvider]=useState(p.value?.provider??"SHINHAN"),[suffix,setSuffix]=useState(p.value?.suffix??""),[masked,setMasked]=useState(p.value?.maskedReference??""),[memo,setMemo]=useState(p.value?.memo??"");
  const [group,setGroup]=useState<Account["fundGroup"]>(p.value?.fundGroup??"LIVING"),[subtype,setSubtype]=useState<Account["savingsSubtype"]>(p.value?.savingsSubtype??"SAVINGS_ACCOUNT");
  const [busy,setBusy]=useState(""),[error,setError]=useState(""),[status,setStatus]=useState(""),[latest,setLatest]=useState<Account|null>(null);
  const [emoji,setEmoji]=useState(p.value?.emoji??"");
  const [providerImpact,setProviderImpact]=useState<ProviderImpact|null>(null);
  const [checkingProvider,setCheckingProvider]=useState(false);
  const balances=useMoneyData<AccountBalance[]>("/account-balances"),stock=useMoneyData<{unsupportedCurrencyAccountIds:string[]}>("/overview/current-stock");
  const balance=balances.data?.find(b=>b.account.id===account?.id)?.balance;
  const tracking=useMoneyData<Tracking>("/tracking"),preferences=useMoneyData<AccountPreferences>("/overview/preferences");
  const recent=useMoneyData<{items:Transaction[]}>(account?`/transactions?accountId=${account.id}&limit=10`:null);
  const history=useMoneyData<{fundGroup:string;savingsSubtype:string|null;effectiveAt:string|null;recordedAt:string}[]>(account?`/accounts/${account.id}/fund-history`:null);
  const eligibility=useMoneyData<{allowed:boolean;reasons:string[]}>(account?`/accounts/${account.id}/deletion-eligibility`:null);
  const cache=useMoneyCache(),{setDirty}=useContext(PanelContext),active=!!account&&!account.archived;
  useEffect(()=>{setDirty(account?name!==account.displayName||suffix!==(account.suffix??"")||masked!==(account.maskedReference??"")||memo!==(account.memo??"")||emoji!==(account.emoji??"")||group!==account.fundGroup||(group==="SAVINGS"&&subtype!==account.savingsSubtype):!!name||!!suffix||!!masked);},[account,name,suffix,masked,memo,group,subtype,emoji,setDirty]);
  async function run(label:string,fn:()=>Promise<unknown>){if(busy)return;setBusy(label);setError("");setStatus("");setLatest(null);try{await fn();cache.invalidate();p.onSaved();setStatus(label+" 저장됨");}catch(e){setError((e instanceof Error?e.message:"저장 응답 확인 실패")+" · 입력을 유지했습니다.");if(account){const current=await api.get<Account>(`/accounts/${account.id}`).catch(()=>null);setLatest(current);}}finally{setBusy("");}}
  function update(label:string,changes:Partial<Account>,impact?:string){if(!account||busy)return;if(impact&&!window.confirm(impact))return;void run(label,async()=>{const saved=await api.put<Account>(`/accounts/${account.id}`,accountUpdatePayload(account,changes));setAccount(saved);if(changes.displayName!==undefined)setName(saved.displayName);if(changes.emoji!==undefined)setEmoji(saved.emoji??"");});}
  async function previewProvider(nextProvider:string) {
    if (!account) { setProvider(nextProvider); return; }
    if (busy || checkingProvider || providerImpact || !active || nextProvider===account.provider) return;
    setError("");
    setStatus("");
    setCheckingProvider(true);
    try {
      const impact=await api.get<ProviderImpact>(`/accounts/${account.id}/provider-impact?provider=${encodeURIComponent(nextProvider)}`);
      setProviderImpact(impact);
    } catch (e) {
      setError(e instanceof Error ? e.message : "금융기관 변경 영향을 조회하지 못했습니다.");
    } finally {
      setCheckingProvider(false);
    }
  }
  function saveProvider() {
    if (!account || !providerImpact || busy || providerImpact.collision || providerImpact.scheduledAlerts) return;
    const {nextProvider,version,fingerprint}=providerImpact;
    setProviderImpact(null);
    void run("금융기관",async()=>{
      const saved=await api.put<Account>(`/accounts/${account.id}/provider`,{provider:nextProvider,expectedVersion:version,fingerprint});
      setAccount(saved);
    });
  }
  async function upload(file?:File){if(!file||!account)return;try{if(!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type)||file.size>10485760)throw new Error("10MB 이하의 이미지 파일을 선택하세요.");const bitmap=await createImageBitmap(file),canvas=document.createElement("canvas");canvas.width=canvas.height=256;const size=Math.min(bitmap.width,bitmap.height);canvas.getContext("2d")!.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,256,256);bitmap.close();update("계좌 이미지",{imageData:canvas.toDataURL("image/png"),emoji:null});}catch(e){setError(e instanceof Error?e.message:"이미지 처리 실패");}}
  async function track(kind:"income"|"expense",enabled:boolean){if(!account||!tracking.data)return;const current=tracking.data,ids=enabled?[...current[kind],account.id]:current[kind].filter(id=>id!==account.id);if(ids.length>5){setError("수입·지출 추적은 각각 최대 5개입니다.");return;}await run(kind==="income"?"수입 추적":"지출 추적",()=>api.put("/tracking",{expense:kind==="expense"?ids:current.expense,income:kind==="income"?ids:current.income,expectedVersion:current.version}));}
  async function create(){if(!name.trim()||busy)return;if(p.accounts.some(a=>a.provider===provider&&((suffix&&a.suffix===suffix)||(masked&&a.maskedReference===masked)||a.displayName.trim()===name.trim()))){setError("이름 또는 금융 식별이 같은 계좌가 있습니다. 기존 계좌와 보관 계좌를 확인하세요.");return;}await run("계좌 등록",async()=>{const saved=await api.post<{account:Account}>("/mobile/accounts",{account:{provider,displayName:name.trim(),role:provider==="CASH"?"CASH":"SPENDING",suffix:provider==="CASH"?null:suffix||null,maskedReference:provider==="CASH"?null:masked||null,emoji:null,imageData:null,fundingAccountId:null,includeInAssets:false,includeInStatistics:true},fundGroup:group,savingsSubtype:group==="SAVINGS"?subtype:null});setDirty(false);setAccount(saved.account);p.select({kind:"account",value:saved.account});});}
  return <MoneyPanel title={account?"계좌 설정":"계좌 추가"} onClose={()=>{if(!busy)p.onClose();}} backdrop trackDirty={false} status={<span className="money-account-save-state" role="status">{busy?busy+" 저장 중…":status}</span>}>
    {account&&<div className="money-account-card-title"><AccountIcon account={account}/><strong>{account.displayName}</strong>{account.archived&&<span>보관됨</span>}</div>}
    {account&&<><p className="money-account-card-balance"><strong>{!stock.data?"통화 조회 중":stock.data.unsupportedCurrencyAccountIds.includes(account.id)?"원통화별 잔액 확인 필요":moneyAmount(balance?.asOf?balance.amount:undefined)}</strong><small>{balance?.asOf?seoul(balance.asOf).replace("T"," "):"잔액 기준 시각 미확인"} · {stock.data?stock.data.unsupportedCurrencyAccountIds.includes(account.id)?"KRW 합산 제외":"KRW 장부 잔액":"통화 조회 중"}</small></p><LoadState error={balances.error||stock.error} loading={balances.loading||stock.loading}/><div className="money-account-shortcuts"><button onClick={()=>p.navigate?.(`/money/transactions?account=${account.id}`)}>이 계좌 거래 보기</button><button onClick={()=>p.navigate?.(`/money/reconciliation?account=${account.id}`)}>잔액 점검</button></div></>}
    {error&&<p role="alert">{error}</p>}{latest&&<section className="money-card"><p>최신 서버: {latest.displayName} · {fundLabels[latest.fundGroup??"OTHER"]} · 버전 {latest.version}<br/>편집 기준 버전 {account?.version}. 현재 입력과 비교한 뒤 최신 기준을 적용하세요.</p><button disabled={!!busy} onClick={()=>{setAccount(latest);setLatest(null);setError("");}}>입력 유지 · 최신 버전 적용</button></section>}
    <section className="money-account-setting-section"><h3>기본 정보</h3>
      <label className="money-field"><span>계좌명 · 필수</span><input required maxLength={120} value={name} disabled={!!busy} onChange={e=>setName(e.target.value)} onBlur={()=>{if(account&&name.trim()&&name!==account.displayName)update("계좌명",{displayName:name.trim()});}}/></label>
      <label className="money-field"><span>금융기관</span><select value={account?.provider??provider} disabled={!!busy||checkingProvider||!!providerImpact||!!account&&(!active||account.provider==="CASH"||account.role==="CASH")} onChange={e=>void previewProvider(e.target.value)}>
        {Object.entries(providers).filter(([id])=>!account||id!=="CASH"||account.provider==="CASH").map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </select></label>
      {checkingProvider&&<p className="money-muted" role="status">변경 영향 확인 중…</p>}
      {(account?.provider??provider)!=="CASH"&&<><label className="money-field"><span>계좌 끝자리 · 금융 연결 식별</span><input maxLength={4} value={suffix} disabled={!!busy} onChange={e=>setSuffix(e.target.value)} onBlur={()=>{if(account&&suffix!==(account.suffix??""))update("계좌 끝자리",{suffix:suffix||null},"알림의 계좌 연결 기준이 달라집니다. 기존 거래 연결은 유지됩니다. 저장할까요?");}}/></label><label className="money-field"><span>마스킹 계좌 번호 · 선택</span><input maxLength={100} value={masked} disabled={!!busy} onChange={e=>setMasked(e.target.value)} onBlur={()=>{if(account&&masked!==(account.maskedReference??""))update("계좌 식별",{maskedReference:masked||null},"알림 계좌 연결 기준 변경을 확인하고 저장할까요?");}}/></label></>}
      {account&&<><label className="money-field"><span>계좌 메모</span><textarea maxLength={500} value={memo} disabled={!!busy} onChange={e=>setMemo(e.target.value)} onBlur={()=>{if(memo!==(account.memo??""))update("계좌 메모",{memo});}}/></label><label className="money-field"><span>계좌 아이콘 · 이모지</span><input aria-label="계좌 이모지" maxLength={32} value={emoji} disabled={!!busy} onChange={e=>setEmoji(e.target.value)} onBlur={()=>{if(emoji!==(account.emoji??""))update("계좌 아이콘",{emoji:emoji||null,imageData:null});}}/></label><label className="money-field"><span>계좌 이미지 업로드</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={!!busy} onChange={e=>void upload(e.target.files?.[0])}/></label>{account.imageData&&<button disabled={!!busy} onClick={()=>update("계좌 이미지",{imageData:null})}>이미지 제거</button>}</>}
    </section>
    <section className="money-account-setting-section"><h3>자금 그룹</h3><label className="money-field"><span>자금 그룹</span><select disabled={!!busy||!!account&&!active} value={group} onChange={e=>setGroup(e.target.value as Account["fundGroup"])}><option value="LIVING">생활비</option><option value="SAVINGS">저축·적금</option><option value="OTHER">기타</option></select></label>{group==="SAVINGS"&&<label className="money-field"><span>통장 유형</span><select disabled={!!busy||!!account&&!active} value={subtype??"SAVINGS_ACCOUNT"} onChange={e=>setSubtype(e.target.value as Account["savingsSubtype"])}><option value="SAVINGS_ACCOUNT">저축통장</option><option value="INSTALLMENT">적금통장</option></select></label>}
      {account&&<><p className="money-muted">변경 확정 시 서버 시각부터 발생한 거래에 적용합니다. 과거 거래·통계는 유지하며 역할·추적·자산·대표 설정은 별도로 유지합니다.</p><button disabled={!!busy||!active||(group===account.fundGroup&&(group!=="SAVINGS"||subtype===account.savingsSubtype))} onClick={()=>{if(window.confirm(`${fundLabels[account.fundGroup??"OTHER"]} → ${fundLabels[group??"OTHER"]}${group==="SAVINGS"?" · "+(subtype==="INSTALLMENT"?"적금통장":"저축통장"):""}\n확정 시점 이후 발생 거래의 저축 경계와 현재 그룹 합계에 적용됩니다. 과거 통계는 바뀌지 않습니다. 변경할까요?`))void run("자금 그룹",async()=>{const saved=await api.put<{account:Account}>(`/accounts/${account.id}/fund`,{fundGroup:group,savingsSubtype:group==="SAVINGS"?subtype:null,expectedVersion:account.version});setAccount(saved.account);});}}>변경 영향 확인 · 확정</button><details className="money-account-settings-history"><summary>자금 그룹 변경 이력</summary><LoadState error={history.error} loading={history.loading}/>{history.data?.map((row,i)=><p key={i}>{row.effectiveAt?seoul(row.effectiveAt).replace("T"," "):"기존 통계 기준"} · {fundLabels[row.fundGroup as keyof typeof fundLabels]}{row.savingsSubtype?" · "+(row.savingsSubtype==="INSTALLMENT"?"적금통장":"저축통장"):""}</p>)}</details></>}
    </section>
    {!account?<><p className="money-muted">추적·자산·대표 계좌 설정은 등록 후 관리합니다. 금융 식별을 입력하면 은행 알림을 연결할 수 있습니다.</p><button className="money-primary" disabled={!!busy||!name.trim()} onClick={()=>void create()}>계좌 등록</button><button disabled={!!busy} onClick={p.onClose}>취소 · 목록으로</button></>:<>
      <section className="money-account-setting-section"><h3>관리 설정</h3><label className="money-field"><span>기존 구조 역할 · 자금 그룹과 별도</span><select value={account.role} disabled={!!busy||!active} onChange={e=>update("구조 역할",{role:e.target.value as Account["role"]},"기존 계좌 구조 역할을 변경합니다. 자금 그룹·추적·대표 설정은 유지합니다. 저장할까요?")}>{Object.entries(roles).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><p className="money-muted">연결 계좌: {p.accounts.find(a=>a.id===account.fundingAccountId)?.displayName??"없음"}</p>
        <LoadState error={tracking.error||preferences.error} loading={tracking.loading||preferences.loading}/>
        {(["income","expense"] as const).map(kind=><label className="money-account-setting-row" key={kind}><span>{kind==="income"?"수입 추적":"지출 추적"} · 최대 5개</span><input type="checkbox" checked={tracking.data?.[kind].includes(account.id)??false} disabled={!!busy||!tracking.data||!active} onChange={e=>void track(kind,e.target.checked)}/></label>)}
        <label className="money-account-setting-row"><span>자산 포함</span><input type="checkbox" checked={account.includeInAssets!==false} disabled={!!busy} onChange={e=>update("자산 포함",{includeInAssets:e.target.checked},"현재 자산 합계의 포함 범위가 변경됩니다. 금융 거래는 유지합니다. 저장할까요?")}/></label>
        <label className="money-account-setting-row"><span>기존 통계 포함</span><input type="checkbox" checked={account.includeInStatistics!==false} disabled={!!busy} onChange={e=>update("통계 포함",{includeInStatistics:e.target.checked},"기존 통계의 포함 범위가 변경됩니다. 저장할까요?")}/></label>
        <label className="money-account-setting-row"><span>대표 계좌 · 최대 10개</span><input type="checkbox" checked={preferences.data?.accountIds.includes(account.id)??false} disabled={!!busy||!preferences.data||!active} onChange={e=>{const enabled=e.target.checked;void run("대표 계좌",()=>api.put("/overview/preferences",toggleRepresentative(preferences.data!,account.id,enabled)));}}/></label>
      </section>
      <div className="money-account-shortcuts"><button onClick={()=>p.navigate?.(`/money/transactions?account=${account.id}`)}>이 계좌 거래 보기</button><button onClick={()=>p.navigate?.(`/money/reconciliation?account=${account.id}`)}>잔액 점검</button></div>
      <BalanceObservations account={account}/><details><summary>최근 거래</summary><LoadState error={recent.error} loading={recent.loading}/>{recent.data?.items.map(t=><button className="money-evidence-transaction" key={t.id} onClick={()=>p.select({kind:"transaction",value:t})}><span>{t.title??t.counterpartyText??t.type}</span><strong>{moneyAmount(t.amount,t.currency)}</strong><small>{seoul(t.occurredAt).replace("T"," ")}</small></button>)}</details><details><summary>초기 잔액 · 예외적 수동 조정</summary><OpeningBalance account={account} select={p.select} run={async fn=>{await fn();cache.invalidate();p.onSaved();}}/><button onClick={()=>p.select({kind:"account",value:account,action:"BALANCE_ADJUSTMENT"})}>예외적 수동 잔액 조정</button><p className="money-muted">직접 확인 기록과 별개입니다. 기준점 변경은 기존 버전·사유 검증을 따릅니다.</p></details><section className="money-destructive"><button disabled={!!busy} onClick={()=>{if(window.confirm(account.archived?"계좌를 다시 사용할까요?":"계좌를 보관할까요? 과거 거래와 참조는 유지됩니다."))void run(account.archived?"보관 해제":"계좌 보관",async()=>{setAccount(await api.put<Account>(`/accounts/${account.id}/archive`,{expectedVersion:account.version,archived:!account.archived}));});}}>{account.archived?"보관 해제":"계좌 보관"}</button><LoadState error={eligibility.error} loading={eligibility.loading}/>{eligibility.data&&!eligibility.data.allowed&&<p className="money-muted">삭제 불가 · {eligibility.data.reasons.join(" / ")}. 보관을 사용하세요.</p>}<button disabled={!!busy||!eligibility.data?.allowed} onClick={()=>{if(window.confirm("거래·참조가 없는 이 계좌를 삭제할까요? 삭제 후 되돌릴 수 없습니다."))void run("계좌 삭제",async()=>{await api.post(`/accounts/${account.id}/delete`,{expectedVersion:account.version});setDirty(false);p.onClose();});}}>참조 없는 계좌 삭제</button></section>
    </>}
    {providerImpact&&<MoneyDialog title="금융기관 변경 영향 확인" onClose={()=>setProviderImpact(null)}>
      <p><strong>{account?.displayName}</strong> · {providers[providerImpact.currentProvider]??providerImpact.currentProvider} → {providers[providerImpact.nextProvider]??providerImpact.nextProvider}</p>
      <dl className="money-evidence-details">
        <dt>기존 거래</dt><dd>{providerImpact.transactions.toLocaleString("ko-KR")}건 유지</dd>
        <dt>거래에 연결된 알림</dt><dd>{providerImpact.linkedAlerts.toLocaleString("ko-KR")}건 유지</dd>
        <dt>연결 후보가 달라지는 과거 잔액 관측</dt><dd>{providerImpact.preservedObservations.toLocaleString("ko-KR")}건의 기존 연결 상태 보존</dd>
      </dl>
      <p>변경 후 새 알림은 새 금융기관의 계좌 식별 기준으로 연결됩니다.</p>
      {providerImpact.reviewAlerts>0&&<p>아직 연결되지 않은 검토 알림 {providerImpact.reviewAlerts.toLocaleString("ko-KR")}건은 계좌 후보가 달라질 수 있습니다.</p>}
      {providerImpact.collision&&<p role="alert">새 금융기관에 같은 이름 또는 금융 식별 정보가 이미 등록되어 있습니다. 사용 중인 계좌와 보관 계좌를 확인하세요.</p>}
      {providerImpact.scheduledAlerts>0&&<p role="alert">연결 후보가 바뀌는 처리 중 알림 {providerImpact.scheduledAlerts.toLocaleString("ko-KR")}건이 있습니다. 처리 후 다시 확인하세요.</p>}
      <footer><button onClick={()=>setProviderImpact(null)}>취소</button><button className="money-primary" disabled={!!busy||providerImpact.collision||providerImpact.scheduledAlerts>0} onClick={saveProvider}>금융기관 변경</button></footer>
    </MoneyDialog>}
  </MoneyPanel>;
}

export function ReconciliationPanel(p:EditorProps & {account:Account}) {
  const result=useMoneyData<Reconciliation[]>("/reconciliation");
  const row=result.data?.find(r=>r.accountId===p.account.id);
  const investigation=p.selection.kind==="reconciliation"?p.selection.investigation:undefined;
  const [adjust,setAdjust]=useState<{row:Reconciliation;account:Account;investigation?:ReconciliationInvestigation}|null>(null),[error,setError]=useState("");
  const [investigated,setInvestigated]=useState(false),[loading,setLoading]=useState(false);
  const cache=useMoneyCache();
  const transactions=useMoneyData<{items:Transaction[]}>(row?.observedAt?`/transactions?accountId=${p.account.id}&from=${seoul(row.observedAt).slice(0,10)}&to=${seoul(row.observedAt).slice(0,10)}&limit=20`:null);
  async function prepare(){setLoading(true);setError("");try{const [rows,accounts]=await Promise.all([api.get<Reconciliation[]>("/reconciliation"),api.get<Account[]>("/accounts")]);const latest=rows.find(r=>r.accountId===p.account.id),account=accounts.find(a=>a.id===p.account.id);if(!latest||latest.status!=="MISMATCH"||!account||account.archived)throw new Error("최신 상태에는 적용할 차이가 없습니다. 최신 근거를 확인하세요.");setAdjust({row:latest,account,investigation});}catch(e){setError(e instanceof Error?e.message:"근거 조회 실패");cache.invalidate();}finally{setLoading(false);}}
  return <MoneyPanel title="차이 조사" onClose={p.onClose} trackDirty={false}><h3>{p.account.displayName}</h3>{investigation&&<section className="money-card"><h4>선택한 조사 기준</h4><p>조회 기준 {seoul(investigation.cutoff).replace("T"," ")} · 기준점 {investigation.anchorAt?seoul(investigation.anchorAt).replace("T"," "):"없음"}</p><p>등록 거래 잔액 {moneyAmount(investigation.registeredBalance)} · 관측 잔액 {moneyAmount(investigation.observedBalance)}</p><p className="money-muted">선택한 조사 근거와 아래 최신 알림 근거를 적용 직전에 함께 검증합니다. 근거가 바뀌면 초안을 유지하고 다시 조사합니다.</p></section>}<LoadState error={result.error} loading={result.loading}/>{row&&<><strong className="money-recon-difference">{moneyAmount(row.difference)}</strong><p className="money-muted">관측 잔액 − 같은 시각 장부 잔액</p><dl className="money-evidence-details"><dt>관측 근거</dt><dd>{row.observedSource==="NOTIFICATION"?"은행 알림":row.observedSource==="MANUAL"?"수동 기준점":"관측 없음"} · {row.observedAt?seoul(row.observedAt).replace("T"," "):"—"}</dd><dt>관측 잔액</dt><dd>{moneyAmount(row.observedBalance)}</dd><dt>계산 기준</dt><dd>{row.basis==="MANUAL"?"수동 기준점":row.basis==="FIRST_NOTIFICATION"?"첫 알림 기준":"근거 부족"} · {row.basisAt?seoul(row.basisAt).replace("T"," "):"—"}</dd><dt>같은 시각 장부</dt><dd>{moneyAmount(row.ledgerBalance)}</dd><dt>현재 장부 잔액</dt><dd>{moneyAmount(row.current.amount)} · {row.current.asOf?seoul(row.current.asOf).replace("T"," "):"기준 시각 없음"}</dd></dl><p className="money-recon-status" data-status={row.status}>{reconciliationStatus[row.status]}</p>
    <h3>조사 순서</h3>{["누락 거래 / 금융 확인 필요","잘못 연결된 계좌","중복 알림 / 이체 양쪽","시각 차이 / 취소·환불"].map(label=><label className="money-check" key={label}><input type="checkbox"/>{label}</label>)}
    <button onClick={()=>p.navigate?.("/money/review")}>누락 금융 확인으로 이동</button><h3>해당 시각의 거래</h3><LoadState error={transactions.error} loading={transactions.loading}/>{transactions.data?.items.map(t=><button className="money-evidence-transaction" key={t.id} onClick={()=>p.select({kind:"transaction",value:t})}><span>{t.title??t.counterpartyText??t.type}</span><strong>{moneyAmount(t.amount,t.currency)}</strong><small>{seoul(t.occurredAt).replace("T"," ")}</small></button>)}{transactions.data&&!transactions.data.items.length&&<p>그 날짜의 거래 없음</p>}
    <p className="money-financial-notice">누락 거래가 확인되면 해당 거래를 먼저 수정하세요. 잔액 조정은 원인 조사를 대신하지 않습니다.</p><label className="money-check"><input type="checkbox" checked={investigated} onChange={e=>setInvestigated(e.target.checked)}/>조사 후에도 차이가 남아 수동 기준점 적용을 검토합니다.</label>
    {row.status==="MISMATCH"&&!p.account.archived&&<button className="money-primary" disabled={!investigated||loading} onClick={()=>void prepare()}>{loading?"최신 근거 확인 중…":"잔액 조정 검토"}</button>}
    {!p.account.archived&&<details><summary>초기 잔액 · 수동 기준점 정정</summary><OpeningBalance account={p.account} select={p.select} run={async fn=>{await fn();p.onSaved();}}/><button onClick={()=>p.select({kind:"account",value:p.account,action:"BALANCE_ADJUSTMENT"})}>별도 수동 잔액 조정</button><p className="money-muted">절대 기준점과 감사 기록을 저장하며 통계에서 제외됩니다.</p></details>}
    </>}{error&&<p role="alert">{error}</p>}{adjust&&<ReconciliationAdjustment initial={adjust} onClose={()=>setAdjust(null)} onSaved={p.onSaved}/>}</MoneyPanel>;
}
function ReconciliationAdjustment({initial,onClose,onSaved}:{initial:{row:Reconciliation;account:Account;investigation?:ReconciliationInvestigation};onClose:()=>void;onSaved:()=>void}) {
  const [note,setNote]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[locked,setLocked]=useState(false);
  const cache=useMoneyCache(),r=initial.row;
  async function apply(){if(busy||locked)return;setBusy(true);try{
    const [rows,accounts]=await Promise.all([api.get<Reconciliation[]>("/reconciliation"),api.get<Account[]>("/accounts")]);const latest=rows.find(v=>v.accountId===r.accountId),account=accounts.find(a=>a.id===r.accountId);
    if(!latest||!account||account.archived||latest.status!=="MISMATCH"||account.version!==initial.account.version||latest.observedAt!==r.observedAt||latest.observedBalance!==r.observedBalance||latest.ledgerBalance!==r.ledgerBalance){setLocked(true);throw new Error("최신 관측·장부·버전이 변경되었습니다. 사유 초안은 유지했습니다. 닫고 최신 근거로 다시 조사하세요.");}
    await api.post(`/accounts/${r.accountId}/reconcile`,{observedAt:r.observedAt,observedBalance:r.observedBalance,expectedLedgerBalance:r.ledgerBalance,note,expectedVersion:account.version,investigation:initial.investigation});cache.invalidate();onSaved();
  }catch(e){setLocked(true);const latest=await api.get<Reconciliation[]>("/reconciliation").catch(()=>null);cache.invalidate();setError((e instanceof Error?e.message:"저장 응답을 확인하지 못했습니다.")+" · "+(latest?.find(v=>v.accountId===r.accountId)?.status==="ANCHORED"?"현재 서버는 수동 기준점 상태입니다. 이력에서 결과를 확인하세요.":"서버 상태를 다시 조회했습니다. 동일 조정을 자동 반복하지 않습니다."));}finally{setBusy(false);}}
  return <MoneyDialog title="잔액 조정 확인" onClose={()=>{if(!busy)onClose();}}><p>{initial.account.displayName} · {r.observedAt?seoul(r.observedAt).replace("T"," "):"—"} · 알림 관측</p><div className="money-adjustment-values"><div><small>같은 시각 장부</small><strong>{moneyAmount(r.ledgerBalance)}</strong></div><div><small>새 수동 기준점</small><strong>{moneyAmount(r.observedBalance)}</strong></div></div><p>조정 금액 <strong>{moneyAmount(r.difference)}</strong> · 잔액 조정</p><label className="money-field"><span>사유 · 필수</span><textarea maxLength={500} required value={note} onChange={e=>setNote(e.target.value)}/></label><p className="money-financial-notice">수입·소비·저축 통계에서 제외됩니다. 완료 후 상태는 수동 기준점이며 은행 일치로 확정하지 않습니다.</p>{error&&<p role="alert">{error}</p>}<footer><button disabled={busy} onClick={onClose}>취소</button><button className="money-primary" disabled={busy||locked||!note.trim()} onClick={()=>void apply()}>{busy?"적용 중…":"수동 기준점 적용"}</button></footer></MoneyDialog>;
}
