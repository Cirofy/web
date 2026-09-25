"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { LifeBuoy, Mail } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPageSkeleton } from "@/components/page-skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePageReady } from "@/lib/use-page-ready";
import { apiFetch, getStoredUser, getToken } from "@/lib/api";

const topics = [
  { id: "connection", label: "Mağaza bağlantısı" },
  { id: "settlement", label: "Hakediş / sapma" },
  { id: "tariff", label: "Komisyon tarifesi" },
  { id: "billing", label: "Abonelik / fatura" },
  { id: "data", label: "Veri / senkron" },
  { id: "other", label: "Diğer" },
] as const;

type TopicId = (typeof topics)[number]["id"];

const priorities = [
  { id: "low", label: "Düşük" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "Yüksek" },
  { id: "urgent", label: "Acil" },
] as const;

type PriorityId = (typeof priorities)[number]["id"];

const macros: Array<{
  id: string;
  label: string;
  topic: TopicId;
  priority: PriorityId;
  subject: string;
  body: string;
}> = [
  {
    id: "m-settlement",
    label: "Hakediş farkı",
    topic: "settlement",
    priority: "high",
    subject: "Hakediş dönem farkı incelemesi",
    body: "Dönem: …\nMağaza: …\nBeklenen tutar: …\nGörünen tutar: …\nNot: Sapma satırlarını ve itiraz paketini kontrol ettim.",
  },
  {
    id: "m-tariff",
    label: "Tarife sapması",
    topic: "tariff",
    priority: "normal",
    subject: "Komisyon tarife sapması bildirimi",
    body: "Kanal: …\nKategori: …\nSKU: …\nMevcut komisyon %: …\nTarife %: …\nNot: Ürünler / Tarifeler ekranından sapmayı gördüm; düzeltme veya doğrulama istiyorum.",
  },
  {
    id: "m-settlement-tariff",
    label: "Hakediş + tarife",
    topic: "settlement",
    priority: "high",
    subject: "Hakediş farkı ve tarife uyumsuzluğu",
    body: "Dönem: …\nMağaza: …\nHakediş sapması: …\nTarife sapması (SKU / kategori): …\nNot: Hem hakediş hem komisyon tarifesini birlikte kontrol ettim.",
  },
  {
    id: "m-sync",
    label: "Senkron çalışmıyor",
    topic: "data",
    priority: "normal",
    subject: "Sipariş / ürün senkronu güncellenmiyor",
    body: "Son başarılı senkron: …\nMağaza: …\nBeklenen: sipariş veya ürün listesinin yenilenmesi.\nGözlem: …",
  },
  {
    id: "m-billing",
    label: "Kota / fatura",
    topic: "billing",
    priority: "high",
    subject: "Abonelik kota veya fatura sorusu",
    body: "Plan: …\nSorun: kota / fatura / yükseltme\nDetay: …",
  },
  {
    id: "m-connect",
    label: "Bağlantı hatası",
    topic: "connection",
    priority: "normal",
    subject: "Mağaza bağlantısı doğrulanamıyor",
    body: "Kanal: …\nHata mesajı: …\nNe denedim: Ayarlar → bağlantıyı doğrula",
  },
];

const faqs = [
  {
    q: "Mağaza bağlandı ama sipariş görünmüyor?",
    a: "Ayarlar’dan bağlantıyı doğrulayın, ardından senkronu tetikleyin. İlk çekim birkaç dakika sürebilir; özet ve sipariş listesi güncellenir.",
  },
  {
    q: "Net kâr neden tahmini görünüyor?",
    a: "Kargo faturası veya kesin hakediş gelmeden önce desi ve kesinti tahminleri kullanılır. Hakediş sonrası dönem farkları sapma listesinde görünür.",
  },
  {
    q: "Komisyon tarifesi ürünle uyuşmuyorsa ne yapmalıyım?",
    a: "Ürünler veya Tarifeler ekranında sapma satırlarını görün. Toplu tarife uygula ile komisyonu kategori tarifesine çekebilir; ardından fiyat motorunda net farkı kontrol edin.",
  },
  {
    q: "Hedef marjın altındaki teklifleri nasıl eleyebilirim?",
    a: "Teklif filtresi sayfasında hedef marjı girin. Kırmızı satırlar hedef altıdır; CSV yükleyerek toplu kontrol de yapılabilir.",
  },
  {
    q: "Abonelik faturamı nereden görürüm?",
    a: "Abonelik sayfasından plan, dönem ve fatura özetine ulaşırsınız. İade veya iptal için destek talebi açın.",
  },
  {
    q: "Ekip üyesi nasıl davet edilir?",
    a: "Ekip sayfasından e-posta ve rol seçerek davet gönderin. Davet kabul edilene kadar bekleyen olarak listelenir.",
  },
];

const guides = [
  { href: "/settings", title: "Mağaza bağla", blurb: "Pazaryeri kimlik bilgisi ve senkron." },
  { href: "/settlements", title: "Hakediş sapması", blurb: "Dönem farkı ve itiraz paketi." },
  { href: "/tariffs", title: "Komisyon tarifeleri", blurb: "Kategori × kanal oranları ve sapmalar." },
  { href: "/billing", title: "Abonelik", blurb: "Plan, kota ve fatura özeti." },
  { href: "/extension", title: "Eklenti köprüsü", blurb: "Buybox yakalama ve fiyat önerisi." },
];

type TicketRow = {
  id: string;
  topic: string;
  subject: string;
  status: string;
  priority?: string;
  createdAt: string;
  tags?: string[];
};

function ticketHasTariffTag(t: TicketRow) {
  if (t.topic === "tariff") return true;
  if (t.tags?.includes("tariff")) return true;
  const blob = `${t.subject}`.toLowerCase();
  return blob.includes("tarif") || blob.includes("komisyon");
}

export default function SupportPage() {
  const ready = usePageReady();
  const user = getStoredUser();
  const [topic, setTopic] = useState<TopicId>("connection");
  const [priority, setPriority] = useState<PriorityId>("normal");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tickets, setTickets] = useState<TicketRow[]>([]);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<{ items: TicketRow[] }>("/support/tickets");
        if (!cancelled && res.items?.length) setTickets(res.items);
      } catch {
        // boş liste
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function applyMacro(id: string) {
    const m = macros.find((x) => x.id === id);
    if (!m) return;
    setTopic(m.topic);
    setPriority(m.priority);
    setSubject(m.subject);
    setBody(m.body);
    setMsg(`“${m.label}” şablonu uygulandı — düzenleyip gönderin.`);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (getToken()) {
        const res = await apiFetch<{
          item: TicketRow | null;
          message?: string;
        }>("/support/tickets", {
          method: "POST",
          body: JSON.stringify({
            topic,
            subject,
            body,
            priority,
            contactEmail: email || undefined,
          }),
        });
        if (res.item) {
          setTickets((prev) => [res.item as TicketRow, ...prev].slice(0, 20));
        }
        setMsg(res.message ?? "Talebiniz alındı.");
      } else {
        setMsg("Giriş yapınca talebiniz kaydedilir. Şimdilik destek@cirofy.com adresine yazabilirsiniz.");
      }
      setSubject("");
      setBody("");
      setPriority("normal");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Talep gönderilemedi. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell
      loading={!ready}
      title="Destek"
      description="Sık sorulanlar, hızlı rehberler ve destek talebi — operasyon sorunlarını hızlı çözün."
      actions={
        <Button asChild variant="outline" size="sm">
          <a href="mailto:destek@cirofy.com">
            <Mail className="h-3.5 w-3.5" />
            E-posta
          </a>
        </Button>
      }
    >
      {!ready ? (
        <ListPageSkeleton />
      ) : (
        <>
          {msg ? (
            <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {msg}
            </div>
          ) : null}

          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Kanal</div>
                <div className="mt-2 flex items-center gap-2">
                  <LifeBuoy className="h-4 w-4 text-profit" />
                  <span className="font-semibold">Panel + e-posta</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Yanıt süresi</div>
                <div className="mt-1 font-display text-2xl font-bold">1 iş günü</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Açık talepleriniz</div>
                <div className="mt-1 font-display text-2xl font-bold">
                  {tickets.filter((t) => t.status === "open").length}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Hızlı rehber</CardTitle>
                <CardDescription>Sık ihtiyaç duyulan paneller.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {guides.map((g) => (
                  <Link
                    key={g.href}
                    href={g.href}
                    className="rounded-xl border border-border p-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="font-semibold">{g.title}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{g.blurb}</p>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Destek talebi</CardTitle>
                <CardDescription>
                  Konu seçip kısaca yazın — hesap ve mağaza bağlamı otomatik eklenir.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 space-y-1.5">
                  <div className="text-sm font-medium">Hazır şablon</div>
                  <div className="flex flex-wrap gap-2">
                    {macros.map((m) => (
                      <Button
                        key={m.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => applyMacro(m.id)}
                      >
                        {m.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <form className="space-y-4" onSubmit={onSubmit}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium" htmlFor="support-topic">
                        Konu
                      </label>
                      <Select
                        value={topic}
                        onValueChange={(v) => setTopic(v as TopicId)}
                      >
                        <SelectTrigger id="support-topic" aria-label="Konu">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {topics.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium" htmlFor="support-priority">
                        Öncelik
                      </label>
                      <Select
                        value={priority}
                        onValueChange={(v) => setPriority(v as PriorityId)}
                      >
                        <SelectTrigger id="support-priority" aria-label="Öncelik">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {priorities.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="support-email">
                      İletişim e-postası
                    </label>
                    <input
                      id="support-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="support-subject">
                      Başlık
                    </label>
                    <input
                      id="support-subject"
                      required
                      minLength={3}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Örn. Hakediş farkı incelemesi"
                      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="support-body">
                      Açıklama
                    </label>
                    <textarea
                      id="support-body"
                      required
                      minLength={10}
                      rows={5}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Ne oldu, hangi mağaza/dönem, beklediğiniz sonuç…"
                      className="w-full resize-y rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                    {busy ? "Gönderiliyor…" : "Talep gönder"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sık sorulanlar</CardTitle>
                <CardDescription>Kısa cevaplar — derin detay için talep açın.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {faqs.map((item) => (
                  <details
                    key={item.q}
                    className="group rounded-xl border border-border px-4 py-3"
                  >
                    <summary className="cursor-pointer list-none font-semibold marker:content-none">
                      {item.q}
                    </summary>
                    <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
                  </details>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Talepleriniz</CardTitle>
                <CardDescription>
                  Son gönderilen destek kayıtları.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {tickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Henüz kayıtlı talep yok.
                  </p>
                ) : (
                  tickets.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl border border-border p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">{t.subject}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {ticketHasTariffTag(t) ? (
                            <Badge tone="warn">Tarife</Badge>
                          ) : null}
                          {t.priority ? (
                            <Badge
                              tone={
                                t.priority === "urgent" || t.priority === "high"
                                  ? "loss"
                                  : t.priority === "low"
                                    ? "default"
                                    : "warn"
                              }
                            >
                              {priorities.find((p) => p.id === t.priority)?.label ??
                                t.priority}
                            </Badge>
                          ) : null}
                          <Badge tone={t.status === "open" ? "warn" : "profit"}>
                            {t.status === "open" ? "Açık" : "Kapalı"}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {topics.find((x) => x.id === t.topic)?.label ?? t.topic}
                        {" · "}
                        {new Date(t.createdAt).toLocaleString("tr-TR")}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
