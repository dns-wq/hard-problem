"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/topics", label: "Topics" },
  { href: "/admin/concepts", label: "Concepts" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/stance-tags", label: "Stance tags" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 52px)" }}>
      <aside className="admin-sidebar">
        <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "1rem" }}>
          Admin
        </p>
        <nav>
          {NAV.map(({ href, label, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={`admin-nav-link${active ? " active" : ""}`}>
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="admin-content">{children}</div>
    </div>
  );
}
