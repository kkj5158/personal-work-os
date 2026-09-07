"use client";
import { useEffect, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import { notesApi } from "@/lib/api/notes";
import { filterGraph } from "@/lib/notes/model";
import type { Graph, GraphNode, Workspace, Metric } from "@/lib/notes/types";
import { useNoteEnvironment } from "./NoteContext";
import { Metrics } from "./Connections";
export function GraphView({
  workspace,
  revision,
  open,
  create,
}: {
  workspace: Workspace;
  revision: number;
  open: (id: string) => void;
  create: (title: string) => Promise<void>;
}) {
  const env = useNoteEnvironment();
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] });
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [daily, setDaily] = useState(env.settings.graphDaily);
  const [orphans, setOrphans] = useState(env.settings.graphOrphans);
  const [selected, setSelected] = useState<GraphNode>();
  const [query, setQuery] = useState("");
  const canvas = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  useEffect(() => {
    let gone = false;
    Promise.all([notesApi.graph(workspace.id), notesApi.metrics(workspace.id)])
      .then(([g, m]) => {
        if (!gone) {
          setGraph(g);
          setMetrics(m);
        }
      })
      .catch(env.error);
    return () => {
      gone = true;
    };
  }, [workspace.id, revision]);
  useEffect(() => {
    if (!canvas.current) return;
    const filtered = filterGraph(graph, daily, orphans);
    const instance = cytoscape({
      container: canvas.current,
      elements: [
        ...filtered.nodes.map((n) => ({
          data: {
            ...n,
            size: Math.min(70, 22 + Math.sqrt(n.connectedNotes) * 7),
          },
        })),
        ...filtered.edges.map((e, i) => ({ data: { ...e, id: `edge-${i}` } })),
      ],
      style: [
        {
          selector: "node",
          style: {
            label: "data(title)",
            width: "data(size)",
            height: "data(size)",
            "background-color": "#8ebcff",
            color: "#263a54",
            "font-size": 12,
            "text-valign": "bottom",
            "text-margin-y": 8,
            "border-width": 3,
            "border-color": "#fff",
            "text-wrap": "ellipsis",
            "text-max-width": "140px",
          },
        },
        {
          selector: 'node[type="PENDING"]',
          style: {
            "background-color": "#ffe393",
            "border-style": "dashed",
            "border-color": "#d6ac46",
            "border-width": 1,
          },
        },
        {
          selector: 'node[type="DAILY"]',
          style: { "background-color": "#b8c6d6", shape: "round-rectangle" },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#c6d7ed",
            "target-arrow-shape": "triangle",
            "target-arrow-color": "#c6d7ed",
            "curve-style": "bezier",
          },
        },
        { selector: ".faded", style: { opacity: 0.15 } },
        {
          selector: ":selected",
          style: {
            "background-color": "#086fff",
            "border-color": "#92bfff",
            "border-width": 5,
          },
        },
      ],
      layout: { name: "cose", animate: false, padding: 55 },
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.2,
    });
    if (instance.zoom() > 1) {
      instance.zoom(1);
      instance.center();
    }
    cy.current = instance;
    instance.on("tap", "node", (e) => {
      const node = graph.nodes.find((n) => n.id === e.target.id());
      setSelected(node);
      instance.elements().addClass("faded");
      e.target.closedNeighborhood().removeClass("faded");
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(canvas.current);
    return () => {
      observer.disconnect();
      instance.destroy();
      cy.current = null;
    };
  }, [graph, daily, orphans]);
  function select(node: GraphNode) {
    const target = cy.current?.getElementById(node.id);
    setSelected(node);
    if (target?.length) {
      cy.current?.elements().unselect().removeClass("faded");
      target.select();
      cy.current?.animate({ center: { eles: target }, duration: 250 });
    }
  }
  const filtered = filterGraph(graph, daily, orphans);
  return (
    <section className="note-module">
      <header className="module-heading">
        <div>
          <h1>그래프</h1>
          <p>노트 사이의 연결을 탐색하고 생각의 흐름을 발견하세요.</p>
        </div>
      </header>
      <div className="module-tools">
        <input
          aria-label="그래프 노드 검색"
          placeholder="노드 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={daily}
            onChange={(e) => setDaily(e.target.checked)}
          />{" "}
          데일리 노트 표시
        </label>
        <label>
          <input
            type="checkbox"
            checked={orphans}
            onChange={(e) => setOrphans(e.target.checked)}
          />{" "}
          Orphan 표시
        </label>
        <button
          aria-label="그래프 축소"
          onClick={() => cy.current?.zoom((cy.current?.zoom() ?? 1) / 1.2)}
        >
          −
        </button>
        <button onClick={() => cy.current?.fit(undefined, 45)}>
          전체 맞춤
        </button>
        <button
          aria-label="그래프 확대"
          onClick={() => cy.current?.zoom((cy.current?.zoom() ?? 1) * 1.2)}
        >
          +
        </button>
      </div>
      {query && (
        <div className="graph-search-results">
          {filtered.nodes
            .filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 12)
            .map((n) => (
              <button key={n.id} onClick={() => select(n)}>
                {n.title}
              </button>
            ))}
        </div>
      )}
      <div className="graph-layout">
        <div className="graph-stage">
          <div
            ref={canvas}
            className="graph-canvas"
            aria-label="노트 관계 그래프"
          />
          {!filtered.nodes.length && (
            <p className="graph-empty">
              표시할 연결이 없습니다. Orphan 표시를 켜거나 Wiki Link를
              추가하세요.
            </p>
          )}
          <div className="graph-legend">
            ● 노트　<span>● 미생성 링크</span>
            <small>드래그 · 이동 / 휠 · 확대 / 클릭 · 미리보기</small>
          </div>
        </div>
        <aside className="note-panel">
          {selected ? (
            <>
              <small>
                {selected.type === "PENDING"
                  ? "미생성 링크"
                  : selected.type === "DAILY"
                    ? "데일리 노트"
                    : "노트"}
              </small>
              <h2>{selected.title}</h2>
              <button
                className="primary"
                onClick={() =>
                  selected.type === "PENDING"
                    ? void create(selected.title)
                    : open(selected.id)
                }
              >
                {selected.type === "PENDING" ? "+ 노트 만들기" : "노트 열기 ↗"}
              </button>
              <Metrics metric={metrics.find((m) => m.id === selected.id)} />
              <h3>연결된 노트</h3>
              {graph.edges
                .filter(
                  (e) => e.source === selected.id || e.target === selected.id,
                )
                .map((e) => {
                  const n = graph.nodes.find(
                    (n) =>
                      n.id === (e.source === selected.id ? e.target : e.source),
                  );
                  return n ? (
                    <button
                      className="graph-neighbor"
                      key={`${e.source}-${e.target}`}
                      onClick={() => select(n)}
                    >
                      {n.title}
                      <small>{e.weight}회</small>
                    </button>
                  ) : null;
                })}
            </>
          ) : (
            <p className="note-muted">노드를 선택하면 미리보기가 표시됩니다.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
