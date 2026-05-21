"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Save, Settings } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { api } from "@/lib/api";

interface BotSetting {
  key: string;
  value: unknown;
}

export default function SettingsPage() {
  return (
    <AuthGate>
      <AppShell>
        <SettingsPanel />
      </AppShell>
    </AuthGate>
  );
}

function SettingsPanel() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<BotSetting[]>("/admin/settings") });
  const [welcomeText, setWelcomeText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = settings.data?.find((item) => item.key === "welcomeText")?.value as { text?: string } | undefined;
    if (value?.text) {
      setWelcomeText(value.text);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      api("/admin/settings/welcomeText", {
        method: "PATCH",
        body: JSON.stringify({ value: { text: welcomeText } })
      }),
    onSuccess: () => {
      setError(null);
      return queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Не удалось сохранить настройки")
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await save.mutateAsync();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.4em] text-focus">Бот</p>
        <h1 className="mt-2 text-3xl font-black sm:text-5xl">Настройки</h1>
      </header>

      {(settings.isError || error) ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-100">
          <AlertTriangle size={18} />
          {error ?? "Не удалось загрузить настройки."}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <form onSubmit={submit} className="panel space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Settings className="text-focus" size={20} />
            <h2 className="text-xl font-black">Тексты и поведение</h2>
          </div>
          <label className="block text-sm font-semibold text-zinc-300">
            Приветственное сообщение
            <textarea
              className="field mt-2 min-h-40"
              value={settings.isLoading ? "Загружаем..." : welcomeText}
              disabled={settings.isLoading}
              onChange={(event) => setWelcomeText(event.target.value)}
            />
          </label>
          <button className="btn btn-primary" disabled={save.isPending || settings.isLoading} type="submit">
            <Save size={18} />
            Сохранить
          </button>
        </form>
        <div className="panel p-5">
          <h2 className="text-xl font-black">Production env</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Эти значения задаются только в `.env` на сервере и не попадают в Git.</p>
          <div className="mt-4 space-y-2 text-sm text-zinc-400">
            <Env name="BOT_TOKEN" />
            <Env name="FACEIT_API_KEY" />
            <Env name="STEAM_API_KEY" />
            <Env name="ADMIN_PUBLIC_URL" />
            <Env name="BOT_WEBHOOK_URL" />
            <Env name="DOCKER_NGINX_PORT" />
          </div>
        </div>
      </section>
    </div>
  );
}

function Env({ name }: { name: string }) {
  return <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs">{name}</div>;
}
