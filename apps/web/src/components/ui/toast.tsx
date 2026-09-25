"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "default" | "profit" | "warn" | "loss";

type ToastItem = {
  id: string;
  title?: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
};

type ToastInput = {
  message: string;
  title?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastContextValue = {
  toast: (input: string | ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let pushToast: ((input: string | ToastInput) => void) | null = null;

/** Sayfa bileşenlerinden doğrudan çağrı — provider şart. */
export function toast(input: string | ToastInput) {
  if (!pushToast) {
    // eslint-disable-next-line no-console
    console.warn("ToastProvider henüz hazır değil");
    return;
  }
  pushToast(input);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (input: string | ToastInput) => {
      const normalized =
        typeof input === "string"
          ? { message: input, tone: "default" as const, durationMs: 4200 }
          : {
              message: input.message,
              title: input.title,
              tone: input.tone ?? "default",
              durationMs: input.durationMs ?? 4200,
            };
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => [
        ...prev.slice(-4),
        {
          id,
          title: normalized.title,
          message: normalized.message,
          tone: normalized.tone,
          durationMs: normalized.durationMs,
        },
      ]);
    },
    [],
  );

  useEffect(() => {
    pushToast = add;
    return () => {
      if (pushToast === add) pushToast = null;
    };
  }, [add]);

  const value = useMemo(() => ({ toast: add }), [add]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 pb-[env(safe-area-inset-bottom)] sm:bottom-6 sm:right-6"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast ToastProvider içinde kullanılmalı");
  return ctx;
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const id = window.setTimeout(() => onDismiss(item.id), item.durationMs);
    return () => window.clearTimeout(id);
  }, [item.id, item.durationMs, onDismiss]);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto rounded-xl border bg-card px-4 py-3 shadow-soft",
        "motion-safe:animate-[toast-in_180ms_ease-out]",
        item.tone === "profit" && "border-profit/25",
        item.tone === "warn" && "border-amber-200",
        item.tone === "loss" && "border-loss/30",
        item.tone === "default" && "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {item.title ? (
            <div className="text-sm font-semibold text-foreground">{item.title}</div>
          ) : null}
          <p
            className={cn(
              "text-sm leading-snug text-muted-foreground",
              item.title && "mt-0.5",
              !item.title && "text-foreground",
            )}
          >
            {item.message}
          </p>
        </div>
        <button
          type="button"
          aria-label="Kapat"
          className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onDismiss(item.id)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
