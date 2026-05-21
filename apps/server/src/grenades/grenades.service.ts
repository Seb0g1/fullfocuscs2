import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GrenadeSide, Prisma } from "@prisma/client";
import type { GrenadeMediaItem } from "@fullfocus/shared";
import { CS2_MAPS } from "@fullfocus/shared";
import { PrismaService } from "../prisma.service";
import {
  normalizeMediaItems,
  serializeLineup,
  slugify,
  toPrismaDifficulty,
  toPrismaGrenadeType,
  toPrismaMediaType,
  toPrismaSide
} from "./grenade-mappers";

export interface UpsertLineupInput {
  mapId: string;
  side: string;
  grenadeType: string;
  area?: string;
  areaSlug?: string;
  positionSlug?: string;
  from: string;
  to: string;
  title: string;
  description: string;
  difficulty: string;
  tags?: string[];
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl?: string | null;
  mediaItems?: GrenadeMediaItem[];
  published?: boolean;
}

@Injectable()
export class GrenadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async ensureDefaultMaps() {
    await Promise.all(
      CS2_MAPS.map((map, index) =>
        this.prisma.csMap.upsert({
          where: { slug: map.slug },
          update: {},
          create: { slug: map.slug, name: map.name, sortOrder: index, overviewImageUrl: null }
        })
      )
    );
  }

  async listMaps() {
    await this.ensureDefaultMaps();
    return this.prisma.csMap.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: { lineups: true }
        }
      }
    });
  }

  async listPublishedMaps() {
    await this.ensureDefaultMaps();
    return this.prisma.csMap.findMany({
      where: { active: true, lineups: { some: { published: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
  }

  async createMap(input: { slug: string; name: string; active?: boolean; overviewImageUrl?: string | null }) {
    return this.prisma.csMap.create({
      data: {
        slug: input.slug.toLowerCase().trim(),
        name: input.name.trim(),
        active: input.active ?? true,
        overviewImageUrl: input.overviewImageUrl ?? null
      }
    });
  }

  async updateMap(id: string, input: { name?: string; active?: boolean; overviewImageUrl?: string | null }) {
    return this.prisma.csMap.update({
      where: { id },
      data: {
        name: input.name,
        active: input.active,
        overviewImageUrl: input.overviewImageUrl
      }
    });
  }

  async listLineups(filter: {
    mapId?: string;
    mapSlug?: string;
    side?: string;
    areaSlug?: string;
    type?: string;
    published?: boolean;
  }) {
    const where: Prisma.GrenadeLineupWhereInput = {
      published: filter.published,
      mapId: filter.mapId,
      map: filter.mapSlug ? { slug: filter.mapSlug } : undefined,
      grenadeType: filter.type ? toPrismaGrenadeType(filter.type) : undefined,
      areaSlug: filter.areaSlug,
      ...(filter.side ? this.sideWhere(filter.side) : {})
    };
    const lineups = await this.prisma.grenadeLineup.findMany({
      where,
      include: { map: true },
      orderBy: [{ map: { sortOrder: "asc" } }, { area: "asc" }, { toPosition: "asc" }, { updatedAt: "desc" }]
    });
    return lineups.map(serializeLineup);
  }

  async listSidesForMap(mapSlug: string) {
    const rows = await this.prisma.grenadeLineup.findMany({
      where: { map: { slug: mapSlug }, published: true },
      select: { side: true },
      distinct: ["side"]
    });
    const sides = new Set<"t" | "ct">();
    for (const row of rows) {
      if (row.side === GrenadeSide.T || row.side === GrenadeSide.BOTH) sides.add("t");
      if (row.side === GrenadeSide.CT || row.side === GrenadeSide.BOTH) sides.add("ct");
    }
    return [...sides];
  }

  async listAreas(filter: { mapSlug: string; side: string }) {
    const rows = await this.prisma.grenadeLineup.findMany({
      where: {
        map: { slug: filter.mapSlug },
        published: true,
        ...this.sideWhere(filter.side)
      },
      select: { area: true, areaSlug: true },
      orderBy: [{ area: "asc" }]
    });
    return uniqueBy(
      rows.map((row) => ({
        area: row.area || "Общее",
        areaSlug: row.areaSlug || "general"
      })),
      (row) => row.areaSlug
    );
  }

  async listTypesForSelection(filter: { mapSlug: string; side: string; areaSlug: string }) {
    const rows = await this.prisma.grenadeLineup.findMany({
      where: {
        map: { slug: filter.mapSlug },
        published: true,
        areaSlug: filter.areaSlug,
        ...this.sideWhere(filter.side)
      },
      select: { grenadeType: true },
      distinct: ["grenadeType"]
    });
    return rows.map((row) => row.grenadeType.toLowerCase());
  }

  async listTypesForMap(mapSlug: string) {
    const rows = await this.prisma.grenadeLineup.findMany({
      where: { map: { slug: mapSlug }, published: true },
      select: { grenadeType: true },
      distinct: ["grenadeType"]
    });
    return rows.map((row) => row.grenadeType.toLowerCase());
  }

  async getLineup(id: string, publishedOnly = false) {
    const lineup = await this.prisma.grenadeLineup.findFirst({
      where: { id, published: publishedOnly ? true : undefined },
      include: { map: true }
    });
    return lineup ? serializeLineup(lineup) : null;
  }

  async createLineup(input: UpsertLineupInput) {
    const lineup = await this.prisma.grenadeLineup.create({
      data: this.toCreateData(input),
      include: { map: true }
    });
    return serializeLineup(lineup);
  }

  async updateLineup(id: string, input: Partial<UpsertLineupInput>) {
    const lineup = await this.prisma.grenadeLineup.update({
      where: { id },
      data: this.toUpdateData(input),
      include: { map: true }
    });
    return serializeLineup(lineup);
  }

  async deleteLineup(id: string) {
    await this.prisma.grenadeLineup.delete({ where: { id } });
    return { ok: true };
  }

  async saveUploadedMedia(file: { filename: string; mimetype: string; toBuffer: () => Promise<Buffer> }) {
    const mediaRoot = this.config.get<string>("MEDIA_ROOT") ?? "./media";
    await mkdir(mediaRoot, { recursive: true });
    const extension = extname(file.filename) || mimeToExt(file.mimetype);
    const filename = `${randomUUID()}${extension}`;
    const absolutePath = join(mediaRoot, filename);
    await writeFile(absolutePath, await file.toBuffer());
    const publicBase = this.config.get<string>("ADMIN_PUBLIC_URL")?.replace(/\/$/, "");
    const url = publicBase ? `${publicBase}/media/${filename}` : `/media/${filename}`;
    return {
      url,
      filename,
      mimetype: file.mimetype
    };
  }

  private toCreateData(input: UpsertLineupInput): Prisma.GrenadeLineupUncheckedCreateInput {
    const mediaItems = this.toMediaItems(input);
    const primaryMedia = mediaItems[0];

    return {
      mapId: input.mapId,
      side: toPrismaSide(input.side),
      grenadeType: toPrismaGrenadeType(input.grenadeType),
      area: (input.area ?? "Общее").trim() || "Общее",
      areaSlug: slugify(input.areaSlug || input.area || "Общее"),
      positionSlug: slugify(input.positionSlug || input.to || input.title),
      fromPosition: input.from,
      toPosition: input.to,
      title: input.title,
      description: input.description,
      difficulty: toPrismaDifficulty(input.difficulty),
      tags: input.tags ?? [],
      mediaType: toPrismaMediaType(input.mediaType || primaryMedia?.type || "image"),
      mediaUrl: input.mediaUrl || primaryMedia?.url || "",
      thumbnailUrl: input.thumbnailUrl ?? primaryMedia?.thumbnailUrl ?? null,
      mediaItems: mediaItems.length ? (mediaItems as never) : undefined,
      published: input.published ?? false
    };
  }

  private toUpdateData(input: Partial<UpsertLineupInput>): Prisma.GrenadeLineupUncheckedUpdateInput {
    const data: Prisma.GrenadeLineupUncheckedUpdateInput = {};
    if (input.mapId !== undefined) data.mapId = input.mapId;
    if (input.side !== undefined) data.side = toPrismaSide(input.side);
    if (input.grenadeType !== undefined) data.grenadeType = toPrismaGrenadeType(input.grenadeType);
    if (input.area !== undefined) data.area = input.area.trim() || "Общее";
    if (input.areaSlug !== undefined || input.area !== undefined) data.areaSlug = slugify(input.areaSlug || input.area || "Общее");
    if (input.positionSlug !== undefined || input.to !== undefined || input.title !== undefined) {
      data.positionSlug = slugify(input.positionSlug || input.to || input.title || "position");
    }
    if (input.from !== undefined) data.fromPosition = input.from;
    if (input.to !== undefined) data.toPosition = input.to;
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.difficulty !== undefined) data.difficulty = toPrismaDifficulty(input.difficulty);
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.mediaType !== undefined) data.mediaType = toPrismaMediaType(input.mediaType);
    if (input.mediaUrl !== undefined) data.mediaUrl = input.mediaUrl;
    if (input.thumbnailUrl !== undefined) data.thumbnailUrl = input.thumbnailUrl;
    if (input.mediaItems !== undefined) data.mediaItems = input.mediaItems.length ? (this.toMediaItems(input as UpsertLineupInput) as never) : Prisma.JsonNull;
    if (input.published !== undefined) data.published = input.published;
    return data;
  }

  private sideWhere(side: string): Prisma.GrenadeLineupWhereInput {
    const normalized = side.toLowerCase();
    if (normalized === "ct") {
      return { OR: [{ side: GrenadeSide.CT }, { side: GrenadeSide.BOTH }] };
    }
    if (normalized === "t") {
      return { OR: [{ side: GrenadeSide.T }, { side: GrenadeSide.BOTH }] };
    }
    if (normalized === "both") {
      return { side: GrenadeSide.BOTH };
    }
    return {};
  }

  private toMediaItems(input: Partial<UpsertLineupInput>): GrenadeMediaItem[] {
    return normalizeMediaItems((input.mediaItems ?? []) as never, {
      type: (input.mediaType === "video" || input.mediaType === "external" ? input.mediaType : "image") as never,
      url: input.mediaUrl ?? "",
      thumbnailUrl: input.thumbnailUrl ?? null,
      caption: input.title ?? null
    });
  }
}

function mimeToExt(mimetype: string): string {
  if (mimetype.includes("png")) return ".png";
  if (mimetype.includes("jpeg") || mimetype.includes("jpg")) return ".jpg";
  if (mimetype.includes("webp")) return ".webp";
  if (mimetype.includes("mp4")) return ".mp4";
  return ".bin";
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
