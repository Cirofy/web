import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "profit" | "loss" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "default" && "bg-muted text-muted-foreground",
        tone === "profit" && "bg-profit-soft text-profit",
        tone === "loss" && "bg-loss/10 text-loss",
        tone === "warn" && "bg-amber-100 text-amber-800",
        className,
      )}
      {...props}
    />
  );
}
