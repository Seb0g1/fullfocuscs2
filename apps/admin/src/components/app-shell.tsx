"use client";

import clsx from "clsx";
import { BarChart3, Bomb, LogOut, Menu, Settings, Shield, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

const nav = [
  { href: "/", label: "Обзор", icon: BarChart3 },
  { href: "/grenades", label: "Раскиды", icon: Bomb },
  { href: "/users", label: "Админы", icon: Users },
  { href: "/settings", label: "Настройки", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    await api("/admin/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/40 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between">
          <Brand size="sm" />
          <button className="btn btn-ghost h-10 w-10 px-0" onClick={() => setMobileOpen((open) => !open)} aria-label="Открыть меню">
            {mobileOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
        {mobileOpen ? (
          <nav className="mt-3 grid gap-2">
            {nav.map((item) => (
              <NavLink key={item.href} item={item} active={pathname === item.href} onClick={() => setMobileOpen(false)} />
            ))}
            <button className="btn btn-ghost justify-start" onClick={logout}>
              <LogOut size={17} />
              Выйти
            </button>
          </nav>
        ) : null}
      </header>

      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 bg-black/30 p-5 backdrop-blur-xl lg:block">
        <Brand />
        <nav className="mt-8 space-y-2">
          {nav.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} />
          ))}
        </nav>
        <button className="btn btn-ghost absolute bottom-5 left-5 right-5" onClick={logout}>
          <LogOut size={17} />
          Выйти
        </button>
      </aside>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

function Brand({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-lg border border-focus/60 bg-focus/15 text-focus">
        <Shield size={size === "sm" ? 19 : 22} />
      </div>
      <div>
        <div className={clsx("font-black uppercase", size === "sm" ? "text-base" : "text-lg")}>FullFocus</div>
        <div className="text-xs uppercase tracking-[0.32em] text-zinc-500">cs2 admin</div>
      </div>
    </div>
  );
}

function NavLink({
  item,
  active,
  onClick
}: {
  item: (typeof nav)[number];
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={clsx(
        "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition",
        active ? "bg-focus text-black" : "text-zinc-300 hover:bg-white/7"
      )}
    >
      <Icon size={18} />
      {item.label}
    </Link>
  );
}
