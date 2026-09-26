"use client";
import { type Period, presetPeriod, shiftPeriod } from "@/lib/money/period";
export function MoneyPeriod({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="money-period">
      <div className="money-period-presets">
        <button
          aria-label="이전 기간"
          onClick={() => onChange(shiftPeriod(value, -1))}
        >
          ←
        </button>
        {(
          [
            ["week", "1주"],
            ["month", "1개월"],
            ["quarter", "분기"],
            ["half", "6개월"],
            ["year", "1년"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            aria-pressed={value.preset === id}
            onClick={() => onChange(presetPeriod(id))}
          >
            {label}
          </button>
        ))}
        <button
          aria-label="다음 기간"
          onClick={() => onChange(shiftPeriod(value, 1))}
        >
          →
        </button>
      </div>
      <details>
        <summary>기간 직접 선택</summary>
        <label>
          시작일
          <input
            type="date"
            aria-label="시작일"
            value={value.from}
            max={value.to}
            onChange={(e) => {
              if (e.target.value && e.target.value <= value.to)
                onChange({ ...value, preset: "custom", from: e.target.value });
            }}
          />
        </label>
        <label>
          종료일
          <input
            type="date"
            aria-label="종료일"
            value={value.to}
            min={value.from}
            onChange={(e) => {
              if (e.target.value && e.target.value >= value.from)
                onChange({ ...value, preset: "custom", to: e.target.value });
            }}
          />
        </label>
      </details>
      <p data-testid="effective-period">
        {value.from} — {value.to}
      </p>
    </div>
  );
}
