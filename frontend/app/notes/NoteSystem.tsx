"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  FileText,
  Clock,
  Tag,
  GitBranch,
  Share2,
  Settings as SettingsIcon,
  Trash2,
  Search,
  Plus,
} from "lucide-react";
import { notesApi } from "@/lib/api/notes";
import { clearMediaCache } from "@/lib/notes/mediaCache";
import {
  DEFAULT_SETTINGS,
  MODULE_LABELS,
  type Workspace,
  type Settings,
} from "@/lib/notes/types";
import { today } from "@/lib/notes/model";
import { validLocalDate } from "@/lib/localDateBridge";
import { NoteContext } from "./NoteContext";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DailyFeed } from "./DailyFeed";
import { Library, TagsModule } from "./Library";
import { NoteDetail, Connections } from "./Connections";
import { GraphView } from "./GraphView";
import { WorkspaceSettings, SystemSettings } from "./Settings";
import { GlobalSearch } from "./GlobalSearch";
import { useGlobalTabs, useShellNavigationGuard } from "@/components/GlobalTabs";
import { SharedSidebar } from "@/components/Sidebar";
import { WorkspaceOrderModal } from "./WorkspaceOrderModal";
import { workspaceIcon } from "./WorkspaceIconPicker";
import { DailyHub } from "./DailyHub";
import { DailyHubSettings } from "./DailyHubSettings";
import { includedWorkspaces, type DailyHubSettings as HubPreferences } from "@/lib/notes/dailyHub";
import { guardNoteHistory } from "@/lib/notes/historyGuard";

const icons = {
  DAILY_NOTES: CalendarDays,
  ALL_NOTES: FileText,
  RECENT_NOTES: Clock,
  TAGS: Tag,
  CONNECTED_NOTES: GitBranch,
  GRAPH: Share2,
};
export function NoteSystem() {
  const router = useRouter(),
    params = useSearchParams();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [workspaceOrder, setWorkspaceOrder] = useState(false);
  const [mainWorkspaceId, setMainWorkspaceId] = useState<string | null>(null);
  const [hubSettings, setHubSettings] = useState<HubPreferences | null>(null);
  const [hubSettingsOpen, setHubSettingsOpen] = useState(false);
  const [hubRecent, setHubRecent] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<{ id: string; tick: number } | null>(null);

  const [search, setSearch] = useState(false);
  const [modal, setModal] = useState<"note" | "workspace" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, startNavigation] = useTransition();
  const queues = useRef(
    new Map<string, { flush: () => Promise<void>; dirty: () => boolean }>(),
  );
  const report = useCallback(
    (e: unknown) =>
      setError(e instanceof Error ? e.message : "요청을 처리하지 못했습니다."),
    [],
  );
  const register = useCallback(
    (id: string, flush: () => Promise<void>, dirty: () => boolean) => {
      queues.current.set(id, { flush, dirty });
      return () => {
        queues.current.delete(id);
      };
    },
    [],
  );
  const changed = useCallback(() => setRevision((n) => n + 1), []);
  const flush = useCallback(async () => {
    do {
      for (const q of queues.current.values()) await q.flush();
    } while (Array.from(queues.current.values()).some(q => q.dirty()));
  }, []);
  const historyGuard = useRef<ReturnType<typeof guardNoteHistory> | null>(null);
  useEffect(() => {
    const guard = guardNoteHistory(flush, () => Array.from(queues.current.values()).some(q => q.dirty()), report, startNavigation);
    historyGuard.current = guard;
    return guard.dispose;
  }, [flush, report]);
  useEffect(() => { historyGuard.current?.remember(); }, [params]);
  useShellNavigationGuard(proceed => {
    startNavigation(async () => {
      try { await flush(); startNavigation(proceed); } catch (e) { report(e); }
    });
  });
  const shell = useGlobalTabs();
  const setTabTitle = shell?.setTitle;
  const reload = useCallback(async () => {
    const [rows, main] = await Promise.all([notesApi.workspaces(), notesApi.mainWorkspace()]);
    setMainWorkspaceId(main.mainWorkspaceId);
    setWorkspaces(rows);
  }, []);
  useEffect(() => {
    Promise.all([Promise.resolve().then(reload), notesApi.settings().then(setSettings), notesApi.dailyHubSettings().then(setHubSettings)]).catch(
      report,
    );
  }, [reload, report]);
  const workspace =
    workspaces.find((w) => w.id === params.get("workspace")) ??
    workspaces.find(
      (w) =>
        !w.archivedAt && w.name === params.get("workspaceName"),
    ) ??
    workspaces.find((w) => !w.archivedAt && w.id === mainWorkspaceId) ??
    workspaces.find((w) => !w.archivedAt);
  const requestedModule =
    params.get("module") ??
    workspace?.modules.find((m) => m.isDefault)?.module ??
    "DAILY_NOTES";
  const isHub = requestedModule === "DAILY_HUB";
  const activeWorkspaces = workspaces.filter(w => !w.archivedAt);
  const hubWorkspaces = hubSettings ? includedWorkspaces(workspaces, hubSettings) : [];
  const mediaContext = isHub ? "DAILY_HUB" : workspace?.id;
  useEffect(() => () => clearMediaCache(), [mediaContext]);
  const selectedModule =
    requestedModule in MODULE_LABELS &&
    !workspace?.modules.some((m) => m.module === requestedModule && m.enabled)
      ? (workspace?.modules.find((m) => m.isDefault)?.module ?? "DAILY_NOTES")
      : requestedModule;
  const noteId = params.get("note");
  const date = validLocalDate(params.get("date"))
    ? params.get("date")!
    : today();
  useEffect(() => {
    if (isHub) { setTabTitle?.(`데일리 허브 · ${date}`); return; }
    if (!workspace || noteId) return;
    const label = selectedModule === "DAILY_NOTES" ? date : (MODULE_LABELS[selectedModule as keyof typeof MODULE_LABELS] ?? (selectedModule === "WORKSPACE_SETTINGS" ? "Workspace 설정" : "휴지통"));
    setTabTitle?.(`${workspace.name} · ${label}`);
  }, [workspace, noteId, selectedModule, date, setTabTitle, isHub]);
  function navigateTo(href: string) {
    startNavigation(async () => {
      try {
        await flush(); setError("");
        startNavigation(() => router.push(href));
        setWorkspaceMenu(false);
      } catch (e) { report(e); }
    });
  }
  function navigate(values: Record<string, string>) {
      const query = new URLSearchParams({
        workspace: workspace?.id ?? "",
        date,
        ...values,
      });
      if (values.module === "DAILY_HUB") query.delete("workspace");
      navigateTo(`/notes?${query}`);
  }
  async function hubWiki(workspaceId: string, title: string) {
    try { await flush(); const note = await notesApi.openWiki(workspaceId, title); changed(); await navigate({ workspace: workspaceId, note: note.id }); }
    catch (e) { report(e); }
  }
  const open = (id: string, context?: string) =>
    void navigate({ note: id, ...(context ? { context } : {}) });
  async function create(title: string) {
    if (!workspace) return;
    try {
      await flush();
      const note = await notesApi.save(workspace.id, {
        id: crypto.randomUUID(),
        journalDate: null,
        title,
        content: "",
        version: 0,
      });
      changed();
      if (note) {
        setModal(null);
        setName("");
        open(note.id);
      }
    } catch (e) {
      report(e);
    }
  }
  async function openWiki(title: string) {
    if (!workspace) return;
    try {
      await flush();
      const note = workspace.archivedAt
        ? await notesApi.resolve(workspace.id, title)
        : await notesApi.openWiki(workspace.id, title);
      changed();
      open(note.id);
    } catch (e) {
      report(e);
    }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!isHub) setSearch((value) => !value);
      }
      if (event.key === "Escape") {
        setWorkspaceMenu(false);

        setModal(null);
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (Array.from(queues.current.values()).some((q) => q.dirty())) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", unload);
    };
  }, [isHub]);
  const environment = {
    workspace: workspace?.id ?? "",
    settings,
    openWiki: (title: string) => void openWiki(title),
    error: report,
    register,
    changed,
    navigate: navigateTo,
  };
  return (
    <NoteContext.Provider value={environment}>
      <div className="note-system">
        <SharedSidebar
          system="NOTE SYS"
          beforeLogout={flush}
          beforeNavigate={async () => {
            try { await flush(); } catch (error) { report(error); throw error; }
          }}
          navigate={(destination) => void navigate({ module: destination })}
          groups={isHub ? [
            { section: "DAILY HUB", items: [
              { label: "오늘", icon: CalendarDays, active: date === today() && !hubRecent, action: () => { setHubRecent(false); void navigate({ module: "DAILY_HUB", date: today() }); } },
              { label: "최근 기록", icon: Clock, active: hubRecent, action: () => setHubRecent(true) },
            ] },
            { section: "WORKSPACES", items: hubWorkspaces.map(w => ({ label: w.name, icon: FileText, iconText: workspaceIcon(w.icon), action: () => setScrollTarget({ id: w.id, tick: Date.now() }) })) },
            { section: "SYSTEM", items: [{ label: "데일리 허브 설정", icon: SettingsIcon, action: () => setHubSettingsOpen(true) }] },
          ] : [
            ...(
              [
                ["NOTE", ["DAILY_NOTES", "ALL_NOTES", "RECENT_NOTES"]],
                ["CONNECTION", ["TAGS", "CONNECTED_NOTES", "GRAPH"]],
              ] as const
            ).map(([section, modules]) => ({
              section,
              items: (workspace?.modules ?? [])
                .filter(
                  (m) =>
                    m.enabled &&
                    (modules as readonly string[]).includes(m.module),
                )
                .map((m) => ({
                  label: MODULE_LABELS[m.module],
                  icon: icons[m.module],
                  active: !noteId && selectedModule === m.module,
                  destination: m.module,
                })),
            })),
            {
              section: "SYSTEM",
              items: [
                {
                  label: "휴지통",
                  icon: Trash2,
                  active: !noteId && selectedModule === "TRASH",
                  destination: "TRASH",
                },
                {
                  label: "Workspace 설정",
                  icon: SettingsIcon,
                  active: selectedModule === "WORKSPACE_SETTINGS",
                  destination: "WORKSPACE_SETTINGS",
                },
              ],
            },
          ]}
        />
        <div className="note-shell">
          <header className="note-topbar">
            <nav className="note-workspace-tabs" aria-label="NOTE SYS 탐색">
              <button className={isHub ? "selected hub-tab" : "hub-tab"} aria-current={isHub ? "page" : undefined} onClick={() => void navigate({ module: "DAILY_HUB", date })}><CalendarDays size={15}/><span>데일리 허브</span></button>
              {activeWorkspaces.slice(0, 7).map(w => <button key={w.id} title={w.name} className={!isHub && workspace?.id === w.id ? "selected" : ""} aria-current={!isHub && workspace?.id === w.id ? "page" : undefined} onClick={() => void navigate({ workspace: w.id })}><span>{workspaceIcon(w.icon)}</span><span className="workspace-tab-name">{w.name}</span></button>)}
            </nav>
            <div className="switcher-container">
              <button
                aria-label="더 많은 Workspace"
                aria-expanded={workspaceMenu}
                className={`workspace-overflow ${!isHub && !activeWorkspaces.slice(0, 7).some(w => w.id === workspace?.id) ? "selected" : ""}`}
                onClick={() => {
                  setWorkspaceMenu(!workspaceMenu);
                }}
              >
                …
              </button>
              {workspaceMenu && (
                <div className="note-dropdown workspace-dropdown">
                  <small>Workspace</small>
                  {workspaces
                    .filter((w) => (w.archivedAt ? showArchived : activeWorkspaces.indexOf(w) >= 7))
                    .map((w) => (
                      <button
                        key={w.id}
                        className={!isHub && w.id === workspace?.id ? "selected" : ""}
                        onClick={() => void navigate({ workspace: w.id })}
                      >
                        <strong>
                          {workspaceIcon(w.icon)} {w.name}
                          {w.archivedAt ? " · 보관됨" : ""}
                        </strong>
                        <small>{w.description}</small>
                      </button>
                    ))}
                  <label className="archived-workspace-toggle">
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={(e) => setShowArchived(e.target.checked)}
                    />
                    보관중인 Workspace 표시
                  </label>
                  <button
                    className="new-workspace"
                    onClick={() => {
                      setName("");
                      setModal("workspace");
                      setWorkspaceMenu(false);
                    }}
                  >
                    + 새 Workspace 만들기
                  </button>
                </div>
              )}
            </div>
            <button type="button" aria-label="Workspace 순서 설정" title="Workspace 순서 설정" disabled={!workspace} onClick={() => {
              // Pin the current context before a fallback workspace's position changes.
              if (!isHub && workspace && !params.get("workspace")) {
                const query = new URLSearchParams(params.toString());
                query.set("workspace", workspace.id);
                router.replace(`/notes?${query}`);
              }
              setWorkspaceMenu(false);
              setWorkspaceOrder(true);
            }}><SettingsIcon size={15}/></button>
            <button disabled={isHub} aria-label="전체 노트 검색" className="header-search" onClick={() => setSearch(true)}>
              <Search size={16} />
              <span>검색… (Ctrl + K)</span>
            </button>
            <button
              className="primary"
              aria-label="새 노트"
              disabled={isHub || !workspace || !!workspace.archivedAt}
              onClick={() => {
                setName("");
                setModal("note");
              }}
            >
              <Plus size={16} />
              <span>새 노트</span>
            </button>
            <button
              aria-label="Note System 설정"
              onClick={() => void navigate({ module: "SYSTEM_SETTINGS" })}
            >
              <SettingsIcon size={19} />
            </button>
          </header>
          {error && (
            <div className="note-global-error" role="alert">
              {error}
              <button aria-label="오류 닫기" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {!isHub && workspace?.archivedAt && (
            <div className="note-warning">
              보관된 Workspace입니다. 기록을 읽거나 설정에서 복원할 수 있습니다.
            </div>
          )}
          <div className="note-content" inert={leaving} aria-busy={leaving}>
            {isHub ? hubSettings ? <DailyHub
              key={`${date}/${hubWorkspaces.map(w => w.id).sort().join(",")}`}
              workspaces={hubWorkspaces} date={date} jump={d => void navigate({ module: "DAILY_HUB", date: d })}
              flush={flush} openOriginal={w => void navigate({ workspace: w, module: "DAILY_NOTES", date })}
              openWiki={(w, title) => void hubWiki(w, title)} settings={() => setHubSettingsOpen(true)} recent={hubRecent} scrollTarget={scrollTarget}
            /> : <p className="note-empty">데일리 허브 불러오는 중…</p> : !workspace ? (
              <p className="note-empty">Workspace 불러오는 중…</p>
            ) : noteId ? (
              <NoteDetail
                key={`${workspace.id}/${noteId}`}
                workspace={workspace}
                id={noteId}
                revision={revision}
                open={open}
                context={params.get("context") ?? undefined}
              />
            ) : selectedModule === "DAILY_NOTES" ? (
              <DailyFeed
                key={`${workspace.id}/${date}`}
                workspace={workspace}
                end={date}
                jump={(d) => void navigate({ module: "DAILY_NOTES", date: d })}
                flush={flush}
              />
            ) : ["ALL_NOTES", "RECENT_NOTES", "TRASH"].includes(selectedModule) ? (
              <Library
                key={`${workspace.id}/${selectedModule}`}
                workspace={workspace}
                module={selectedModule}
                revision={revision}
                open={open}
              />
            ) : selectedModule === "TAGS" ? (
              <TagsModule
                key={workspace.id}
                workspace={workspace}
                revision={revision}
                selected={params.get("tag") ?? undefined}
                select={(id) => void navigate({ module: "TAGS", tag: id })}
                open={open}
              />
            ) : selectedModule === "CONNECTED_NOTES" ? (
              <Connections
                key={workspace.id}
                workspace={workspace}
                revision={revision}
                open={open}
                create={openWiki}
              />
            ) : selectedModule === "GRAPH" ? (
              <GraphView
                key={workspace.id}
                workspace={workspace}
                revision={revision}
                open={open}
                create={openWiki}
              />
            ) : selectedModule === "WORKSPACE_SETTINGS" ? (
              <WorkspaceSettings
                key={`${workspace.id}-${workspace.archivedAt}`}
                workspace={workspace}
                reload={reload}
              />
            ) : selectedModule === "SYSTEM_SETTINGS" ? (
              <SystemSettings settings={settings} update={setSettings} />
            ) : (
              <p className="note-empty">왼쪽에서 모듈을 선택하세요.</p>
            )}
          </div>
          <footer className="note-footer">
            NOTE SYS
            <span>{isHub ? "데일리 허브" : workspace?.name}</span>
            <small>기록을 연결하고, 생각을 이어갑니다.</small>
          </footer>
        </div>
        {workspaceOrder && <WorkspaceOrderModal workspaces={workspaces} selectedId={workspace?.id} mainWorkspaceId={mainWorkspaceId} onMainSaved={setMainWorkspaceId} onClose={() => setWorkspaceOrder(false)} onSaved={setWorkspaces}/>}
        {hubSettingsOpen && hubSettings && <DailyHubSettings workspaces={workspaces} initial={hubSettings} flush={flush} saved={setHubSettings} close={() => setHubSettingsOpen(false)}/>}
        {search && workspace && (
          <GlobalSearch
            close={() => setSearch(false)}
            open={open}
            selectTag={(id) => void navigate({ module: "TAGS", tag: id })}
          />
        )}
        <Modal
          open={!!modal}
          onClose={() => setModal(null)}
          title={modal === "workspace" ? "새 Workspace" : "새 노트"}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim() || busy) return;
              setBusy(true);
              try {
                if (modal === "workspace") {
                  await flush();
                  const result = await notesApi.createWorkspace(name.trim());
                  await reload();
                  setHubSettings(await notesApi.dailyHubSettings());
                  setModal(null);
                  setName("");
                  await navigate({ workspace: result.id });
                } else await create(name.trim());
              } catch (err) {
                report(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input
              autoFocus
              aria-label={
                modal === "workspace" ? "새 Workspace 이름" : "새 노트 제목"
              }
              placeholder={
                modal === "workspace" ? "Workspace 이름" : "노트 제목"
              }
              maxLength={modal === "workspace" ? 120 : 240}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing && e.key === "Enter")
                  e.preventDefault();
              }}
            />
            <p className="note-muted">
              {modal === "note"
                ? "같은 Workspace의 제목과 별칭은 중복될 수 없습니다."
                : "서로 다른 Workspace의 노트는 독립적으로 관리됩니다."}
            </p>
            <Button
              type="submit"
              className="primary"
              disabled={!name.trim() || busy}
            >
              {busy ? "생성 중…" : "만들기"}
            </Button>
          </form>
        </Modal>
      </div>
    </NoteContext.Provider>
  );
}
