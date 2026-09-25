"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, ChevronRight, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotificationsPanelSkeleton } from "@/components/page-skeletons";
import { cn } from "@/lib/utils";
import { apiFetch, getToken } from "@/lib/api";

type Notif = {
  id: string;
  title: string;
  body: string;
  tone: "profit" | "loss" | "warn";
  href: string;
  actionLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  time: string;
  readAt?: string | null;
  kind?: string;
  priority?: number;
  priorityLabel?: string | null;
};

function toneLabel(tone: "profit" | "loss" | "warn") {
  if (tone === "profit") return "Bilgi";
  if (tone === "loss") return "Kritik";
  return "Dikkat";
}

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await apiFetch<{ items: Notif[]; unread: number }>(
        "/notifications",
      );
      if (res.items?.length) setItems(res.items);
    } catch {
      // bildirim yüklenemedi — boş kalır
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    void load();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => setReady(true), 350);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(id);
    };
  }, [open, load]);

  const unread = items.filter((n) => !n.readAt && n.tone !== "profit").length;

  async function markRead(id: string) {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    if (!getToken()) return;
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "POST" });
    } catch {
      // yerel okundu kalsın
    }
  }

  async function markAll() {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    if (!getToken()) return;
    try {
      await apiFetch("/notifications/read-all", { method: "POST" });
    } catch {
      // yok say
    }
  }

  async function runScan() {
    if (!getToken()) {
      setScanNote("Tarama için giriş yapın.");
      return;
    }
    setScanning(true);
    setScanNote(null);
    try {
      const res = await apiFetch<{ emitted?: number; message?: string }>(
        "/notifications/scan",
        { method: "POST" },
      );
      await load();
      setScanNote(res.message ?? `${res.emitted ?? 0} olay güncellendi.`);
    } catch (err) {
      setScanNote(err instanceof Error ? err.message : "Tarama başarısız.");
    } finally {
      setScanning(false);
    }
  }

  const panel =
    open && mounted
      ? createPortal(
          <div className="fixed inset-0 z-[60]" role="presentation">
            <button
              type="button"
              aria-label="Bildirimleri kapat"
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="notifications-title"
              className={cn(
                "absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-card shadow-xl",
              )}
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-4">
                <div>
                  <div
                    id="notifications-title"
                    className="font-display text-lg font-bold tracking-tight"
                  >
                    Bildirimler
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Uyarıdan ilgili kayda tek dokunuş
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={scanning}
                    onClick={() => void runScan()}
                    aria-label={scanning ? "Yenileniyor" : "Yenile"}
                    title={scanning ? "Yenileniyor…" : "Yenile"}
                  >
                    <RefreshCw
                      className={`h-4 w-4${scanning ? " animate-spin" : ""}`}
                    />
                  </Button>
                  {unread > 0 ? (
                    <Button variant="ghost" size="sm" onClick={() => void markAll()}>
                      Tümünü oku
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Kapat"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {scanNote ? (
                <div className="shrink-0 border-b border-border px-4 py-2 text-xs text-muted-foreground">
                  {scanNote}
                </div>
              ) : null}
              {!ready ? (
                <NotificationsPanelSkeleton />
              ) : items.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                  Henüz bildirim yok.
                </div>
              ) : (
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  {items.map((n) => (
                    <article
                      key={n.id}
                      className={cn(
                        "rounded-xl border border-border bg-background p-4",
                        n.readAt ? "opacity-70" : undefined,
                      )}
                    >
                      <div className="mb-1.5 flex items-start justify-between gap-3">
                        <h3 className="text-sm font-semibold text-foreground">{n.title}</h3>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          {n.priorityLabel ? (
                            <Badge tone="warn">{n.priorityLabel}</Badge>
                          ) : n.kind === "tariff" && !n.readAt ? (
                            <Badge tone="warn">Tarife · öncelikli</Badge>
                          ) : null}
                          <Badge tone={n.tone}>{toneLabel(n.tone)}</Badge>
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">{n.body}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">{n.time}</div>
                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                          {n.secondaryHref && n.secondaryLabel ? (
                            <Link
                              href={n.secondaryHref}
                              onClick={() => {
                                void markRead(n.id);
                                setOpen(false);
                              }}
                              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                            >
                              {n.secondaryLabel}
                            </Link>
                          ) : null}
                          <Link
                            href={n.href}
                            onClick={() => {
                              void markRead(n.id);
                              setOpen(false);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-profit hover:underline"
                          >
                            {n.actionLabel}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </aside>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        aria-label="Bildirimler"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="relative"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-loss" aria-hidden />
        ) : null}
      </Button>
      {panel}
    </>
  );
}
