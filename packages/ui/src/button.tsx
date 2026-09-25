import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--cf-profit)",
    color: "var(--cf-profit-on, #fff)",
    border: "none",
  },
  secondary: {
    background: "var(--cf-ink)",
    color: "#fff",
    border: "none",
  },
  ghost: {
    background: "transparent",
    color: "var(--cf-ink)",
    border: "1px solid var(--cf-border)",
  },
  danger: {
    background: "var(--cf-loss)",
    color: "#fff",
    border: "none",
  },
};

export function Button({
  children,
  variant = "primary",
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <button
      {...props}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "12px 20px",
        borderRadius: 999,
        fontWeight: 600,
        fontSize: 15,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.55 : 1,
        ...styles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
