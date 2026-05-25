"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, ImageUp, Loader2, Palette, Plus, Save, Settings, Sparkles, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { SelectField } from "@/components/select-field";
import { api, mediaUrl } from "@/lib/api";

type BotButtonStyle = "default" | "primary" | "success" | "danger";

interface BotSetting {
  key: string;
  value: unknown;
}

interface RuntimeSettings {
  adminPublicUrl: string;
  botWebhookUrl: string;
  telegramBotUsername: string;
  dockerNginxPort: string;
  nodeEnv: string;
  adminDevLogin: boolean;
}

interface BotButtonConfig {
  key:
    | "stats"
    | "compare"
    | "grenades"
    | "leaderboard"
    | "settings"
    | "profile"
    | "favorites"
    | "training"
    | "search"
    | "menu"
    | "back"
    | "backToMaps"
    | "favorite"
    | "bindFaceit"
    | "otherPlayer"
    | "myStats";
  label: string;
  fallbackEmoji: string;
  premiumEmojiId: string | null;
  style: BotButtonStyle;
  enabled: boolean;
}

interface PremiumEmojiConfig {
  key: string;
  title: string;
  fallbackEmoji: string;
  customEmojiId: string;
}

const defaultMenuButtons: BotButtonConfig[] = [
  { key: "stats", label: "Статистика", fallbackEmoji: "📈", premiumEmojiId: null, style: "primary", enabled: true },
  { key: "compare", label: "Сравнить", fallbackEmoji: "⚔️", premiumEmojiId: null, style: "primary", enabled: true },
  { key: "grenades", label: "Раскид гранат", fallbackEmoji: "💣", premiumEmojiId: null, style: "success", enabled: true },
  { key: "leaderboard", label: "Лидерборд", fallbackEmoji: "🏆", premiumEmojiId: null, style: "success", enabled: true },
  { key: "profile", label: "Мой профиль", fallbackEmoji: "🎯", premiumEmojiId: null, style: "primary", enabled: true },
  { key: "favorites", label: "Избранное", fallbackEmoji: "⭐", premiumEmojiId: null, style: "default", enabled: true },
  { key: "training", label: "Тренировка", fallbackEmoji: "🧠", premiumEmojiId: null, style: "default", enabled: true },
  { key: "search", label: "Поиск", fallbackEmoji: "🔎", premiumEmojiId: null, style: "default", enabled: true },
  { key: "settings", label: "Настройки", fallbackEmoji: "⚙️", premiumEmojiId: null, style: "primary", enabled: true },
  { key: "menu", label: "Меню", fallbackEmoji: "🏠", premiumEmojiId: null, style: "primary", enabled: true },
  { key: "back", label: "Назад", fallbackEmoji: "⬅️", premiumEmojiId: null, style: "default", enabled: true },
  { key: "backToMaps", label: "К выбору карты", fallbackEmoji: "🗺️", premiumEmojiId: null, style: "primary", enabled: true },
  { key: "favorite", label: "В избранное", fallbackEmoji: "⭐", premiumEmojiId: null, style: "success", enabled: true },
  { key: "bindFaceit", label: "Привязать FACEIT", fallbackEmoji: "🔗", premiumEmojiId: null, style: "primary", enabled: true },
  { key: "otherPlayer", label: "Другой игрок", fallbackEmoji: "👤", premiumEmojiId: null, style: "default", enabled: true },
  { key: "myStats", label: "Моя статистика", fallbackEmoji: "📈", premiumEmojiId: null, style: "success", enabled: true }
];

const mainMenuKeys = new Set(["stats", "compare", "grenades", "leaderboard", "profile", "favorites", "training", "search", "settings"]);
const actionPreviewKeys = ["favorite", "back", "backToMaps", "menu"];

const defaultCatalog: PremiumEmojiConfig[] = [
  { key: "smoke", title: "Смок", fallbackEmoji: "💨", customEmojiId: "" },
  { key: "flash", title: "Флешка", fallbackEmoji: "⚡", customEmojiId: "" },
  { key: "molotov", title: "Молик", fallbackEmoji: "🔥", customEmojiId: "" },
  { key: "he", title: "HE", fallbackEmoji: "💥", customEmojiId: "" },
  { key: "star", title: "Избранное", fallbackEmoji: "⭐", customEmojiId: "" },
  { key: "focus", title: "FullFocus", fallbackEmoji: "🎯", customEmojiId: "" }
];

const styleOptions = [
  { value: "default", label: "Default" },
  { value: "primary", label: "Primary" },
  { value: "success", label: "Success" },
  { value: "danger", label: "Danger" }
];

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
  const runtime = useQuery({ queryKey: ["settings-runtime"], queryFn: () => api<RuntimeSettings>("/admin/settings/runtime") });
  const [welcomeText, setWelcomeText] = useState("");
  const [welcomeImageUrl, setWelcomeImageUrl] = useState("");
  const [menuButtons, setMenuButtons] = useState<BotButtonConfig[]>(defaultMenuButtons);
  const [catalog, setCatalog] = useState<PremiumEmojiConfig[]>(defaultCatalog);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [imageNotice, setImageNotice] = useState<string | null>(null);

  useEffect(() => {
    const welcome = settings.data?.find((item) => item.key === "welcomeText")?.value as { text?: string } | undefined;
    setWelcomeText(welcome?.text ?? "Привет! Я FullFocus cs2: FACEIT-статистика, сравнение игроков, раскиды гранат и персональный CS2-профиль.");

    const image = settings.data?.find((item) => item.key === "welcomeImageUrl")?.value as { url?: string } | undefined;
    setWelcomeImageUrl(image?.url ?? "");

    setMenuButtons(normalizeMenuButtons(settings.data?.find((item) => item.key === "botButtons")?.value, settings.data?.find((item) => item.key === "menuButtons")?.value));
    setCatalog(normalizeCatalog(settings.data?.find((item) => item.key === "premiumEmojiCatalog")?.value));
  }, [settings.data]);

  const enabledPreview = useMemo(() => menuButtons.filter((button) => button.enabled && mainMenuKeys.has(button.key)), [menuButtons]);
  const actionPreview = useMemo(
    () => actionPreviewKeys.flatMap((key) => menuButtons.find((button) => button.key === key && button.enabled) ?? []),
    [menuButtons]
  );

  const save = useMutation({
    mutationFn: async () => {
      await api("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          settings: [
            { key: "welcomeText", value: { text: welcomeText.trim() } },
            { key: "welcomeImageUrl", value: { url: welcomeImageUrl.trim() } },
            { key: "botButtons", value: menuButtons.map(cleanButton) },
            { key: "menuButtons", value: menuButtons.filter((button) => mainMenuKeys.has(button.key)).map(cleanButton) },
            { key: "premiumEmojiCatalog", value: catalog.map(cleanCatalogItem) }
          ]
        })
      });
    },
    onSuccess: () => {
      setError(null);
      setSaved(true);
      return queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (mutationError) => {
      setSaved(false);
      setError(mutationError instanceof Error ? mutationError.message : "Не удалось сохранить настройки");
    }
  });

  const uploadWelcomeImage = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return api<{ url: string }>("/admin/media", { method: "POST", body });
    },
    onSuccess: (result) => {
      setWelcomeImageUrl(result.url);
      setError(null);
      setSaved(false);
      setImageNotice("Картинка загружена. Нажми “Сохранить всё”, чтобы применить.");
    },
    onError: (uploadError) => {
      setSaved(false);
      setImageNotice(null);
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить картинку");
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    await save.mutateAsync();
  }

  async function uploadImage(file: File | null) {
    if (!file) return;
    setError(null);
    setSaved(false);
    setImageNotice(null);
    await uploadWelcomeImage.mutateAsync(file);
  }

  function clearWelcomeImage() {
    setWelcomeImageUrl("");
    setSaved(false);
    setImageNotice("Картинка очищена. Нажми “Сохранить всё”, чтобы применить.");
  }

  function patchButton(index: number, patch: Partial<BotButtonConfig>) {
    setMenuButtons((current) => current.map((button, itemIndex) => (itemIndex === index ? { ...button, ...patch } : button)));
  }

  function patchCatalog(index: number, patch: Partial<PremiumEmojiConfig>) {
    setCatalog((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function addCatalogItem() {
    setCatalog((current) => [...current, { key: `custom_${current.length + 1}`, title: "Новый emoji", fallbackEmoji: "✨", customEmojiId: "" }]);
  }

  function removeCatalogItem(index: number) {
    setCatalog((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.4em] text-focus">Бот</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">Настройки</h1>
        </div>
        <button className="btn btn-primary" disabled={save.isPending || settings.isLoading} type="submit">
          <Save size={18} />
          Сохранить всё
        </button>
      </header>

      {settings.isError || runtime.isError || error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-100">
          <AlertTriangle size={18} />
          {error ?? "Не удалось загрузить настройки. Проверь API и обнови страницу."}
        </div>
      ) : null}

      {saved ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-100">
          Настройки сохранены. Бот применит их при следующем действии пользователя.
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="panel space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Settings className="text-focus" size={20} />
              <h2 className="text-xl font-black">Приветствие</h2>
            </div>
            <label className="block text-sm font-semibold text-zinc-300">
              Приветственное сообщение
              <textarea
                className="field mt-2 min-h-36"
                value={settings.isLoading ? "Загружаем..." : welcomeText}
                disabled={settings.isLoading}
                onChange={(event) => setWelcomeText(event.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold text-zinc-300">
              Картинка приветствия
              <input
                className="field mt-2"
                placeholder="https://... или /media/welcome.webp"
                value={settings.isLoading ? "Загружаем..." : welcomeImageUrl}
                disabled={settings.isLoading}
                onChange={(event) => setWelcomeImageUrl(event.target.value)}
              />
            </label>
            <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold text-zinc-200">Загрузка картинки</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">Рекомендуем webp/png до нескольких MB. URL всё ещё можно вставить вручную выше.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className={`btn btn-ghost h-10 cursor-pointer ${uploadWelcomeImage.isPending ? "pointer-events-none opacity-60" : ""}`}>
                  {uploadWelcomeImage.isPending ? <Loader2 size={16} className="animate-spin" /> : <ImageUp size={16} />}
                  {uploadWelcomeImage.isPending ? "Загружаем" : "Загрузить картинку"}
                  <input
                    data-testid="welcome-image-upload"
                    className="hidden"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    disabled={uploadWelcomeImage.isPending || settings.isLoading}
                    onChange={(event) => uploadImage(event.target.files?.[0] ?? null)}
                  />
                </label>
                <button className="btn btn-ghost h-10" type="button" disabled={!welcomeImageUrl || uploadWelcomeImage.isPending} onClick={clearWelcomeImage}>
                  <X size={16} />
                  Очистить
                </button>
              </div>
            </div>
            {imageNotice ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100">{imageNotice}</div>
            ) : null}
            <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
              {welcomeImageUrl ? (
                <img src={mediaUrl(welcomeImageUrl)} alt="Preview приветствия" className="h-44 w-full object-cover" />
              ) : (
                <div className="grid h-28 place-items-center text-sm text-zinc-500">Preview картинки появится здесь</div>
              )}
            </div>
          </section>

          <section className="panel space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Palette className="text-focus" size={20} />
              <h2 className="text-xl font-black">Внешний вид меню</h2>
            </div>
            <div className="grid gap-3">
              {menuButtons.map((button, index) => (
                <div key={button.key} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-white">{button.key}</div>
                      <div className="text-xs text-zinc-500">Premium emoji включается через custom_emoji_id, fallback всегда останется в тексте.</div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input type="checkbox" checked={button.enabled} onChange={(event) => patchButton(index, { enabled: event.target.checked })} />
                      Активно
                    </label>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[1fr_92px_1.2fr_150px]">
                    <input className="field" value={button.label} onChange={(event) => patchButton(index, { label: event.target.value })} placeholder="Название" />
                    <input className="field" value={button.fallbackEmoji} onChange={(event) => patchButton(index, { fallbackEmoji: event.target.value })} placeholder="Emoji" />
                    <input
                      className="field"
                      value={button.premiumEmojiId ?? ""}
                      onChange={(event) => patchButton(index, { premiumEmojiId: event.target.value || null })}
                      placeholder="premium custom_emoji_id"
                    />
                    <SelectField value={button.style} options={styleOptions} onChange={(value) => patchButton(index, { style: value as BotButtonStyle })} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="text-focus" size={20} />
                <h2 className="text-xl font-black">Premium emoji catalog</h2>
              </div>
              <button className="btn btn-ghost h-9" type="button" onClick={addCatalogItem}>
                <Plus size={16} />
                Добавить
              </button>
            </div>
            <div className="grid gap-3">
              {catalog.map((item, index) => (
                <div key={`${item.key}-${index}`} className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 lg:grid-cols-[140px_1fr_90px_1.2fr_44px]">
                  <input className="field" value={item.key} onChange={(event) => patchCatalog(index, { key: event.target.value })} placeholder="key" />
                  <input className="field" value={item.title} onChange={(event) => patchCatalog(index, { title: event.target.value })} placeholder="Название" />
                  <input className="field" value={item.fallbackEmoji} onChange={(event) => patchCatalog(index, { fallbackEmoji: event.target.value })} placeholder="Emoji" />
                  <input className="field" value={item.customEmojiId} onChange={(event) => patchCatalog(index, { customEmojiId: event.target.value })} placeholder="custom_emoji_id" />
                  <button className="btn btn-ghost h-10 px-2" type="button" title="Удалить" onClick={() => removeCatalogItem(index)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-400">
              Чтобы узнать ID: отправь premium emoji боту командой <span className="font-mono text-zinc-200">/emoji_id</span>. Бот вернёт найденные custom_emoji_id.
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-5">
            <div className="flex items-center gap-2">
              <Bot className="text-focus" size={20} />
              <h2 className="text-xl font-black">Preview меню</h2>
            </div>
            <div className="mt-4 rounded-lg border border-white/10 bg-[#172033] p-3">
              <div className="mb-3 text-sm font-bold">FullFocus cs2 | выбери действие</div>
              <div className="grid grid-cols-2 gap-1.5">
                {enabledPreview.map((button) => (
                  <div key={button.key} className={`rounded-md px-3 py-2 text-center text-sm font-bold ${previewStyle(button.style)}`}>
                    {button.premiumEmojiId ? "" : `${button.fallbackEmoji} `}
                    {button.label}
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-zinc-500">После раскида</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {actionPreview.map((button) => (
                    <div key={button.key} className={`rounded-md px-3 py-2 text-center text-sm font-bold ${previewStyle(button.style)}`}>
                      {button.premiumEmojiId ? "" : `${button.fallbackEmoji} `}
                      {button.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-xl font-black">Production env</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">Эти значения задаются только в `.env` на сервере и не попадают в Git.</p>
            <div className="mt-4 space-y-2 text-sm text-zinc-400">
              <Env name="ADMIN_PUBLIC_URL" value={runtime.data?.adminPublicUrl} />
              <Env name="BOT_WEBHOOK_URL" value={runtime.data?.botWebhookUrl || "не задан"} />
              <Env name="TELEGRAM_BOT_USERNAME" value={runtime.data?.telegramBotUsername} />
              <Env name="DOCKER_NGINX_PORT" value={runtime.data?.dockerNginxPort} />
              <Env name="NODE_ENV" value={runtime.data?.nodeEnv} />
              <Env name="ADMIN_DEV_LOGIN" value={runtime.data ? String(runtime.data.adminDevLogin) : undefined} />
            </div>
          </section>
        </aside>
      </section>
    </form>
  );
}

function Env({ name, value }: { name: string; value?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="font-mono text-xs text-zinc-500">{name}</div>
      <div className="mt-1 break-words text-sm font-semibold text-zinc-200">{value ?? "загружаем..."}</div>
    </div>
  );
}

function normalizeMenuButtons(value: unknown, legacyValue?: unknown): BotButtonConfig[] {
  const configured = [...(Array.isArray(legacyValue) ? legacyValue : []), ...(Array.isArray(value) ? value : [])];
  return defaultMenuButtons.map((fallback) => {
    const item = configured.find((candidate) => isRecord(candidate) && candidate.key === fallback.key);
    if (!isRecord(item)) {
      return fallback;
    }
    const style = typeof item.style === "string" && ["default", "primary", "success", "danger"].includes(item.style) ? item.style : fallback.style;
    return {
      key: fallback.key,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : fallback.label,
      fallbackEmoji: typeof item.fallbackEmoji === "string" && item.fallbackEmoji.trim() ? item.fallbackEmoji.trim() : fallback.fallbackEmoji,
      premiumEmojiId: typeof item.premiumEmojiId === "string" && item.premiumEmojiId.trim() ? item.premiumEmojiId.trim() : null,
      style: style as BotButtonStyle,
      enabled: typeof item.enabled === "boolean" ? item.enabled : fallback.enabled
    };
  });
}

function normalizeCatalog(value: unknown): PremiumEmojiConfig[] {
  if (!Array.isArray(value)) {
    return defaultCatalog;
  }
  const items = value.flatMap((item): PremiumEmojiConfig[] => {
    if (!isRecord(item)) {
      return [];
    }
    const key = typeof item.key === "string" ? item.key.trim() : "";
    if (!key) {
      return [];
    }
    return [{
      key,
      title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : key,
      fallbackEmoji: typeof item.fallbackEmoji === "string" && item.fallbackEmoji.trim() ? item.fallbackEmoji.trim() : "✨",
      customEmojiId: typeof item.customEmojiId === "string" ? item.customEmojiId.trim() : ""
    }];
  });
  return items.length ? items : defaultCatalog;
}

function cleanButton(button: BotButtonConfig): BotButtonConfig {
  return {
    ...button,
    label: button.label.trim(),
    fallbackEmoji: button.fallbackEmoji.trim(),
    premiumEmojiId: button.premiumEmojiId?.trim() || null
  };
}

function cleanCatalogItem(item: PremiumEmojiConfig): PremiumEmojiConfig {
  return {
    key: item.key.trim(),
    title: item.title.trim(),
    fallbackEmoji: item.fallbackEmoji.trim() || "✨",
    customEmojiId: item.customEmojiId.trim()
  };
}

function previewStyle(style: BotButtonStyle) {
  if (style === "primary") return "bg-sky-500/25 text-sky-50 ring-1 ring-sky-400/25";
  if (style === "success") return "bg-emerald-500/25 text-emerald-50 ring-1 ring-emerald-400/25";
  if (style === "danger") return "bg-red-500/25 text-red-50 ring-1 ring-red-400/25";
  return "bg-[#071322] text-white ring-1 ring-white/10";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
