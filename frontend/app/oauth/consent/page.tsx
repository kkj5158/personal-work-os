"use client";

import {Suspense,useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";

type Details={client:{id:string;name?:string};scope:string;redirect_uri:string};
const expectedOrigin=process.env.NEXT_PUBLIC_ORBIT_MCP_ORIGIN;
const expectedClient=process.env.NEXT_PUBLIC_ORBIT_OAUTH_CLIENT_ID;
function safeCallback(value:string):boolean{
  try{const url=new URL(value);return url.protocol==="https:"&&url.origin===expectedOrigin&&url.pathname==="/interaction/upstream"&&!url.username&&!url.password&&!url.hash;}catch{return false;}
}
function Consent(){
  const search=useSearchParams(),authorizationId=search.get("authorization_id");
  const [details,setDetails]=useState<Details|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    async function load(){
      const supabase=createSupabaseBrowserClient();
      if(!supabase||!authorizationId||authorizationId.length>256||!expectedOrigin||!expectedClient){setError("연결 요청을 확인할 수 없습니다. ORBIT 연결 화면에서 다시 시작하세요.");return;}
      try{
        const {data,error:authError}=await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if(!active)return;
        if(authError||!data)throw Error("unavailable");
        if("redirect_url" in data){if(!safeCallback(data.redirect_url))throw Error("redirect");window.location.assign(data.redirect_url);return;}
        if(data.client.id!==expectedClient||!safeCallback(data.redirect_uri)||data.scope!=="openid")throw Error("client");
        setDetails({client:data.client,scope:data.scope,redirect_uri:data.redirect_uri});
      }catch{if(active)setError("인증 요청이 만료되었거나 허용된 ORBIT 연결이 아닙니다.");}
    }
    void load();return()=>{active=false;};
  },[authorizationId]);
  async function decide(allow:boolean){
    const supabase=createSupabaseBrowserClient();if(!supabase||!authorizationId||!details||busy)return;
    setBusy(true);setError("");
    try{
      const result=allow?await supabase.auth.oauth.approveAuthorization(authorizationId,{skipBrowserRedirect:true}):await supabase.auth.oauth.denyAuthorization(authorizationId,{skipBrowserRedirect:true});
      if(result.error||!result.data||!safeCallback(result.data.redirect_url))throw Error("unavailable");
      window.location.assign(result.data.redirect_url);
    }catch{setError("연결을 처리하지 못했습니다. 다시 시도하세요.");setBusy(false);}
  }
  return <main className="mx-auto max-w-lg space-y-5 p-8">
    <h1 className="text-xl font-semibold">ORBIT POS 계정 연결</h1>
    <p>현재 로그인한 POS 계정으로 ORBIT 서버에 본인임을 확인합니다.</p>
    {details&&<><p>앱: {details.client.name||"ORBIT POS"}</p><p>다음 화면에서 연결할 앱과 개인 기록 읽기 권한을 확인하고 최종 승인합니다. POS 비밀번호는 ORBIT나 ChatGPT에 전달되지 않습니다.</p><div className="flex gap-3"><button className="rounded border px-4 py-2" disabled={busy} onClick={()=>void decide(true)}>이 계정으로 계속</button><button className="rounded border px-4 py-2" disabled={busy} onClick={()=>void decide(false)}>취소</button></div></>}
    {!details&&!error&&<p>인증 요청을 확인하고 있습니다.</p>}
    {error&&<p role="alert">{error}</p>}
  </main>;
}
export default function OAuthConsentPage(){return <Suspense fallback={<p>인증 요청을 확인하고 있습니다.</p>}><Consent/></Suspense>;}
