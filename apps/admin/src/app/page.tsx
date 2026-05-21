"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Bomb, ImageIcon, Server, Shield, Users, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { API_URL, api } from "@/lib/api";

interface Overview {
  users: number;
  admins: number;
  maps: number;
  lineups: number;
  publishedLineups: number;
  recentQueries: Array<{ id: string; query: string; faceitNickname: string | null; status: string; createdAt: string }>;
}

export default function DashboardPage() {
  return (
    <AuthGate>
      <AppShell>
        <Dashboard />
      </AppShell>
    </AuthGate>
  );
}

function Dashboard() {
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: () => api<Overview>("/admin/overview")
  });

  const data = overview.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.4em] text-focus">FullFocus cs2</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">Панель управления</h1>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
          API: {API_URL}
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        <Metric icon={Users} label="Пользователи" value={data?.users ?? 0} />
        <Metric icon={Shield} label="Админы" value={data?.admins ?? 0} />
        <Metric icon={Server} label="Карты" value={data?.maps ?? 0} />
        <Metric icon={Bomb} label="Раскиды" value={data?.lineups ?? 0} />
        <Metric icon={Activity} label="Опубликовано" value={data?.publishedLineups ?? 0} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="text-focus" size={20} />
            <h2 className="text-xl font-black">Последние запросы</h2>
          </div>
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-[0.22em] text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Запрос</th>
                  <th className="px-4 py-3">Игрок</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Время</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentQueries ?? []).map((query) => (
                  <tr key={query.id} className="border-t border-white/10">
                    <td className="px-4 py-3 font-semibold">{query.query}</td>
                    <td className="px-4 py-3 text-zinc-300">{query.faceitNickname ?? "—"}</td>
                    <td className="px-4 py-3 text-emerald-300">{query.status}</td>
                    <td className="px-4 py-3 text-zinc-500">{new Date(query.createdAt).toLocaleString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel overflow-hidden p-5">
          <div className="mb-4 flex items-center gap-2">
            <ImageIcon className="text-cyan" size={20} />
            <h2 className="text-xl font-black">Preview карточки</h2>
          </div>
          <img
            src={`${API_URL}/admin/cards/preview`}
            alt="Stat card preview"
            className="aspect-[1080/1215] w-full rounded-lg border border-white/10 object-cover"
          />
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="panel p-4">
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-focus/15 text-focus">
        <Icon size={18} />
      </div>
      <div className="text-3xl font-black">{value}</div>
      <div className="mt-1 text-sm text-zinc-500">{label}</div>
    </div>
  );
}
