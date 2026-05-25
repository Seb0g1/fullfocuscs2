"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ImageUp, Loader2, Megaphone, Play, Plus, Save, Send, UploadCloud, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { SelectField } from "@/components/select-field";
import { api, mediaUrl } from "@/lib/api";

type MediaType = "none" | "photo" | "video";

interface BroadcastCampaign {
  id: string;
  title: string;
  mediaType: MediaType | null;
  mediaUrl: string | null;
  caption: string;
  buttons: BroadcastButton[];
  targetSegment: string;
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  sentAt: string | null;
}

interface BroadcastButton {
  label: string;
  url?: string | null;
  callbackData?: string | null;
}

const segmentOptions = [
  { value: "all", label: "Все пользователи" },
  { value: "active_30d", label: "Активные 30 дней" },
  { value: "bound_faceit", label: "С привязанным FACEIT" },
  { value: "favorites", label: "С избранными раскидами" }
];

const mediaOptions = [
  { value: "none", label: "Без баннера" },
  { value: "photo", label: "Фото баннер" },
  { value: "video", label: "Видео баннер" }
];

export default function BroadcastsPage() {
  return (
    <AuthGate>
      <AppShell>
        <Broadcasts />
      </AppShell>
    </AuthGate>
  );
}

function Broadcasts() {
  const queryClient = useQueryClient();
  const campaigns = useQuery({ queryKey: ["broadcasts"], queryFn: () => api<BroadcastCampaign[]>("/admin/broadcasts") });
  const [draftId, setDraftId] = useState<string | null>(null);
  const [title, setTitle] = useState("Новая рассылка FullFocus");
  const [caption, setCaption] = useState("🔥 FullFocus cs2\n\nНовый контент уже в боте. Залетай и забирай полезные раскиды.");
  const [mediaType, setMediaType] = useState<MediaType>("photo");
  const [media, setMedia] = useState("");
  const [segment, setSegment] = useState("all");
  const [buttons, setButtons] = useState<BroadcastButton[]>([{ label: "Открыть бота", url: "https://t.me/fullfocuscs2_bot" }]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedCampaign = useMemo(() => campaigns.data?.find((item) => item.id === draftId), [campaigns.data, draftId]);

  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({
        title,
        caption,
        mediaType: mediaType === "none" ? null : mediaType,
        mediaUrl: media,
        targetSegment: segment,
        buttons: buttons.filter((button) => button.label && (button.url || button.callbackData))
      });
      if (draftId) {
        return api<BroadcastCampaign>(`/admin/broadcasts/${draftId}`, { method: "PATCH", body });
      }
      return api<BroadcastCampaign>("/admin/broadcasts", { method: "POST", body });
    },
    onSuccess: async (campaign) => {
      setDraftId(campaign.id);
      setError(null);
      setNotice("Черновик сохранён.");
      await queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (mutationError) => setError(toError(mutationError, "Не удалось сохранить рассылку"))
  });

  const uploadMedia = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return api<{ url: string }>("/admin/media", { method: "POST", body });
    },
    onSuccess: (result) => {
      setMedia(result.url);
      setNotice("Баннер загружен. Сохрани черновик перед запуском.");
    },
    onError: (mutationError) => setError(toError(mutationError, "Не удалось загрузить баннер"))
  });

  const importUsers = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return api<{ imported: number }>("/admin/broadcasts/import-users", { method: "POST", body });
    },
    onSuccess: (result) => {
      setNotice(`База обновлена: импортировано ${result.imported} ID.`);
    },
    onError: (mutationError) => setError(toError(mutationError, "Не удалось импортировать базу пользователей"))
  });

  const test = useMutation({
    mutationFn: async () => {
      const id = await ensureSaved();
      return api(`/admin/broadcasts/${id}/test`, { method: "POST" });
    },
    onSuccess: () => setNotice("Тестовая рассылка отправлена тебе в Telegram."),
    onError: (mutationError) => setError(toError(mutationError, "Не удалось отправить тест"))
  });

  const sendCampaign = useMutation({
    mutationFn: async () => {
      const id = await ensureSaved();
      return api(`/admin/broadcasts/${id}/send`, { method: "POST" });
    },
    onSuccess: async () => {
      setNotice("Рассылка запущена. Счётчики будут обновляться по мере отправки.");
      await queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (mutationError) => setError(toError(mutationError, "Не удалось запустить рассылку"))
  });

  async function ensureSaved() {
    if (draftId) return draftId;
    const campaign = await save.mutateAsync();
    return campaign.id;
  }

  function loadCampaign(campaign: BroadcastCampaign) {
    setDraftId(campaign.id);
    setTitle(campaign.title);
    setCaption(campaign.caption);
    setMediaType((campaign.mediaType ?? "none") as MediaType);
    setMedia(campaign.mediaUrl ?? "");
    setSegment(campaign.targetSegment);
    setButtons(campaign.buttons?.length ? campaign.buttons : [{ label: "Открыть бота", url: "https://t.me/fullfocuscs2_bot" }]);
    setNotice(`Открыт черновик: ${campaign.title}`);
  }

  function patchButton(index: number, patch: Partial<BroadcastButton>) {
    setButtons((current) => current.map((button, itemIndex) => (itemIndex === index ? { ...button, ...patch } : button)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    save.mutate();
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.4em] text-focus">Маркетинг</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">Рассылки</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" type="button" disabled={test.isPending} onClick={() => test.mutate()}>
            {test.isPending ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
            Тест себе
          </button>
          <button className="btn btn-primary" type="button" disabled={sendCampaign.isPending} onClick={() => sendCampaign.mutate()}>
            {sendCampaign.isPending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            Запустить
          </button>
          <button className="btn btn-ghost" disabled={save.isPending} type="submit">
            {save.isPending ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Сохранить
          </button>
        </div>
      </header>

      {error ? <Status tone="error">{error}</Status> : null}
      {notice ? <Status tone="success">{notice}</Status> : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <section className="panel space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Megaphone className="text-focus" size={20} />
              <h2 className="text-xl font-black">Конструктор баннера</h2>
            </div>
            <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название кампании" />
            <textarea className="field min-h-40" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Текст рассылки" />
            <div className="grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-end">
              <SelectField label="Баннер" value={mediaType} options={mediaOptions} onChange={(value) => setMediaType(value as MediaType)} />
              <input className="field" value={media} onChange={(event) => setMedia(event.target.value)} placeholder="/media/banner.webp или https://..." />
              <label className="btn btn-ghost h-10 cursor-pointer">
                {uploadMedia.isPending ? <Loader2 className="animate-spin" size={16} /> : <ImageUp size={16} />}
                Upload
                <input className="hidden" type="file" accept="image/*,video/*" onChange={(event) => event.target.files?.[0] && uploadMedia.mutate(event.target.files[0])} />
              </label>
            </div>
            <SelectField label="Сегмент" value={segment} options={segmentOptions} onChange={setSegment} />
          </section>

          <section className="panel space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">Inline-кнопки</h2>
              <button className="btn btn-ghost h-9" type="button" onClick={() => setButtons((current) => [...current, { label: "Кнопка", url: "" }])}>
                <Plus size={16} />
                Добавить
              </button>
            </div>
            {buttons.map((button, index) => (
              <div key={index} className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[1fr_1.4fr_44px]">
                <input className="field" value={button.label} onChange={(event) => patchButton(index, { label: event.target.value })} placeholder="Текст кнопки" />
                <input className="field" value={button.url ?? ""} onChange={(event) => patchButton(index, { url: event.target.value, callbackData: null })} placeholder="https://..." />
                <button className="btn btn-ghost h-10 px-2" type="button" onClick={() => setButtons((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  <X size={16} />
                </button>
              </div>
            ))}
          </section>

          <section className="panel space-y-4 p-5">
            <h2 className="text-xl font-black">База пользователей бота</h2>
            <p className="text-sm leading-6 text-zinc-400">Загрузи txt/csv с Telegram ID пользователей. Каждый ID будет добавлен в базу рассылок, дубликаты безопасно пропускаются.</p>
            <div className="rounded-lg border border-focus/40 bg-focus/10 p-3 text-sm text-orange-100">
              Убедись, что загружаешь реальные ID активных юзеров, относящихся к этому боту.
            </div>
            <label className="flex min-h-16 cursor-pointer items-center justify-center gap-3 rounded-lg border border-dashed border-white/20 bg-white/[0.03] px-4 text-sm font-bold text-zinc-200 hover:border-focus/60">
              {importUsers.isPending ? <Loader2 className="animate-spin text-focus" size={18} /> : <UploadCloud className="text-focus" size={18} />}
              Выбрать файл с ID
              <input className="hidden" type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(event) => event.target.files?.[0] && importUsers.mutate(event.target.files[0])} />
            </label>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-5">
            <h2 className="text-xl font-black">Preview Telegram</h2>
            <div className="mt-4 overflow-hidden rounded-lg bg-[#30354f]">
              {media && mediaType !== "none" ? (
                mediaType === "video" ? (
                  <div className="grid h-52 place-items-center bg-black/60 text-sm text-zinc-400">Видео: {media}</div>
                ) : (
                  <img src={mediaUrl(media)} alt="" className="h-52 w-full object-cover" />
                )
              ) : null}
              <div className="whitespace-pre-wrap p-4 text-sm leading-6 text-white">{caption || "Текст рассылки"}</div>
              {buttons.length ? (
                <div className="grid gap-1.5 border-t border-white/10 p-3">
                  {buttons.filter((button) => button.label).map((button, index) => (
                    <div key={index} className="rounded-md bg-[#071322] px-3 py-2 text-center text-sm font-bold text-white">
                      {button.label}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-xl font-black">Кампании</h2>
            <div className="mt-4 space-y-3">
              {campaigns.isLoading ? <div className="text-sm text-zinc-500">Загружаем...</div> : null}
              {(campaigns.data ?? []).map((campaign) => (
                <button key={campaign.id} className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left hover:border-focus/50" type="button" onClick={() => loadCampaign(campaign)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-white">{campaign.title}</div>
                    <div className="text-xs uppercase tracking-[0.16em] text-focus">{campaign.status}</div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    {campaign.sentCount}/{campaign.totalCount} sent · failed {campaign.failedCount}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </form>
  );
}

function Status({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const className = tone === "error" ? "flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-100" : "rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-100";
  return (
    <div className={className}>
      {tone === "error" ? <AlertTriangle size={18} /> : null}
      {children}
    </div>
  );
}

function toError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
