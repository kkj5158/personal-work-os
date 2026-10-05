"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api/client";

function Connect() {
  const query = useSearchParams();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const request = { challenge: query.get("challenge"), state: query.get("state"), redirectUri: query.get("redirect_uri"), installId: query.get("install_id"), deviceName: "WORK QUEUE Windows" };
  let valid = false;
  try {
    const uri = new URL(request.redirectUri ?? "");
    valid = /^[A-Za-z0-9_-]{43}$/.test(request.challenge ?? "") && /^[A-Za-z0-9_-]{32,128}$/.test(request.state ?? "") && /^[0-9a-f-]{36}$/i.test(request.installId ?? "") && uri.protocol === "http:" && uri.hostname === "127.0.0.1" && Number(uri.port) >= 1024 && Number(uri.port) <= 65535 && uri.pathname === "/callback" && !uri.search && !uri.hash && !uri.username && !uri.password;
  } catch { /* malformed authorization links never become a redirect */ }
  async function authorize() {
    if (busy || !valid) return;
    setBusy(true); setError("");
    try {
      const response = await apiClient.post<{ code: string; state: string; redirectUri: string }>("/api/workflow/attention/device-authorizations", request);
      // Only a short-lived one-time code crosses the loopback URL. Device bearer is delivered to native code by the exchange API.
      if (response.redirectUri !== request.redirectUri || response.state !== request.state) throw new Error("연결 요청이 변경되었습니다.");
      const callback = new URL(response.redirectUri);
      callback.searchParams.set("code", response.code); callback.searchParams.set("state", response.state);
      window.location.replace(callback.toString());
    } catch { setError("연결하지 못했습니다. WORK QUEUE에서 다시 연결을 시작해 주세요."); setBusy(false); }
  }
  return <main style={{ maxWidth: 480, padding: 24, margin: "40px auto" }}><h1 style={{ fontSize: 20, fontWeight: 600 }}>WORK QUEUE 연결</h1><p style={{ margin: "16px 0" }}>현재 로그인한 POS 계정의 확인할 항목을 이 Windows 앱과 연결합니다. 작업과 프로젝트의 완료 상태는 바뀌지 않습니다.</p>{valid ? <button type="button" disabled={busy} onClick={() => void authorize()} style={{ padding: "8px 16px", background: "#2563eb", color: "white", borderRadius: 4 }}>{busy ? "연결 중…" : "이 기기 연결"}</button> : <p role="alert">유효한 연결 요청이 아닙니다. WORK QUEUE에서 다시 시작해 주세요.</p>}{error && <p role="alert" style={{ marginTop: 12 }}>{error}</p>}</main>;
}
export default function ConnectPage() { return <Suspense fallback={<p>연결 요청 확인 중…</p>}><Connect /></Suspense>; }
