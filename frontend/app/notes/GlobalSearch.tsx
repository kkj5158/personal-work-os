"use client";
import { useEffect, useRef, useState } from "react";
import { notesApi } from "@/lib/api/notes";
import type { SearchResult } from "@/lib/notes/types";
import { useNoteEnvironment } from "./NoteContext";
export function GlobalSearch({
  close,
  open,
  selectTag,
}: {
  close: () => void;
  open: (id: string) => void;
  selectTag: (id: string) => void;
}) {
  const env = useNoteEnvironment();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    let gone = false;
    const timer = setTimeout(() => {
      notesApi
        .search(env.workspace, query, env.settings.searchLimit)
        .then((rows) => {
          if (!gone) {
            setResults(rows);
            setActive(0);
          }
        })
        .catch(env.error);
    }, 160);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [env.workspace, query, env.settings.searchLimit]);
  function choose(r: SearchResult) {
    close();
    if (r.type === "TAG") selectTag(r.id);
    else open(r.id);
  }
  return (
    <div
      className="note-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Workspace 전체 검색"
        className="note-dialog global-search"
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) =>
              results.length
                ? (i + (e.key === "ArrowDown" ? 1 : -1) + results.length) %
                  results.length
                : 0,
            );
          }
          if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            choose(results[active]);
          }
        }}
      >
        <header>
          <input
            ref={input}
            aria-label="Workspace 검색어"
            placeholder="제목, 별칭, 본문, 태그, 날짜 검색…"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (!(e.nativeEvent as InputEvent).isComposing)
                setQuery(e.target.value);
            }}
            onCompositionEnd={(e) => setQuery(e.currentTarget.value)}
          />
          <button aria-label="검색 닫기" onClick={close}>
            ×
          </button>
        </header>
        <div className="note-tabs">
          <span>모든 결과 ({results.length})</span>
        </div>
        <div role="listbox" aria-label="검색 결과">
          {results.map((r, i) => (
            <button
              role="option"
              aria-selected={active === i}
              className={`search-result ${i === active ? "selected" : ""}`}
              key={`${r.type}-${r.id}`}
              onClick={() => choose(r)}
            >
              <span>
                {r.type === "TAG" ? "◇" : r.type === "DAILY" ? "▦" : "▤"}
              </span>
              <span>
                <strong>{r.title}</strong>
                <small>{r.excerpt.slice(0, 120)}</small>
              </span>
              <small>
                {r.type === "TAG"
                  ? "태그"
                  : r.type === "DAILY"
                    ? "데일리 노트"
                    : "노트"}
              </small>
            </button>
          ))}
        </div>
        {!results.length && <p className="note-empty">검색 결과가 없습니다.</p>}
        <footer>
          <small>↑ ↓ 선택 · Enter 열기</small>
          <small>Esc 닫기</small>
        </footer>
      </section>
    </div>
  );
}
