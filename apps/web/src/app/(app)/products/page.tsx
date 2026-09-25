"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Pencil, Percent, Search, Upload } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPct, formatTry } from "@/lib/utils";
import { usePageReady } from "@/lib/use-page-ready";
import { ListPageSkeleton } from "@/components/page-skeletons";
import { estimateMargin, hasEnteredCost } from "@/lib/profit-utils";
import { parseCostXml, costXmlTemplate } from "@/lib/cost-xml";
import { apiFetch, getToken } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { MarketplaceChannelFilter, MarketplaceLogo } from "@/components/marketplace-logo";
import { PaginationBar, paginateSlice } from "@/components/pagination-bar";
import {
  loadTariffMismatches,
  type TariffMismatchRow,
} from "@/lib/tariff-mismatches";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CatalogProduct = {
  id: string;
  title: string;
  sku: string;
  barcode: string;
  brand: string;
  returnRatePct: number;
  category: string;
  costPrice: number;
  costVatRate: number;
  desi: number;
  salePrice: number;
  commissionRate: number;
  shippingCost: number;
  stock: number;
  isActive: boolean;
  marketplace: string;
};

type ApiProduct = {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  category: string | null;
  returnRatePct: number;
  stockQty: number | null;
  costPrice: number;
  costVatRate?: number;
  desi?: number;
  salePrice: number;
  commissionRate: number;
  shippingCost: number;
  isActive: boolean;
  storeId?: string | null;
  needsCategory?: boolean;
  store: { id?: string; name: string; marketplace: string } | null;
};

type ProductEdit = {
  costPrice: number;
  costVatRate: number;
  desi: number;
  commissionRatePct: number;
};

type ImportPreviewRow = {
  sku: string;
  barcode: string;
  costPrice: number | null;
  costVatRate: number | null;
  desi: number | null;
  commissionRatePct: number | null;
  productId?: string;
  title?: string;
  matched: boolean;
};

type ImportPreview = {
  source: "csv" | "xml";
  rows: ImportPreviewRow[];
  matched: number;
  missed: number;
};

function mapApiProduct(p: ApiProduct): CatalogProduct {
  const mp = p.store?.marketplace ?? "";
  const marketplace =
    mp === "HEPSIBURADA" || mp === "Hepsiburada"
      ? "Hepsiburada"
      : "Trendyol";
  return {
    id: p.id,
    title: p.title,
    sku: p.sku ?? "",
    barcode: p.barcode ?? "",
    brand: p.brand ?? "—",
    returnRatePct: Number(p.returnRatePct) || 0,
    category: p.category?.trim() || "",
    costPrice: Number(p.costPrice) || 0,
    costVatRate: Number(p.costVatRate) || 20,
    desi: Number(p.desi) || 1,
    salePrice: Number(p.salePrice) || 0,
    commissionRate: Number(p.commissionRate) || 0,
    shippingCost: Number(p.shippingCost) || 0,
    stock: p.stockQty ?? 0,
    isActive: p.isActive,
    marketplace,
  };
}

function parseNum(raw: string) {
  const n = Number(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

/** Basit CSV satır bölme — tırnak içi ayırıcıyı korur */
function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (ch === ";" || ch === "," || ch === "\t")) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function editsFromProducts(list: CatalogProduct[]) {
  return Object.fromEntries(
    list.map((p) => [
      p.id,
      {
        costPrice: p.costPrice,
        costVatRate: p.costVatRate,
        desi: p.desi,
        commissionRatePct: Math.round(p.commissionRate * 10000) / 100,
      },
    ]),
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <ProductsInner />
    </Suspense>
  );
}

function ProductsInner() {
  const ready = usePageReady();
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const xmlRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [fromApi, setFromApi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [channel, setChannel] = useState<"all" | "Trendyol" | "Hepsiburada">("all");
  const [brand, setBrand] = useState<string>("all");
  /** TY panel “aktif” ≈ stoklu; varsayılan satışta */
  const [stock, setStock] = useState<"all" | "in" | "out">("in");
  const [listing, setListing] = useState<"live" | "all">("live");
  const [highReturnOnly, setHighReturnOnly] = useState(
    () => searchParams.get("highReturn") === "1",
  );
  const [editing, setEditing] = useState<string | null>(null);
    const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [tariffBusyId, setTariffBusyId] = useState<string | null>(null);
  const [bulkTariffBusy, setBulkTariffBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [mismatchByProductId, setMismatchByProductId] = useState<
    Map<string, TariffMismatchRow>
  >(() => new Map());
  const [dragOver, setDragOver] = useState(false);
  const [edits, setEdits] = useState<Record<string, ProductEdit>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    const nextQ = searchParams.get("q");
    if (nextQ != null) setQ(nextQ);
    if (searchParams.get("highReturn") === "1") setHighReturnOnly(true);
  }, [searchParams]);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [rows, mismatches] = await Promise.all([
          apiFetch<ApiProduct[]>("/products?limit=5000"),
          loadTariffMismatches(5000),
        ]);
        if (cancelled) return;
        setMismatchByProductId(mismatches.byProductId);
        if (rows?.length) {
          const mapped = rows.map(mapApiProduct);
          setProducts(mapped);
          setEdits(editsFromProducts(mapped));
          setFromApi(true);
        } else {
          setProducts([]);
          setEdits({});
          setFromApi(true);
        }
      } catch {
        if (!cancelled) {
          setProducts([]);
          setEdits({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const brands = useMemo(() => {
    return [...new Set(products.map((p) => p.brand).filter(Boolean))].sort();
  }, [products]);

  const rows = useMemo(() => {
    return products.filter((p) => {
      const matchQ =
        !q ||
        p.title.toLowerCase().includes(q.toLowerCase()) ||
        (p.sku ?? "").toLowerCase().includes(q.toLowerCase()) ||
        (p.barcode ?? "").includes(q) ||
        p.brand.toLowerCase().includes(q.toLowerCase());
      if (!matchQ) return false;
      if (listing === "live" && !p.isActive) return false;
      if (channel !== "all" && p.marketplace !== channel) return false;
      if (brand !== "all" && p.brand !== brand) return false;
      if (stock === "in" && p.stock <= 0) return false;
      if (stock === "out" && p.stock > 0) return false;
      if (highReturnOnly && p.returnRatePct < 5) return false;
      return true;
    });
  }, [products, q, channel, brand, stock, highReturnOnly, listing]);

  useEffect(() => {
    setPage(1);
  }, [q, channel, brand, stock, highReturnOnly, listing, pageSize]);

  const catalogCount = useMemo(
    () => products.filter((p) => p.isActive).length,
    [products],
  );
  const onSaleCount = useMemo(
    () => products.filter((p) => p.isActive && p.stock > 0).length,
    [products],
  );

  const { page: safePage, slice: pageRows } = useMemo(
    () => paginateSlice(rows, page, pageSize),
    [rows, page, pageSize],
  );

  const missingDesi = rows.filter((p) => (edits[p.id]?.desi ?? p.desi) <= 0).length;
  const missingCost = rows.filter(
    (p) => !hasEnteredCost(edits[p.id]?.costPrice ?? p.costPrice),
  ).length;
  const lowMargin = rows.filter((p) => {
    const e = edits[p.id];
    const cost = e?.costPrice ?? p.costPrice;
    if (!hasEnteredCost(cost)) return false;
    const { marginPct, hasCost } = estimateMargin({
      ...p,
      costPrice: cost,
      commissionRate:
        e?.commissionRatePct != null
          ? e.commissionRatePct > 1
            ? e.commissionRatePct / 100
            : e.commissionRatePct
          : p.commissionRate,
    });
    return hasCost && marginPct < 15;
  }).length;
  const tariffMismatchInView = rows.filter((p) =>
    mismatchByProductId.has(p.id),
  ).length;
  const missingCategory = rows.filter((p) => !p.category?.trim()).length;

  async function assignMissingCategories(applyTariff: boolean) {
    if (!fromApi || !getToken() || missingCategory === 0) return;
    setAssignBusy(true);
    
    try {
      const ids = rows.filter((p) => !p.category?.trim()).map((p) => p.id);
      const res = await apiFetch<{
        updated: number;
        message: string;
      }>("/products/assign-category", {
        method: "POST",
        body: JSON.stringify({
          productIds: ids,
          category: "Diğer",
          applyTariff,
          usePlus: false,
        }),
      });
      toast(res.message);
      const [nextRows, mismatches] = await Promise.all([
        apiFetch<ApiProduct[]>("/products?limit=5000"),
        loadTariffMismatches(),
      ]);
      if (nextRows?.length) {
        const mapped = nextRows.map(mapApiProduct);
        setProducts(mapped);
        setEdits(editsFromProducts(mapped));
      }
      setMismatchByProductId(mismatches.byProductId);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kategori atanamadı.",);
    } finally {
      setAssignBusy(false);
    }
  }

  function patch(id: string, next: Partial<ProductEdit>) {
    setEdits((prev) => {
      const product = products.find((p) => p.id === id);
      const base = prev[id] ?? {
        costPrice: product?.costPrice ?? 0,
        costVatRate: product?.costVatRate ?? 20,
        desi: product?.desi ?? 0,
        commissionRatePct: Math.round((product?.commissionRate ?? 0) * 10000) / 100,
      };
      return { ...prev, [id]: { ...base, ...next } };
    });
  }

  function exportExcel() {
    const header = [
      "sku",
      "barcode",
      "title",
      "cost_price",
      "cost_vat_rate",
      "desi",
      "commission_rate",
      "tariff_rate",
      "tariff_plus_rate",
      "tariff_status",
      "tariff_delta",
    ];
    const source = rows.length ? rows : products;
    const lines = source.map((p) => {
      const e = edits[p.id] ?? {
        costPrice: p.costPrice,
        costVatRate: p.costVatRate,
        desi: p.desi,
        commissionRatePct: Math.round(p.commissionRate * 10000) / 100,
      };
      const mm = mismatchByProductId.get(p.id);
      const commissionPct = e.commissionRatePct;
      const tariffRate = mm?.suggestedRatePct ?? "";
      const tariffPlus = mm?.suggestedPlusRatePct ?? "";
      const tariffStatus = mm
        ? "sapıyor"
        : fromApi
          ? "uyumlu"
          : "";
      const tariffDelta = mm?.deltaPct ?? "";
      return [
        p.sku,
        p.barcode,
        `"${p.title.replace(/"/g, '""')}"`,
        e.costPrice,
        e.costVatRate,
        e.desi,
        commissionPct,
        tariffRate,
        tariffPlus,
        tariffStatus,
        tariffDelta,
      ].join(";");
    });
    downloadBlob(
      "cirofy-urun-maliyet.csv",
      "\uFEFF" + [header.join(";"), ...lines].join("\n"),
      "text/csv;charset=utf-8",
    );
    toast("CSV indirildi (tarife sütunları dahil).");
  }

  function downloadSampleCsv() {
    const sample = [
      "sku;barcode;title;cost_price;cost_vat_rate;desi;commission_rate;tariff_rate;tariff_plus_rate;tariff_status;tariff_delta",
      "SKU-1001;8690001001;Ürün A;120;20;1.2;12;12;14.5;uyumlu;0",
      "SKU-1002;8690001002;Ürün B;85,5;20;0.8;15;13.5;15.5;sapıyor;1.5",
    ].join("\n");
    downloadBlob(
      "cirofy-maliyet-sablon.csv",
      "\uFEFF" + sample,
      "text/csv;charset=utf-8",
    );
    toast("Şablon CSV indirildi.");
  }

  function buildPreviewFromCsv(text: string): ImportPreview | null {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      toast("Dosyada satır bulunamadı.");
      return null;
    }
    const headerLine = lines[0];
    if (!headerLine) {
      toast("Dosyada satır bulunamadı.");
      return null;
    }
    const header = headerLine.toLowerCase().split(/[;,]/);
    const skuIdx = header.findIndex((h) => h.includes("sku"));
    const barcodeIdx = header.findIndex(
      (h) => h.includes("barcode") || h.includes("barkod"),
    );
    const costIdx = header.findIndex(
      (h) => h.includes("cost_price") || h.includes("maliyet") || h === "cost",
    );
    const vatIdx = header.findIndex((h) => h.includes("vat") || h.includes("kdv"));
    const desiIdx = header.findIndex((h) => h.includes("desi"));
    const commissionIdx = header.findIndex(
      (h) => h.includes("commission") || h.includes("komisyon"),
    );
    if (skuIdx < 0 && barcodeIdx < 0) {
      toast("sku veya barkod sütunu gerekli.");
      return null;
    }
    if (costIdx < 0 && vatIdx < 0 && desiIdx < 0 && commissionIdx < 0) {
      toast("Sütunlar okunamadı. sku;cost_price;cost_vat_rate;desi;commission_rate bekleniyor.",);
      return null;
    }

    const previewRows: ImportPreviewRow[] = [];
    for (const line of lines.slice(1)) {
      const cols = splitCsvLine(line);
      const sku = skuIdx >= 0 ? (cols[skuIdx]?.trim() ?? "") : "";
      const barcode = barcodeIdx >= 0 ? (cols[barcodeIdx]?.trim() ?? "") : "";
      if (!sku && !barcode) continue;
      const product = products.find(
        (p) => (sku && p.sku === sku) || (barcode && p.barcode === barcode),
      );
      previewRows.push({
        sku,
        barcode,
        costPrice: costIdx >= 0 ? parseNum(cols[costIdx] ?? "") : null,
        costVatRate: vatIdx >= 0 ? parseNum(cols[vatIdx] ?? "") : null,
        desi: desiIdx >= 0 ? parseNum(cols[desiIdx] ?? "") : null,
        commissionRatePct:
          commissionIdx >= 0 ? parseNum(cols[commissionIdx] ?? "") : null,
        productId: product?.id,
        title: product?.title,
        matched: !!product,
      });
    }

    const matched = previewRows.filter((r) => r.matched).length;
    return {
      source: "csv",
      rows: previewRows,
      matched,
      missed: previewRows.length - matched,
    };
  }

  function importExcel(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const preview = buildPreviewFromCsv(String(reader.result ?? ""));
      if (!preview) return;
      setImportPreview(preview);
      toast(`${preview.rows.length} satır okundu · ${preview.matched} eşleşti · ${preview.missed} eşleşmedi. Uygula ile kaydedin.`,);
    };
    reader.readAsText(file);
  }

  function importXml(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCostXml(String(reader.result ?? ""));
        if (parsed.length === 0) {
          toast("XML içinde ürün satırı bulunamadı.");
          return;
        }
        const previewRows: ImportPreviewRow[] = parsed.map((row) => {
          const product = products.find(
            (p) =>
              (row.sku && p.sku === row.sku) ||
              (row.barcode && p.barcode === row.barcode),
          );
          return {
            sku: row.sku ?? "",
            barcode: row.barcode ?? "",
            costPrice: row.costPrice ?? null,
            costVatRate: row.costVatRate ?? null,
            desi: row.desi ?? null,
            commissionRatePct: null,
            productId: product?.id,
            title: product?.title,
            matched: !!product,
          };
        });
        const matched = previewRows.filter((r) => r.matched).length;
        const preview: ImportPreview = {
          source: "xml",
          rows: previewRows,
          matched,
          missed: previewRows.length - matched,
        };
        setImportPreview(preview);
        toast(`${preview.rows.length} XML satırı · ${matched} eşleşti · ${preview.missed} eşleşmedi.`,);
      } catch (err) {
        toast(err instanceof Error ? err.message : "XML işlenemedi.");
      }
    };
    reader.readAsText(file);
  }

  async function applyImportPreview() {
    if (!importPreview || importPreview.matched === 0) {
      toast("Uygulanacak eşleşen satır yok.");
      return;
    }
    setImporting(true);
    try {
      const matched = importPreview.rows.filter((r) => r.matched && r.productId);
      setEdits((prev) => {
        const next = { ...prev };
        for (const row of matched) {
          if (!row.productId) continue;
          const product = products.find((p) => p.id === row.productId);
          if (!product) continue;
          const base = next[product.id] ?? {
            costPrice: product.costPrice,
            costVatRate: product.costVatRate,
            desi: product.desi,
            commissionRatePct: Math.round(product.commissionRate * 10000) / 100,
          };
          next[product.id] = {
            costPrice: row.costPrice ?? base.costPrice,
            costVatRate: row.costVatRate ?? base.costVatRate,
            desi: row.desi ?? base.desi,
            commissionRatePct: row.commissionRatePct ?? base.commissionRatePct,
          };
        }
        return next;
      });

      if (getToken()) {
        const payload = {
          rows: matched
            .filter((r) => r.sku || r.barcode)
            .map((r) => ({
              sku: r.sku || undefined,
              barcode: r.barcode || undefined,
              costPrice: r.costPrice ?? undefined,
              costVatRate: r.costVatRate ?? undefined,
              desi: r.desi ?? undefined,
              commissionRate:
                r.commissionRatePct != null
                  ? r.commissionRatePct > 1
                    ? r.commissionRatePct / 100
                    : r.commissionRatePct
                  : undefined,
            })),
        };
        try {
          const res = await apiFetch<{
            updated: number;
            missed?: string[];
            message: string;
          }>("/products/costs", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          const missedNote =
            res.missed?.length ? ` · eşleşmeyen: ${res.missed.slice(0, 5).join(", ")}` : "";
          toast(`${res.message}${missedNote}`);
          setImportPreview(null);
          return;
        } catch {
          // yerel önizleme kalsın
        }
      }

      toast(`${matched.length} ürün maliyeti güncellendi.`);
      setImportPreview(null);
    } finally {
      setImporting(false);
    }
  }

  function handleDroppedFile(file: File) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xml") || file.type.includes("xml")) {
      importXml(file);
      return;
    }
    if (name.endsWith(".csv") || file.type.includes("csv") || name.endsWith(".txt")) {
      importExcel(file);
      return;
    }
    toast("Yalnızca CSV veya XML dosyası yükleyin.");
  }

  async function saveProductCosts(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const e = edits[productId] ?? {
      costPrice: product.costPrice,
      costVatRate: product.costVatRate,
      desi: product.desi,
      commissionRatePct: Math.round(product.commissionRate * 10000) / 100,
    };
    const commissionRate =
      e.commissionRatePct > 1 ? e.commissionRatePct / 100 : e.commissionRatePct;
    if (!getToken()) {
      toast("Maliyet kaydı için giriş yapın.");
      setEditing(null);
      return;
    }
    setSavingId(productId);
    try {
      const res = await apiFetch<{ updated: number; message: string }>("/products/costs", {
        method: "POST",
        body: JSON.stringify({
          rows: [
            {
              sku: product.sku || undefined,
              barcode: product.barcode || undefined,
              costPrice: e.costPrice,
              costVatRate: e.costVatRate,
              desi: e.desi,
              commissionRate,
            },
          ],
        }),
      });
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                costPrice: e.costPrice,
                costVatRate: e.costVatRate,
                desi: e.desi,
                commissionRate,
              }
            : p,
        ),
      );
      toast(res.message);
      setEditing(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kayıt başarısız.");
    } finally {
      setSavingId(null);
    }
  }

  async function suggestFromTariff(productId: string) {
    if (!getToken()) {
      toast("Tarife önerisi için giriş yapın.");
      return;
    }
    setTariffBusyId(productId);
    try {
      const res = await apiFetch<{
        tariff: {
          ratePct: number;
          plusRatePct: number;
          category: string;
          marketplace: string;
        } | null;
        mismatch?: boolean;
        message?: string;
      }>(`/tariffs/resolve?productId=${encodeURIComponent(productId)}`);
      if (!res.tariff) {
        toast(res.message || "Bu kategori için tarife yok.");
        return;
      }
      patch(productId, { commissionRatePct: res.tariff.ratePct });
      setEditing(productId);
      toast(`${res.message || `Öneri: %${res.tariff.ratePct}`}${
          res.mismatch ? " — mevcut komisyondan farklı." : ""
        } Kaydet veya doğrudan uygula.`,);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Tarife önerisi alınamadı.");
    } finally {
      setTariffBusyId(null);
    }
  }

  async function applyFromTariff(productId: string, usePlus = false) {
    if (!getToken()) {
      toast("Tarife uygulamak için giriş yapın.");
      return;
    }
    setTariffBusyId(productId);
    try {
      const res = await apiFetch<{
        rate: number;
        ratePct: number;
        message: string;
      }>("/tariffs/apply-product", {
        method: "POST",
        body: JSON.stringify({ productId, usePlus }),
      });
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, commissionRate: res.rate } : p,
        ),
      );
      patch(productId, { commissionRatePct: res.ratePct });
      setEditing(null);
      toast(res.message);
      const refreshed = await loadTariffMismatches();
      setMismatchByProductId(refreshed.byProductId);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Tarife uygulanamadı.");
    } finally {
      setTariffBusyId(null);
    }
  }

  async function applyAllVisibleMismatches(usePlus = false) {
    if (!getToken()) {
      toast("Toplu tarife için giriş yapın.");
      return;
    }
    const ids = rows
      .filter((p) => mismatchByProductId.has(p.id))
      .map((p) => p.id);
    if (ids.length === 0) {
      toast("Görünür listede tarife sapması yok.");
      return;
    }
    setBulkTariffBusy(true);
    try {
      const res = await apiFetch<{ updated: number; message: string }>(
        "/tariffs/apply-mismatches",
        {
          method: "POST",
          body: JSON.stringify({ productIds: ids, usePlus }),
        },
      );
      const rateById = new Map(
        ids.map((id) => {
          const mm = mismatchByProductId.get(id);
          return [
            id,
            mm
              ? (usePlus ? mm.suggestedPlusRatePct : mm.suggestedRatePct) / 100
              : null,
          ] as const;
        }),
      );
      setProducts((prev) =>
        prev.map((p) => {
          const rate = rateById.get(p.id);
          if (rate == null) return p;
          return { ...p, commissionRate: rate };
        }),
      );
      setEdits((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          const mm = mismatchByProductId.get(id);
          if (!mm) continue;
          const pct = usePlus ? mm.suggestedPlusRatePct : mm.suggestedRatePct;
          const base = next[id];
          if (base) next[id] = { ...base, commissionRatePct: pct };
        }
        return next;
      });
      const refreshed = await loadTariffMismatches();
      setMismatchByProductId(refreshed.byProductId);
      toast(res.message);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Toplu tarife başarısız.");
    } finally {
      setBulkTariffBusy(false);
    }
  }

  function downloadSampleXml() {
    downloadBlob("cirofy-maliyet-sablon.xml", costXmlTemplate(), "application/xml");
    toast("Şablon XML indirildi.");
  }

  return (
    <DashboardShell
      loading={!ready || loading}
      title="Ürünler"
      description="Maliyet, desi ve komisyon oranı — net marjın yakıtı. Tarifelerden toplu uygulayabilirsiniz."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/tariffs">Komisyon tarifeleri</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <Download className="h-3.5 w-3.5" />
            Excel indir
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Excel yükle
          </Button>
          <Button variant="outline" size="sm" onClick={() => xmlRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            XML yükle
          </Button>
          <Button variant="outline" size="sm" onClick={downloadSampleCsv}>
            <Download className="h-3.5 w-3.5" />
            Şablon CSV
          </Button>
          <Button variant="outline" size="sm" onClick={downloadSampleXml}>
            <Download className="h-3.5 w-3.5" />
            Şablon XML
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importExcel(f);
              e.target.value = "";
            }}
          />
          <input
            ref={xmlRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importXml(f);
              e.target.value = "";
            }}
          />
          <Button asChild variant="outline" size="sm">
            <Link href="/promotions">Teklif filtresi</Link>
          </Button>
        </div>
      }
    >
      {!ready || loading ? (
        <ListPageSkeleton rows={8} />
      ) : (
        <>
          <div
            className={
              dragOver
                ? "mb-4 rounded-xl border-2 border-dashed border-profit bg-profit/5 px-4 py-6 text-center text-sm"
                : "mb-4 rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground"
            }
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleDroppedFile(f);
            }}
          >
            <p className="font-medium text-foreground">Maliyet dosyasını buraya bırakın</p>
            <p className="mt-1">CSV veya XML · sku / barkod ile eşleşir</p>
          </div>

          {importPreview ? (
            <Card className="mb-4">
              <CardHeader className="flex-row items-start justify-between space-y-0 gap-3">
                <div>
                  <CardTitle>İçe aktarma önizleme</CardTitle>
                  <CardDescription>
                    {importPreview.source.toUpperCase()} · {importPreview.matched} eşleşen ·{" "}
                    {importPreview.missed} eşleşmeyen
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={importing || importPreview.matched === 0}
                    onClick={() => void applyImportPreview()}
                  >
                    {importing ? "Uygulanıyor…" : "Uygula"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setImportPreview(null);
                      
                    }}
                  >
                    İptal
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-56 overflow-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Ürün</th>
                        <th className="px-3 py-2 font-medium">Maliyet</th>
                        <th className="px-3 py-2 font-medium">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.slice(0, 40).map((r, i) => (
                        <tr key={`${r.sku}-${r.barcode}-${i}`} className="border-t border-border">
                          <td className="px-3 py-2 font-medium">{r.sku || r.barcode || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {r.title ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {r.costPrice != null ? formatTry(r.costPrice) : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={r.matched ? "profit" : "warn"}>
                              {r.matched ? "Eşleşti" : "Yok"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Satışta</div>
                <div className="mt-1 font-display text-2xl font-bold">{onSaleCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Katalog {catalogCount.toLocaleString("tr-TR")}
                  {products.length > catalogCount
                    ? ` · Pasif ${(products.length - catalogCount).toLocaleString("tr-TR")}`
                    : ""}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Maliyet eksik</div>
                <div
                  className={
                    missingCost > 0
                      ? "mt-1 font-display text-2xl font-bold text-loss"
                      : "mt-1 font-display text-2xl font-bold"
                  }
                >
                  {missingCost}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Filtrelenen {rows.length.toLocaleString("tr-TR")}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Düşük marj (&lt;%15)</div>
                <div className="mt-1 font-display text-2xl font-bold text-amber-700">
                  {lowMargin}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">Tarife sapması</div>
                <div className="mt-1 font-display text-2xl font-bold text-amber-700">
                  {tariffMismatchInView}
                </div>
              </CardContent>
            </Card>
          </div>

          {missingCost > 0 ? (
            <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {missingCost} üründe maliyet yok — tahmini net ve marj gösterilmez.
              CSV/XML ile yükleyin veya satırdan düzenleyin.
            </div>
          ) : null}

          {fromApi && missingCategory > 0 ? (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Görünür listede {missingCategory} ürünün kategorisi yok — tarife
                eşlemesi için «Diğer» atanabilir.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={assignBusy}
                  onClick={() => void assignMissingCategories(true)}
                >
                  {assignBusy ? "Atanıyor…" : "Diğer + tarife"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={assignBusy}
                  onClick={() => void assignMissingCategories(false)}
                >
                  Yalnız kategori
                </Button>
              </div>
            </div>
          ) : null}

          {fromApi && tariffMismatchInView > 0 ? (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-amber-900">
                Görünür listede {tariffMismatchInView} ürün komisyon tarifesinden sapıyor.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={bulkTariffBusy}
                  onClick={() => void applyAllVisibleMismatches(false)}
                >
                  {bulkTariffBusy ? "Uygulanıyor…" : "Toplu tarife uygula"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkTariffBusy}
                  onClick={() => void applyAllVisibleMismatches(true)}
                >
                  Plus ile uygula
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/tariffs">Tarifelere git</Link>
                </Button>
              </div>
            </div>
          ) : null}

          <Card>
            <CardHeader className="space-y-4 lg:flex-row lg:items-start lg:justify-between lg:space-y-0 lg:gap-6">
              <div className="min-w-0 shrink">
                <CardTitle>Ürün kataloğu</CardTitle>
                <CardDescription>
                  {fromApi
                    ? "Canlı katalog. Maliyet KDV dahil; tahmini net satış − kesintiler − maliyet."
                    : "Mağaza bağlandıktan sonra ürün kataloğu burada görünür."}
                </CardDescription>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-2 lg:max-w-xl lg:shrink-0 xl:max-w-2xl">
                <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
                  <MarketplaceChannelFilter
                    className="max-w-full shrink-0"
                    value={channel}
                    onChange={setChannel}
                  />
                  <Select value={brand} onValueChange={setBrand}>
                    <SelectTrigger
                      className="h-10 w-full min-w-[9rem] flex-1 basis-[9rem] sm:max-w-[11.5rem] sm:flex-none"
                      aria-label="Marka"
                    >
                      <SelectValue placeholder="Marka" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tüm markalar</SelectItem>
                      {brands.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-card p-1">
                    {(
                      [
                        ["in", "Satışta"],
                        ["out", "Stoksuz"],
                        ["all", "Tümü"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setStock(id)}
                        className={
                          stock === id
                            ? "rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background"
                            : "rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0"
                    variant={listing === "all" ? "default" : "outline"}
                    onClick={() =>
                      setListing((v) => (v === "live" ? "all" : "live"))
                    }
                    title={
                      listing === "live"
                        ? "Pasif / katalog dışı ürünleri de göster"
                        : "Yalnızca katalogdaki ürünler"
                    }
                  >
                    {listing === "live" ? "Katalog" : "Pasif dahil"}
                  </Button>
                  <Button
                    size="sm"
                    className="shrink-0"
                    variant={highReturnOnly ? "default" : "outline"}
                    onClick={() => setHighReturnOnly((v) => !v)}
                  >
                    Yüksek iade
                  </Button>
                </div>
                <div className="relative w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Ürün, SKU, barkod, marka…"
                    className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {pageRows.map((p) => {
                  const e = edits[p.id] ?? {
                    costPrice: p.costPrice,
                    costVatRate: p.costVatRate,
                    desi: p.desi,
                    commissionRatePct: Math.round(p.commissionRate * 10000) / 100,
                  };
                  const commissionRate =
                    e.commissionRatePct > 1
                      ? e.commissionRatePct / 100
                      : e.commissionRatePct;
                  const { net, marginPct, hasCost } = estimateMargin({
                    ...p,
                    costPrice: e.costPrice,
                    commissionRate,
                  });
                  const editingRow = editing === p.id;
                  return (
                    <div key={p.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold leading-snug">{p.title}</div>
                            {!hasCost ? <Badge tone="warn">Maliyet yok</Badge> : null}
                            {mismatchByProductId.has(p.id) ? (
                              <Badge tone="warn">Tarife sapması</Badge>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {p.sku} · {p.brand} · {p.category} · iade %{p.returnRatePct} ·{" "}
                            <MarketplaceLogo
                              marketplace={p.marketplace}
                              height={12}
                              className="align-middle"
                            />
                            {p.stock <= 0 ? " · stok yok" : ` · stok ${p.stock}`}
                          </div>
                          {mismatchByProductId.get(p.id) ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Komisyon %{mismatchByProductId.get(p.id)!.currentRatePct} → tarife %
                              {mismatchByProductId.get(p.id)!.suggestedRatePct}
                            </p>
                          ) : null}
                        </div>
                        {hasCost ? (
                          <Badge
                            tone={marginPct >= 15 ? "profit" : marginPct >= 8 ? "warn" : "loss"}
                          >
                            {formatPct(marginPct)}
                          </Badge>
                        ) : (
                          <Badge tone="warn">—</Badge>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                        <Field
                          label="Maliyet"
                          editing={editingRow}
                          value={e.costPrice}
                          onChange={(v) => patch(p.id, { costPrice: v })}
                          display={hasCost ? formatTry(e.costPrice) : "—"}
                        />
                        <Field
                          label="KDV %"
                          editing={editingRow}
                          value={e.costVatRate}
                          onChange={(v) => patch(p.id, { costVatRate: v })}
                          display={`%${e.costVatRate}`}
                        />
                        <Field
                          label="Desi"
                          editing={editingRow}
                          value={e.desi}
                          onChange={(v) => patch(p.id, { desi: v })}
                          display={String(e.desi)}
                        />
                        <Field
                          label="Komisyon %"
                          editing={editingRow}
                          value={e.commissionRatePct}
                          onChange={(v) => patch(p.id, { commissionRatePct: v })}
                          display={`%${e.commissionRatePct}`}
                        />
                        <div>
                          <div className="text-xs text-muted-foreground">Net</div>
                          {hasCost ? (
                            <div
                              className={
                                net >= 0
                                  ? "font-semibold text-profit"
                                  : "font-semibold text-loss"
                              }
                            >
                              {formatTry(net)}
                            </div>
                          ) : (
                            <div className="font-semibold text-muted-foreground">—</div>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Badge tone={p.stock === 0 ? "warn" : "default"}>
                          {p.stock === 0 ? "Tükendi" : `Stok ${p.stock}`}
                        </Badge>
                        <div className="flex flex-wrap justify-end gap-1">
                          {fromApi ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={tariffBusyId === p.id}
                                onClick={() => void suggestFromTariff(p.id)}
                                title="Tarifeden öner"
                              >
                                <Percent className="h-3.5 w-3.5" />
                                {tariffBusyId === p.id ? "…" : "Öner"}
                              </Button>
                              {editingRow ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={tariffBusyId === p.id}
                                  onClick={() => void applyFromTariff(p.id, false)}
                                >
                                  Uygula
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                          {editingRow ? (
                            <Button
                              size="sm"
                              disabled={savingId === p.id}
                              onClick={() => void saveProductCosts(p.id)}
                            >
                              {savingId === p.id ? "…" : "Kaydet"}
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(editingRow ? null : p.id)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            {editingRow ? "İptal" : "Düzenle"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <table className="w-full min-w-[1040px] text-left text-sm">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Ürün</th>
                      <th className="px-4 py-3 font-medium">SKU</th>
                      <th className="px-4 py-3 font-medium">Maliyet</th>
                      <th className="px-4 py-3 font-medium">KDV %</th>
                      <th className="px-4 py-3 font-medium">Desi</th>
                      <th className="px-4 py-3 font-medium">Komisyon %</th>
                      <th className="px-4 py-3 font-medium">Satış</th>
                      <th className="px-4 py-3 font-medium">Tahmini net</th>
                      <th className="px-4 py-3 font-medium">Marj</th>
                      <th className="px-4 py-3 font-medium">Stok</th>
                      <th className="px-4 py-3 font-medium"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((p) => {
                      const e = edits[p.id] ?? {
                        costPrice: p.costPrice,
                        costVatRate: p.costVatRate,
                        desi: p.desi,
                        commissionRatePct: Math.round(p.commissionRate * 10000) / 100,
                      };
                      const commissionRate =
                        e.commissionRatePct > 1
                          ? e.commissionRatePct / 100
                          : e.commissionRatePct;
                      const { net, marginPct, hasCost } = estimateMargin({
                        ...p,
                        costPrice: e.costPrice,
                        commissionRate,
                      });
                      const editingRow = editing === p.id;
                      return (
                        <tr key={p.id} className="border-t border-border">
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium">{p.title}</div>
                              {!hasCost ? <Badge tone="warn">Maliyet yok</Badge> : null}
                              {mismatchByProductId.has(p.id) ? (
                                <Badge tone="warn">Sapma</Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {p.brand} · {p.category} · iade %{p.returnRatePct}
                              {mismatchByProductId.get(p.id)
                                ? ` · %${mismatchByProductId.get(p.id)!.currentRatePct}→%${mismatchByProductId.get(p.id)!.suggestedRatePct}`
                                : ""}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{p.sku}</td>
                          <td className="px-4 py-3">
                            {editingRow ? (
                              <NumInput
                                value={e.costPrice}
                                onChange={(v) => patch(p.id, { costPrice: v })}
                              />
                            ) : hasCost ? (
                              formatTry(e.costPrice)
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {editingRow ? (
                              <NumInput
                                value={e.costVatRate}
                                onChange={(v) => patch(p.id, { costVatRate: v })}
                              />
                            ) : (
                              `%${e.costVatRate}`
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {editingRow ? (
                              <NumInput
                                value={e.desi}
                                onChange={(v) => patch(p.id, { desi: v })}
                              />
                            ) : (
                              e.desi
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {editingRow ? (
                              <NumInput
                                value={e.commissionRatePct}
                                onChange={(v) =>
                                  patch(p.id, { commissionRatePct: v })
                                }
                              />
                            ) : (
                              `%${e.commissionRatePct}`
                            )}
                          </td>
                          <td className="px-4 py-3">{formatTry(p.salePrice)}</td>
                          <td
                            className={
                              !hasCost
                                ? "px-4 py-3 text-muted-foreground"
                                : net >= 0
                                  ? "px-4 py-3 font-semibold text-profit"
                                  : "px-4 py-3 font-semibold text-loss"
                            }
                          >
                            {hasCost ? formatTry(net) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {hasCost ? (
                              <Badge
                                tone={
                                  marginPct >= 15
                                    ? "profit"
                                    : marginPct >= 8
                                      ? "warn"
                                      : "loss"
                                }
                              >
                                {formatPct(marginPct)}
                              </Badge>
                            ) : (
                              <Badge tone="warn">—</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              tone={p.stock === 0 ? "warn" : p.isActive ? "default" : "warn"}
                            >
                              {p.stock === 0 ? "Tükendi" : p.stock}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {fromApi ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={tariffBusyId === p.id}
                                  onClick={() => void suggestFromTariff(p.id)}
                                  title="Tarifeden öner"
                                >
                                  <Percent className="h-3.5 w-3.5" />
                                  {tariffBusyId === p.id ? "…" : "Öner"}
                                </Button>
                              ) : null}
                              {editingRow && fromApi ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={tariffBusyId === p.id}
                                  onClick={() => void applyFromTariff(p.id, false)}
                                >
                                  Uygula
                                </Button>
                              ) : null}
                              {editingRow ? (
                                <Button
                                  size="sm"
                                  disabled={savingId === p.id}
                                  onClick={() => void saveProductCosts(p.id)}
                                >
                                  {savingId === p.id ? "…" : "Kaydet"}
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditing(editingRow ? null : p.id)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {editingRow ? "İptal" : "Düzenle"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={safePage}
                pageSize={pageSize}
                total={rows.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </CardContent>
          </Card>
        </>
      )}
    </DashboardShell>
  );
}

function NumInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 w-20 rounded-lg border border-border bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

function Field({
  label,
  editing,
  value,
  onChange,
  display,
}: {
  label: string;
  editing: boolean;
  value: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {editing ? (
        <NumInput value={value} onChange={onChange} />
      ) : (
        <div className="font-medium">{display}</div>
      )}
    </div>
  );
}
