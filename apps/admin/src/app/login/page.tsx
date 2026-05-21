"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { LogIn, Shield } from "lucide-react";
import { api } from "@/lib/api";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [telegramId, setTelegramId] = useState("1");
  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "FullFocusCs2Bot";
  const devLogin = process.env.NEXT_PUBLIC_DEV_LOGIN === "true" || process.env.NODE_ENV !== "production";

  useEffect(() => {
    window.onTelegramAuth = async (user) => {
      await api("/admin/auth/telegram", {
        method: "POST",
        body: JSON.stringify(user)
      });
      router.push("/");
    };
  }, [router]);

  async function submitDev(event: FormEvent) {
    event.preventDefault();
    await api("/admin/auth/dev", {
      method: "POST",
      body: JSON.stringify({ telegramId, username: "dev_admin" })
    });
    router.push("/");
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="panel w-full max-w-md p-6 shadow-glow">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-lg border border-focus/60 bg-focus/15 text-focus">
            <Shield size={24} />
          </div>
          <div>
            <div className="text-2xl font-black uppercase">FullFocus</div>
            <div className="text-xs uppercase tracking-[0.34em] text-zinc-500">cs2 admin</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div id="telegram-login" className="min-h-12" />
            <Script
              src="https://telegram.org/js/telegram-widget.js?22"
              strategy="afterInteractive"
              data-telegram-login={botName}
              data-size="large"
              data-radius="8"
              data-userpic="false"
              data-onauth="onTelegramAuth(user)"
              data-request-access="write"
            />
          </div>

          {devLogin ? (
            <form onSubmit={submitDev} className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
              <label className="block text-sm font-semibold text-zinc-300">
                Telegram ID для dev-входа
                <input className="field mt-2" value={telegramId} onChange={(event) => setTelegramId(event.target.value)} />
              </label>
              <button className="btn btn-primary w-full" type="submit">
                <LogIn size={18} />
                Войти в dev-режиме
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </main>
  );
}
