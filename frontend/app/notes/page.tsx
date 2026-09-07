import { Suspense } from "react";
import { NoteSystem } from "./NoteSystem";
import "./notes.css";
export default function Page() {
  return (
    <Suspense fallback={<p>Note System 불러오는 중…</p>}>
      <NoteSystem />
    </Suspense>
  );
}
