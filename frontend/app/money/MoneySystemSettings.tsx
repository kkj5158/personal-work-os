"use client";
import { useState } from "react";
import BridgeConnection from "./BridgeConnection";
import { useMoneyData, LoadState } from "./MoneyWebData";
import { seoul } from "@/lib/money/model";
export function SystemSettings(){
 const status=useMoneyData<{server:string;lastReceivedAt:string|null;pending:number;reviewCount:number}>("/connection-status");const [exported,setExported]=useState(false);
 return <div className="meaning-settings"><section className="money-card"><div className="money-section-heading"><h2>MONEY Bridge</h2><span className="meaning-status">Android 알림 → 인증된 HTTPS 수신</span></div><BridgeConnection/></section>
 <section className="money-card"><h2>알림 수집 설정</h2><p>은행 로그인 연결이 아닙니다. 휴대폰에서 알림 접근을 허용하고 선택한 앱의 Push 알림만 전달합니다.</p><div className="meaning-bank-grid">{["신한은행","IBK기업은행","우리은행","카카오뱅크"].map(bank=><div key={bank}><strong>{bank}</strong><small>선택 여부는 휴대폰 Bridge에서 확인</small></div>)}</div><dl className="meaning-setting-list"><div><dt>Bridge 켜기 / 끄기</dt><dd>휴대폰 앱에서 제어</dd></div><div><dt>알림 접근 권한</dt><dd>Android 설정에서 확인</dd></div><div><dt>허용 앱</dt><dd>휴대폰의 명시적 선택 목록</dd></div><div><dt>서버에서 수집 설정 변경</dt><dd>현재 지원하지 않음</dd></div></dl></section>
 <section className="money-card"><h2>처리 상태</h2><LoadState error={status.error} loading={status.loading}/>{status.data&&<dl className="meaning-setting-list"><div><dt>서버</dt><dd>{status.data.server==="CONNECTED"?"연결됨":status.data.server}</dd></div><div><dt>최근 알림 수신</dt><dd>{status.data.lastReceivedAt?seoul(status.data.lastReceivedAt):"수신 기록 없음"}</dd></div><div><dt>처리 대기</dt><dd>{status.data.pending}건</dd></div><div><dt>검토 대상</dt><dd>{status.data.reviewCount}건 · 상세는 Review Required</dd></div></dl>}<p className="money-muted">최근 수신 시각은 실시간 온라인 상태를 보증하지 않습니다. 잔액 불일치는 검토 작업대의 별도 진단에서 확인하세요.</p></section>
 <section className="money-card"><h2>진단 / 데이터 관리</h2><p>원본 금융 데이터나 인증정보 없이 서버 상태와 처리 건수만 내보냅니다.</p><button disabled={!status.data} onClick={()=>{if(!status.data)return;const blob=new Blob([JSON.stringify({generatedAt:new Date().toISOString(),scope:"MONEY_STATUS_ONLY",...status.data},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="money-status-diagnostic.json";a.click();URL.revokeObjectURL(url);setExported(true);}}>상태 진단 요약 다운로드</button>{exported&&<p role="status">진단 요약을 다운로드했습니다.</p>}<p className="money-muted">전체 백업 / 복원 / 금융 기록 초기화는 이 화면에서 제공하지 않습니다. 연결 해제는 위 Bridge 기기별 확인 절차를 사용하세요.</p></section>
 </div>;
}
