"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ConnectAuthorization from "./ConnectAuthorization";

function Connect() {
  const query = useSearchParams();
  const request = { challenge: query.get("challenge"), state: query.get("state"), redirectUri: query.get("redirect_uri"), installId: query.get("install_id"), deviceName: "WORK QUEUE Windows" };
  return <ConnectAuthorization key={JSON.stringify(request)} request={request}/>;
}
export default function ConnectPage() { return <Suspense fallback={<p>연결 요청 확인 중…</p>}><Connect /></Suspense>; }
