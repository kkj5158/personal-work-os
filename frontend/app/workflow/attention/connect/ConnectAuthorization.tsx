"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type PairingRequest = { challenge: string | null; state: string | null; redirectUri: string | null; installId: string | null; deviceName: string };
type Owner = { id: string; label: string };
type Props = { request: PairingRequest; authClient?: ReturnType<typeof createSupabaseBrowserClient>; redirect?: (url: string) => void };

export default function ConnectAuthorization({ request, authClient, redirect = url => window.location.replace(url) }: Props) {
  const [client] = useState(() => authClient === undefined ? createSupabaseBrowserClient() : authClient);
  const [owner, setOwner] = useState<Owner | null | undefined>(undefined);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), pending = useRef(false), mounted = useRef(false), currentOwner = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    mounted.current = true; currentOwner.current = undefined;
    const cancel = () => { generation.current++; pending.current = false; };
    const invalidate = () => { cancel(); setBusy(false); };
    const changed = (next: Owner | null) => {
      if (!active) return;
      if (currentOwner.current !== next?.id) {
        if (currentOwner.current !== undefined) setError("계정이 변경되었습니다. 연결할 계정을 확인하고 다시 시작해 주세요.");
        invalidate(); currentOwner.current = next?.id ?? null;
      }
      setOwner(next);
    };
    const subscription = client?.auth.onAuthStateChange((_event, session) => changed(session ? { id: session.user.id, label: session.user.email ?? session.user.id } : null)).data.subscription;
    if (!client) changed({ id: "local-dev", label: "로컬 개발 계정" });
    const hidden = () => { if (document.hidden) { invalidate(); setError("연결 화면을 벗어났습니다. 계정을 확인하고 다시 시작해 주세요."); } };
    document.addEventListener("visibilitychange", hidden);
    return () => { active = false; mounted.current = false; cancel(); subscription?.unsubscribe(); document.removeEventListener("visibilitychange", hidden); };
  }, [client]);
  let valid = false;
  try {
    const uri = new URL(request.redirectUri ?? "");
    valid = /^[A-Za-z0-9_-]{43}$/.test(request.challenge ?? "") && /^[A-Za-z0-9_-]{32,128}$/.test(request.state ?? "") && /^[0-9a-f-]{36}$/i.test(request.installId ?? "") && uri.protocol === "http:" && uri.hostname === "127.0.0.1" && Number(uri.port) >= 1024 && Number(uri.port) <= 65535 && uri.pathname === "/callback" && !uri.search && !uri.hash && !uri.username && !uri.password;
  } catch { /* malformed authorization links never become a redirect */ }
  async function authorize() {
    if (pending.current || !valid || !mounted.current || !owner || owner.id !== currentOwner.current || document.hidden) return;
    const epoch = generation.current, ownerId = owner.id;
    const current = () => mounted.current && epoch === generation.current && ownerId === currentOwner.current && !document.hidden;
    const stillOwner = async () => {
      if (!current()) return false;
      if (!client) return true;
      const { data, error } = await client.auth.getSession();
      return !error && data.session?.user.id === ownerId && current();
    };
    pending.current = true; setBusy(true); setError("");
    try {
      if (!await stillOwner()) { if (current()) setError("계정을 다시 확인한 뒤 WORK QUEUE에서 연결을 시작해 주세요."); return; }
      const response = await apiClient.post<{ code: string; state: string; redirectUri: string }>("/api/workflow/attention/device-authorizations", request);
      if (!await stillOwner()) { if (current()) setError("계정을 다시 확인한 뒤 WORK QUEUE에서 연결을 시작해 주세요."); return; }
      if (response.redirectUri !== request.redirectUri || response.state !== request.state) throw new Error("INVALID_AUTHORIZATION_RESPONSE");
      // A one-time code crosses the loopback URL; the device bearer is exchanged and stored only by native code.
      const callback = new URL(response.redirectUri);
      callback.searchParams.set("code", response.code); callback.searchParams.set("state", response.state);
      redirect(callback.toString());
    } catch { if (current()) setError("연결하지 못했습니다. WORK QUEUE에서 다시 연결을 시작해 주세요."); }
    finally { if (current()) { pending.current = false; setBusy(false); } }
  }
  return <main style={{ maxWidth: 480, padding: 24, margin: "40px auto" }}><h1 style={{ fontSize: 20, fontWeight: 600 }}>WORK QUEUE 연결</h1><p style={{ margin: "16px 0" }}>아래 POS 계정의 확인할 항목을 이 Windows 앱과 연결합니다. 작업과 프로젝트의 완료 상태는 바뀌지 않습니다.</p><p aria-label="연결할 POS 계정">{owner === undefined ? "계정 확인 중…" : owner ? `연결 계정: ${owner.label}` : "POS에 로그인한 뒤 다시 시작해 주세요."}</p>{valid ? <button type="button" disabled={busy || !owner} onClick={() => void authorize()} style={{ padding: "8px 16px", background: "#2563eb", color: "white", borderRadius: 4 }}>{busy ? "연결 중…" : "이 기기 연결"}</button> : <p role="alert">유효한 연결 요청이 아닙니다. WORK QUEUE에서 다시 시작해 주세요.</p>}{error && <p role="alert" style={{ marginTop: 12 }}>{error}</p>}</main>;
}
