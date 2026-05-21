import {
  GrenadeDifficulty,
  GrenadeSide,
  GrenadeType,
  MediaType,
  type CsMap,
  type GrenadeLineup,
  type Prisma
} from "@prisma/client";
import type { GrenadeMediaItem } from "@fullfocus/shared";

export function toPrismaSide(side: string): GrenadeSide {
  return side.toLowerCase() === "ct" ? GrenadeSide.CT : side.toLowerCase() === "both" ? GrenadeSide.BOTH : GrenadeSide.T;
}

export function fromPrismaSide(side: GrenadeSide): "t" | "ct" | "both" {
  return side === GrenadeSide.CT ? "ct" : side === GrenadeSide.BOTH ? "both" : "t";
}

export function toPrismaGrenadeType(type: string): GrenadeType {
  const normalized = type.toLowerCase();
  if (normalized === "flash") return GrenadeType.FLASH;
  if (normalized === "molotov") return GrenadeType.MOLOTOV;
  if (normalized === "he") return GrenadeType.HE;
  return GrenadeType.SMOKE;
}

export function fromPrismaGrenadeType(type: GrenadeType): "smoke" | "flash" | "molotov" | "he" {
  if (type === GrenadeType.FLASH) return "flash";
  if (type === GrenadeType.MOLOTOV) return "molotov";
  if (type === GrenadeType.HE) return "he";
  return "smoke";
}

export function toPrismaDifficulty(difficulty: string): GrenadeDifficulty {
  const normalized = difficulty.toLowerCase();
  if (normalized === "hard") return GrenadeDifficulty.HARD;
  if (normalized === "medium") return GrenadeDifficulty.MEDIUM;
  return GrenadeDifficulty.EASY;
}

export function toPrismaMediaType(type: string): MediaType {
  const normalized = type.toLowerCase();
  if (normalized === "video") return MediaType.VIDEO;
  if (normalized === "external") return MediaType.EXTERNAL;
  return MediaType.IMAGE;
}

export function serializeLineup(lineup: GrenadeLineup & { map: CsMap }) {
  const mediaItems = normalizeMediaItems(lineup.mediaItems, {
    type: fromPrismaMediaType(lineup.mediaType),
    url: lineup.mediaUrl,
    thumbnailUrl: lineup.thumbnailUrl,
    caption: lineup.title
  });

  return {
    id: lineup.id,
    mapSlug: lineup.map.slug,
    mapName: lineup.map.name,
    mapOverviewImageUrl: lineup.map.overviewImageUrl,
    side: fromPrismaSide(lineup.side),
    grenadeType: fromPrismaGrenadeType(lineup.grenadeType),
    area: lineup.area || "Общее",
    areaSlug: lineup.areaSlug || "general",
    positionSlug: lineup.positionSlug || slugify(lineup.toPosition || lineup.title),
    from: lineup.fromPosition,
    to: lineup.toPosition,
    title: lineup.title,
    description: lineup.description,
    difficulty: lineup.difficulty.toLowerCase(),
    tags: lineup.tags,
    mediaType: lineup.mediaType.toLowerCase(),
    mediaUrl: lineup.mediaUrl,
    thumbnailUrl: lineup.thumbnailUrl,
    mediaItems,
    published: lineup.published,
    createdAt: lineup.createdAt.toISOString(),
    updatedAt: lineup.updatedAt.toISOString()
  };
}

export function fromPrismaMediaType(type: MediaType): "image" | "video" | "external" {
  if (type === MediaType.VIDEO) return "video";
  if (type === MediaType.EXTERNAL) return "external";
  return "image";
}

export function normalizeMediaItems(value: Prisma.JsonValue | null, fallback?: GrenadeMediaItem): GrenadeMediaItem[] {
  const rawItems = Array.isArray(value) ? value : [];
  const items = rawItems.flatMap((item): GrenadeMediaItem[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return [];
      }
      const record = item as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url.trim() : "";
      if (!url) {
        return [];
      }
      const type = typeof record.type === "string" ? record.type.toLowerCase() : inferMediaType(url);
      return [{
        type: type === "video" || type === "external" ? type : "image",
        url,
        thumbnailUrl: typeof record.thumbnailUrl === "string" ? record.thumbnailUrl : null,
        caption: typeof record.caption === "string" ? record.caption : null
      }];
    });

  if (items.length) {
    return items;
  }
  return fallback?.url ? [fallback] : [];
}

export function slugify(value: string): string {
  const translit: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "c",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya"
  };

  return value
    .trim()
    .toLowerCase()
    .split("")
    .map((char) => translit[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "general";
}

function inferMediaType(url: string): "image" | "video" | "external" {
  const lower = url.toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".webm")) return "video";
  if (lower.startsWith("http") && !/\.(png|jpe?g|webp|gif)$/i.test(lower)) return "external";
  return "image";
}
