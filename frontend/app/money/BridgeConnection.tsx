"use client";
import { useEffect, useState } from "react";
import { moneyApi as api } from "@/lib/money/model";
import { Button } from "@/components/ui/Button";

type Device = { id: string; installId: string; expiresAt: string; revokedAt: string | null; lastReceivedAt: string | null; lastStatus: string | null; acceptedCount: number; duplicateCount: number; rejectedCount: number };
export default function BridgeConnection() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [code, setCode] = useState<{code: string; expiresAt: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState(0);
  async function reload() { setDevices(await api.get<Device[]>("/bridge/devices")); setCheckedAt(Date.now()); }
  useEffect(() => { let active = true; api.get<Device[]>("/bridge/devices").then(d => { if (active) { setDevices(d); setCheckedAt(Date.now()); } }).catch(() => { if (active) setError("Bridge 상태를 불러올 수 없습니다."); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!code) return;
    const timer = setTimeout(() => setCode(null), Math.max(0, Date.parse(code.expiresAt) - Date.now()));
    const hide = () => { if (document.hidden) setCode(null); };
    document.addEventListener("visibilitychange", hide);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", hide); };
  }, [code]);
  async function action(fn: () => Promise<void>) { setBusy(true); setError(""); try { await fn(); } catch { setError("Bridge 요청이 실패했습니다. 연결을 확인해 주세요."); } finally { setBusy(false); } }
  return <section aria-label="Android Bridge">
    <h3>Android MONEY Bridge</h3>
    <p>로그인한 계정에 휴대폰을 연결합니다. 등록 코드는 5분 동안 한 번만 사용할 수 있으며 알림 전송 권한만 발급합니다. 휴대폰의 DEV / PROD 환경을 먼저 확인하세요.</p>
    <Button disabled={busy} onClick={() => void action(async () => setCode(await api.post("/bridge/enrollments", {})))}>휴대폰 등록 코드 발급</Button>
    <Button disabled={busy} onClick={() => void action(reload)}>상태 새로고침</Button>
    {code && <div><p>휴대폰 Bridge에 아래 코드를 입력하세요. 공유하거나 촬영하지 마세요.</p><input aria-label="일회용 등록 코드" readOnly value={code.code} autoComplete="off" /><Button onClick={() => setCode(null)}>코드 숨기기</Button></div>}
    {error && <p role="alert">{error}</p>}
    {!devices.length && <p>등록된 Bridge가 없습니다.</p>}
    {devices.map(d => <div key={d.id}>
      <p>설치 {d.installId.slice(0,8)} · {d.revokedAt ? "해제됨" : Date.parse(d.expiresAt) <= checkedAt ? "만료됨" : "등록됨"} · 만료 {new Date(d.expiresAt).toLocaleString()}</p>
      <p>최근 수신 {d.lastReceivedAt ? new Date(d.lastReceivedAt).toLocaleString() : "없음"} · {d.lastStatus ?? "대기"} · 신규 {d.acceptedCount} / 재전송 확인 {d.duplicateCount} / 거절 {d.rejectedCount}</p>
      {!d.revokedAt && <Button disabled={busy} onClick={() => { if (window.confirm("이 Bridge의 전송 권한을 즉시 해제할까요?")) void action(async () => { await api.delete("/bridge/devices/" + d.id); await reload(); }); }}>연결 해제</Button>}
    </div>)}
    <p>인증은 30일 후 만료됩니다. 같은 휴대폰에서 새 코드로 다시 등록하면 기존 인증이 교체됩니다. 대기 중인 알림은 원래 계정과 환경에만 전송됩니다.</p>
  </section>;
}
