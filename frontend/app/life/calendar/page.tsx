import { Suspense } from "react";
import SleepWorkspace from "../sleep/SleepWorkspace";
export default function Page(){return <Suspense fallback={<p>통합 캘린더를 불러오는 중…</p>}><SleepWorkspace/></Suspense>;}
