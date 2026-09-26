import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  delta,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number;
  tone?: "neutral" | "profit" | "loss";
  icon: LucideIcon;
}) {
  const up = typeof delta === "number" ? delta >= 0 : null;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-muted-foreground">{label}</div>
            <div
              className={cn(
                "mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl",
                tone === "profit" && "text-profit",
                tone === "loss" && "text-loss",
              )}
            >
              {value}
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <Icon className="h-5 w-5 text-foreground/80" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs">
          {typeof delta === "number" ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold",
                up ? "bg-profit-soft text-profit" : "bg-loss/10 text-loss",
              )}
            >
              {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              %{Math.abs(delta).toLocaleString("tr-TR")}
            </span>
          ) : null}
          {hint ? <span className="text-muted-foreground">{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
