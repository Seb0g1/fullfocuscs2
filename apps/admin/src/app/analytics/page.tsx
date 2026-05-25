"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Bot, Megaphone, Radio, Search, TrendingUp, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { api } from "@/lib/api";

interface Overview {
  range: string;
  users: number;
  activeUsers: number;
  events: number;
  statsSuccess: number;
  statsError: number;
  lineupsSent: number;
  broadcasts: Broadcast[];
}

interface ContentAnalytics {
  maps: Array<{ name: string; count: number }>;
  grenadeTypes: Array<{ name: string; count: number }>;
  searches: Array<{ id: string; createdAt: string; metadata: unknown }>;
}

interface Broadcast {
  id: string;
  title: string;
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
}

interface Health {
  ok: boolean;
  users: number;
  lineups: number;
  webhookUrl: string;
  adminPublicUrl: string;
  ffmpeg: string;
  lastErrors: Array<{ id: string; type: string; createdAt: string; metadata: unknown }>;
}

export default function AnalyticsPage() {
  return (
    <AuthGate>
      <AppShell>
        <Analytics />
      </AppShell>
    </AuthGate>
  );
}

function Analytics() {
  const overview = useQuery({ queryKey: ["analytics-overview"], queryFn: () => api<Overview>("/admin/analytics/overview?range=7d") });
  const content = useQuery({ queryKey: ["analytics-content"], queryFn: () => api<ContentAnalytics>("/admin/analytics/content?range=7d") });
  const health = useQuery({ queryKey: ["admin-health"], queryFn: () => api<Health>("/admin/health") });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.4em] text-focus">Продукт</p>
        <h1 className="mt-2 text-3xl font-black sm:text-5xl">Аналитика</h1>
      </header>

      {overview.isError || content.isError || health.isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-100">
          <AlertTriangle size={18} />
          Не удалось загрузить аналитику. Проверь API и миграции Prisma.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Users} label="Пользователи" value={overview.data?.users} sub={`Активные: ${overview.data?.activeUsers ?? 0}`} />
        <Metric icon={TrendingUp} label="Стата FACEIT" value={overview.data?.statsSuccess} sub={`Ошибки: ${overview.data?.statsError ?? 0}`} />
        <Metric icon={Radio} label="Раскиды отправлены" value={overview.data?.lineupsSent} sub="lineup_sent за 7 дней" />
        <Metric icon={Activity} label="События" value={overview.data?.events} sub="клики, поиск, карточки" />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Популярные карты" icon={Bot}>
          <Bars items={content.data?.maps ?? []} empty="Пока нет отправленных раскидов." />
        </Panel>
        <Panel title="Типы гранат" icon={Activity}>
          <Bars items={content.data?.grenadeTypes ?? []} empty="Пока нет событий по типам." />
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel title="Поисковые запросы" icon={Search}>
          <div className="space-y-2">
            {(content.data?.searches ?? []).length ? (
              content.data?.searches.map((event) => (
                <div key={event.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">
                  {metadataValue(event.metadata, "query") || "Поиск"} · <span className="text-zinc-500">{new Date(event.createdAt).toLocaleString("ru-RU")}</span>
                </div>
              ))
            ) : (
              <Empty>Поиска ещё не было.</Empty>
            )}
          </div>
        </Panel>

        <Panel title="Bot Health" icon={Activity}>
          <div className="space-y-3 text-sm">
            <HealthRow label="Status" value={health.data?.ok ? "OK" : "loading"} />
            <HealthRow label="Webhook" value={health.data?.webhookUrl || "не задан"} />
            <HealthRow label="Public URL" value={health.data?.adminPublicUrl || "не задан"} />
            <HealthRow label="FFmpeg" value={health.data?.ffmpeg || "loading"} />
            <HealthRow label="Lineups" value={String(health.data?.lineups ?? 0)} />
          </div>
        </Panel>
      </section>

      <Panel title="Рассылки" icon={Megaphone}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(overview.data?.broadcasts ?? []).length ? (
            overview.data?.broadcasts.map((campaign) => (
              <div key={campaign.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="font-bold text-white">{campaign.title}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.16em] text-focus">{campaign.status}</div>
                <div className="mt-3 text-sm text-zinc-400">
                  {campaign.sentCount}/{campaign.totalCount} sent · failed {campaign.failedCount}
                </div>
              </div>
            ))
          ) : (
            <Empty>Рассылок пока нет.</Empty>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value?: number; sub: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-bold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
        <Icon className="text-focus" size={20} />
      </div>
      <div className="mt-4 text-4xl font-black">{value ?? "..."}</div>
      <div className="mt-2 text-sm text-zinc-500">{sub}</div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Users; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="text-focus" size={20} />
        <h2 className="text-xl font-black">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Bars({ items, empty }: { items: Array<{ name: string; count: number }>; empty: string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.name}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="font-bold text-zinc-200">{item.name}</span>
            <span className="text-zinc-500">{item.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-focus" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-1 break-words font-semibold text-zinc-200">{value}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">{children}</div>;
}

function metadataValue(metadata: unknown, key: string) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof (metadata as Record<string, unknown>)[key] === "string"
    ? String((metadata as Record<string, unknown>)[key])
    : null;
}
