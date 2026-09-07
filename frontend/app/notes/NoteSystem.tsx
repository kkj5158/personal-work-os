"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
  ChevronDown,
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
import { SharedSidebar } from "@/components/Sidebar";
import { SystemSwitcher } from "@/components/SystemSwitcher";
import { workspaceIcon } from "./WorkspaceIconPicker";

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

  const [search, setSearch] = useState(false);
  const [modal, setModal] = useState<"note" | "workspace" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
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
    for (const q of queues.current.values()) await q.flush();
  }, []);
  const reload = useCallback(async () => {
    const rows = await notesApi.workspaces();
    setWorkspaces(rows);
  }, []);
  useEffect(() => {
    Promise.all([reload(), notesApi.settings().then(setSettings)]).catch(
      report,
    );
  }, [reload, report]);
  const workspace =
    workspaces.find((w) => w.id === params.get("workspace")) ??
    workspaces.find(
      (w) =>
        !w.archivedAt && w.name === (params.get("workspaceName") ?? "JISEUNG"),
    ) ??
    workspaces.find((w) => !w.archivedAt) ??
    workspaces[0];
  const requestedModule =
    params.get("module") ??
    workspace?.modules.find((m) => m.isDefault)?.module ??
    "DAILY_NOTES";
  useEffect(() => () => clearMediaCache(), [workspace?.id]);
  const module =
    requestedModule in MODULE_LABELS &&
    !workspace?.modules.some((m) => m.module === requestedModule && m.enabled)
      ? (workspace?.modules.find((m) => m.isDefault)?.module ?? "DAILY_NOTES")
      : requestedModule;
  const noteId = params.get("note");
  const date = validLocalDate(params.get("date"))
    ? params.get("date")!
    : today();
  async function navigate(values: Record<string, string>) {
    try {
      await flush();
      setError("");
      const query = new URLSearchParams({
        workspace: workspace?.id ?? "",
        ...values,
      });
      router.push(`/notes?${query}`);
      setWorkspaceMenu(false);
    } catch (e) {
      report(e);
    }
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
        setSearch((value) => !value);
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
  }, []);
  const environment = {
    workspace: workspace?.id ?? "",
    settings,
    openWiki: (title: string) => void openWiki(title),
    error: report,
    register,
    changed,
  };
  return (
    <NoteContext.Provider value={environment}>
      <div className="note-system">
        <SharedSidebar
          system="NOTE SYS"
          beforeLogout={flush}
          navigate={(destination) => void navigate({ module: destination })}
          groups={[
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
                  active: !noteId && module === m.module,
                  destination: m.module,
                })),
            })),
            {
              section: "SYSTEM",
              items: [
                {
                  label: "휴지통",
                  icon: Trash2,
                  active: !noteId && module === "TRASH",
                  destination: "TRASH",
                },
                {
                  label: "Workspace 설정",
                  icon: SettingsIcon,
                  active: module === "WORKSPACE_SETTINGS",
                  destination: "WORKSPACE_SETTINGS",
                },
              ],
            },
          ]}
        />
        <div className="note-shell">
          <header className="note-topbar">
            <SystemSwitcher
              system="NOTE SYS"
              beforeNavigate={async () => {
                try {
                  await flush();
                } catch (error) {
                  report(error);
                  throw error;
                }
              }}
            />
            <span className="header-divider" />
            <div className="switcher-container">
              <button
                aria-label="Workspace 전환"
                className="workspace-switcher"
                onClick={() => {
                  setWorkspaceMenu(!workspaceMenu);
                }}
              >
                <span>{workspaceIcon(workspace?.icon ?? "notebook")}</span>
                {workspace?.name ?? "불러오는 중"}
                <ChevronDown size={14} />
              </button>
              {workspaceMenu && (
                <div className="note-dropdown workspace-dropdown">
                  <small>Workspace</small>
                  {workspaces
                    .filter((w) => showArchived || !w.archivedAt)
                    .map((w) => (
                      <button
                        key={w.id}
                        className={w.id === workspace?.id ? "selected" : ""}
                        onClick={() => void navigate({ workspace: w.id })}
                      >
                        <strong>
                          {w.name}
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
            <button aria-label="전체 노트 검색" className="header-search" onClick={() => setSearch(true)}>
              <Search size={16} />
              <span>검색… (Ctrl + K)</span>
            </button>
            <button
              className="primary"
              aria-label="새 노트"
              disabled={!workspace || !!workspace.archivedAt}
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
          {workspace?.archivedAt && (
            <div className="note-warning">
              보관된 Workspace입니다. 기록을 읽거나 설정에서 복원할 수 있습니다.
            </div>
          )}
          <div className="note-content">
            {!workspace ? (
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
            ) : module === "DAILY_NOTES" ? (
              <DailyFeed
                key={`${workspace.id}/${date}`}
                workspace={workspace}
                end={date}
                jump={(d) => void navigate({ module: "DAILY_NOTES", date: d })}
                flush={flush}
              />
            ) : ["ALL_NOTES", "RECENT_NOTES", "TRASH"].includes(module) ? (
              <Library
                key={`${workspace.id}/${module}`}
                workspace={workspace}
                module={module}
                revision={revision}
                open={open}
              />
            ) : module === "TAGS" ? (
              <TagsModule
                key={workspace.id}
                workspace={workspace}
                revision={revision}
                selected={params.get("tag") ?? undefined}
                select={(id) => void navigate({ module: "TAGS", tag: id })}
                open={open}
              />
            ) : module === "CONNECTED_NOTES" ? (
              <Connections
                key={workspace.id}
                workspace={workspace}
                revision={revision}
                open={open}
                create={openWiki}
              />
            ) : module === "GRAPH" ? (
              <GraphView
                key={workspace.id}
                workspace={workspace}
                revision={revision}
                open={open}
                create={openWiki}
              />
            ) : module === "WORKSPACE_SETTINGS" ? (
              <WorkspaceSettings
                key={`${workspace.id}-${workspace.archivedAt}`}
                workspace={workspace}
                reload={reload}
              />
            ) : module === "SYSTEM_SETTINGS" ? (
              <SystemSettings settings={settings} update={setSettings} />
            ) : (
              <p className="note-empty">왼쪽에서 모듈을 선택하세요.</p>
            )}
          </div>
          <footer className="note-footer">
            NOTE SYS
            <span>{workspace?.name}</span>
            <small>기록을 연결하고, 생각을 이어갑니다.</small>
          </footer>
        </div>
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
