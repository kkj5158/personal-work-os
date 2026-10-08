import { Suspense } from "react";
import SleepWorkspace from "./SleepWorkspace";
export default function Page(){return <Suspense fallback={<p>수면 화면을 불러오는 중…</p>}><SleepWorkspace/></Suspense>;}
