"use client";

import clsx from "clsx";
import { BarChart3, Bomb, LogOut, Settings, Shield, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

  async function logout() {
    await api("/admin/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 bg-black/30 p-5 backdrop-blur-xl lg:block">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-focus/60 bg-focus/15 text-focus">
            <Shield size={22} />
          </div>
          <div>
            <div className="text-lg font-black uppercase">FullFocus</div>
            <div className="text-xs uppercase tracking-[0.32em] text-zinc-500">cs2 admin</div>
          </div>
        </div>
        <nav className="space-y-2">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition",
                  active ? "bg-focus text-black" : "text-zinc-300 hover:bg-white/7"
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
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
