"use client";
import { useState } from "react";
import { notesApi } from "@/lib/api/notes";
import {
  MODULE_LABELS,
  type Workspace,
  type Settings,
} from "@/lib/notes/types";
import { useNoteEnvironment } from "./NoteContext";
export function WorkspaceSettings({
  workspace,
  reload,
}: {
  workspace: Workspace;
  reload: () => Promise<void>;
}) {
  const env = useNoteEnvironment();
  const [draft, setDraft] = useState(workspace);
  const [status, setStatus] = useState("");
  async function save(value = draft) {
    try {
      setStatus("저장 중…");
      await notesApi.updateWorkspace(value);
      await reload();
      setStatus("저장됨");
    } catch (e) {
      setStatus("저장 실패");
      env.error(e);
    }
  }
  return (
    <section className="note-module settings-module">
      <header className="module-heading">
        <div>
          <h1>Workspace 설정</h1>
          <p>워크스페이스의 기본 정보와 모듈을 관리하세요.</p>
        </div>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <section className="note-panel">
          <header>
            <h2>워크스페이스 정보</h2>
            <button className="primary">변경 사항 저장</button>
          </header>
          <div className="workspace-fields">
            <label>
              이름
              <input
                aria-label="Workspace 이름"
                maxLength={120}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing && e.key === "Enter")
                    e.preventDefault();
                }}
              />
            </label>
            <label>
              아이콘
              <select
                aria-label="Workspace 아이콘"
                value={draft.icon}
                onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
              >
                <option value="notebook">▣ 노트북</option>
                <option value="book">▤ 책</option>
                <option value="lightbulb">☀ 아이디어</option>
                <option value="leaf">♧ 성장</option>
              </select>
            </label>
            <label>
              설명
              <textarea
                aria-label="Workspace 설명"
                maxLength={1000}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
          </div>
          <small role="status">{status}</small>
        </section>
        <section className="note-panel">
          <h2>모듈 관리</h2>
          <p className="note-muted">
            활성 모듈을 선택하고 순서와 기본 진입 화면을 정하세요.
          </p>
          {draft.modules.map((m, i) => (
            <div className="module-setting-row" key={m.module}>
              <span>
                <button
                  type="button"
                  aria-label={`${MODULE_LABELS[m.module]} 위로`}
                  disabled={!i}
                  onClick={() => {
                    const modules = [...draft.modules];
                    [modules[i - 1], modules[i]] = [modules[i], modules[i - 1]];
                    setDraft({ ...draft, modules });
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`${MODULE_LABELS[m.module]} 아래로`}
                  disabled={i === 5}
                  onClick={() => {
                    const modules = [...draft.modules];
                    [modules[i + 1], modules[i]] = [modules[i], modules[i + 1]];
                    setDraft({ ...draft, modules });
                  }}
                >
                  ↓
                </button>
              </span>
              <strong>{MODULE_LABELS[m.module]}</strong>
              <label>
                <input
                  type="checkbox"
                  aria-label={`${MODULE_LABELS[m.module]} 사용`}
                  checked={m.enabled}
                  disabled={m.isDefault}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      modules: draft.modules.map((x) =>
                        x.module === m.module
                          ? { ...x, enabled: e.target.checked }
                          : x,
                      ),
                    })
                  }
                />{" "}
                사용
              </label>
              <label>
                <input
                  type="radio"
                  name="defaultModule"
                  aria-label={`${MODULE_LABELS[m.module]} 기본 진입`}
                  checked={m.isDefault}
                  disabled={!m.enabled}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      modules: draft.modules.map((x) => ({
                        ...x,
                        isDefault: x.module === m.module,
                      })),
                    })
                  }
                />{" "}
                기본 진입
              </label>
            </div>
          ))}
        </section>
      </form>
      <section className="note-panel">
        <h2>보관 및 삭제</h2>
        <p>보관한 Workspace는 나중에 복원할 수 있습니다.</p>
        <button
          onClick={() => {
            const next = {
              ...draft,
              archivedAt: workspace.archivedAt
                ? null
                : new Date().toISOString(),
            };
            setDraft(next);
            void save(next);
          }}
        >
          {workspace.archivedAt ? "Workspace 복원" : "Workspace 보관"}
        </button>
        <p className="note-muted">
          V1에서는 노트와 미디어가 없는, 보관된 Workspace만 영구 삭제할 수
          있습니다.
        </p>
        <button
          className="danger"
          disabled={!workspace.archivedAt}
          onClick={async () => {
            const confirmation = prompt(
              `영구 삭제하려면 Workspace 이름 '${workspace.name}'을 입력하세요.`,
            );
            if (confirmation !== workspace.name) return;
            try {
              await notesApi.deleteWorkspace(workspace);
              await reload();
            } catch (e) {
              env.error(e);
            }
          }}
        >
          빈 Workspace 영구 삭제
        </button>
      </section>
    </section>
  );
}
export function SystemSettings({
  settings,
  update,
}: {
  settings: Settings;
  update: (settings: Settings) => void;
}) {
  const env = useNoteEnvironment();
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState("");
  return (
    <section className="note-module settings-module">
      <header className="module-heading">
        <div>
          <h1>Note System 설정</h1>
          <p>모든 Workspace에 적용되는 공통 기본값입니다.</p>
        </div>
      </header>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setStatus("저장 중…");
            const next = await notesApi.saveSettings(draft);
            update(next);
            setStatus("저장됨");
          } catch (err) {
            setStatus("저장 실패");
            env.error(err);
          }
        }}
      >
        <section className="note-panel">
          <h2>에디터</h2>
          <label className="system-setting">
            자동저장 대기 시간
            <select
              value={draft.autosaveDelay}
              aria-label="자동저장 대기 시간"
              onChange={(e) =>
                setDraft({ ...draft, autosaveDelay: Number(e.target.value) })
              }
            >
              <option value={400}>0.4초</option>
              <option value={800}>0.8초</option>
              <option value={1500}>1.5초</option>
              <option value={3000}>3초</option>
            </select>
          </label>
          {(
            [
              ["markdownAssistance", "Markdown 입력 보조"],
              ["imagePaste", "클립보드 이미지 붙여넣기"],
              ["wikiAutocomplete", "Wiki Link 자동완성"],
              ["graphDaily", "그래프 기본값 · Daily Note 표시"],
              ["graphOrphans", "그래프 기본값 · Orphan 표시"],
            ] as const
          ).map(([key, label]) => (
            <label className="system-setting" key={key}>
              {label}
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(e) =>
                  setDraft({ ...draft, [key]: e.target.checked })
                }
              />
            </label>
          ))}
          <label className="system-setting">
            전체 검색 최대 결과
            <input
              aria-label="최대 검색 결과"
              type="number"
              min={10}
              max={100}
              value={draft.searchLimit}
              onChange={(e) =>
                setDraft({ ...draft, searchLimit: Number(e.target.value) })
              }
            />
          </label>
          <div className="system-setting">
            휴지통 보존 정책<span>자동 삭제하지 않음</span>
          </div>
          <p className="note-muted">
            에디터와 그래프 기본값은 다음에 여는 화면부터 적용됩니다.
          </p>
          <button className="primary">설정 저장</button>
          <span role="status"> {status}</span>
        </section>
      </form>
    </section>
  );
}
