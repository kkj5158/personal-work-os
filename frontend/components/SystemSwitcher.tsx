"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Settings2 } from "lucide-react";
import { useSystemOrder } from "./SystemOrder";
import { moveSystem } from "@/lib/systemOrder";
import { useRouter } from "next/navigation";
import { useGlobalTabs } from "./GlobalTabs";
import {
  BriefcaseBusiness,
  NotebookPen,
  CalendarDays,
  ChevronDown,
  Check,
  Leaf,
  HeartPulse,
  ListTodo,
  Feather,
  Wallet,
  SquareCheckBig,
} from "lucide-react";

const systems = [
  { id: "money", name: "MONEY SYS", href: "/money", Icon: Wallet },
  { id: "work", name: "WORK OS", href: "/worklog", Icon: BriefcaseBusiness },
  { id: "notes", name: "NOTE SYS", href: "/notes", Icon: NotebookPen },
  { id: "diet", name: "DIET SYS", href: "/diet", Icon: HeartPulse },
  { id: "life", name: "LIFE CODE", href: "/life/categories", Icon: Leaf },
  { id: "calendar", name: "Calendar", href: "/calendar", Icon: CalendarDays },
  { id: "workflow", name: "WORK FLOW", href: "/workflow/today", Icon: ListTodo },
  { id: "authoring", name: "AUTHORING", href: "/authoring", Icon: Feather },
  { id: "checklist", name: "CHECKLIST SYS", href: "/checklist", Icon: SquareCheckBig },
] as const;

export type SystemName = (typeof systems)[number]["name"];

export function SystemSwitcher({
  system = "WORK OS",
  beforeNavigate,
  navigate,
  compact = false,
}: {
  system?: SystemName;
  beforeNavigate?: () => Promise<void>;
  /** Replaces the default push when the host owns its own leave guard (Calendar's unsaved Actual editor). */
  navigate?: (href: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const order = useSystemOrder();
  const orderedSystems = order ? order.order.flatMap(id => systems.filter(item => item.id === id)) : systems;
  const router = useRouter();
  const shell = useGlobalTabs();
  const { Icon } = systems.find((item) => item.name === system)!;
  return (
    <div
      className="app-system-switcher"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label="시스템 전환"
        aria-expanded={open}
        title={compact ? `${system} · 시스템 전환` : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <Icon size={23} strokeWidth={1.75} />
        {!compact && <><strong>{system}</strong><ChevronDown size={14} /></>}
      </button>
      {open && (
        <div className="app-system-menu">
          {orderedSystems.map(({ name, href, Icon: RowIcon }) => (
            <button
              key={name}
              type="button"
              aria-current={name === system ? "true" : undefined}
              title="Ctrl/Cmd 클릭으로 새 탭으로 열기"
              onClick={async (event) => {
                if (shell && (name !== system || event.ctrlKey || event.metaKey)) {
                  shell.navigate(href, { newTab: event.ctrlKey || event.metaKey });
                  setOpen(false);
                  return;
                }
                if (name !== system) {
                  if (navigate) {
                    setOpen(false);
                    navigate(href);
                    return;
                  }
                  await beforeNavigate?.();
                  router.push(href);
                }
                setOpen(false);
              }}
            >
              <RowIcon size={20} />
              <span>{name}</span>
              {name === system && <Check size={15} />}
            </button>
          ))}
          {order && <button type="button" onClick={() => { setOpen(false); setSettings(true); }}><Settings2 size={18}/><span>시스템 순서 설정</span></button>}
        </div>
      )}
      {settings && <SystemOrderDialog onClose={() => setSettings(false)}/>}
    </div>
  );
}

function SystemOrderRow({ id, disabled }: { id: string; disabled: boolean }) {
  const item = systems.find(row => row.id === id)!;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled });
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
    <button type="button" disabled={disabled} aria-label={`${item.name} 순서 이동`} {...attributes} {...listeners}><GripVertical size={18}/></button>
    <item.Icon size={20}/><span>{item.name}</span>
  </li>;
}

function SystemOrderDialog({ onClose }: { onClose: () => void }) {
  const order = useSystemOrder()!;
  const dialog = useRef<HTMLDialogElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  useEffect(() => {
    const element = dialog.current!, previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="system-order-dialog" aria-labelledby="system-order-title" onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }} onCancel={onClose}>
    <header><h2 id="system-order-title">시스템 순서 설정</h2><button type="button" onClick={onClose} aria-label="시스템 순서 설정 닫기">×</button></header>
    <p>핸들을 드래그하거나 Space와 방향키로 이동하세요. 변경하면 자동 저장됩니다.</p>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over && active.id !== over.id) order.save(moveSystem(order.order, String(active.id), String(over.id))); }}>
      <SortableContext items={order.order} strategy={verticalListSortingStrategy}><ul>{order.order.map(id => <SystemOrderRow key={id} id={id} disabled={!order.loaded}/>)}</ul></SortableContext>
    </DndContext>
    <div role="status">{order.saving ? "저장 중…" : order.error ? "" : order.loaded ? "저장됨" : "불러오는 중…"}</div>
    {order.error && <div role="alert">{order.error}<button type="button" onClick={order.retry}>다시 시도</button></div>}
    <button type="button" disabled={!order.loaded} onClick={() => order.save([])}>기본 순서로 초기화</button>
  </dialog>, document.body);
}
