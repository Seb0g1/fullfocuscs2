"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bomb, Check, Eye, ImageUp, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { api, mediaUrl } from "@/lib/api";

type Side = "t" | "ct" | "both";
type GrenadeType = "smoke" | "flash" | "molotov" | "he";
type Difficulty = "easy" | "medium" | "hard";
type MediaType = "image" | "video" | "external";

interface CsMap {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  overviewImageUrl: string | null;
  _count?: { lineups: number };
}

interface MediaItem {
  type: MediaType;
  url: string;
  thumbnailUrl?: string | null;
  caption?: string | null;
}

interface Lineup {
  id: string;
  mapName: string;
  mapSlug: string;
  side: Side;
  grenadeType: GrenadeType;
  area: string;
  areaSlug: string;
  positionSlug: string;
  from: string;
  to: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  tags: string[];
  mediaType: MediaType;
  mediaUrl: string;
  thumbnailUrl: string | null;
  mediaItems: MediaItem[];
  published: boolean;
}

interface LineupForm {
  mapId: string;
  side: Side;
  grenadeType: GrenadeType;
  area: string;
  areaSlug: string;
  positionSlug: string;
  from: string;
  to: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  tags: string;
  mediaItemsText: string;
  thumbnailUrl: string;
  published: boolean;
}

const emptyForm: LineupForm = {
  mapId: "",
  side: "t",
  grenadeType: "smoke",
  area: "",
  areaSlug: "",
  positionSlug: "",
  from: "",
  to: "",
  title: "",
  description: "",
  difficulty: "easy",
  tags: "",
  mediaItemsText: "",
  thumbnailUrl: "",
  published: true
};

const grenadeLabels: Record<GrenadeType, string> = {
  smoke: "Смоки",
  flash: "Флешки",
  molotov: "Молики",
  he: "HE"
};

export default function GrenadesPage() {
  return (
    <AuthGate>
      <AppShell>
        <Grenades />
      </AppShell>
    </AuthGate>
  );
}

function Grenades() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LineupForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ mapId: "", side: "", type: "", areaSlug: "", published: "" });

  const maps = useQuery({ queryKey: ["maps"], queryFn: () => api<CsMap[]>("/admin/maps") });
  const lineups = useQuery({
    queryKey: ["lineups", filters],
    queryFn: () => api<Lineup[]>(lineupsPath(filters))
  });

  useEffect(() => {
    if (!form.mapId && maps.data?.[0]?.id) {
      setForm((current) => ({ ...current, mapId: maps.data[0].id }));
    }
  }, [form.mapId, maps.data]);

  const mapOptions = maps.data ?? [];
  const selectedMap = mapOptions.find((map) => map.id === form.mapId) ?? mapOptions[0];
  const selectedMapId = form.mapId || selectedMap?.id || "";
  const mediaItems = useMemo(() => parseMediaItems(form.mediaItemsText, form.title, form.thumbnailUrl), [form.mediaItemsText, form.title, form.thumbnailUrl]);
  const firstMedia = mediaItems[0];

  const create = useMutation({
    mutationFn: () => api("/admin/grenades", { method: "POST", body: JSON.stringify(toPayload(form)) }),
    onSuccess: async () => {
      setError(null);
      resetForm(mapOptions[0]?.id);
      await invalidateContent(queryClient);
    },
    onError: (mutationError) => setError(toErrorText(mutationError, "Не удалось сохранить раскид"))
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api(`/admin/grenades/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: async () => {
      setError(null);
      await invalidateContent(queryClient);
    },
    onError: (mutationError) => setError(toErrorText(mutationError, "Не удалось обновить раскид"))
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/grenades/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateContent(queryClient),
    onError: (mutationError) => setError(toErrorText(mutationError, "Не удалось удалить раскид"))
  });

  const updateMap = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CsMap> }) => api(`/admin/maps/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maps"] }),
    onError: (mutationError) => setError(toErrorText(mutationError, "Не удалось обновить карту"))
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const payload = toPayload({ ...form, mapId: selectedMapId });
    if (!payload.mapId || !payload.title || !payload.area || !payload.from || !payload.to || !payload.mediaUrl) {
      setError("Заполни карту, часть карты, название, позиции и хотя бы одно медиа.");
      return;
    }
    if (editingId) {
      await update.mutateAsync({ id: editingId, body: payload });
      resetForm(selectedMapId);
      return;
    }
    await create.mutateAsync();
  }

  async function upload(file: File | null, target: "lineup" | "overview") {
    if (!file) return;
    setError(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const result = await api<{ url: string }>("/admin/media", { method: "POST", body });
      if (target === "overview") {
        if (!selectedMapId) {
          setError("Сначала выбери карту.");
          return;
        }
        await updateMap.mutateAsync({ id: selectedMapId, body: { overviewImageUrl: result.url } });
        return;
      }
      setForm((current) => ({
        ...current,
        mediaItemsText: current.mediaItemsText ? `${current.mediaItemsText}\n${result.url}` : result.url
      }));
    } catch (uploadError) {
      setError(toErrorText(uploadError, "Не удалось загрузить файл"));
    }
  }

  function resetForm(mapId = selectedMapId) {
    setEditingId(null);
    setForm({ ...emptyForm, mapId: mapId ?? "" });
  }

  function editLineup(lineup: Lineup) {
    const map = mapOptions.find((item) => item.slug === lineup.mapSlug);
    setEditingId(lineup.id);
    setForm({
      mapId: map?.id ?? selectedMapId,
      side: lineup.side,
      grenadeType: lineup.grenadeType,
      area: lineup.area,
      areaSlug: lineup.areaSlug,
      positionSlug: lineup.positionSlug,
      from: lineup.from,
      to: lineup.to,
      title: lineup.title,
      description: lineup.description,
      difficulty: lineup.difficulty,
      tags: lineup.tags.join(", "),
      mediaItemsText: (lineup.mediaItems.length ? lineup.mediaItems : [{ type: lineup.mediaType, url: lineup.mediaUrl, thumbnailUrl: lineup.thumbnailUrl }])
        .map((item) => (item.caption ? `${item.url} | ${item.caption}` : item.url))
        .join("\n"),
      thumbnailUrl: lineup.thumbnailUrl ?? "",
      published: lineup.published
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.4em] text-focus">Контент</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">Раскиды гранат</h1>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
          Flow: карта → сторона → часть → тип → позиция
        </div>
      </header>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-100">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[470px_1fr]">
        <form onSubmit={submit} className="panel space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Plus className="text-focus" size={20} />
              <h2 className="text-xl font-black">{editingId ? "Редактирование" : "Новый раскид"}</h2>
            </div>
            {editingId ? (
              <button className="btn btn-ghost h-9" type="button" onClick={() => resetForm(selectedMapId)}>
                <X size={16} />
                Сброс
              </button>
            ) : null}
          </div>

          <label className="block text-sm text-zinc-400">
            Карта
            <select className="field mt-2" value={selectedMapId} onChange={(event) => setForm({ ...form, mapId: event.target.value })}>
              {mapOptions.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-zinc-200">Overview карты</div>
                <div className="text-xs text-zinc-500">Отправляется перед выбором T/CT в боте</div>
              </div>
              <label className="btn btn-ghost h-9 cursor-pointer">
                <ImageUp size={16} />
                Upload
                <input className="hidden" type="file" accept="image/*" onChange={(event) => upload(event.target.files?.[0] ?? null, "overview")} />
              </label>
            </div>
            {selectedMap?.overviewImageUrl ? (
              <img src={mediaUrl(selectedMap.overviewImageUrl)} alt="" className="h-28 w-full rounded-lg border border-white/10 object-cover" />
            ) : (
              <div className="grid h-20 place-items-center rounded-lg border border-dashed border-white/10 text-sm text-zinc-500">Картинка не загружена</div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select label="Сторона" value={form.side} onChange={(value) => setForm({ ...form, side: value as Side })}>
              <option value="t">T</option>
              <option value="ct">CT</option>
              <option value="both">T/CT</option>
            </Select>
            <Select label="Тип" value={form.grenadeType} onChange={(value) => setForm({ ...form, grenadeType: value as GrenadeType })}>
              <option value="smoke">Смоки</option>
              <option value="flash">Флешки</option>
              <option value="molotov">Молики</option>
              <option value="he">HE</option>
            </Select>
            <Select label="Сложность" value={form.difficulty} onChange={(value) => setForm({ ...form, difficulty: value as Difficulty })}>
              <option value="easy">Легко</option>
              <option value="medium">Средне</option>
              <option value="hard">Сложно</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className="field" placeholder="Часть карты: Мид, A, B" value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} />
            <input className="field" placeholder="Slug части, можно пустым" value={form.areaSlug} onChange={(event) => setForm({ ...form, areaSlug: event.target.value })} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className="field" placeholder="Откуда" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} />
            <input className="field" placeholder="Куда / позиция кнопки" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} />
          </div>
          <input className="field" placeholder="Slug позиции, можно пустым" value={form.positionSlug} onChange={(event) => setForm({ ...form, positionSlug: event.target.value })} />
          <input className="field" placeholder="Название" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <textarea
            className="field min-h-28 resize-y"
            placeholder="Описание и порядок действий"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <input className="field" placeholder="Теги через запятую" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-zinc-200">Медиа</div>
                <div className="text-xs text-zinc-500">Одна строка = один файл. Можно добавить caption через `url | caption`.</div>
              </div>
              <label className="btn btn-ghost h-9 cursor-pointer">
                <ImageUp size={16} />
                Upload
                <input className="hidden" type="file" accept="image/*,video/*" onChange={(event) => upload(event.target.files?.[0] ?? null, "lineup")} />
              </label>
            </div>
            <textarea
              className="field min-h-24 resize-y"
              placeholder="https://... или /media/file.mp4"
              value={form.mediaItemsText}
              onChange={(event) => setForm({ ...form, mediaItemsText: event.target.value })}
            />
            <input className="field" placeholder="Thumbnail URL, если нужен" value={form.thumbnailUrl} onChange={(event) => setForm({ ...form, thumbnailUrl: event.target.value })} />
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} />
            Опубликовать в боте
          </label>

          <button className="btn btn-primary w-full" disabled={create.isPending || update.isPending || !selectedMapId} type="submit">
            {create.isPending || update.isPending ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {editingId ? "Сохранить изменения" : "Сохранить раскид"}
          </button>

          <TelegramPreview form={form} firstMedia={firstMedia} selectedMap={selectedMap} />
        </form>

        <div className="panel overflow-hidden p-5">
          <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2">
              <Bomb className="text-focus" size={20} />
              <h2 className="text-xl font-black">Каталог</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-5">
              <select className="field h-10" value={filters.mapId} onChange={(event) => setFilters({ ...filters, mapId: event.target.value })}>
                <option value="">Все карты</option>
                {mapOptions.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.name}
                  </option>
                ))}
              </select>
              <select className="field h-10" value={filters.side} onChange={(event) => setFilters({ ...filters, side: event.target.value })}>
                <option value="">Сторона</option>
                <option value="t">T</option>
                <option value="ct">CT</option>
                <option value="both">T/CT</option>
              </select>
              <select className="field h-10" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
                <option value="">Тип</option>
                <option value="smoke">Смоки</option>
                <option value="flash">Флешки</option>
                <option value="molotov">Молики</option>
                <option value="he">HE</option>
              </select>
              <input className="field h-10" placeholder="area slug" value={filters.areaSlug} onChange={(event) => setFilters({ ...filters, areaSlug: event.target.value })} />
              <select className="field h-10" value={filters.published} onChange={(event) => setFilters({ ...filters, published: event.target.value })}>
                <option value="">Статус</option>
                <option value="true">Live</option>
                <option value="false">Draft</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                <tr>
                  <th className="px-3 py-3">Раскид</th>
                  <th className="px-3 py-3">Карта</th>
                  <th className="px-3 py-3">Flow</th>
                  <th className="px-3 py-3">Медиа</th>
                  <th className="px-3 py-3">Статус</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {lineups.isLoading ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-zinc-500" colSpan={6}>
                      Загружаем каталог...
                    </td>
                  </tr>
                ) : (lineups.data ?? []).length ? (
                  lineups.data?.map((lineup) => (
                    <tr key={lineup.id} className="border-t border-white/10">
                      <td className="px-3 py-4">
                        <div className="font-bold">{lineup.title}</div>
                        <div className="text-zinc-500">
                          {lineup.from} → {lineup.to}
                        </div>
                      </td>
                      <td className="px-3 py-4">{lineup.mapName}</td>
                      <td className="px-3 py-4 text-zinc-300">
                        {sideText(lineup.side)} · {lineup.area} · {grenadeLabels[lineup.grenadeType]}
                      </td>
                      <td className="px-3 py-4">{lineup.mediaItems.length || (lineup.mediaUrl ? 1 : 0)}</td>
                      <td className="px-3 py-4">
                        <button
                          className="btn btn-ghost h-9"
                          disabled={update.isPending}
                          onClick={() => update.mutate({ id: lineup.id, body: { published: !lineup.published } })}
                        >
                          <Check size={16} />
                          {lineup.published ? "Live" : "Draft"}
                        </button>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex justify-end gap-2">
                          <button className="btn btn-ghost h-9" onClick={() => editLineup(lineup)} title="Редактировать">
                            <Pencil size={16} />
                          </button>
                          <button className="btn btn-ghost h-9" disabled={remove.isPending} onClick={() => remove.mutate(lineup.id)} title="Удалить">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-8 text-center text-zinc-500" colSpan={6}>
                      Каталог пуст. Добавь первый раскид слева и опубликуй его для бота.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="block text-sm text-zinc-400">
      {label}
      <select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function TelegramPreview({ form, firstMedia, selectedMap }: { form: LineupForm; firstMedia?: MediaItem; selectedMap?: CsMap }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#182033] p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200">
        <Eye size={16} className="text-focus" />
        Preview в стиле Telegram
      </div>
      <div className="overflow-hidden rounded-lg bg-[#30354f]">
        {firstMedia?.url ? (
          firstMedia.type === "video" ? (
            <div className="grid h-48 place-items-center bg-black/50 text-sm text-zinc-400">Видео: {firstMedia.url}</div>
          ) : (
            <img src={mediaUrl(firstMedia.thumbnailUrl || firstMedia.url)} alt="" className="h-48 w-full object-cover" />
          )
        ) : (
          <div className="grid h-36 place-items-center bg-black/30 text-sm text-zinc-500">Медиа появится здесь</div>
        )}
        <div className="space-y-1 p-3 text-sm">
          <div className="font-bold text-white">{form.title || "Название раскида"}</div>
          <div className="text-zinc-200">{selectedMap?.name ?? "Карта"} · {sideText(form.side)} · {form.area || "Часть карты"}</div>
          <div className="text-zinc-300">1 - {form.from || "откуда"}</div>
          <div className="text-zinc-300">2 - {form.to || "куда"}</div>
        </div>
      </div>
    </div>
  );
}

function toPayload(form: LineupForm) {
  const mediaItems = parseMediaItems(form.mediaItemsText, form.title, form.thumbnailUrl);
  const firstMedia = mediaItems[0];
  return {
    mapId: form.mapId,
    side: form.side,
    grenadeType: form.grenadeType,
    area: form.area.trim(),
    areaSlug: form.areaSlug.trim(),
    positionSlug: form.positionSlug.trim(),
    from: form.from.trim(),
    to: form.to.trim(),
    title: form.title.trim(),
    description: form.description.trim(),
    difficulty: form.difficulty,
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    mediaType: firstMedia?.type ?? "image",
    mediaUrl: firstMedia?.url ?? "",
    thumbnailUrl: form.thumbnailUrl || firstMedia?.thumbnailUrl || null,
    mediaItems,
    published: form.published
  };
}

function parseMediaItems(value: string, title: string, thumbnailUrl: string): MediaItem[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [url, caption] = line.split("|").map((part) => part.trim());
      return {
        type: inferMediaType(url),
        url,
        thumbnailUrl: thumbnailUrl || null,
        caption: caption || title || null
      };
    });
}

function inferMediaType(url: string): MediaType {
  const lower = url.toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".webm")) return "video";
  if (lower.startsWith("http") && !/\.(png|jpe?g|webp|gif)$/i.test(lower)) return "external";
  return "image";
}

function lineupsPath(filters: { mapId: string; side: string; type: string; areaSlug: string; published: string }) {
  const params = new URLSearchParams();
  if (filters.mapId) params.set("mapId", filters.mapId);
  if (filters.side) params.set("side", filters.side);
  if (filters.type) params.set("type", filters.type);
  if (filters.areaSlug) params.set("areaSlug", filters.areaSlug);
  if (filters.published) params.set("published", filters.published);
  const query = params.toString();
  return query ? `/admin/grenades?${query}` : "/admin/grenades";
}

function sideText(side: string) {
  if (side === "ct") return "CT";
  if (side === "both") return "T/CT";
  return "T";
}

function toErrorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function invalidateContent(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: ["lineups"] });
  await queryClient.invalidateQueries({ queryKey: ["overview"] });
}
