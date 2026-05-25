"use client";

import { Film, ImageUp, Loader2, Pause, Play, RotateCcw, Scissors, SlidersHorizontal, Timer, UploadCloud } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { mediaUrl } from "@/lib/api";

export interface GrenadeVideoEditorState {
  flightSeconds: string;
  aimFrameSeconds: string;
  videoScale: string;
  videoOffsetX: string;
  videoOffsetY: string;
  introSeconds: string;
  notice: string;
  processedUrl?: string | null;
  thumbnailUrl?: string | null;
  sourceInfo?: string | null;
}

export interface GrenadeVideoBuildPayload {
  file: File;
  title: string;
  flightSeconds: string;
  aimFrameSeconds: string;
  videoScale: string;
  videoOffsetX: string;
  videoOffsetY: string;
  introSeconds: string;
}

interface GrenadeVideoEditorProps {
  title: string;
  value: GrenadeVideoEditorState;
  isProcessing: boolean;
  onChange: (patch: Partial<GrenadeVideoEditorState>) => void;
  onBuild: (payload: GrenadeVideoBuildPayload) => Promise<void>;
}

export function GrenadeVideoEditor({ title, value, isProcessing, onChange, onBuild }: GrenadeVideoEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setObjectUrl(nextUrl);
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const previewScale = clampNumber(value.videoScale, 1, 0.65, 2.5);
  const previewOffsetX = clampNumber(value.videoOffsetX, 0, -420, 420);
  const previewOffsetY = clampNumber(value.videoOffsetY, 0, -420, 420);
  const timelineMax = Math.max(duration, 0);
  const timelineLabel = useMemo(() => `${formatTime(currentTime)} / ${duration ? formatTime(duration) : "00:00"}`, [currentTime, duration]);

  function updateDraft(patch: Partial<GrenadeVideoEditorState>) {
    onChange({ ...patch, notice: "", processedUrl: null, thumbnailUrl: null });
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setLocalError(null);
    onChange({ notice: "", processedUrl: null, thumbnailUrl: null, sourceInfo: null });
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video || !objectUrl) return;
    if (video.paused) {
      await video.play();
    } else {
      video.pause();
    }
    setIsPlaying(!video.paused);
  }

  function seekTo(rawValue: string) {
    const nextTime = Number(rawValue);
    if (!Number.isFinite(nextTime)) return;
    setCurrentTime(nextTime);
    if (videoRef.current) {
      videoRef.current.currentTime = nextTime;
    }
  }

  function setAimFrame() {
    const video = videoRef.current;
    const nextTime = video?.currentTime ?? currentTime;
    video?.pause();
    setIsPlaying(false);
    setCurrentTime(nextTime);
    updateDraft({ aimFrameSeconds: formatDecimal(nextTime) });
  }

  function resetFrame() {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setCurrentTime(0);
    setIsPlaying(false);
    updateDraft({
      aimFrameSeconds: "0",
      videoScale: "1",
      videoOffsetX: "0",
      videoOffsetY: "0",
      introSeconds: "1.2"
    });
  }

  async function buildVideo() {
    if (!file) {
      setLocalError("Выбери webm, mp4 или mov видео для адаптации.");
      return;
    }
    setLocalError(null);
    onChange({ notice: "", processedUrl: null, thumbnailUrl: null, sourceInfo: null });
    try {
      await onBuild({
        file,
        title: title || file.name,
        flightSeconds: value.flightSeconds,
        aimFrameSeconds: value.aimFrameSeconds,
        videoScale: value.videoScale,
        videoOffsetX: value.videoOffsetX,
        videoOffsetY: value.videoOffsetY,
        introSeconds: value.introSeconds
      });
    } catch {
      // The parent mutation already turns API errors into the page-level alert.
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-focus/25 bg-[linear-gradient(135deg,rgba(255,106,0,0.08),rgba(255,255,255,0.03)_42%,rgba(10,13,19,0.92))] p-4">
      <input
        ref={inputRef}
        data-testid="grenade-video-upload"
        className="hidden"
        type="file"
        accept="video/webm,video/mp4,video/quicktime,.webm,.mp4,.mov"
        onChange={chooseFile}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-focus/40 bg-focus/10 text-focus">
            <Film size={18} />
          </div>
          <div>
            <div className="text-base font-black text-zinc-50">Видео-редактор FullFocus</div>
            <div className="max-w-2xl text-sm leading-6 text-zinc-400">
              Загрузи webm/mp4/mov, выбери точный стоп-кадр и собери Telegram MP4 1080x1920 с фирменной обложкой.
            </div>
          </div>
        </div>
        <button className="btn btn-ghost h-10 shrink-0" type="button" onClick={() => inputRef.current?.click()}>
          <UploadCloud size={16} />
          {file ? "Заменить видео" : "Загрузить видео"}
        </button>
      </div>

      <div className="grid gap-5 min-[1500px]:grid-cols-[minmax(300px,390px)_1fr]">
        <div className="mx-auto w-full max-w-[390px]">
          <div className="relative aspect-[9/16] overflow-hidden rounded-[26px] border border-focus/35 bg-black shadow-2xl shadow-black/40">
            <img src="/back-fro-granades.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,106,0,0.13),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.36))]" />

            {objectUrl ? (
              <video
                ref={videoRef}
                src={objectUrl}
                muted
                playsInline
                preload="metadata"
                className="absolute left-1/2 top-1/2 z-10 w-full max-w-none"
                style={{
                  transform: `translate(-50%, -50%) translate(${previewOffsetX}px, ${previewOffsetY}px) scale(${previewScale})`,
                  transformOrigin: "center"
                }}
                onLoadedMetadata={(event) => {
                  const nextDuration = event.currentTarget.duration;
                  setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
                }}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            ) : (
              <button
                type="button"
                className="absolute inset-x-8 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-dashed border-focus/45 bg-black/55 px-5 py-8 text-center text-sm text-zinc-300 backdrop-blur"
                onClick={() => inputRef.current?.click()}
              >
                <ImageUp className="mx-auto mb-3 text-focus" size={26} />
                Перетащи или выбери 9:16 видео. Preview появится сразу, без загрузки на сервер.
              </button>
            )}

            <div className="absolute left-4 right-4 top-4 z-20 flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/80">
              <span className="rounded-lg border border-white/10 bg-black/45 px-2 py-1 backdrop-blur">Preview 9:16</span>
              <span className="rounded-lg border border-focus/30 bg-focus/15 px-2 py-1 text-focus">1080x1920</span>
            </div>
            <div className="absolute bottom-4 left-4 right-4 z-20 rounded-lg border border-white/10 bg-black/55 p-3 backdrop-blur">
              <div className="flex items-center justify-between gap-3 text-xs text-zinc-300">
                <span>Стоп: {formatSecondsInput(value.aimFrameSeconds)} сек.</span>
                <span>Полёт: {formatSecondsInput(value.flightSeconds)} сек.</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-focus"
                  style={{ width: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>

          {value.thumbnailUrl ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-emerald-500/25 bg-emerald-500/10">
              <img src={mediaUrl(value.thumbnailUrl)} alt="Poster готового видео" className="h-28 w-full object-cover" />
              <div className="px-3 py-2 text-xs text-emerald-100">Poster готов. Ролик добавлен в файлы раскида.</div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-black text-zinc-100">{file?.name ?? "Видео ещё не выбрано"}</div>
                <div className="text-xs text-zinc-500">{value.sourceInfo || "Сначала выбери видео, затем выставь тайминги и кадр прицеливания."}</div>
              </div>
              <button className="btn btn-ghost h-10" type="button" disabled={!objectUrl} onClick={togglePlayback}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                {isPlaying ? "Пауза" : "Play"}
              </button>
            </div>

            <label className="block text-xs font-bold uppercase tracking-[0.18em] text-zinc-500" htmlFor="grenade-video-timeline">
              Таймлайн · {timelineLabel}
            </label>
            <input
              id="grenade-video-timeline"
              className="mt-3 w-full accent-[#ff6a00]"
              type="range"
              min="0"
              max={timelineMax || 0}
              step="0.05"
              value={timelineMax ? Math.min(currentTime, timelineMax) : 0}
              disabled={!objectUrl || !timelineMax}
              onChange={(event) => seekTo(event.target.value)}
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button className="btn btn-ghost h-10" type="button" disabled={!objectUrl} onClick={setAimFrame}>
                <Scissors size={16} />
                Поставить стоп-кадр
              </button>
              <button className="btn btn-ghost h-10" type="button" onClick={resetFrame}>
                <RotateCcw size={16} />
                Сбросить кадр
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <NumberControl label="Время полёта, сек" value={value.flightSeconds} min={0.1} max={20} step={0.1} icon={<Timer size={14} />} onChange={(next) => updateDraft({ flightSeconds: next })} />
            <NumberControl label="Стоп-кадр, сек" value={value.aimFrameSeconds} min={0} max={Math.max(duration, 1)} step={0.05} icon={<Scissors size={14} />} onChange={(next) => updateDraft({ aimFrameSeconds: next })} />
            <NumberControl label="Zoom видео" value={value.videoScale} min={0.65} max={2.5} step={0.05} icon={<SlidersHorizontal size={14} />} onChange={(next) => updateDraft({ videoScale: next })} />
            <NumberControl label="Стоп-кадр длится, сек" value={value.introSeconds} min={0.4} max={4} step={0.1} icon={<Timer size={14} />} onChange={(next) => updateDraft({ introSeconds: next })} />
            <NumberControl label="Сдвиг X" value={value.videoOffsetX} min={-420} max={420} step={5} onChange={(next) => updateDraft({ videoOffsetX: next })} />
            <NumberControl label="Сдвиг Y" value={value.videoOffsetY} min={-420} max={420} step={5} onChange={(next) => updateDraft({ videoOffsetY: next })} />
          </div>

          <button className="btn btn-primary h-12 w-full text-base" type="button" disabled={!file || isProcessing} onClick={buildVideo}>
            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Film size={18} />}
            {isProcessing ? "Собираем MP4..." : "Собрать MP4 для Telegram"}
          </button>

          {localError ? <StatusBox tone="error">{localError}</StatusBox> : null}
          {value.notice ? <StatusBox tone="success">{value.notice}</StatusBox> : null}
          {value.processedUrl ? (
            <a className="block rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 hover:border-focus/45" href={mediaUrl(value.processedUrl)} target="_blank" rel="noreferrer">
              Открыть готовый MP4
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  icon,
  onChange
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  icon?: ReactNode;
  onChange: (value: string) => void;
}) {
  const fallback = min <= 0 && max >= 0 ? 0 : min;
  const normalized = clampNumber(value, fallback, min, max);
  return (
    <label className="rounded-lg border border-white/10 bg-black/20 p-3">
      <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
        {icon}
        {label}
      </span>
      <input className="w-full accent-[#ff6a00]" type="range" min={min} max={max} step={step} value={normalized} onChange={(event) => onChange(event.target.value)} />
      <input
        className="field mt-2 h-10"
        aria-label={label}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function StatusBox({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  const className =
    tone === "success"
      ? "rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
      : "rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-100";
  return <div className={className}>{children}</div>;
}

function clampNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function formatDecimal(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "") || "0";
}

function formatTime(value: number): string {
  if (!Number.isFinite(value)) return "00:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSecondsInput(value: string): string {
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toFixed(1).replace(/\.0$/, "");
}
