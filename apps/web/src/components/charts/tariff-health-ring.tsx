"use client";

import { cn } from "@/lib/utils";

/** 0–100 tarife sağlık skoru — SVG halka */
export function TariffHealthRing({
  score,
  size = 112,
  className,
  label = "Tarife sağlığı",
}: {
  score: number;
  size?: number;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  const tone =
    clamped >= 80 ? "text-profit" : clamped >= 55 ? "text-amber-700" : "text-loss";
  const track =
    clamped >= 80
      ? "stroke-[hsl(var(--profit))]"
      : clamped >= 55
        ? "stroke-amber-500"
        : "stroke-[hsl(var(--loss))]";

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-muted"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className={track}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-display text-2xl font-bold tabular-nums", tone)}>
            {clamped}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground">/100</span>
        </div>
      </div>
      <div className="text-center text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}
