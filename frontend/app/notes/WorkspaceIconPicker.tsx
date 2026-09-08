"use client";
import { useState } from "react";
const categories = [
  ["개발 · 연구", "💻 🖥️ ⌨️ 🛠️ ⚙️ 🧪 🔬 🔭 🧬 📡 🤖 🚀"],
  ["읽기 · 쓰기 · 배움", "📚 📖 📓 📝 ✍️ 🖋️ 📰 🎓 🏫 🧠 🗂️ 🗃️"],
  ["프로젝트 · 업무", "💼 📋 📅 🗓️ 🎯 📊 📈 🧭 🏗️ 🧩 📦 🏷️"],
  ["일상 · 건강 · 성장", "🏡 ☕ 🌱 🌿 🌳 🌻 🍀 🏃 🧘 💪 ❤️ 🌈"],
  ["아이디어 · 창작", "💡 ✨ 🌟 🎨 🖌️ 🎬 🎵 🎸 📷 🎭 💎 🌌"],
] as const;
export function workspaceIcon(value: string) {
  return (
    (
      { notebook: "📓", book: "📚", lightbulb: "💡", leaf: "🌱" } as Record<
        string,
        string
      >
    )[value] ?? value
  );
}
export function WorkspaceIconPicker({
  value,
  change,
}: {
  value: string;
  change: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  return (
    <div className="workspace-icon-picker">
      <button
        type="button"
        aria-label="Workspace 아이콘"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {workspaceIcon(value)} <span>아이콘 선택</span>
      </button>
      {open && (
        <div
          className="workspace-icon-popover"
          role="dialog"
          aria-label="Workspace 아이콘 선택"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <input
            autoFocus
            aria-label="아이콘 카테고리 검색"
            placeholder="개발, 건강, 창작…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {categories
            .filter(([name, icons]) =>
              `${name} ${icons}`.includes(query.trim()),
            )
            .map(([name, icons]) => (
              <section key={name}>
                <h3>{name}</h3>
                <div>
                  {icons.split(" ").map((icon) => (
                    <button
                      type="button"
                      key={icon}
                      aria-label={`${name} ${icon}`}
                      aria-pressed={workspaceIcon(value) === icon}
                      onClick={() => {
                        change(icon);
                        setOpen(false);
                      }}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          <button type="button" onClick={() => setOpen(false)}>
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
