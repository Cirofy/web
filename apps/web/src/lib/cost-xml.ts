/** XML maliyet satırları — tarayıcı DOMParser */
export type CostXmlRow = {
  sku?: string;
  barcode?: string;
  costPrice?: number;
  costVatRate?: number;
  desi?: number;
};

export function parseCostXml(xmlText: string): CostXmlRow[] {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("XML okunamadı. Geçerli bir maliyet dosyası yükleyin.");
  }

  const nodes = [
    ...doc.querySelectorAll("product, item, urun, row"),
  ] as Element[];
  if (nodes.length === 0) {
    const root = doc.documentElement;
    if (root) {
      for (const child of Array.from(root.children)) {
        if (child.children.length > 0 || child.attributes.length > 0) {
          nodes.push(child);
        }
      }
    }
  }

  const rows: CostXmlRow[] = [];
  for (const el of nodes) {
    const textOf = (...names: string[]) => {
      for (const n of names) {
        const child = el.querySelector(n);
        if (child?.textContent?.trim()) return child.textContent.trim();
        const attr = el.getAttribute(n) ?? el.getAttribute(n.replace(/_/g, "-"));
        if (attr?.trim()) return attr.trim();
      }
      return "";
    };
    const numOf = (...names: string[]) => {
      const raw = textOf(...names).replace(",", ".");
      if (!raw) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    };

    const sku = textOf("sku", "SKU", "stockCode", "stock_code") || undefined;
    const barcode = textOf("barcode", "barkod", "barcodeNumber") || undefined;
    const costPrice = numOf("cost_price", "costPrice", "maliyet", "cost", "price");
    const costVatRate = numOf("cost_vat_rate", "costVatRate", "vat", "kdv", "vat_rate");
    const desi = numOf("desi", "desiValue", "dimensional_weight");

    if (!sku && !barcode && costPrice == null && desi == null) continue;
    rows.push({ sku, barcode, costPrice, costVatRate, desi });
  }
  return rows;
}

/** Format örneği — gerçek ürün verisi içermez */
export function costXmlTemplate(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <sku>SKU-0001</sku>
    <barcode>8690000000001</barcode>
    <cost_price>95</cost_price>
    <cost_vat_rate>20</cost_vat_rate>
    <desi>2</desi>
  </product>
  <product>
    <sku>SKU-0002</sku>
    <cost_price>180</cost_price>
    <cost_vat_rate>20</cost_vat_rate>
    <desi>1</desi>
  </product>
</products>
`;
}
