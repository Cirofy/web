import type { TeamRole } from "@/lib/types/team";

/** Rol → görünen rota; owner her şeyi görür. */
const ROLE_HREFS: Record<"ops" | "finance" | "agency", Set<string>> = {
  ops: new Set([
    "/dashboard",
    "/products",
    "/tariffs",
    "/orders",
    "/returns",
    "/settlements",
    "/live",
    "/promotions",
    "/pricing",
    "/buybox",
    "/extension",
    "/scenarios",
    "/radar",
    "/reports",
    "/support",
    "/settings",
  ]),
  finance: new Set([
    "/dashboard",
    "/products",
    "/tariffs",
    "/orders",
    "/returns",
    "/settlements",
    "/live",
    "/reports",
    "/billing",
    "/support",
    "/settings",
  ]),
  agency: new Set([
    "/dashboard",
    "/agency",
    "/products",
    "/tariffs",
    "/orders",
    "/settlements",
    "/live",
    "/reports",
    "/support",
    "/settings",
  ]),
};

/** Tarife paneli yetkisi — matris ve yardım metni. */
export type TariffAccess = "apply" | "view" | "none";

const ROLE_TARIFF: Record<TeamRole, TariffAccess> = {
  owner: "apply",
  ops: "apply",
  finance: "view",
  agency: "view",
};

export const tariffAccessLabels: Record<TariffAccess, string> = {
  apply: "Tarife: uygula",
  view: "Tarife: görüntüle",
  none: "Tarife: yok",
};

const PATH_LABELS: Record<string, string> = {
  "/dashboard": "Özet",
  "/products": "Ürünler",
  "/tariffs": "Tarifeler",
  "/orders": "Siparişler",
  "/returns": "İadeler",
  "/settlements": "Hakediş",
  "/live": "Gün içi",
  "/promotions": "Teklifler",
  "/pricing": "Fiyat",
  "/buybox": "Buybox",
  "/extension": "Eklenti",
  "/scenarios": "Senaryo",
  "/radar": "Radar",
  "/reports": "Raporlar",
  "/billing": "Abonelik",
  "/agency": "Ajans",
  "/team": "Ekip",
  "/support": "Destek",
  "/settings": "Ayarlar",
};

export function roleTariffAccess(role: TeamRole): TariffAccess {
  return ROLE_TARIFF[role] ?? "none";
}

export function roleAccessSummary(role: "ops" | "finance" | "agency" | "owner") {
  const tariffAccess = roleTariffAccess(role);
  if (role === "owner") {
    return {
      role,
      label: "Sahip",
      paths: Object.keys(PATH_LABELS),
      labels: Object.values(PATH_LABELS),
      all: true as const,
      tariffAccess,
      tariffLabel: tariffAccessLabels[tariffAccess],
    };
  }
  const set = ROLE_HREFS[role];
  const paths = [...set].sort();
  return {
    role,
    label: role === "ops" ? "Operasyon" : role === "finance" ? "Finans" : "Ajans",
    paths,
    labels: paths.map((p) => PATH_LABELS[p] ?? p),
    all: false as const,
    tariffAccess,
    tariffLabel: tariffAccessLabels[tariffAccess],
  };
}

export function pathLabel(href: string) {
  return PATH_LABELS[href] ?? href;
}

export function allowedHrefs(
  teamRole?: string | null,
): Set<string> | "all" {
  if (!teamRole || teamRole === "owner") return "all";
  if (teamRole === "ops" || teamRole === "finance" || teamRole === "agency") {
    return ROLE_HREFS[teamRole];
  }
  return "all";
}

/** Pathname için izin (prefix eşleşmesi: /orders/xyz → /orders). */
export function canAccessPath(
  pathname: string,
  teamRole?: TeamRole | string | null,
): boolean {
  const allow = allowedHrefs(teamRole);
  if (allow === "all") return true;
  if (allow.has(pathname)) return true;
  for (const href of allow) {
    if (href !== "/dashboard" && pathname.startsWith(href + "/")) return true;
  }
  return false;
}

export function defaultHomeForRole(teamRole?: string | null): string {
  if (teamRole === "agency") return "/agency";
  if (teamRole === "finance") return "/settlements";
  return "/dashboard";
}
