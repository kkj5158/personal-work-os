"use client";
import { useEffect, useRef, useState } from "react";
import { IDENTITY_COLORS } from "@/lib/checklist-sys/model";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Identity representative color: a swatch button opening a small popover with the
 * presets and a custom color (native picker + hex). Any #rrggbb persists as-is.
 */
export function ColorPicker({ value, onChange, label }: { value: string; onChange: (color: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", escape); };
  }, [open]);
  const pick = (color: string) => { setHex(color); onChange(color.toLowerCase()); };
  const custom = !IDENTITY_COLORS.includes(value.toLowerCase());
  return (
    <span className="cks-colorpick" ref={host}>
      <button type="button" className="cks-swatch" aria-label={`${label} 색상 ${value}`} aria-haspopup="dialog" aria-expanded={open} style={{ background: value }}
        onClick={() => { setHex(value); setOpen(!open); }} />
      {open && (
        <span className="cks-colorpop" role="dialog" aria-label={`${label} 대표 색상`}>
          <span className="cks-colorpop-title">프리셋</span>
          <span className="cks-colorpop-grid">
            {IDENTITY_COLORS.map(color => <button key={color} type="button" aria-label={`색상 ${color}`} aria-pressed={value.toLowerCase() === color} style={{ background: color }} onClick={() => pick(color)} />)}
          </span>
          <span className="cks-colorpop-title">사용자 색상</span>
          <span className="cks-colorpop-custom">
            <input type="color" aria-label="사용자 색상 선택" value={HEX.test(hex) ? hex : value} onChange={e => pick(e.target.value)} />
            <input type="text" aria-label="색상 코드" maxLength={7} value={hex} spellCheck={false}
              onChange={e => { const next = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`; setHex(next); if (HEX.test(next)) onChange(next.toLowerCase()); }} />
            {custom && <span className="cks-colorpop-note">사용자 색상</span>}
          </span>
        </span>
      )}
    </span>
  );
}
