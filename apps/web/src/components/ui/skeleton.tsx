import { cn } from "@/lib/utils";

type SkeletonTone = "default" | "onInk";

export function Skeleton({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: SkeletonTone }) {
  return (
    <div
      className={cn(
        "rounded-xl",
        tone === "onInk" ? "skeleton-shimmer-on-ink" : "skeleton-shimmer",
        className,
      )}
      {...props}
    />
  );
}
