"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useThemeStore } from "@/stores/theme";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { trpc } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

export function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useThemeStore();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const nextTheme =
    theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const themeLabel =
    theme === "light" ? "☀" : theme === "dark" ? "◐" : "◑";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="header-logo">
          Hard Problem
        </Link>

        <nav className="header-nav">
          <Link
            href="/topics"
            className={`header-link ${pathname.startsWith("/topics") ? "active" : ""}`}
          >
            Topics
          </Link>
          <Link
            href="/concepts"
            className={`header-link ${pathname.startsWith("/concepts") ? "active" : ""}`}
          >
            Concepts
          </Link>
          <Link
            href="/about"
            className={`header-link ${pathname === "/about" ? "active" : ""}`}
          >
            About
          </Link>
        </nav>

        <div className="header-controls">
          <button
            className="header-btn"
            onClick={() => setTheme(nextTheme)}
            title={`Switch to ${nextTheme} mode`}
            aria-label="Toggle theme"
          >
            {themeLabel}
          </button>

          {user ? (
            <>
              <NotificationBell />
              <Link href="/profile" className="header-btn">
                Profile
              </Link>
              <button className="header-btn" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="header-btn">
                Sign in
              </Link>
              <Link href="/auth/signup" className="header-btn header-btn-primary">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
