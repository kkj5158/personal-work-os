'use client';
import {useState} from 'react';
import {attentionApi,type ManagedProposal,type ManagedGrant} from '@/lib/api/attention';

export default function ManagedConsent({onAccepted}:{onAccepted:()=>void}) {
  const [proposal,setProposal]=useState<ManagedProposal|null>(null);
  const [grant,setGrant]=useState<ManagedGrant|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function read(file?:File) {
    setError('');
    setProposal(null);
    setGrant(null);
    if (!file) return;
    try {
      if (file.size>8192) throw Error();
      const value=JSON.parse(await file.text());
      if (value?.schemaVersion!=='work-content.v1' ||
          !['DEV','PROD'].includes(value.environment) || !['read-only','workspace-write'].includes(value.sandboxMode) ||
          typeof value.title!=='string' || !value.title.trim() || value.title.length>100 ||
          typeof value.request!=='string' || !value.request.trim() || value.request.length>1200 ||
          !/^[a-f0-9-]{36}$/.test(value.logicalTaskId) || !/^[a-f0-9-]{36}$/.test(value.runId) ||
          !/^[A-Za-z0-9_-]{59}$/.test(value.publicKey)) throw Error();
      setProposal(value);
    } catch {setError('실행기가 생성한 신청 JSON 파일을 선택해 주세요.');}
  }

  async function accept() {
    if (!proposal || busy) return;
    setBusy(true);
    setError('');
    try {
      setGrant(await attentionApi.reserveManaged(proposal));
      onAccepted();
    } catch {setError('승인하지 못했습니다. 로그인과 실행 환경을 확인한 후 같은 파일로 다시 시도해 주세요.');}
    finally {setBusy(false);}
  }

  function save() {
    if (!grant) return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(grant)],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;
    link.download='wq-'+grant.logicalTaskId+'-receipt.json';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  return <details className="aq-managed-consent">
    <summary>관리형 Codex 작업 승인</summary>
    <p>실행기에서 생성한 신청 파일을 열고 제목, 요청, 환경을 확인하세요. 이 실행의 보고서가 현재 계정의 작업 카드에 저장됩니다.</p>
    <label>실행 신청 파일 <input type="file" accept=".json,application/json" disabled={busy} onChange={e=>void read(e.currentTarget.files?.[0])}/></label>
    {proposal&&<dl><dt>환경</dt><dd>{proposal.environment}</dd><dt>파일 권한</dt><dd>{proposal.sandboxMode==='read-only'?'읽기 전용':'작업 폴더 수정 허용'}</dd><dt>작업</dt><dd>{proposal.title}</dd><dt>요청</dt><dd>{proposal.request}</dd></dl>}
    {proposal&&!grant&&<button disabled={busy} onClick={()=>void accept()}>이 실행의 보고서 수집 승인</button>}
    {grant&&<div role="status"><p>작업 카드가 생성되었습니다. 영수증을 저장해 실행기에 전달하세요.</p><button onClick={save}>승인 영수증 저장</button></div>}
    {error&&<p role="alert">{error}</p>}
  </details>;
}

