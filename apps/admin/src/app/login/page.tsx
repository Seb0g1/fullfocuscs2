"use client";

import { FormEvent, useCallback, useState } from "react";
import { KeyRound, LogIn, RefreshCw, ShieldCheck, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { TelegramLoginButton } from "@/components/telegram-login-button";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [telegramId, setTelegramId] = useState("1");
  const [devError, setDevError] = useState<string | null>(null);
  const [devLoading, setDevLoading] = useState(false);
  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "fullfocuscs2_bot";
  const devLogin = process.env.NEXT_PUBLIC_DEV_LOGIN === "true" || process.env.NODE_ENV !== "production";

  const handleTelegramAuth = useCallback(async (user: Record<string, unknown>) => {
    await api("/admin/auth/telegram", {
      method: "POST",
      body: JSON.stringify(user)
    });
    router.push("/");
  }, [router]);

  async function submitDev(event: FormEvent) {
    event.preventDefault();
    setDevError(null);
    setDevLoading(true);
    try {
      await api("/admin/auth/dev", {
        method: "POST",
        body: JSON.stringify({ telegramId, username: "dev_admin" })
      });
      router.push("/");
    } catch (error) {
      setDevError(error instanceof Error ? error.message : "Не удалось войти в dev-режиме");
    } finally {
      setDevLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute left-[10%] top-[18%] h-52 w-52 rounded-full bg-cyan/10 blur-3xl" />
        <div className="absolute right-[12%] top-[12%] h-72 w-72 rounded-full bg-focus/16 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[35%] h-72 w-72 rounded-full bg-white/5 blur-3xl" />
      </div>

      <section className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden lg:block">
          <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-focus/30 bg-focus/10 px-3 py-2 text-sm font-semibold text-focus">
            <Target size={17} />
            FullFocus cs2 admin
          </div>
          <h1 className="max-w-2xl text-6xl font-black leading-[0.95] tracking-normal">
            Контроль бота, статистики FACEIT и раскидов в одном месте.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-400">
            Вход только для администраторов. Панель управляет контентом, пользователями, карточками статистики и Telegram-сценариями.
          </p>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            <Info label="Домен" value="tiktok.sebog1.ru" />
            <Info label="Admin" value="5030" />
            <Info label="API" value="4000" />
          </div>
        </div>

        <div className="mx-auto w-full max-w-md lg:hidden">
          <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-focus/30 bg-focus/10 px-3 py-2 text-sm font-semibold text-focus">
            <Target size={17} />
            FullFocus cs2 admin
          </div>
          <h1 className="mb-5 text-3xl font-black leading-tight">
            Контроль бота, статистики FACEIT и раскидов в одном месте.
          </h1>
        </div>

        <div className="panel mx-auto w-full max-w-md p-6 shadow-glow">
          <div className="mb-7 flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-lg border border-focus/60 bg-focus/15 text-focus shadow-glow">
              <ShieldCheck size={27} />
            </div>
            <div>
              <div className="text-3xl font-black uppercase leading-none">FullFocus</div>
              <div className="mt-2 text-xs uppercase tracking-[0.34em] text-zinc-500">cs2 admin</div>
            </div>
          </div>

          {devLogin ? (
            <form onSubmit={submitDev} className="space-y-3 rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-zinc-200">Локальный dev-вход</div>
                  <div className="mt-1 text-xs text-zinc-500">Для production используется Telegram Login</div>
                </div>
                <KeyRound className="text-focus" size={20} />
              </div>
              <label className="block text-sm font-semibold text-zinc-300">
                Telegram ID для dev-входа
                <input className="field mt-2" value={telegramId} onChange={(event) => setTelegramId(event.target.value)} />
              </label>
              {devError ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{devError}</div> : null}
              <button className="btn btn-primary w-full" type="submit" disabled={devLoading}>
                {devLoading ? <RefreshCw className="animate-spin" size={18} /> : <LogIn size={18} />}
                Войти в dev-режиме
              </button>
            </form>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-zinc-200">Вход через Telegram</div>
                  <div className="mt-1 text-xs text-zinc-500">@{botName}</div>
                </div>
                <KeyRound className="text-focus" size={20} />
              </div>
              <TelegramLoginButton botName={botName} onAuth={handleTelegramAuth} />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">{label}</div>
      <div className="mt-2 text-lg font-black">{value}</div>
    </div>
  );
}
