"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bomb, Check, ImageUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { api, mediaUrl } from "@/lib/api";

interface CsMap {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  _count?: { lineups: number };
}

interface Lineup {
  id: string;
  mapName: string;
  mapSlug: string;
  side: "t" | "ct" | "both";
  grenadeType: "smoke" | "flash" | "molotov" | "he";
  from: string;
  to: string;
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  mediaType: "image" | "video" | "external";
  mediaUrl: string;
  thumbnailUrl: string | null;
  published: boolean;
}

const emptyForm = {
  mapId: "",
  side: "t",
  grenadeType: "smoke",
  from: "",
  to: "",
  title: "",
  description: "",
  difficulty: "easy",
  tags: "",
  mediaType: "image",
  mediaUrl: "",
  thumbnailUrl: "",
  published: true
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
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const maps = useQuery({ queryKey: ["maps"], queryFn: () => api<CsMap[]>("/admin/maps") });
  const lineups = useQuery({ queryKey: ["lineups"], queryFn: () => api<Lineup[]>("/admin/grenades") });

  useEffect(() => {
    if (!form.mapId && maps.data?.[0]?.id) {
      setForm((current) => ({ ...current, mapId: maps.data[0].id }));
    }
  }, [form.mapId, maps.data]);

  const create = useMutation({
    mutationFn: () =>
      api("/admin/grenades", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          thumbnailUrl: form.thumbnailUrl || null
        })
      }),
    onSuccess: async () => {
      setError(null);
      setForm({ ...emptyForm, mapId: maps.data?.[0]?.id ?? "" });
      await queryClient.invalidateQueries({ queryKey: ["lineups"] });
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Не удалось сохранить раскид")
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Lineup> }) =>
      api(`/admin/grenades/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lineups"] }),
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Не удалось обновить раскид")
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/grenades/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lineups"] }),
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Не удалось удалить раскид")
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.mapId || !form.title.trim() || !form.from.trim() || !form.to.trim() || !form.mediaUrl.trim()) {
      setError("Заполни карту, название, позиции и media URL.");
      return;
    }
    await create.mutateAsync();
  }

  async function upload(file: File | null) {
    if (!file) return;
    setError(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const result = await api<{ url: string }>("/admin/media", { method: "POST", body });
      setForm((current) => ({ ...current, mediaUrl: result.url }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить файл");
    }
  }

  const mapOptions = maps.data ?? [];
  const selectedMapId = form.mapId || mapOptions[0]?.id || "";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.4em] text-focus">Контент</p>
        <h1 className="mt-2 text-3xl font-black sm:text-5xl">Раскиды гранат</h1>
      </header>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-100">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[430px_1fr]">
        <form onSubmit={submit} className="panel space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Plus className="text-focus" size={20} />
            <h2 className="text-xl font-black">Новый раскид</h2>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-sm text-zinc-400">
              Тип
              <select className="field mt-2" value={form.grenadeType} onChange={(event) => setForm({ ...form, grenadeType: event.target.value })}>
                <option value="smoke">Smoke</option>
                <option value="flash">Flash</option>
                <option value="molotov">Molotov</option>
                <option value="he">HE</option>
              </select>
            </label>
            <label className="block text-sm text-zinc-400">
              Side
              <select className="field mt-2" value={form.side} onChange={(event) => setForm({ ...form, side: event.target.value })}>
                <option value="t">T</option>
                <option value="ct">CT</option>
                <option value="both">T/CT</option>
              </select>
            </label>
            <label className="block text-sm text-zinc-400">
              Сложность
              <select className="field mt-2" value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value })}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className="field" placeholder="Откуда" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} />
            <input className="field" placeholder="Куда" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} />
          </div>
          <input className="field" placeholder="Название" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <textarea
            className="field min-h-28 resize-y"
            placeholder="Описание и порядок действий"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <input className="field" placeholder="Теги через запятую" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <input className="field" placeholder="Media URL" value={form.mediaUrl} onChange={(event) => setForm({ ...form, mediaUrl: event.target.value })} />
            <label className="btn btn-ghost cursor-pointer" title="Загрузить медиа">
              <ImageUp size={18} />
              <input className="hidden" type="file" accept="image/*,video/*" onChange={(event) => upload(event.target.files?.[0] ?? null)} />
            </label>
          </div>
          {form.mediaUrl ? <img src={mediaUrl(form.mediaUrl)} alt="" className="h-36 w-full rounded-lg border border-white/10 object-cover" /> : null}
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} />
            Опубликовать сразу
          </label>
          <button className="btn btn-primary w-full" disabled={create.isPending || !selectedMapId} type="submit">
            {create.isPending ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Сохранить
          </button>
        </form>

        <div className="panel overflow-hidden p-5">
          <div className="mb-4 flex items-center gap-2">
            <Bomb className="text-focus" size={20} />
            <h2 className="text-xl font-black">Каталог</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                <tr>
                  <th className="px-3 py-3">Раскид</th>
                  <th className="px-3 py-3">Карта</th>
                  <th className="px-3 py-3">Тип</th>
                  <th className="px-3 py-3">Side</th>
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
                      <td className="px-3 py-4 uppercase text-focus">{lineup.grenadeType}</td>
                      <td className="px-3 py-4 uppercase">{lineup.side}</td>
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
                      <td className="px-3 py-4 text-right">
                        <button className="btn btn-ghost h-9" disabled={remove.isPending} onClick={() => remove.mutate(lineup.id)} title="Удалить">
                          <Trash2 size={16} />
                        </button>
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
