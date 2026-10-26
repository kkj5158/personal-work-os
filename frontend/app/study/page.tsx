import { Suspense } from "react";
import StudyApp from "./StudyApp";
export default function Page() { return <Suspense fallback={<p>학습 화면을 불러오는 중…</p>}><StudyApp /></Suspense>; }
