"use client";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type TabMenuAction = "close" | "closeOthers" | "closeRight" | "pin" | "duplicate" | "newWindow";
export type TabMenuAnchor = { tabId: string; x: number; y: number; trigger: HTMLElement };

/** Shell menu presentation only; all tab mutations live in the tab model. */
export function GlobalTabContextMenu({ anchor, pinned, onAction, onClose }: {
  anchor: TabMenuAnchor;
  pinned: boolean;
  onAction: (action: TabMenuAction) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menu.current!;
    const position = () => {
      const box = element.getBoundingClientRect();
      element.style.left = `${Math.max(8, Math.min(anchor.x, window.innerWidth - box.width - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - box.height - 8))}px`;
    };
    position();
    element.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => { if (!element.contains(event.target as Node)) onClose(); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); onClose();
        if (anchor.trigger.isConnected) anchor.trigger.focus();
      } else if (event.key === "Tab") onClose();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard, true);
    window.addEventListener("resize", position);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("resize", position);
    };
  }, [anchor, onClose]);
  const commands: [TabMenuAction, string][] = [
    ["close", "탭 닫기"], ["closeOthers", "다른 탭 닫기"], ["closeRight", "오른쪽 탭 닫기"],
    ["pin", pinned ? "탭 고정 해제" : "탭 고정"], ["duplicate", "탭 복제"], ["newWindow", "새 창에서 열기"],
  ];
  return createPortal(<div ref={menu} className="orbit-tab-context-menu" role="menu" aria-label="탭 메뉴" onKeyDown={event => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }}>{commands.map(([action, label]) => <button key={action} type="button" role="menuitem" onClick={() => onAction(action)}>{label}</button>)}</div>, document.body);
}
