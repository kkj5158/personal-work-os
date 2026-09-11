"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { notesApi } from "@/lib/api/notes";
import { Autosave, type SaveState } from "@/lib/notes/autosave";
import type { Note, SearchResult, Tag } from "@/lib/notes/types";
import { useNoteEnvironment } from "../NoteContext";
import { ReflectionModal } from "@/app/calendar/ReflectionModal";
import { WikiLink, MediaRow, NoteFind, findKey } from "./extensions";

let activeEditor = "";
export function NoteEditor({
  initial,
  compact = false,
  onSaved,
  readonly = false,
}: {
  initial: Note;
  compact?: boolean;
  onSaved?: (note: Note) => void;
  readonly?: boolean;
}) {
  const env = useNoteEnvironment();
  const latest = useRef(initial);
  const [note, setNote] = useState(initial);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [title, setTitle] = useState(initial.title);
  const [reflection, setReflection] = useState(false);
  const [tag, setTag] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [wiki, setWiki] = useState<{
    query: string;
    from: number;
    to: number;
    left: number;
    top: number;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [choice, setChoice] = useState(0);
  const [find, setFind] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findCount, setFindCount] = useState({ current: 0, total: 0 });
  const [recovery, setRecovery] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const envRef = useRef(env);
  envRef.current = env;
  const draftKey = `notes.draft.${initial.workspaceId}.${initial.journalDate ?? initial.id}`;
  const operations = useRef<Promise<unknown>>(Promise.resolve());
  const operationCount = useRef(0);
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    operationCount.current++;
    const next = operations.current.then(operation).finally(() => {
      operationCount.current--;
    });
    operations.current = next.catch(() => {});
    return next;
  }
  const [queue] = useState(
    () =>
      new Autosave<string>(
        async (content) => {
          await serial(async () => {
            const firstWrite = !latest.current.createdAt;
            const saved = await notesApi.save(initial.workspaceId, {
              ...latest.current,
              content,
            });
            if (saved) {
              latest.current = saved;
              setNote(saved);
              onSavedRef.current?.(saved);
              envRef.current.changed();
              if (firstWrite)
                void notesApi
                  .visit(initial.workspaceId, saved.id)
                  .catch(envRef.current.error);
            }
          });
          // Only clear the draft corresponding to this exact acknowledged content.
          if (sessionStorage.getItem(draftKey) === content)
            sessionStorage.removeItem(draftKey);
        },
        (s, e) => {
          setState(s);
          setError(
            e instanceof Error
              ? e.message
              : s === "error"
                ? "저장에 실패했습니다."
                : "",
          );
        },
        env.settings.autosaveDelay,
      ),
  );
  const wikiRef = useRef(wiki);
  wikiRef.current = wiki;
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;
  const choiceRef = useRef(choice);
  choiceRef.current = choice;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      WikiLink,
      MediaRow,
      NoteFind,
      Markdown,
    ],
    content: initial.content,
    contentType: "markdown",
    immediatelyRender: false,
    editable: !readonly,
    enableInputRules: env.settings.markdownAssistance,
    editorProps: {
      attributes: {
        class: "note-prose",
        role: "textbox",
        "aria-label":
          initial.type === "DAILY"
            ? `${initial.journalDate} 노트 본문`
            : "노트 본문",
        "aria-multiline": "true",
      },
      handleDOMEvents: {
        click: (_view, event) => {
          const link = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-wiki-title]",
          );
          if (link) {
            envRef.current.openWiki(link.dataset.wikiTitle!);
            return true;
          }
          return false;
        },
      },
      handleKeyDown: (view, event) => {
        if (event.isComposing || view.composing) return false;
        const current = wikiRef.current;
        if (
          current &&
          ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)
        ) {
          if (event.key === "Escape") setWiki(null);
          else if (event.key === "ArrowUp" || event.key === "ArrowDown")
            setChoice(
              (n) =>
                (n +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  suggestionsRef.current.length +
                  1) %
                (suggestionsRef.current.length + 1),
            );
          else
            selectWiki(
              suggestionsRef.current[choiceRef.current]?.title ?? current.query,
            );
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length && envRef.current.settings.imagePaste) {
          void upload(files);
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        if (event.dataTransfer?.types.includes("application/x-note-image"))
          return true;
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length) {
          void upload(files);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      capture(e.getMarkdown());
      updateWiki(e);
    },
    onSelectionUpdate: ({ editor: e }) => updateWiki(e),
    onTransaction: ({ editor: e }) => {
      const f = findKey.getState(e.state);
      if (f)
        setFindCount({
          current: f.matches.length ? f.current + 1 : 0,
          total: f.matches.length,
        });
    },
    onFocus: () => {
      activeEditor = initial.id;
      if (latest.current.createdAt)
        void notesApi
          .visit(initial.workspaceId, latest.current.id)
          .catch(envRef.current.error);
    },
    onBlur: ({ editor: e }) => {
      if (!e.view.composing) void queue.flush().catch(() => {});
    },
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;
  function capture(content: string) {
    if (readonly) return;
    sessionStorage.setItem(draftKey, content);
    queue.set(content);
  }
  function updateWiki(e: NonNullable<typeof editor>) {
    if (!envRef.current.settings.wikiAutocomplete || e.view.composing) {
      setWiki(null);
      return;
    }
    const { $from } = e.state.selection;
    const before = $from.parent.textBetween(
      0,
      $from.parentOffset,
      "",
      "\ufffc",
    );
    const match = /\[\[([^\[\]\n]{0,240})$/.exec(before);
    if (match) {
      if (wikiRef.current?.query !== match[1]) setSuggestions([]);
      const caret = e.view.coordsAtPos($from.pos);
      setWiki({
        query: match[1],
        from: $from.pos - match[0].length,
        to: $from.pos,
        left: Math.max(8, Math.min(caret.left, window.innerWidth - 368)),
        top: caret.bottom + 6,
      });
      setChoice(0);
    } else setWiki(null);
  }
  function selectWiki(value: string) {
    const range = wikiRef.current;
    if (!range || !value.trim()) return;
    editorRef.current
      ?.chain()
      .focus()
      .insertContentAt(
        { from: range.from, to: range.to },
        { type: "wikiLink", attrs: { title: value.trim() } },
      )
      .run();
    setWiki(null);
  }
  async function upload(files: File[]) {
    try {
      const images = [];
      for (const f of files) {
        if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type))
          throw new Error("PNG, JPEG, GIF, WebP 이미지를 선택하세요.");
        const media = await notesApi.upload(initial.workspaceId, f);
        images.push({ src: `media:${media.id}`, caption: "", ratio: 100 });
      }
      const nodes = [];
      for (let i = 0; i < images.length; i += 3) {
        const row = images.slice(i, i + 3);
        nodes.push({
          type: "mediaRow",
          attrs: {
            images: row.map((item) => ({ ...item, ratio: 100 / row.length })),
            width: 100,
            align: "left",
          },
        });
      }
      editorRef.current
        ?.chain()
        .focus()
        .insertContent([...nodes, { type: "paragraph" }])
        .run();
    } catch (e) {
      envRef.current.error(e);
    }
  }
  useEffect(() => {
    const stored = sessionStorage.getItem(draftKey);
    if (stored && stored !== initial.content) setRecovery(stored);
    const unregister = env.register(
      initial.id,
      async () => {
        await queue.flush();
        await operations.current;
      },
      () => queue.dirty() || operationCount.current > 0,
    );
    return () => {
      unregister();
      queue.stop();
      void queue.flush().catch(() => {});
    };
  }, [initial.id, draftKey, queue]); // stable note lifetime
  useEffect(() => {
    if (!wiki) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      notesApi
        .wikiSuggestions(initial.workspaceId, wiki.query)
        .then((rows) => {
          if (!cancelled) setSuggestions(rows.filter((r) => r.type !== "TAG"));
        })
        .catch(env.error);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wiki?.query, initial.workspaceId]);
  useEffect(() => {
    if (!wiki || !editor) return;
    const position = () => {
      const caret = editor.view.coordsAtPos(wiki.to);
      setWiki((current) =>
        current
          ? {
              ...current,
              left: Math.max(8, Math.min(caret.left, window.innerWidth - 368)),
              top: Math.min(caret.bottom + 6, window.innerHeight - 180),
            }
          : null,
      );
    };
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [wiki?.to, editor]);
  useEffect(() => {
    notesApi.tags(initial.workspaceId).then(setTags).catch(env.error);
  }, [initial.workspaceId, note.tags]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "f" &&
        activeEditor === initial.id &&
        !event.isComposing
      ) {
        event.preventDefault();
        setFind(true);
        setTimeout(() => findInput.current?.focus(), 0);
      }
      if (event.key === "Escape") {
        setFind(false);
        editorRef.current?.view.dispatch(
          editorRef.current.state.tr.setMeta(findKey, { query: "" }),
        );
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [initial.id]);
  function search(query: string, direction = 0) {
    if (!editor) return;
    const old = findKey.getState(editor.state)!;
    editor.view.dispatch(
      editor.state.tr.setMeta(findKey, {
        query,
        current: query === old.query ? old.current + direction : 0,
      }),
    );
    const f = findKey.getState(editor.state)!;
    const match = f.matches[f.current];
    if (match) {
      const dom = editor.view.domAtPos(match.from).node;
      (dom instanceof HTMLElement ? dom : dom.parentElement)?.scrollIntoView({
        block: "nearest",
      });
    }
  }
  async function action(fn: (n: Note) => Promise<Note>) {
    try {
      await queue.flush();
      await serial(async () => {
        const n = await fn(latest.current);
        latest.current = n;
        setNote(n);
        onSavedRef.current?.(n);
        envRef.current.changed();
      });
    } catch (e) {
      envRef.current.error(e);
    }
  }
  function downloadDraft() {
    const url = URL.createObjectURL(
      new Blob([editor?.getMarkdown() ?? recovery], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "note-draft.md";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!editor) return <p className="note-muted">에디터 불러오는 중…</p>;
  const command = (fn: () => void) => {
    if (!editor.view.composing) fn();
  };
  return (
    <div
      ref={root}
      className={`note-editor ${compact ? "compact" : ""}`}
      onCompositionStartCapture={() => {
        queue.composition(true);
        setWiki(null);
      }}
      onCompositionEndCapture={() => {
        setTimeout(() => {
          queue.composition(false);
          if (editorRef.current) capture(editorRef.current.getMarkdown());
        }, 0);
      }}
    >
      {!compact && (
        <>
          <div className="note-title-row">
            <input
              aria-label="노트 제목"
              className="note-title-input"
              value={title}
              readOnly={readonly || note.type === "DAILY"}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={(e) => {
                if (title === latest.current.title || readonly) return;
                void action((n) =>
                  notesApi.rename(initial.workspaceId, n, title),
                );
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing)
                  e.currentTarget.blur();
              }}
            />
            <button
              onClick={() =>
                void action((n) => notesApi.pin(initial.workspaceId, n))
              }
              disabled={readonly}
            >
              {note.pinnedAt ? "★ 핀 해제" : "☆ 핀"}
            </button>
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(
                    `${location.origin}/notes?workspace=${initial.workspaceId}&note=${initial.id}`,
                  )
                  .catch(env.error)
              }
            >
              링크 복사
            </button>
            <details>
              <summary aria-label="노트 메뉴">···</summary>
              <button
                onClick={() =>
                  void action((n) => notesApi.trash(initial.workspaceId, n))
                }
              >
                {note.deletedAt ? "복원" : "휴지통으로 이동"}
              </button>
            </details>
          </div>
          {!!note.aliases.length && (
            <p className="note-muted">별칭 · {note.aliases.join(" · ")}</p>
          )}
          <div className="note-tag-row">
            {note.tags.map((t) => (
              <span className="note-tag" key={t.id}>
                #{t.name}
                {!readonly && (
                  <button
                    aria-label={`${t.name} 태그 제거`}
                    onClick={() =>
                      void action((n) =>
                        notesApi.detach(initial.workspaceId, n.id, t.name),
                      )
                    }
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {!readonly && (
              <>
                <input
                  aria-label="태그 추가"
                  list={`tags-${initial.id}`}
                  placeholder="+ 태그"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.nativeEvent.isComposing &&
                      tag.trim()
                    ) {
                      void action((n) =>
                        notesApi.attach(initial.workspaceId, n.id, tag.trim()),
                      );
                      setTag("");
                    }
                  }}
                />
                <datalist id={`tags-${initial.id}`}>
                  {tags.map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
                </datalist>
              </>
            )}
          </div>
        </>
      )}
      {recovery && (
        <div className="note-warning">
          저장되지 않은 이전 초안이 있습니다.
          <button
            onClick={() => {
              editor.commands.setContent(recovery, { contentType: "markdown" });
              setRecovery("");
            }}
          >
            초안 복원
          </button>
          <button onClick={downloadDraft}>초안 다운로드</button>
        </div>
      )}
      {!readonly && (
        <div className="editor-toolbar" role="toolbar" aria-label="노트 서식">
          <select
            aria-label="문단 서식"
            onChange={(e) =>
              command(() => {
                const value = Number(e.target.value);
                if (value)
                  editor
                    .chain()
                    .focus()
                    .toggleHeading({ level: value as 1 | 2 | 3 })
                    .run();
                else editor.chain().focus().setParagraph().run();
              })
            }
          >
            <option value="0">본문</option>
            <option value="1">제목 1</option>
            <option value="2">제목 2</option>
            <option value="3">제목 3</option>
          </select>
          {[
            ["굵게", "B", () => editor.chain().focus().toggleBold().run()],
            ["기울임", "I", () => editor.chain().focus().toggleItalic().run()],
            ["취소선", "S̶", () => editor.chain().focus().toggleStrike().run()],
            [
              "글머리 목록",
              "• 목록",
              () => editor.chain().focus().toggleBulletList().run(),
            ],
            [
              "번호 목록",
              "1. 목록",
              () => editor.chain().focus().toggleOrderedList().run(),
            ],
            [
              "체크리스트",
              "☑",
              () => editor.chain().focus().toggleTaskList().run(),
            ],
            [
              "인용",
              "❞",
              () => editor.chain().focus().toggleBlockquote().run(),
            ],
            [
              "인라인 코드",
              "‹/›",
              () => editor.chain().focus().toggleCode().run(),
            ],
            [
              "코드 블록",
              "{ }",
              () => editor.chain().focus().toggleCodeBlock().run(),
            ],
            [
              "구분선",
              "―",
              () => editor.chain().focus().setHorizontalRule().run(),
            ],
          ].map(([label, text, run]) => (
            <button
              key={String(label)}
              title={String(label)}
              aria-label={String(label)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => command(run as () => void)}
            >
              {String(text)}
            </button>
          ))}
          <button
            title="링크"
            aria-label="링크 추가"
            onClick={() => {
              const href = prompt("링크 주소 (https://…)");
              if (href && /^https?:\/\//i.test(href))
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href })
                  .run();
            }}
          >
            ↗
          </button>
          <button
            title="이미지 추가"
            aria-label="이미지 추가"
            onClick={() => file.current?.click()}
          >
            ▧
          </button>
          <button onClick={() => setReflection(true)}>▣ 회고 열기</button>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <span className={`save-status status-${state}`} role="status">
            {
              {
                saved: "저장됨",
                pending: "변경됨",
                saving: "저장 중…",
                error: "저장 실패",
              }[state]
            }
          </span>
        </div>
      )}
      {error && (
        <div className="note-warning" role="alert">
          {error}
          <button onClick={() => void queue.flush().catch(() => {})}>
            다시 시도
          </button>
          <button onClick={downloadDraft}>초안 다운로드</button>
        </div>
      )}
      {find && (
        <div className="note-find">
          <input
            ref={findInput}
            aria-label="현재 노트 검색"
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value);
              if (!(e.nativeEvent as InputEvent).isComposing)
                search(e.target.value);
            }}
            onCompositionEnd={(e) => search(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing)
                search(findQuery, e.shiftKey ? -1 : 1);
            }}
          />
          <span>
            {findCount.current} / {findCount.total}
          </span>
          <button onClick={() => search(findQuery, -1)}>이전</button>
          <button onClick={() => search(findQuery, 1)}>다음</button>
          <button
            aria-label="노트 검색 닫기"
            onClick={() => {
              setFind(false);
              search("");
            }}
          >
            ×
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
      {wiki &&
        createPortal(
          <div
            className="wiki-suggestions"
            style={{
              position: "fixed",
              left: wiki.left,
              top: wiki.top,
              bottom: "auto",
              width: "min(360px, calc(100vw - 16px))",
              zIndex: 100,
              maxHeight: 240,
              overflowY: "auto",
            }}
            role="listbox"
            aria-label="Wiki Link 자동완성"
          >
            {suggestions.map((r, i) => (
              <button
                key={r.id}
                role="option"
                aria-selected={choice === i}
                className={choice === i ? "selected" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectWiki(r.title)}
              >
                {r.title}
                <small>{r.type === "DAILY" ? "데일리 노트" : "노트"}</small>
              </button>
            ))}
            <button
              className={choice === suggestions.length ? "selected" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectWiki(wiki.query)}
            >
              [[{wiki.query || "노트 제목"}]] · 미생성 링크로 삽입
            </button>
          </div>,
          document.body,
        )}
      {reflection && <ReflectionModal open date={note.journalDate ?? new Date().toLocaleDateString("sv-SE")} context={`NOTE SYS · ${note.title || "제목 없는 노트"}`} onClose={() => setReflection(false)} />}
    </div>
  );
}
