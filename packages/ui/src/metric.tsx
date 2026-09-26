import type { ReactNode } from "react";

export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "neutral" | "profit" | "loss";
}) {
  const color =
    tone === "profit"
      ? "var(--cf-profit-dark)"
      : tone === "loss"
        ? "var(--cf-loss)"
        : "var(--cf-ink)";

  return (
    <div
      style={{
        background: "var(--cf-surface-elevated)",
        border: "1px solid var(--cf-border)",
        borderRadius: "var(--cf-radius-lg)",
        padding: "20px 22px",
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "var(--cf-ink-muted)",
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--cf-font-display)",
          fontSize: 28,
          fontWeight: 700,
          color,
          letterSpacing: "-0.03em",
        }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--cf-ink-muted)" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
