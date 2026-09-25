import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({
  size = 36,
  className,
  priority,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="Cirofy"
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

export function BrandMark({
  size = 36,
  showWordmark = true,
  wordmarkClassName,
  className,
}: {
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandLogo size={size} />
      {showWordmark ? (
        <span
          className={cn(
            "font-display font-bold tracking-tight text-foreground",
            wordmarkClassName,
          )}
        >
          Cirofy
        </span>
      ) : null}
    </span>
  );
}
