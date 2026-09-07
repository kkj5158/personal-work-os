"use client";
import { useState } from "react";
import { ReflectionCard } from "../ReflectionCard";
import { reflectionFixture } from "./reflectionFixture";
import type { DisplayMode } from "@/lib/notes/reflection";
export function Fixture() {
  const [entry, setEntry] = useState(reflectionFixture);
  const [mode, setMode] = useState<DisplayMode>("COMPARE");
  const [linked, setLinked] = useState(true);
  return (
    <div className="note-system">
      <main
        style={{ maxWidth: 1000, width: "100%", margin: "auto", padding: 30 }}
      >
        <p>DEV fixture · 실제 사용자 데이터가 아닙니다</p>
        <h1>2026년 9월 6일 · Reflection</h1>
        {linked ? (
          <ReflectionCard
            entry={entry}
            mode={mode}
            onMode={setMode}
            onText={async (content) =>
              setEntry({ ...entry, content, version: entry.version + 1 })
            }
            onUnlink={() => setLinked(false)}
          />
        ) : (
          <button onClick={() => setLinked(true)}>
            기존 Reflection 다시 연결
          </button>
        )}
      </main>
    </div>
  );
}
