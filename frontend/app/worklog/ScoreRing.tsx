const STROKE_WIDTH = 3;

interface ScoreRingProps {
  score: number | null;
  size?: number;
}

// Circular progress ring shown beside (never inside) the numeric score.
// Per spec §6: never render "/ 100" or a star icon anywhere near a score.
export function ScoreRing({ score, size = 20 }: ScoreRingProps) {
  if (score == null) {
    return <span aria-hidden style={{ width: size, height: size }} className="inline-block shrink-0" />;
  }

  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`점수 ${score}점`}
      className="shrink-0"
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-muted)" strokeWidth={STROKE_WIDTH} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--primary-emphasis)"
        strokeWidth={STROKE_WIDTH}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
