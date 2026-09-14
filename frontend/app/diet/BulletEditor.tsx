"use client";

import { useRef } from "react";

export default function BulletEditor({ value, onChange, label = "메모" }: { value: string[]; onChange: (items: string[]) => void; label?: string }) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const items = value.length ? value : [""];
  const focus = (index: number) => requestAnimationFrame(() => inputs.current[index]?.focus());
  return <fieldset className="dp-bullet-editor"><legend>{label}</legend>
    {items.map((item, index) => <div key={index} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <span aria-hidden="true">•</span><input ref={node => { inputs.current[index] = node; }} aria-label={`${label} 항목 ${index + 1}`} value={item}
        onChange={e => onChange(items.map((text, i) => i === index ? e.target.value : text))}
        onKeyDown={e => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          const start = e.currentTarget.selectionStart ?? item.length;
          const end = e.currentTarget.selectionEnd ?? start;
          onChange([...items.slice(0, index), item.slice(0, start), item.slice(end), ...items.slice(index + 1)]);
          focus(index + 1);
        }} style={{ flex: 1, minWidth: 0 }} />
      <button type="button" aria-label={`${label} 항목 ${index + 1} 삭제`} onClick={() => { onChange(items.filter((_, i) => i !== index)); focus(Math.max(0, index - 1)); }}>×</button>
    </div>)}
    <button type="button" onClick={() => { onChange([...items, ""]); focus(items.length); }}>+ 항목</button>
  </fieldset>;
}
