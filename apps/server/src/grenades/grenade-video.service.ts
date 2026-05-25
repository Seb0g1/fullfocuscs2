import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { GrenadeMediaItem } from "@fullfocus/shared";

const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
const DEFAULT_INTRO_SECONDS = 1.2;
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const MIN_VIDEO_SCALE = 0.65;
const MAX_VIDEO_SCALE = 4.5;
const MAX_VIDEO_OFFSET = 1200;
const MIN_INTRO_SECONDS = 0.4;
const MAX_INTRO_SECONDS = 4;
const VIDEO_MIME_EXTENSIONS = new Map([
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"]
]);

interface UploadedVideo {
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface GrenadeVideoInput {
  file: UploadedVideo;
  flightSeconds: unknown;
  aimFrameSeconds: unknown;
  title?: unknown;
  videoScale?: unknown;
  videoOffsetX?: unknown;
  videoOffsetY?: unknown;
  introSeconds?: unknown;
  hideWatermark?: unknown;
  zoomStartSeconds?: unknown;
  zoomEndSeconds?: unknown;
  zoomScale?: unknown;
  zoomOffsetX?: unknown;
  zoomOffsetY?: unknown;
  sourceCropMode?: unknown;
}

interface GrenadeVideoEditorSettings {
  flightSeconds: number;
  aimFrameSeconds: number;
  videoScale: number;
  videoOffsetX: number;
  videoOffsetY: number;
  introSeconds: number;
  hideWatermark: boolean;
  zoomStartSeconds: number;
  zoomEndSeconds: number;
  zoomScale: number;
  zoomOffsetX: number;
  zoomOffsetY: number;
  sourceCropMode: "none" | "center-wide";
}

export interface GrenadeVideoOutput {
  mediaItem: GrenadeMediaItem;
  source: {
    filename: string;
    durationSeconds: number;
    width: number;
    height: number;
  };
  editor: GrenadeVideoEditorSettings;
}

@Injectable()
export class GrenadeVideoService {
  constructor(private readonly config: ConfigService) {}

  async process(input: GrenadeVideoInput): Promise<GrenadeVideoOutput> {
    const normalizedMime = input.file.mimetype.toLowerCase().split(";")[0]?.trim() ?? "";
    const extension = VIDEO_MIME_EXTENSIONS.get(normalizedMime);
    if (!extension) {
      throw new HttpException("Можно загрузить только webm, mp4 или mov видео", HttpStatus.BAD_REQUEST);
    }

    const editor = normalizeEditorSettings(input);
    const buffer = await input.file.toBuffer();
    if (!buffer.length) {
      throw new HttpException("Файл пустой", HttpStatus.BAD_REQUEST);
    }
    if (buffer.byteLength > MAX_MEDIA_BYTES) {
      throw new HttpException("Файл слишком большой. Максимум 64 MB", HttpStatus.PAYLOAD_TOO_LARGE);
    }

    const mediaRoot = this.mediaRoot();
    const tempRoot = join(mediaRoot, "tmp");
    await mkdir(mediaRoot, { recursive: true });
    await mkdir(tempRoot, { recursive: true });

    const id = randomUUID();
    const sourcePath = join(tempRoot, `${id}-source${extension}`);
    const aimFramePath = join(tempRoot, `${id}-aim.jpg`);
    const outputFilename = `${id}.mp4`;
    const thumbnailFilename = `${id}.jpg`;
    const outputPath = join(mediaRoot, outputFilename);
    const thumbnailPath = join(mediaRoot, thumbnailFilename);

    await writeFile(sourcePath, buffer);

    try {
      const source = await this.probe(sourcePath);
      if (editor.aimFrameSeconds > source.durationSeconds) {
        throw new HttpException("Стоп-кадр не может быть позже конца видео", HttpStatus.BAD_REQUEST);
      }
      const hasZoomSegment = editor.zoomEndSeconds > editor.zoomStartSeconds;
      if (hasZoomSegment && editor.zoomEndSeconds > source.durationSeconds) {
        throw new HttpException("Конец zoom не может быть позже конца видео", HttpStatus.BAD_REQUEST);
      }

      const coverPath = this.coverPath();
      const videoWidth = even(OUTPUT_WIDTH * editor.videoScale);
      const zoomVideoWidth = even(OUTPUT_WIDTH * editor.zoomScale);
      const overlay = overlayPosition(editor.videoOffsetX, editor.videoOffsetY);
      const zoomOverlay = overlayPosition(editor.zoomOffsetX, editor.zoomOffsetY);
      const watermark = watermarkFilter(editor.hideWatermark);
      const sourceCrop = sourceCropFilter(editor.sourceCropMode);
      const mainClipFilter = hasZoomSegment
        ? `[2:v]${sourceCrop}split=2[clipSrc][zoomSrc];[clipSrc]scale=${videoWidth}:-2,setsar=1[clip];[zoomSrc]scale=${zoomVideoWidth}:-2,setsar=1[zoom];[bg][clip]overlay=${overlay}:shortest=1[base];[base][zoom]overlay=${zoomOverlay}:enable='between(t,${editor.zoomStartSeconds},${editor.zoomEndSeconds})':shortest=1${watermark},format=yuv420p,setpts=PTS-STARTPTS[main]`
        : `[2:v]${sourceCrop}scale=${videoWidth}:-2,setsar=1[clip];[bg][clip]overlay=${overlay}:shortest=1${watermark},format=yuv420p,setpts=PTS-STARTPTS[main]`;
      await this.runFfmpeg([
        "-y",
        "-ss",
        String(editor.aimFrameSeconds),
        "-i",
        sourcePath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        aimFramePath
      ], "Не удалось извлечь стоп-кадр из видео");

      await this.runFfmpeg([
        "-y",
        "-loop",
        "1",
        "-i",
        coverPath,
        "-i",
        aimFramePath,
        "-filter_complex",
        `[0:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setsar=1[bg];[1:v]${sourceCrop}scale=${videoWidth}:-2,setsar=1[aim];[bg][aim]overlay=${overlay}${watermark},format=yuv420p[v]`,
        "-map",
        "[v]",
        "-frames:v",
        "1",
        "-q:v",
        "2",
        thumbnailPath
      ], "Не удалось собрать обложку стоп-кадра");

      await this.runFfmpeg([
        "-y",
        "-loop",
        "1",
        "-t",
        String(editor.introSeconds),
        "-i",
        thumbnailPath,
        "-loop",
        "1",
        "-i",
        coverPath,
        "-i",
        sourcePath,
        "-filter_complex",
        `[0:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setsar=1,trim=duration=${editor.introSeconds},setpts=PTS-STARTPTS[intro];[1:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setsar=1[bg];${mainClipFilter};[intro][main]concat=n=2:v=1:a=0[v]`,
        "-map",
        "[v]",
        "-an",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputPath
      ], "Не удалось собрать Telegram-ready MP4");

      const url = this.publicMediaUrl(outputFilename);
      const thumbnailUrl = this.publicMediaUrl(thumbnailFilename);
      return {
        mediaItem: {
          type: "video",
          url,
          thumbnailUrl,
          caption: normalizeTitle(input.title),
          flightSeconds: editor.flightSeconds,
          aimFrameSeconds: editor.aimFrameSeconds,
          videoScale: editor.videoScale,
          videoOffsetX: editor.videoOffsetX,
          videoOffsetY: editor.videoOffsetY,
          introSeconds: editor.introSeconds,
          zoomStartSeconds: editor.zoomStartSeconds,
          zoomEndSeconds: editor.zoomEndSeconds,
          zoomScale: editor.zoomScale,
          zoomOffsetX: editor.zoomOffsetX,
          zoomOffsetY: editor.zoomOffsetY,
          sourceCropMode: editor.sourceCropMode,
          adapted: true
        },
        source,
        editor
      };
    } finally {
      await Promise.all([rm(sourcePath, { force: true }), rm(aimFramePath, { force: true })]);
    }
  }

  protected runCommand(command: string, args: string[]): Promise<CommandResult> {
    return new Promise((resolveCommand, rejectCommand) => {
      const child = spawn(command, args, { windowsHide: true });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", rejectCommand);
      child.on("close", (code) => {
        if (code === 0) {
          resolveCommand({ stdout, stderr });
          return;
        }
        rejectCommand(new Error(stderr || `${command} exited with code ${code}`));
      });
    });
  }

  private async probe(sourcePath: string) {
    let output: CommandResult;
    try {
      output = await this.runCommand("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", sourcePath]);
    } catch {
      throw new HttpException("Не удалось прочитать параметры видео. Проверь ffprobe и файл.", HttpStatus.UNPROCESSABLE_ENTITY);
    }

    let parsed: {
      format?: { duration?: string; size?: string };
      streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>;
    };
    try {
      parsed = JSON.parse(output.stdout || "{}") as typeof parsed;
    } catch {
      throw new HttpException("ffprobe вернул некорректные данные по видео", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const video = parsed.streams?.find((stream) => stream.codec_type === "video");
    const durationSeconds = Number(parsed.format?.duration ?? video?.duration ?? 0);
    const width = Number(video?.width ?? 0);
    const height = Number(video?.height ?? 0);

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !width || !height) {
      throw new HttpException("Не удалось определить длительность или размер видео", HttpStatus.UNPROCESSABLE_ENTITY);
    }

    return {
      filename: sourcePath.split(/[\\/]/).pop() ?? "source",
      durationSeconds: round(durationSeconds),
      width,
      height
    };
  }

  private async runFfmpeg(args: string[], errorMessage: string) {
    try {
      await this.runCommand("ffmpeg", args);
    } catch {
      throw new HttpException(errorMessage, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  private mediaRoot(): string {
    const mediaRootConfig = this.config.get<string>("MEDIA_ROOT") ?? "./media";
    return isAbsolute(mediaRootConfig) ? mediaRootConfig : resolve(process.cwd(), mediaRootConfig);
  }

  private coverPath(): string {
    const configured = this.config.get<string>("GRENADE_VIDEO_COVER_PATH");
    const candidates = [
      configured,
      resolve(process.cwd(), "public", "back-fro-granades.png"),
      resolve(__dirname, "..", "..", "..", "..", "public", "back-fro-granades.png")
    ].filter((path): path is string => Boolean(path));

    const found = candidates.find((path) => existsSync(path));
    if (!found) {
      throw new HttpException("Фон для видео не найден: public/back-fro-granades.png", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return found;
  }

  private publicMediaUrl(filename: string): string {
    const publicBase = this.config.get<string>("ADMIN_PUBLIC_URL")?.replace(/\/$/, "");
    return publicBase ? `${publicBase}/media/${filename}` : `/media/${filename}`;
  }
}

function parseSeconds(value: unknown, message: string, allowZero: boolean): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed <= 0)) {
    throw new HttpException(message, HttpStatus.BAD_REQUEST);
  }
  return round(parsed);
}

function normalizeEditorSettings(input: GrenadeVideoInput): GrenadeVideoEditorSettings {
  return {
    flightSeconds: parseSeconds(input.flightSeconds, "Время полёта должно быть числом больше 0", false),
    aimFrameSeconds: parseSeconds(input.aimFrameSeconds, "Стоп-кадр должен быть числом 0 или больше", true),
    videoScale: parseRange(input.videoScale, 1, MIN_VIDEO_SCALE, MAX_VIDEO_SCALE, "Zoom видео должен быть от 0.65 до 4.5"),
    videoOffsetX: parseRange(input.videoOffsetX, 0, -MAX_VIDEO_OFFSET, MAX_VIDEO_OFFSET, "Сдвиг X должен быть от -1200 до 1200"),
    videoOffsetY: parseRange(input.videoOffsetY, 0, -MAX_VIDEO_OFFSET, MAX_VIDEO_OFFSET, "Сдвиг Y должен быть от -1200 до 1200"),
    introSeconds: parseRange(input.introSeconds, DEFAULT_INTRO_SECONDS, MIN_INTRO_SECONDS, MAX_INTRO_SECONDS, "Длительность стоп-кадра должна быть от 0.4 до 4 сек."),
    hideWatermark: parseBoolean(input.hideWatermark, true),
    zoomStartSeconds: parseSeconds(input.zoomStartSeconds, "Начало zoom должно быть числом 0 или больше", true),
    zoomEndSeconds: parseSeconds(input.zoomEndSeconds, "Конец zoom должен быть числом 0 или больше", true),
    zoomScale: parseRange(input.zoomScale, 2, 1, MAX_VIDEO_SCALE, "Zoom прицела должен быть от 1 до 4.5"),
    zoomOffsetX: parseRange(input.zoomOffsetX, 0, -MAX_VIDEO_OFFSET, MAX_VIDEO_OFFSET, "Сдвиг zoom X должен быть от -1200 до 1200"),
    zoomOffsetY: parseRange(input.zoomOffsetY, 0, -MAX_VIDEO_OFFSET, MAX_VIDEO_OFFSET, "Сдвиг zoom Y должен быть от -1200 до 1200"),
    sourceCropMode: parseSourceCropMode(input.sourceCropMode)
  };
}

function parseRange(value: unknown, fallback: number, min: number, max: number, message: string): number {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new HttpException(message, HttpStatus.BAD_REQUEST);
  }
  return round(parsed);
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

function overlayPosition(offsetX: number, offsetY: number): string {
  return `(W-w)/2${signedOffset(offsetX)}:(H-h)/2${signedOffset(offsetY)}`;
}

function watermarkFilter(enabled: boolean): string {
  if (!enabled) {
    return "";
  }
  return ",drawbox=x=w-314:y=h-920:w=262:h=82:color=0xff6a00@0.9:t=4,drawbox=x=w-306:y=h-912:w=246:h=66:color=black@0.82:t=fill";
}

function sourceCropFilter(mode: "none" | "center-wide"): string {
  if (mode !== "center-wide") {
    return "";
  }
  return "crop=iw:trunc(min(ih\\,iw*9/16)/2)*2:0:(ih-trunc(min(ih\\,iw*9/16)/2)*2)/2,";
}

function signedOffset(value: number): string {
  if (!value) return "";
  return value > 0 ? `+${value}` : String(value);
}

function normalizeTitle(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const normalized = String(value).toLowerCase().trim();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function parseSourceCropMode(value: unknown): "none" | "center-wide" {
  return value === "none" ? "none" : "center-wide";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
