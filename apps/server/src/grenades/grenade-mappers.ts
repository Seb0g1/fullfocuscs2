import { GrenadeDifficulty, GrenadeSide, GrenadeType, MediaType, type CsMap, type GrenadeLineup } from "@prisma/client";

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
  return {
    id: lineup.id,
    mapSlug: lineup.map.slug,
    mapName: lineup.map.name,
    side: fromPrismaSide(lineup.side),
    grenadeType: fromPrismaGrenadeType(lineup.grenadeType),
    from: lineup.fromPosition,
    to: lineup.toPosition,
    title: lineup.title,
    description: lineup.description,
    difficulty: lineup.difficulty.toLowerCase(),
    tags: lineup.tags,
    mediaType: lineup.mediaType.toLowerCase(),
    mediaUrl: lineup.mediaUrl,
    thumbnailUrl: lineup.thumbnailUrl,
    published: lineup.published,
    createdAt: lineup.createdAt.toISOString(),
    updatedAt: lineup.updatedAt.toISOString()
  };
}
