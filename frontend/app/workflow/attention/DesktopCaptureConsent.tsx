'use client';

import {useEffect, useState} from 'react';
import {apiClient} from '@/lib/api/client';
import type {AttentionDevice} from '@/lib/api/attention';

const base = '/api/workflow/attention/desktop-content/consents';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Scope = {scopeId:string;credentialId:string;createdAt:string};

function parseCode(raw:string, devices:AttentionDevice[]) {
  const code:unknown = JSON.parse(raw);
  if (typeof code !== 'object' || code === null || Array.isArray(code)) throw Error();
  const {scopeId, credentialId, environment} = code as Record<string,unknown>;
  if (typeof scopeId !== 'string' || !uuid.test(scopeId) || typeof credentialId !== 'string'
    || !uuid.test(credentialId) || (environment !== 'DEV' && environment !== 'PROD')
    || !devices.some(device => device.id === credentialId && device.kind === 'DEVICE' && !device.revokedAt)) throw Error();
  return {scopeId, credentialId};
}

export function DesktopCaptureConsent({devices}: {devices:AttentionDevice[]}) {
  const [scopes,setScopes] = useState<Scope[] | null>(null);
  const [code,setCode] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  useEffect(() => {
    let current = true;
    apiClient.get<Scope[]>(base).then(value => {if (current) setScopes(value);}).catch(() => {});
    return () => {current = false;};
  },[]);
  if (scopes === null) return null;

  async function change(scope?:Scope) {
    setBusy(true);
    setMessage('');
    try {
      if (scope) await apiClient.delete<void>(base+'/'+encodeURIComponent(scope.scopeId));
      else {
        await apiClient.post<void>(base,parseCode(code,devices));
        setCode('');
      }
      setScopes(await apiClient.get<Scope[]>(base));
      setMessage(scope ? '해당 범위의 새 보고서 전송을 차단했습니다.' : 'Windows 수집기에서 이 범위를 활성화할 수 있습니다.');
    } catch {
      setMessage(scope ? '연결을 해제하지 못했습니다.' : '이 환경에 연결된 Windows 기기의 범위 코드를 확인하세요.');
    } finally {
      setBusy(false);
    }
  }

  return <details aria-label="Codex Desktop 자동 기록">
    <summary>Codex Desktop 자동 기록</summary>
    <p>승인한 로컬 폴더의 일반 Desktop 턴에서 요청 일부, 최종 답변의 수행·결과·근거·남은 일과 훅 이벤트만 기록합니다. 전체 대화, 파일 경로, 도구 입력·출력은 보내지 않습니다. 보고한 근거는 독립 검증과 구분합니다.</p>
    <label>Windows 수집기 범위 코드
      <textarea value={code} onChange={event => setCode(event.target.value)} rows={3} maxLength={500}/>
    </label>
    <button type="button" disabled={busy || code.trim().length === 0} onClick={() => void change()}>이 범위 승인</button>
    {scopes.length > 0 && <ul>{scopes.map(scope => <li key={scope.scopeId}>
      <span>{devices.find(device => device.id === scope.credentialId)?.name ?? 'Windows'} · {scope.scopeId.slice(0,8)}</span>
      <button type="button" disabled={busy} onClick={() => void change(scope)}>이 범위 해제</button>
    </li>)}</ul>}
    {message && <p role="status">{message}</p>}
  </details>;
}
