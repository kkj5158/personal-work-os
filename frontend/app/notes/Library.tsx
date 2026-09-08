"use client";
import { useEffect, useState } from "react";
import { notesApi } from "@/lib/api/notes";
import type { Note, Summary, Tag, Workspace } from "@/lib/notes/types";
import { DeleteConfirmation } from "./DeleteConfirmation";
import { dateLabel } from "@/lib/notes/model";
import { useNoteEnvironment } from "./NoteContext";
export function NoteList({
  items,
  open,
  remove,
}: {
  items: Summary[];
  open: (id: string) => void;
  remove?: (id: string) => void;
}) {
  return (
    <div className="note-list">
      {items.map((n) => (
        <div key={n.id} className="note-list-entry">
          <button
            key={n.id}
            className="note-list-item"
            onClick={() => open(n.id)}
          >
            <span className="list-icon">{n.type === "DAILY" ? "▦" : "▤"}</span>
            <span className="list-description">
              <strong>
                {n.journalDate ? dateLabel(n.journalDate) : n.title}
              </strong>
              <small>
                {n.excerpt.slice(0, 100) || "아직 내용이 없습니다."}
              </small>
            </span>
            <span className="list-tags">
              {n.tags.slice(0, 3).map((t) => (
                <span key={t.id} className="note-tag">
                  #{t.name}
                </span>
              ))}
            </span>
            <time>{(n.lastOpenedAt ?? n.updatedAt)?.slice(0, 10)}</time>
            <span className={n.pinnedAt ? "pin-active" : ""}>
              {n.pinnedAt ? "★" : "☆"}
            </span>
          </button>
          {remove && (
            <button
              className="danger"
              onClick={() => remove(n.id)}
              aria-label={`${n.title} 영구삭제`}
            >
              영구삭제
            </button>
          )}
        </div>
      ))}
      {!items.length && (
        <p className="note-empty">
          아직 노트가 없습니다. 첫 기록을 남겨보세요.
        </p>
      )}
    </div>
  );
}
export function Library({
  workspace,
  module,
  revision,
  tagId,
  open,
}: {
  workspace: Workspace;
  module: string;
  revision: number;
  tagId?: string;
  open: (id: string) => void;
}) {
  const env = useNoteEnvironment();
  const [items, setItems] = useState<Summary[]>([]);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [pins, setPins] = useState<Summary[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const baseFilter =
    module === "RECENT_NOTES"
      ? "RECENT"
      : module === "TRASH"
        ? "TRASH"
        : filter;
  useEffect(() => {
    let gone = false;
    setLoading(true);
    const timer = setTimeout(() => {
      notesApi
        .library(workspace.id, {
          filter: baseFilter,
          q: query,
          offset,
          ...(tagId ? { tag: tagId } : {}),
        })
        .then((page) => {
          if (!gone) {
            setItems(page.items);
            setMore(page.hasMore);
          }
        })
        .catch(env.error)
        .finally(() => {
          if (!gone) setLoading(false);
        });
    }, 140);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [workspace.id, baseFilter, query, offset, revision, tagId]);
  useEffect(() => {
    let gone = false;
    notesApi
      .library(workspace.id, { filter: "PINNED", limit: 100 })
      .then((page) => {
        if (!gone) setPins(page.items);
      })
      .catch(env.error);
    return () => {
      gone = true;
    };
  }, [workspace.id, revision]);
  return (
    <section className="note-module">
      <header className="module-heading">
        <div>
          <h1>
            {module === "RECENT_NOTES"
              ? "최근 노트"
              : module === "TRASH"
                ? "휴지통"
                : "모든 노트"}
          </h1>
          <p>
            {module === "RECENT_NOTES"
              ? "최근에 방문한 서로 다른 노트 50개입니다."
              : module === "TRASH"
                ? "노트는 자동 삭제되지 않습니다. 열어서 복원할 수 있습니다."
                : `${workspace.name}의 모든 노트를 한곳에서 관리하세요.`}
          </p>
        </div>
      </header>
      {module === "ALL_NOTES" && (
        <div className="note-tabs">
          {[
            ["ALL", "전체"],
            ["PINNED", "핀됨"],
            ["NOTE", "일반 노트"],
            ["DAILY", "데일리 노트"],
          ].map(([key, label]) => (
            <button
              className={filter === key ? "active" : ""}
              key={key}
              onClick={() => {
                setFilter(key);
                setOffset(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="module-tools">
        <input
          aria-label="노트 목록 검색"
          placeholder="노트 검색…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
          }}
        />
        <span className="note-muted">
          {module === "RECENT_NOTES" ? "최근 방문순" : "최근 수정순"}
        </span>
      </div>
      {module === "ALL_NOTES" &&
        filter === "ALL" &&
        !query &&
        !tagId &&
        pins.length > 0 && (
          <div className="pinned-section">
            <h3>
              📌 고정된 노트 <small>{pins.length}</small>
            </h3>
            <NoteList items={pins} open={open} />
          </div>
        )}
      {loading ? (
        <p className="note-empty">노트 불러오는 중…</p>
      ) : (
        <NoteList
          items={items}
          open={open}
          remove={
            module === "TRASH"
              ? async (id) => {
                  try {
                    const note = await notesApi.note(workspace.id, id);
                    setDeleting(note);
                  } catch (error) {
                    env.error(error);
                  }
                }
              : undefined
          }
        />
      )}
      {deleting && (
        <DeleteConfirmation
          name={deleting.title}
          description="노트와 전용 이미지를 삭제합니다. 다른 노트의 원문과 공유 이미지는 유지됩니다."
          close={() => setDeleting(null)}
          remove={async () => {
            await notesApi.deleteNote(workspace.id, deleting);
            setItems((rows) => rows.filter((n) => n.id !== deleting.id));
            env.changed();
          }}
        />
      )}
      <div className="note-pagination">
        <button
          disabled={!offset}
          onClick={() => setOffset((n) => Math.max(0, n - 50))}
        >
          이전 50개
        </button>
        <span>
          {offset + 1}–{offset + items.length}
        </span>
        <button disabled={!more} onClick={() => setOffset((n) => n + 50)}>
          다음 50개
        </button>
      </div>
    </section>
  );
}
export function TagsModule({
  workspace,
  revision,
  selected,
  select,
  open,
}: {
  workspace: Workspace;
  revision: number;
  selected?: string;
  select: (id: string) => void;
  open: (id: string) => void;
}) {
  const env = useNoteEnvironment();
  const [tags, setTags] = useState<Tag[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  useEffect(() => {
    notesApi.tags(workspace.id).then(setTags).catch(env.error);
  }, [workspace.id, revision]);
  const tag = tags.find((t) => t.id === selected);
  async function create() {
    try {
      const t = await notesApi.createTag(workspace.id, name);
      setName("");
      env.changed();
      select(t.id);
    } catch (e) {
      env.error(e);
    }
  }
  return (
    <section className="note-module">
      <header className="module-heading">
        <div>
          <h1>태그</h1>
          <p>태그로 노트를 분류하고 탐색하세요.</p>
        </div>
      </header>
      <div className="tag-layout">
        <aside className="note-panel">
          <input
            aria-label="태그 검색"
            placeholder="태그 검색…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {tags
            .filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
            .map((t) => (
              <button
                key={t.id}
                className={`tag-index-row ${selected === t.id ? "selected" : ""}`}
                onClick={() => select(t.id)}
              >
                #{t.name}
                <span>{t.usageCount}</span>
              </button>
            ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <input
              aria-label="새 태그 이름"
              placeholder="새 태그 이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing && e.key === "Enter")
                  e.preventDefault();
              }}
            />
            <button disabled={!name.trim() || !!workspace.archivedAt}>
              + 새 태그
            </button>
          </form>
        </aside>
        <div>
          {tag ? (
            <>
              <div className="module-tools">
                <h2>
                  #{tag.name} <small>{tag.usageCount}</small>
                </h2>
                <button
                  onClick={async () => {
                    const next = prompt("태그 이름", tag.name);
                    if (next)
                      try {
                        await notesApi.renameTag(workspace.id, tag.id, next);
                        env.changed();
                      } catch (e) {
                        env.error(e);
                      }
                  }}
                >
                  이름 변경
                </button>
                <button
                  onClick={async () => {
                    if (
                      confirm(
                        `태그 #${tag.name}와 연결을 삭제합니다. 노트는 유지됩니다.`,
                      )
                    )
                      try {
                        await notesApi.deleteTag(workspace.id, tag.id);
                        env.changed();
                        select("");
                      } catch (e) {
                        env.error(e);
                      }
                  }}
                >
                  태그 삭제
                </button>
              </div>
              <Library
                key={tag.id}
                workspace={workspace}
                module="TAG_FILTER"
                revision={revision}
                tagId={tag.id}
                open={open}
              />
            </>
          ) : (
            <p className="note-empty">왼쪽에서 태그를 선택하세요.</p>
          )}
        </div>
      </div>
    </section>
  );
}
