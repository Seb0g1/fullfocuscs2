"use client";

import { Film, ImageUp, Loader2, Pause, Play, RotateCcw, Scissors, SlidersHorizontal, Timer, UploadCloud } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { mediaUrl } from "@/lib/api";

const MIN_VIDEO_SCALE = 0.65;
const MAX_VIDEO_SCALE = 4.5;
const MIN_VIDEO_OFFSET = -1200;
const MAX_VIDEO_OFFSET = 1200;

export interface GrenadeVideoEditorState {
  flightSeconds: string;
  aimFrameSeconds: string;
  videoScale: string;
  videoOffsetX: string;
  videoOffsetY: string;
  introSeconds: string;
  hideWatermark: string;
  zoomStartSeconds: string;
  zoomEndSeconds: string;
  zoomScale: string;
  zoomOffsetX: string;
  zoomOffsetY: string;
  sourceCropMode: "none" | "center-wide";
  hideSourceLogo: string;
  logoCoverX: string;
  logoCoverY: string;
  logoCoverWidth: string;
  logoCoverHeight: string;
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
  hideWatermark: string;
  zoomStartSeconds: string;
  zoomEndSeconds: string;
  zoomScale: string;
  zoomOffsetX: string;
  zoomOffsetY: string;
  sourceCropMode: "none" | "center-wide";
  hideSourceLogo: string;
  logoCoverX: string;
  logoCoverY: string;
  logoCoverWidth: string;
  logoCoverHeight: string;
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
  const [files, setFiles] = useState<File[]>([]);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const file = files[0];
    if (!file) {
      setObjectUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setObjectUrl(nextUrl);
    setDuration(0);
    setCurrentTime(0);
    setVideoSize(null);
    setIsPlaying(false);
    return () => URL.revokeObjectURL(nextUrl);
  }, [files]);

  const previewScale = clampNumber(value.videoScale, 1, MIN_VIDEO_SCALE, MAX_VIDEO_SCALE);
  const previewOffsetX = clampNumber(value.videoOffsetX, 0, MIN_VIDEO_OFFSET, MAX_VIDEO_OFFSET);
  const previewOffsetY = clampNumber(value.videoOffsetY, 0, MIN_VIDEO_OFFSET, MAX_VIDEO_OFFSET);
  const timelineMax = Math.max(duration, 0);
  const zoomStart = clampNumber(value.zoomStartSeconds, 0, 0, Math.max(timelineMax, 1));
  const zoomEnd = clampNumber(value.zoomEndSeconds, 0, 0, Math.max(timelineMax, 1));
  const hasZoomSegment = zoomEnd > zoomStart;
  const zoomActive = hasZoomSegment && currentTime >= zoomStart && currentTime <= zoomEnd;
  const segmentScale = clampNumber(value.zoomScale, 2, 1, MAX_VIDEO_SCALE);
  const segmentOffsetX = clampNumber(value.zoomOffsetX, 0, MIN_VIDEO_OFFSET, MAX_VIDEO_OFFSET);
  const segmentOffsetY = clampNumber(value.zoomOffsetY, 0, MIN_VIDEO_OFFSET, MAX_VIDEO_OFFSET);
  const effectiveScale = zoomActive ? segmentScale : previewScale;
  const effectiveOffsetX = zoomActive ? segmentOffsetX : previewOffsetX;
  const effectiveOffsetY = zoomActive ? segmentOffsetY : previewOffsetY;
  const sourceCropMode = value.sourceCropMode === "none" ? "none" : "center-wide";
  const isVerticalSource = Boolean(videoSize?.width && videoSize?.height && videoSize.height > videoSize.width * 1.2);
  const usesWideCrop = sourceCropMode === "center-wide";
  const cropPreviewStyle = usesWideCrop && isVerticalSource ? "inset(34.2% 0 34.2% 0)" : undefined;
  const cropBandTop = usesWideCrop && isVerticalSource ? 34.2 : 0;
  const cropBandHeight = usesWideCrop && isVerticalSource ? 31.6 : 100;
  const hideSourceLogo = value.hideSourceLogo !== "false";
  const logoCoverX = clampNumber(value.logoCoverX, 82, 0, 100);
  const logoCoverY = clampNumber(value.logoCoverY, 2, 0, 100);
  const logoCoverWidth = clampNumber(value.logoCoverWidth, 16, 1, 45);
  const logoCoverHeight = clampNumber(value.logoCoverHeight, 8, 1, 35);
  const logoCoverStyle = {
    left: `${logoCoverX}%`,
    top: `${cropBandTop + (logoCoverY * cropBandHeight) / 100}%`,
    width: `${logoCoverWidth}%`,
    height: `${(logoCoverHeight * cropBandHeight) / 100}%`
  };
  const previewOffsetCssX = effectiveOffsetX / 2.57;
  const previewOffsetCssY = effectiveOffsetY / 2.57;
  const hideWatermark = value.hideWatermark !== "false";
  const timelineLabel = useMemo(() => `${formatTime(currentTime)} / ${duration ? formatTime(duration) : "00:00"}`, [currentTime, duration]);

  function updateDraft(patch: Partial<GrenadeVideoEditorState>) {
    onChange({ ...patch, notice: "", processedUrl: null, thumbnailUrl: null });
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setFiles(event.target.files ? Array.from(event.target.files) : []);
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
      introSeconds: "1.2",
      hideWatermark: "true",
      zoomStartSeconds: "0",
      zoomEndSeconds: "0",
      zoomScale: "2",
      zoomOffsetX: "0",
      zoomOffsetY: "0",
      sourceCropMode: "center-wide",
      hideSourceLogo: "true",
      logoCoverX: "82",
      logoCoverY: "2",
      logoCoverWidth: "16",
      logoCoverHeight: "8"
    });
  }

  function applyPreset(preset: "width" | "fill" | "wide" | "aim") {
    if (preset === "width") {
      updateDraft({ videoScale: "1", videoOffsetX: "0", videoOffsetY: "0", sourceCropMode: "none" });
      return;
    }
    if (preset === "fill") {
      updateDraft({ videoScale: fillScreenScale(videoSize), videoOffsetX: "0", videoOffsetY: "0", sourceCropMode: "none" });
      return;
    }
    if (preset === "wide") {
      updateDraft({ videoScale: "1", videoOffsetX: "0", videoOffsetY: "0", sourceCropMode: "center-wide" });
      return;
    }
    const start = currentTime || clampNumber(value.aimFrameSeconds, 0, 0, Math.max(timelineMax, 1));
    const end = timelineMax ? Math.min(timelineMax, start + 1.2) : start + 1.2;
    updateDraft({
      zoomStartSeconds: formatDecimal(start),
      zoomEndSeconds: formatDecimal(Math.max(end, start + 0.4)),
      zoomScale: "2",
      zoomOffsetX: value.zoomOffsetX || "0",
      zoomOffsetY: value.zoomOffsetY || "0"
    });
  }

  function setZoomStart() {
    const nextTime = videoRef.current?.currentTime ?? currentTime;
    updateDraft({
      zoomStartSeconds: formatDecimal(nextTime),
      zoomEndSeconds: formatDecimal(Math.max(zoomEnd, nextTime + 0.4))
    });
  }

  function setZoomEnd() {
    const nextTime = videoRef.current?.currentTime ?? currentTime;
    updateDraft({
      zoomEndSeconds: formatDecimal(Math.max(nextTime, zoomStart + 0.4))
    });
  }

  function resetZoomSegment() {
    updateDraft({
      zoomStartSeconds: "0",
      zoomEndSeconds: "0",
      zoomScale: "2",
      zoomOffsetX: "0",
      zoomOffsetY: "0"
    });
  }

  async function buildVideo() {
    if (!files.length) {
      setLocalError("Выбери webm, mp4 или mov видео для адаптации.");
      return;
    }
    setLocalError(null);
    onChange({ notice: "", processedUrl: null, thumbnailUrl: null, sourceInfo: null });
    try {
      for (const [index, file] of files.entries()) {
        onChange({ notice: files.length > 1 ? `Собираем видео ${index + 1} из ${files.length}: ${file.name}` : "" });
        await onBuild({
          file,
          title: title || file.name,
          flightSeconds: value.flightSeconds,
          aimFrameSeconds: value.aimFrameSeconds,
          videoScale: value.videoScale,
          videoOffsetX: value.videoOffsetX,
          videoOffsetY: value.videoOffsetY,
          introSeconds: value.introSeconds,
          hideWatermark: value.hideWatermark,
          zoomStartSeconds: value.zoomStartSeconds,
          zoomEndSeconds: value.zoomEndSeconds,
          zoomScale: value.zoomScale,
          zoomOffsetX: value.zoomOffsetX,
          zoomOffsetY: value.zoomOffsetY,
          sourceCropMode,
          hideSourceLogo: value.hideSourceLogo,
          logoCoverX: value.logoCoverX,
          logoCoverY: value.logoCoverY,
          logoCoverWidth: value.logoCoverWidth,
          logoCoverHeight: value.logoCoverHeight
        });
      }
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
        multiple
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
          {files.length ? "Заменить видео" : "Загрузить видео"}
          {files.length > 1 ? ` (${files.length})` : ""}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(340px,420px)_minmax(420px,1fr)]">
        <div className="mx-auto w-full max-w-[420px]">
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
                  transform: `translate(-50%, -50%) translate(${previewOffsetCssX}px, ${previewOffsetCssY}px) scale(${effectiveScale})`,
                  transformOrigin: "center",
                  clipPath: cropPreviewStyle
                }}
                onLoadedMetadata={(event) => {
                  const nextDuration = event.currentTarget.duration;
                  setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
                  setVideoSize({
                    width: event.currentTarget.videoWidth || 0,
                    height: event.currentTarget.videoHeight || 0
                  });
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
            {zoomActive ? (
              <div className="absolute left-5 top-14 z-20 rounded-lg border border-focus/55 bg-focus/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-focus backdrop-blur">
                Aim zoom active
              </div>
            ) : null}
            {usesWideCrop ? (
              <div className="absolute left-5 top-[74px] z-20 rounded-lg border border-white/15 bg-black/65 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/70 backdrop-blur">
                Wide gameplay crop
              </div>
            ) : null}
            {hideWatermark ? (
              <div className="absolute right-5 top-[52%] z-20 rounded-lg border border-focus/55 bg-black/80 px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.18em] text-focus shadow-lg shadow-black/45">
                FullFocus
                <div className="mt-0.5 text-[8px] tracking-[0.22em] text-white/55">Clean overlay</div>
              </div>
            ) : null}
            {hideSourceLogo && objectUrl ? (
              <div
                className="absolute z-30 rounded-md border border-focus/55 bg-black/85 shadow-lg shadow-black/40"
                style={logoCoverStyle}
                title="Зона скрытия чужого watermark"
              >
                <div className="grid h-full w-full place-items-center text-[7px] font-black uppercase tracking-[0.16em] text-focus/90">
                  FullFocus
                </div>
              </div>
            ) : null}
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-focus/45 shadow-[0_0_18px_rgba(255,106,0,0.35)]">
              <span className="absolute left-1/2 top-2 h-8 w-px -translate-x-1/2 bg-focus/70" />
              <span className="absolute left-2 top-1/2 h-px w-8 -translate-y-1/2 bg-focus/70" />
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
          <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-zinc-400">
            Base {previewScale.toFixed(2)} · Aim {segmentScale.toFixed(2)} · {hasZoomSegment ? `${formatSecondsInput(value.zoomStartSeconds)}-${formatSecondsInput(value.zoomEndSeconds)} сек.` : "zoom-участок не задан"} · {usesWideCrop ? "фон виден" : "исходный кадр"}
            <br />
            «Прицел крупно» теперь включается только на выбранном участке. Поставь начало и конец zoom по таймлайну, базовый кадр останется обычным.
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="mb-3">
              <div>
                <div className="text-sm font-black text-zinc-100">{files[0]?.name ?? "Видео ещё не выбрано"}</div>
                <div className="text-xs text-zinc-500">
                  {files.length > 1 ? `Массовая загрузка: ${files.length} файлов с общими настройками.` : value.sourceInfo || "Сначала выбери видео, затем выставь тайминги и кадр прицеливания."}
                </div>
              </div>
            </div>

            <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <button className="btn btn-ghost h-10" type="button" onClick={() => applyPreset("width")}>
                По ширине
              </button>
              <button className="btn btn-ghost h-10" type="button" onClick={() => applyPreset("fill")}>
                Заполнить экран
              </button>
              <button className="btn btn-ghost h-10" type="button" onClick={() => applyPreset("wide")}>
                Фон + широкий кадр
              </button>
              <button className="btn btn-ghost h-10" type="button" onClick={() => applyPreset("aim")}>
                Прицел крупно
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
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button className="btn btn-ghost h-10" type="button" disabled={!objectUrl} onClick={togglePlayback}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                {isPlaying ? "Пауза" : "Play"}
              </button>
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

          <div className="rounded-lg border border-focus/15 bg-focus/[0.04] p-3">
            <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-sm font-black text-zinc-100">Участок крупного прицела</div>
                <div className="text-xs leading-5 text-zinc-500">
                  Zoom включится только между выбранными секундами. Остальное видео останется в базовом масштабе.
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <button className="btn btn-ghost h-9" type="button" disabled={!objectUrl} onClick={setZoomStart}>
                  Начало zoom
                </button>
                <button className="btn btn-ghost h-9" type="button" disabled={!objectUrl} onClick={setZoomEnd}>
                  Конец zoom
                </button>
                <button className="btn btn-ghost h-9" type="button" onClick={resetZoomSegment}>
                  Сброс zoom
                </button>
              </div>
            </div>
            <div className="space-y-3">
              <NumberControl label="Zoom от, сек" value={value.zoomStartSeconds} min={0} max={Math.max(duration, 1)} step={0.05} onChange={(next) => updateDraft({ zoomStartSeconds: next })} />
              <NumberControl label="Zoom до, сек" value={value.zoomEndSeconds} min={0} max={Math.max(duration, 1)} step={0.05} onChange={(next) => updateDraft({ zoomEndSeconds: next })} />
              <NumberControl label="Zoom прицела" value={value.zoomScale} min={1} max={MAX_VIDEO_SCALE} step={0.05} icon={<SlidersHorizontal size={14} />} onChange={(next) => updateDraft({ zoomScale: next })} />
              <NumberControl label="Сдвиг zoom X" value={value.zoomOffsetX} min={MIN_VIDEO_OFFSET} max={MAX_VIDEO_OFFSET} step={10} onChange={(next) => updateDraft({ zoomOffsetX: next })} />
              <NumberControl label="Сдвиг zoom Y" value={value.zoomOffsetY} min={MIN_VIDEO_OFFSET} max={MAX_VIDEO_OFFSET} step={10} onChange={(next) => updateDraft({ zoomOffsetY: next })} />
            </div>
          </div>

          <div className="space-y-3">
            <NumberControl label="Время полёта, сек" value={value.flightSeconds} min={0.1} max={20} step={0.1} icon={<Timer size={14} />} onChange={(next) => updateDraft({ flightSeconds: next })} />
            <NumberControl label="Стоп-кадр, сек" value={value.aimFrameSeconds} min={0} max={Math.max(duration, 1)} step={0.05} icon={<Scissors size={14} />} onChange={(next) => updateDraft({ aimFrameSeconds: next })} />
            <NumberControl label="Zoom видео" value={value.videoScale} min={MIN_VIDEO_SCALE} max={MAX_VIDEO_SCALE} step={0.05} icon={<SlidersHorizontal size={14} />} onChange={(next) => updateDraft({ videoScale: next })} />
            <NumberControl label="Стоп-кадр длится, сек" value={value.introSeconds} min={0.4} max={4} step={0.1} icon={<Timer size={14} />} onChange={(next) => updateDraft({ introSeconds: next })} />
            <NumberControl label="Сдвиг X" value={value.videoOffsetX} min={MIN_VIDEO_OFFSET} max={MAX_VIDEO_OFFSET} step={10} onChange={(next) => updateDraft({ videoOffsetX: next })} />
            <NumberControl label="Сдвиг Y" value={value.videoOffsetY} min={MIN_VIDEO_OFFSET} max={MAX_VIDEO_OFFSET} step={10} onChange={(next) => updateDraft({ videoOffsetY: next })} />
            <label className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
              <span>
                <span className="block text-sm font-black text-zinc-100">Скрыть watermark справа</span>
                <span className="block text-xs leading-5 text-zinc-500">В итоговом MP4 появится аккуратная FullFocus-плашка поверх чужого логотипа.</span>
              </span>
              <input
                className="h-5 w-5 accent-[#ff6a00]"
                type="checkbox"
                checked={hideWatermark}
                onChange={(event) => updateDraft({ hideWatermark: event.target.checked ? "true" : "false" })}
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
              <span>
                <span className="block text-sm font-black text-zinc-100">Скрыть логотип источника справа сверху</span>
                <span className="block text-xs leading-5 text-zinc-500">Эта зона применяется к gameplay-слою в preview и в итоговом MP4, чтобы закрыть csnades/чужой watermark.</span>
              </span>
              <input
                className="h-5 w-5 accent-[#ff6a00]"
                type="checkbox"
                checked={hideSourceLogo}
                onChange={(event) => updateDraft({ hideSourceLogo: event.target.checked ? "true" : "false" })}
              />
            </label>
            {hideSourceLogo ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Зона скрытия логотипа, %</div>
                <div className="space-y-3">
                  <NumberControl label="Logo X" value={value.logoCoverX} min={0} max={100} step={1} onChange={(next) => updateDraft({ logoCoverX: next })} />
                  <NumberControl label="Logo Y" value={value.logoCoverY} min={0} max={100} step={1} onChange={(next) => updateDraft({ logoCoverY: next })} />
                  <NumberControl label="Logo W" value={value.logoCoverWidth} min={1} max={45} step={1} onChange={(next) => updateDraft({ logoCoverWidth: next })} />
                  <NumberControl label="Logo H" value={value.logoCoverHeight} min={1} max={35} step={1} onChange={(next) => updateDraft({ logoCoverHeight: next })} />
                </div>
              </div>
            ) : null}
          </div>

          <button className="btn btn-primary h-12 w-full text-base" type="button" disabled={!files.length || isProcessing} onClick={buildVideo}>
            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Film size={18} />}
            {isProcessing ? "Собираем MP4..." : files.length > 1 ? `Собрать ${files.length} MP4 для Telegram` : "Собрать MP4 для Telegram"}
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
    <label className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-3 sm:grid-cols-[170px_minmax(120px,1fr)_96px] sm:items-center">
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-500">
        {icon}
        {label}
      </span>
      <input className="w-full accent-[#ff6a00]" type="range" min={min} max={max} step={step} value={normalized} onChange={(event) => onChange(event.target.value)} />
      <input
        className="field h-10"
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

function fillScreenScale(videoSize: { width: number; height: number } | null): string {
  if (!videoSize?.width || !videoSize.height) {
    return "1";
  }

  const stageAspect = 9 / 16;
  const videoAspect = videoSize.width / videoSize.height;
  const scale = Math.max(1, videoAspect / stageAspect);
  return formatDecimal(Math.min(MAX_VIDEO_SCALE, Math.max(MIN_VIDEO_SCALE, scale)));
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
