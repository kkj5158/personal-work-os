"use client";
import { Suspense } from "react";
import { NoteSystem, type NoteSystemProps } from "../notes/NoteSystem";
import "../notes/notes.css";

/** Canonical NOTE workspace; the DIET host supplies its sidebar and leave guard. */
export default function NoteSurface({ workspaceId, registerFlush }: {
  workspaceId: string;
  registerFlush?: NoteSystemProps["registerFlush"];
}) {
  return <Suspense fallback={<p>다이어트 노트 불러오는 중…</p>}>
    <NoteSystem embedded workspaceId={workspaceId} registerFlush={registerFlush}/>
  </Suspense>;
}
