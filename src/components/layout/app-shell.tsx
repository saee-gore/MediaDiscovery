"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Compass, ListMusic, LogOut, Menu, Moon, Popcorn, Search, Sun, X } from "lucide-react";

import { useTheme } from "@/components/providers/theme";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";

interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile bar. */
  short: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Three areas, and that is the whole application:
 *   search, the landing surface, both catalogues behind one toggle
 *   music curation, playlists
 *   screen curation, bucket lists
 *
 * Everything here is behind a session. The middleware does the actual gating;
 * this shell only needs to know who is signed in so it can say so and offer a
 * way out.
 */
const NAV: NavItem[] = [
  { href: "/", label: "Search", short: "Search", icon: Search },
  { href: "/playlists", label: "My Song Playlists", short: "Songs", icon: ListMusic },
  { href: "/bucket-lists", label: "Movies & Series Lists", short: "Screen", icon: Popcorn },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // The sign-in page is the one route that renders without the shell around it.
  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-text"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-bg-elevated lg:flex">
        {/* Theme sits at the very top-left, above everything else. */}
        <div className="flex items-center border-b border-line px-3 py-2.5">
          <ThemeToggle />
        </div>
        <Brand />
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <AccountRow />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg-elevated/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="text-sm font-semibold tracking-tight text-ink">Curated</span>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setMenuOpen(false)}>
          <div
            className="animate-fade-up ml-auto flex h-full w-72 flex-col border-l border-line bg-bg-elevated"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-sm font-semibold text-ink">Menu</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-subtle hover:bg-surface-hover hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Main">
              {NAV.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  onClick={() => setMenuOpen(false)}
                />
              ))}
            </nav>
            <AccountRow />
          </div>
        </div>
      ) : null}

      <main id="main" className="pb-20 lg:pb-0 lg:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      {/* Mobile bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-line bg-bg-elevated/95 backdrop-blur lg:hidden"
        aria-label="Primary"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                active ? "text-accent" : "text-subtle hover:text-ink",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Logo() {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 items-center justify-center rounded-lg text-accent-text"
      style={{ backgroundImage: "linear-gradient(135deg, var(--accent), var(--amber))" }}
    >
      <Compass className="h-4 w-4" />
    </span>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 border-b border-line px-4 py-4">
      <Logo />
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-tight text-ink">Curated</span>
        <span className="block text-[11px] text-subtle">Semantic media discovery</span>
      </span>
    </Link>
  );
}

function NavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-hover hover:text-ink",
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

interface Account {
  userId: string;
  email: string;
  name: string;
}

/**
 * Who you are, and the way out.
 *
 * The name is fetched rather than passed down because the shell is a client
 * component shared by every route; asking once on mount is cheaper than making
 * every page thread a session through props. A failed fetch renders nothing
 * rather than an error, since the middleware would already have redirected
 * anyone who is genuinely signed out.
 */
function AccountRow() {
  const [account, setAccount] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ user: Account | null }>("/api/auth/me")
      .then((data) => {
        if (cancelled) return;
        if (data.user) {
          setAccount(data.user);
          return;
        }
        // The middleware only checks the token's signature, which stays valid
        // after an account is deleted. This is the server confirming the row is
        // gone, so send them back to sign in rather than leaving an empty shell.
        window.location.assign("/login");
      })
      .catch(() => {
        /* Server unreachable. The page is still usable; don't eject them. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* The cookie is cleared server-side either way; navigate regardless. */
    }
    // Hard navigation so the middleware re-evaluates and no stale state remains.
    window.location.assign("/login");
  }

  if (!account) return null;

  return (
    <div className="flex items-center gap-2 border-t border-line p-3">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold uppercase text-accent"
      >
        {account.name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{account.name}</span>
        <span className="block truncate text-[11px] text-subtle">{account.email}</span>
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        aria-label="Sign out"
        title="Sign out"
        className="shrink-0 rounded-lg p-2 text-subtle transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Day or night, nothing else. "System" was a third state that looked like a
 * choice but behaved like an absence of one, so the control now says exactly
 * what the screen will do. `resolved` is what the user is actually looking at,
 * which is the right thing to check when the stored preference is "system".
 */
function ThemeToggle({ compact }: { compact?: boolean }) {
  const { resolved, setTheme } = useTheme();
  const options = [
    { value: "light", icon: Sun, label: "Day" },
    { value: "dark", icon: Moon, label: "Night" },
  ] as const;

  if (compact) {
    const next = resolved === "dark" ? "light" : "dark";
    const Icon = resolved === "dark" ? Moon : Sun;
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={next === "dark" ? "Switch to night" : "Switch to day"}
        className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-hover hover:text-ink"
      >
        <Icon className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-line p-0.5"
      role="radiogroup"
      aria-label="Theme"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={resolved === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => setTheme(option.value)}
          className={cx(
            "flex items-center justify-center rounded-md px-3 py-1.5 transition-colors",
            resolved === option.value ? "bg-surface-hover text-ink" : "text-subtle hover:text-ink",
          )}
        >
          <option.icon className="h-3.5 w-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
