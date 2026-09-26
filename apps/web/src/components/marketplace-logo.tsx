import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MarketplaceName = "Trendyol" | "Hepsiburada" | string;

function normalizeMarketplace(raw: string): "trendyol" | "hepsiburada" | null {
  const u = raw.trim().toLowerCase();
  if (u === "trendyol" || u === "ty" || u === "tre") return "trendyol";
  if (u === "hepsiburada" || u === "hb" || u === "hepsi") return "hepsiburada";
  return null;
}

/**
 * Kaynak dizin: `apps/web/public/marketplaces/*.svg`
 * URL: `/marketplaces/{slug}.svg`
 */
const LOGO: Record<
  "trendyol" | "hepsiburada",
  { src: string; alt: string; aspect: number }
> = {
  trendyol: {
    src: "/marketplaces/trendyol.svg",
    alt: "Trendyol",
    aspect: 128 / 28,
  },
  hepsiburada: {
    src: "/marketplaces/hepsiburada.svg",
    alt: "Hepsiburada",
    aspect: 148 / 28,
  },
};

/** Kanal / pazaryeri logosu — filtre chip ve tablo hücreleri (SVG) */
export function MarketplaceLogo({
  marketplace,
  className,
  height = 16,
}: {
  marketplace: MarketplaceName | null | undefined;
  className?: string;
  height?: number;
}) {
  if (!marketplace) {
    return <span className={cn("text-sm text-muted-foreground", className)}>—</span>;
  }
  const key = normalizeMarketplace(String(marketplace));
  if (!key) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>
        {marketplace}
      </span>
    );
  }
  const logo = LOGO[key];
  const width = Math.round(logo.aspect * height);

  return (
    // SVG: next/image yerine img — CSP / optimize kısıtı yok
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logo.src}
      alt={logo.alt}
      width={width}
      height={height}
      className={cn("inline-block object-contain object-left", className)}
      draggable={false}
    />
  );
}

/** Filtre satırı: Tümü | Trendyol logo | Hepsiburada logo */
export function MarketplaceChannelFilter({
  value,
  onChange,
  className,
  variant = "segment",
  extra,
}: {
  value: "all" | "Trendyol" | "Hepsiburada";
  onChange: (v: "all" | "Trendyol" | "Hepsiburada") => void;
  className?: string;
  variant?: "segment" | "buttons";
  extra?: ReactNode;
}) {
  const items = [
    { id: "all" as const, label: "Tümü" },
    { id: "Trendyol" as const, label: "Trendyol" },
    { id: "Hepsiburada" as const, label: "Hepsiburada" },
  ];

  if (variant === "buttons") {
    return (
      <div className={cn("flex flex-wrap gap-2", className)}>
        {items.map((item) => {
          const active = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              aria-label={item.label}
              onClick={() => onChange(item.id)}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-xl border px-2.5 transition-colors",
                item.id === "all" && active
                  ? "border-transparent bg-profit text-white"
                  : active
                    ? "border-profit bg-card ring-1 ring-profit/40"
                    : "border-border bg-card text-foreground hover:bg-muted/40",
              )}
            >
              {item.id === "all" ? (
                <span className="px-1 text-sm font-semibold">Tümü</span>
              ) : (
                <MarketplaceLogo marketplace={item.id} height={15} />
              )}
            </button>
          );
        })}
        {extra}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-xl border border-border bg-card p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            aria-label={item.label}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-lg px-2 transition-colors",
              item.id === "all" && active
                ? "bg-foreground text-background"
                : active
                  ? "bg-muted"
                  : "hover:bg-muted/50",
            )}
          >
            {item.id === "all" ? (
              <span className="px-1 text-xs font-semibold">Tümü</span>
            ) : (
              <MarketplaceLogo marketplace={item.id} height={13} />
            )}
          </button>
        );
      })}
      {extra}
    </div>
  );
}
