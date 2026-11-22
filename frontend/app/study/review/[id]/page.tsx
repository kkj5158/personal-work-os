"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import {apiClient} from "@/lib/api/client";
import type {EngineJob} from "@/lib/study/engine";
import {CampaignPreview} from "../../CampaignPreview";

export default function OwnerDraftReview(){
  const {id}=useParams<{id:string}>();
  const [campaign,setCampaign]=useState<EngineJob["campaign"]>();
  const [error,setError]=useState(false);
  useEffect(()=>{
    let live=true;
    setCampaign(undefined);setError(false);
    apiClient.get<NonNullable<EngineJob["campaign"]>>("/api/study/engine/jobs/"+encodeURIComponent(id)+"/draft")
      .then(value=>{if(live)setCampaign(value);}).catch(()=>{if(live)setError(true);});
    return ()=>{live=false;};
  },[id]);
  return <main className="study-panel"><a href="/study?tab=workbooks">STUDY 문제집</a>
    {campaign?<CampaignPreview job={{id,campaign}} standalone/>:<p role="status">{error?"소유자 권한으로 초안을 열 수 없습니다.":"초안을 불러오는 중입니다."}</p>}
  </main>;
}
