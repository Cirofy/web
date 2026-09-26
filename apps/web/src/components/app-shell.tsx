import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({
  children,
  active,
}: {
  children: ReactNode;
  active: string;
}) {
  const links = [
    { href: "/dashboard", label: "Özet" },
    { href: "/products", label: "Ürünler" },
    { href: "/orders", label: "Siparişler" },
    { href: "/billing", label: "Abonelik" },
    { href: "/settings", label: "Ayarlar" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Cirofy</div>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={active === l.href ? "active" : undefined}
          >
            {l.label}
          </Link>
        ))}
        <div style={{ marginTop: 28 }}>
          <Link href="/login">Çıkış</Link>
        </div>
      </aside>
      <div className="content">{children}</div>
    </div>
  );
}
