"use client";
import { useEffect, useState } from "react";
import { notesApi } from "@/lib/api/notes";
import type {
  Metric,
  Note,
  Pending,
  Reference,
  Workspace,
} from "@/lib/notes/types";
import { useNoteEnvironment } from "./NoteContext";
import { NoteEditor } from "./editor/NoteEditor";
export function Metrics({ metric }: { metric?: Metric }) {
  if (!metric) return null;
  return (
    <dl className="note-metrics">
      {[
        ["연결된 고유 노트", metric.connectedNotes],
        ["서로 다른 Daily 날짜", `${metric.dailyDates}일`],
        ["총 Wiki Link 언급", `${metric.mentions}회`],
        ["최근 30일 새 연결", `+${metric.growth30Days}`],
        ["마지막 연결일", metric.lastConnection?.slice(0, 10) ?? "—"],
        ["Incoming · 고유 출처", metric.incoming],
        ["Outgoing · 고유 대상", metric.outgoing],
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function References({
  references,
  open,
}: {
  references: Reference[];
  open: (id: string, context?: string) => void;
}) {
  const grouped = new Map<string, Reference[]>();
  for (const r of references)
    grouped.set(r.sourceNoteId, [...(grouped.get(r.sourceNoteId) ?? []), r]);
  return (
    <div className="linked-references">
      {Array.from(grouped).map(([id, items]) => (
        <section key={id}>
          <h3>
            <button onClick={() => open(id)}>
              {items[0].journalDate ?? items[0].title}
            </button>
          </h3>
          {items.map((r, i) => (
            <button
              className="reference-context"
              key={i}
              onClick={() => open(id, r.context)}
            >
              {r.context}
              <span>↗</span>
            </button>
          ))}
        </section>
      ))}
      {!references.length && (
        <p className="note-muted">
          명시적인 Wiki Link로 연결된 참조가 없습니다.
        </p>
      )}
    </div>
  );
}
export function NoteDetail({
  workspace,
  id,
  revision,
  open,
  context,
}: {
  workspace: Workspace;
  id: string;
  revision: number;
  open: (id: string, context?: string) => void;
  context?: string;
}) {
  const env = useNoteEnvironment();
  const [note, setNote] = useState<Note | null>(null);
  const [refs, setRefs] = useState<Reference[]>([]);
  const [metric, setMetric] = useState<Metric>();
  useEffect(() => {
    let gone = false;
    setNote(null);
    notesApi
      .note(workspace.id, id)
      .then((n) => {
        if (!gone) setNote(n);
        if (!n.deletedAt) return notesApi.visit(workspace.id, id);
      })
      .catch(env.error);
    return () => {
      gone = true;
    };
  }, [workspace.id, id]);
  useEffect(() => {
    let gone = false;
    Promise.all([
      notesApi.references(workspace.id, { target: id }),
      notesApi.metrics(workspace.id),
    ])
      .then(([r, m]) => {
        if (!gone) {
          setRefs(r);
          setMetric(m.find((x) => x.id === id));
        }
      })
      .catch(env.error);
    return () => {
      gone = true;
    };
  }, [workspace.id, id, revision]);
  useEffect(() => {
    if (!note || !context) return;
    const timer = setTimeout(() => {
      const target = context
        .replace(/\[\[|\]\]/g, "")
        .trim()
        .slice(0, 50);
      for (const p of document.querySelectorAll<HTMLElement>(".note-prose p"))
        if (p.textContent?.includes(target)) {
          p.scrollIntoView({ block: "center" });
          p.classList.add("reference-highlight");
          break;
        }
    }, 500);
    return () => clearTimeout(timer);
  }, [note?.id, context]);
  return (
    <div className="note-detail-layout">
      <section className="note-detail">
        <p className="note-breadcrumb">
          모든 노트 <span>›</span> {note?.title ?? "불러오는 중…"}
        </p>
        {note && (
          <>
            {note.deletedAt && (
              <div className="note-warning">
                휴지통의 노트입니다.
                <button
                  onClick={async () => {
                    try {
                      const n = await notesApi.trash(workspace.id, note);
                      setNote(n);
                      env.changed();
                    } catch (e) {
                      env.error(e);
                    }
                  }}
                >
                  복원하기
                </button>
              </div>
            )}
            <NoteEditor
              key={`${note.id}-${!!note.deletedAt}`}
              initial={note}
              readonly={!!workspace.archivedAt || !!note.deletedAt}
              onSaved={setNote}
            />
            <section className="reference-section">
              <h2>
                Linked References <small>{refs.length}</small>
              </h2>
              <References references={refs} open={open} />
            </section>
          </>
        )}
      </section>
      <aside className="note-detail-aside">
        <div className="note-panel">
          <h3>노트 연결 지표</h3>
          <Metrics metric={metric} />
        </div>
        <div className="note-panel">
          <h3>기록 정보</h3>
          <p className="note-muted">생성 · {note?.createdAt.slice(0, 10)}</p>
          <p className="note-muted">수정 · {note?.updatedAt.slice(0, 10)}</p>
          <p className="note-muted">
            제목을 바꾸어도 기존 링크와 별칭은 유지됩니다.
          </p>
        </div>
      </aside>
    </div>
  );
}
export function Connections({
  workspace,
  revision,
  open,
  create,
}: {
  workspace: Workspace;
  revision: number;
  open: (id: string, context?: string) => void;
  create: (title: string) => Promise<void>;
}) {
  const env = useNoteEnvironment();
  const [tab, setTab] = useState("connected");
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [selected, setSelected] = useState("");
  const [refs, setRefs] = useState<Reference[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let gone = false;
    Promise.all([
      notesApi.metrics(workspace.id),
      notesApi.pending(workspace.id),
    ])
      .then(([m, p]) => {
        if (!gone) {
          setMetrics(m);
          setPending(p);
        }
      })
      .catch(env.error);
    return () => {
      gone = true;
    };
  }, [workspace.id, revision]);
  useEffect(() => {
    let gone = false;
    if (!selected) {
      setRefs([]);
      return;
    }
    notesApi
      .references(
        workspace.id,
        tab === "pending" ? { pending: selected } : { target: selected },
      )
      .then((r) => {
        if (!gone) setRefs(r);
      })
      .catch(env.error);
    return () => {
      gone = true;
    };
  }, [workspace.id, selected, tab, revision]);
  const metric = metrics.find((m) => m.id === selected);
  const item = pending.find((p) => p.normalizedTitle === selected);
  return (
    <section className="note-module">
      <header className="module-heading">
        <div>
          <h1>연결된 노트</h1>
          <p>노트 사이의 Wiki Link를 통해 생각의 연결을 살펴보세요.</p>
        </div>
      </header>
      <div className="note-tabs">
        <button
          className={tab === "connected" ? "active" : ""}
          onClick={() => {
            setTab("connected");
            setSelected("");
          }}
        >
          연결된 노트
        </button>
        <button
          className={tab === "pending" ? "active" : ""}
          onClick={() => {
            setTab("pending");
            setSelected("");
          }}
        >
          미생성 링크 <small>{pending.length}</small>
        </button>
      </div>
      <div className="module-tools">
        <input
          aria-label="연결 노트 검색"
          placeholder="노트 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="note-muted">
          {tab === "connected" ? "많이 연결된 순" : "언급 많은 순"}
        </span>
      </div>
      <div className="connections-layout">
        <div>
          {tab === "connected" ? (
            <div className="metric-table">
              <div className="metric-table-head">
                <span>노트</span>
                <span>연결 노트</span>
                <span>Daily 날짜</span>
                <span>총 언급</span>
                <span>최근 30일</span>
                <span>마지막 연결</span>
              </div>
              {metrics
                .filter(
                  (m) =>
                    m.mentions > 0 &&
                    m.title.toLowerCase().includes(query.toLowerCase()),
                )
                .map((m) => (
                  <button
                    className={`metric-table-row ${selected === m.id ? "selected" : ""}`}
                    key={m.id}
                    onClick={() => setSelected(m.id)}
                  >
                    <strong>{m.title}</strong>
                    <span>{m.connectedNotes}</span>
                    <span>{m.dailyDates}일</span>
                    <span>{m.mentions}회</span>
                    <span className="growth">+{m.growth30Days}</span>
                    <time>{m.lastConnection?.slice(0, 10)}</time>
                  </button>
                ))}
            </div>
          ) : (
            pending
              .filter((p) =>
                p.title.toLowerCase().includes(query.toLowerCase()),
              )
              .map((p) => (
                <div
                  className={`pending-row ${selected === p.normalizedTitle ? "selected" : ""}`}
                  key={p.normalizedTitle}
                >
                  <button onClick={() => setSelected(p.normalizedTitle)}>
                    <strong>[[{p.title}]]</strong>
                    <small>
                      총 {p.mentions}회 · 첫 언급 {p.firstMention.slice(0, 10)}{" "}
                      · 최근 {p.latestMention.slice(0, 10)}
                    </small>
                  </button>
                  <button
                    disabled={!!workspace.archivedAt}
                    onClick={() => void create(p.title)}
                  >
                    + 노트 만들기
                  </button>
                </div>
              ))
          )}
          {!metrics.some((m) => m.mentions) && !pending.length && (
            <p className="note-empty">
              [[노트 제목]]으로 첫 연결을 만들어보세요.
            </p>
          )}
        </div>
        <aside className="note-panel">
          {selected ? (
            <>
              <h2>{metric?.title ?? item?.title}</h2>
              {metric ? (
                <>
                  <button className="primary" onClick={() => open(metric.id)}>
                    노트 열기 ↗
                  </button>
                  <Metrics metric={metric} />
                </>
              ) : (
                <>
                  <p>{item?.mentions}회 언급된 미생성 링크입니다.</p>
                  <button
                    className="primary"
                    onClick={() => void create(item!.title)}
                  >
                    + 새 노트 만들기
                  </button>
                </>
              )}
              <h3>언급된 맥락</h3>
              <References references={refs} open={open} />
            </>
          ) : (
            <p className="note-muted">
              노트를 선택하면 연결 지표와 언급 맥락을 볼 수 있습니다.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
