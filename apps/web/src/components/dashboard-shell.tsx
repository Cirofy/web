"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  CreditCard,
  Settings,
  Store,
  Search,
  LogOut,
  Menu,
  X,
  WalletCards,
  PanelLeftClose,
  PanelLeftOpen,
  MoreHorizontal,
  Percent,
  CircleDollarSign,
  SlidersHorizontal,
  Crosshair,
  Radar,
  Users,
  FileBarChart,
  Briefcase,
  Activity,
  Cable,
  LifeBuoy,
  RotateCcw,
  Table2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useRequireAuth } from "@/lib/use-auth";
import { BrandLogo } from "@/components/brand-logo";
import { NotificationsButton } from "@/components/notifications-panel";
import { ShellSkeleton } from "@/components/page-skeletons";
import { allowedHrefs, canAccessPath, defaultHomeForRole } from "@/lib/nav-access";
import { apiFetch, getToken } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

const SIDEBAR_KEY = "cirofy_sidebar_open";
const NAV_GROUPS_KEY = "cirofy_nav_groups";

type NavIcon = ComponentType<{ className?: string }>;
type NavItem = { href: string; label: string; icon: NavIcon };
type NavGroup = {
  id: string;
  label: string | null;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    id: "overview",
    label: null,
    items: [{ href: "/dashboard", label: "Özet", icon: LayoutDashboard }],
  },
  {
    id: "catalog",
    label: "Katalog",
    items: [
      { href: "/products", label: "Ürünler", icon: Package },
      { href: "/tariffs", label: "Tarifeler", icon: Table2 },
    ],
  },
  {
    id: "ops",
    label: "Operasyon",
    items: [
      { href: "/orders", label: "Siparişler", icon: ShoppingCart },
      { href: "/returns", label: "İadeler", icon: RotateCcw },
      { href: "/settlements", label: "Hakediş", icon: WalletCards },
      { href: "/live", label: "Gün içi", icon: Activity },
    ],
  },
  {
    id: "pricing",
    label: "Fiyat & teklif",
    items: [
      { href: "/promotions", label: "Teklifler", icon: Percent },
      { href: "/pricing", label: "Fiyat", icon: CircleDollarSign },
      { href: "/buybox", label: "Buybox", icon: Crosshair },
      { href: "/extension", label: "Eklenti", icon: Cable },
      { href: "/scenarios", label: "Senaryo", icon: SlidersHorizontal },
    ],
  },
  {
    id: "insights",
    label: "Analiz",
    items: [
      { href: "/radar", label: "Radar", icon: Radar },
      { href: "/reports", label: "Raporlar", icon: FileBarChart },
    ],
  },
  {
    id: "org",
    label: "Hesap",
    items: [
      { href: "/agency", label: "Ajans", icon: Briefcase },
      { href: "/team", label: "Ekip", icon: Users },
      { href: "/billing", label: "Abonelik", icon: CreditCard },
      { href: "/support", label: "Destek", icon: LifeBuoy },
      { href: "/settings", label: "Ayarlar", icon: Settings },
    ],
  },
];

const flatNav = navGroups.flatMap((g) => g.items);
const mobilePrimaryHrefs = ["/dashboard", "/products", "/orders", "/settlements"];
const mobilePrimary = mobilePrimaryHrefs
  .map((href) => flatNav.find((i) => i.href === href))
  .filter((i): i is NavItem => Boolean(i));
const mobileMore = flatNav.filter((i) => !mobilePrimaryHrefs.includes(i.href));

function filterNavGroups(
  groups: NavGroup[],
  teamRole?: string | null,
): NavGroup[] {
  const allow = allowedHrefs(teamRole);
  if (allow === "all") return groups;
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => allow.has(i.href)),
    }))
    .filter((g) => g.items.length > 0);
}

function isItemActive(pathname: string, href: string) {
  return (
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
  );
}

function groupContainsPath(group: NavGroup, pathname: string) {
  return group.items.some((i) => isItemActive(pathname, i.href));
}

function readOpenGroups(pathname: string): string[] {
  const activeIds = navGroups
    .filter((g) => g.label && groupContainsPath(g, pathname))
    .map((g) => g.id);
  try {
    const raw = localStorage.getItem(NAV_GROUPS_KEY);
    if (!raw) return activeIds.length ? activeIds : ["catalog", "ops"];
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return activeIds;
    const merged = new Set([...parsed, ...activeIds]);
    return [...merged];
  } catch {
    return activeIds.length ? activeIds : ["catalog", "ops"];
  }
}

function NavLinkItem({
  item,
  pathname,
  collapsed,
  nested,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed?: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isItemActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "min-h-11 justify-center px-0",
        nested && !collapsed && "min-h-9 py-1.5 pl-9 text-[13px]",
        active
          ? "bg-sidebar-accent text-white"
          : "text-sidebar-muted hover:bg-white/5 hover:text-white",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", nested && !collapsed && "h-3.5 w-3.5")} />
      {!collapsed ? <span>{item.label}</span> : null}
    </Link>
  );
}

function NavLinks({
  pathname,
  collapsed,
  onNavigate,
  teamRole,
}: {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  teamRole?: string | null;
}) {
  const groups = filterNavGroups(navGroups, teamRole);
  const flat = groups.flatMap((g) => g.items);

  const [openIds, setOpenIds] = useState<string[]>(() =>
    typeof window === "undefined"
      ? ["catalog", "ops"]
      : readOpenGroups(pathname),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOpenIds(readOpenGroups(pathname));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setOpenIds((prev) => {
      const activeIds = filterNavGroups(navGroups, teamRole)
        .filter((g) => g.label && groupContainsPath(g, pathname))
        .map((g) => g.id);
      if (activeIds.every((id) => prev.includes(id))) return prev;
      const next = [...new Set([...prev, ...activeIds])];
      localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next));
      return next;
    });
  }, [pathname, ready, teamRole]);

  function toggleGroup(id: string) {
    setOpenIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next));
      return next;
    });
  }

  if (collapsed) {
    return (
      <nav className="flex flex-col gap-1" aria-label="Ana menü">
        {flat.map((item) => (
          <NavLinkItem
            key={item.href}
            item={item}
            pathname={pathname}
            collapsed
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1" aria-label="Ana menü">
      {groups.map((group) => {
        if (!group.label) {
          return group.items.map((item) => (
            <NavLinkItem
              key={item.href}
              item={item}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ));
        }

        const open = openIds.includes(group.id);
        const sectionActive = groupContainsPath(group, pathname);

        return (
          <div key={group.id} className="pt-1">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggleGroup(group.id)}
              className={cn(
                "flex w-full min-h-9 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide transition-colors",
                sectionActive
                  ? "text-white"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-white",
              )}
            >
              <span>{group.label}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                  open && "rotate-180",
                )}
              />
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="flex flex-col gap-0.5 pb-1">
                  {group.items.map((item) => (
                    <NavLinkItem
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      nested
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function StoreCta({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  if (collapsed) {
    return (
      <div className="flex justify-center pt-3">
        <Button
          asChild
          size="icon"
          variant="outline"
          className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-white/10"
          title="Bağlantıyı yönet"
        >
          <Link href="/settings" onClick={onNavigate}>
            <Store className="h-4 w-4 text-profit" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-sidebar-border bg-white/5 p-3">
      <div className="flex items-center gap-2 text-sm">
        <Store className="h-4 w-4 text-profit" />
        <span className="font-medium">Mağaza bağlı</span>
      </div>
      <p className="text-xs leading-relaxed text-sidebar-muted">
        Hamza Magaza TY — son senkron 10 dk önce.
      </p>
      <Button
        asChild
        size="sm"
        variant="outline"
        className="w-full border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-white/10"
      >
        <Link href="/settings" onClick={onNavigate}>
          Bağlantıyı yönet
        </Link>
      </Button>
    </div>
  );
}

function SidebarBrand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div
      className={cn(
        "mb-8 flex items-center gap-2 px-2",
        collapsed && "mb-6 justify-center px-0",
      )}
    >
      <BrandLogo size={collapsed ? 32 : 36} />
      {!collapsed ? (
        <div className="min-w-0">
          <div className="font-display text-lg font-bold tracking-tight">Cirofy</div>
          <div className="text-xs text-sidebar-muted">Satıcı paneli</div>
        </div>
      ) : null}
    </div>
  );
}

function MobileBottomNav({
  pathname,
  onMore,
}: {
  pathname: string;
  onMore: () => void;
}) {
  const moreActive = mobileMore.some((i) => isItemActive(pathname, i.href));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
    >
      <div className="grid h-16 grid-cols-5">
        {mobilePrimary.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                active ? "text-profit" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.25]")} />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          className={cn(
            "flex flex-col items-center justify-center gap-1 text-[11px] font-semibold",
            moreActive ? "text-profit" : "text-muted-foreground",
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          Daha
        </button>
      </div>
    </nav>
  );
}

const AppShellNestContext = createContext(false);

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/** Kalıcı panel çerçevesi — layout’ta bir kez mount edilir. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, logout } = useRequireAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [quotaWarn, setQuotaWarn] = useState<{
    reason: string;
    blocked: boolean;
  } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "0") setSidebarOpen(false);
    if (stored === "1") setSidebarOpen(true);
    setSidebarReady(true);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!ready || !user || !getToken()) {
      setQuotaWarn(null);
      return;
    }
    if (pathname.startsWith("/billing")) {
      setQuotaWarn(null);
      return;
    }
    let cancelled = false;
    void apiFetch<{
      warnReason?: string | null;
      blockedReason?: string | null;
      nearOrderLimit?: boolean;
      nearStoreLimit?: boolean;
    }>("/billing/usage")
      .then((u) => {
        if (cancelled) return;
        if (u.blockedReason) {
          setQuotaWarn({ reason: u.blockedReason, blocked: true });
        } else if (u.warnReason) {
          setQuotaWarn({ reason: u.warnReason, blocked: false });
        } else {
          setQuotaWarn(null);
        }
      })
      .catch(() => {
        if (!cancelled) setQuotaWarn(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user, pathname]);

  useEffect(() => {
    if (!ready || !user) return;
    if (!canAccessPath(pathname, user.teamRole)) {
      router.replace(defaultHomeForRole(user.teamRole));
    }
  }, [ready, user, pathname, router]);

  function toggleSidebar() {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  }

  const initials = (user?.fullName ?? "C")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (!ready) {
    return <ShellSkeleton />;
  }

  const collapsed = sidebarReady && !sidebarOpen;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen w-full">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen max-h-dvh shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar py-5 text-sidebar-foreground transition-[width] duration-200 ease-out lg:flex",
            collapsed ? "w-[72px] px-2" : "w-64 px-4",
          )}
        >
          <div className="shrink-0">
            <SidebarBrand collapsed={collapsed} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <NavLinks
              pathname={pathname}
              collapsed={collapsed}
              teamRole={user?.teamRole}
            />
          </div>
          <div className="shrink-0 pt-3">
            <StoreCta collapsed={collapsed} />
          </div>
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Menüyü kapat"
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="relative z-10 flex h-full max-h-dvh w-[min(18rem,88vw)] flex-col overflow-hidden border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground shadow-xl">
              <div className="mb-6 flex shrink-0 items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <BrandLogo size={36} />
                  <div className="font-display text-lg font-bold tracking-tight">Cirofy</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-sidebar-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <NavLinks
                  pathname={pathname}
                  teamRole={user?.teamRole}
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <header
            className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex h-14 items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 lg:hidden"
                  aria-label="Menü"
                  onClick={() => setMobileOpen(true)}
                >
                  <Menu className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="hidden shrink-0 lg:inline-flex"
                  aria-label={sidebarOpen ? "Kenar çubuğunu daralt" : "Kenar çubuğunu genişlet"}
                  aria-pressed={sidebarOpen}
                  onClick={toggleSidebar}
                >
                  {sidebarOpen ? (
                    <PanelLeftClose className="h-4 w-4" />
                  ) : (
                    <PanelLeftOpen className="h-4 w-4" />
                  )}
                </Button>
                <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
                  <BrandLogo size={28} />
                  <span className="font-display text-base font-bold tracking-tight">Cirofy</span>
                </Link>
              </div>

              <div className="relative hidden max-w-md flex-1 md:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  placeholder="Sipariş, ürün veya SKU ara…"
                  className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                <Button variant="outline" size="icon" className="md:hidden" aria-label="Ara">
                  <Search className="h-4 w-4" />
                </Button>
                <NotificationsButton />
                <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />
                <div className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-1 sm:gap-3 sm:pr-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="hidden text-left sm:block">
                    <div className="text-sm font-semibold leading-none">
                      {user?.fullName ?? "Satıcı"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {user?.organization?.name ?? "Hesap"}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden sm:inline-flex"
                  aria-label="Çıkış"
                  onClick={logout}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
            {quotaWarn ? (
              <div
                className={cn(
                  "mb-4 flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                  quotaWarn.blocked
                    ? "border-loss/30 bg-loss/5"
                    : "border-amber-200 bg-amber-50",
                )}
              >
                <div className="min-w-0">
                  <Badge tone={quotaWarn.blocked ? "loss" : "warn"}>
                    {quotaWarn.blocked ? "Kota doldu" : "Kota yaklaşıyor"}
                  </Badge>
                  <p
                    className={cn(
                      "mt-1.5 text-sm",
                      quotaWarn.blocked ? "text-loss" : "text-amber-900",
                    )}
                  >
                    {quotaWarn.reason}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href="/billing">Planı yükselt</Link>
                </Button>
              </div>
            ) : null}
            <AppShellNestContext.Provider value={true}>
              {children}
            </AppShellNestContext.Provider>
          </main>
        </div>
      </div>

      <MobileBottomNav pathname={pathname} onMore={() => setMobileOpen(true)} />
    </div>
  );
}

/** Sayfa başlığı + içerik. AppShell içinde sidebar yeniden mount olmaz. */
export function DashboardShell({
  children,
  title,
  description,
  actions,
  loading = false,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
}) {
  const nested = useContext(AppShellNestContext);
  const header =
    !loading && title ? (
      <PageHeader title={title} description={description} actions={actions} />
    ) : null;

  if (nested) {
    return (
      <>
        {header}
        {children}
      </>
    );
  }

  return (
    <AppShell>
      {header}
      {children}
    </AppShell>
  );
}
