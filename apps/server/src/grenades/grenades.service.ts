import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { CS2_MAPS } from "@fullfocus/shared";
import { PrismaService } from "../prisma.service";
import {
  serializeLineup,
  toPrismaDifficulty,
  toPrismaGrenadeType,
  toPrismaMediaType,
  toPrismaSide
} from "./grenade-mappers";

export interface UpsertLineupInput {
  mapId: string;
  side: string;
  grenadeType: string;
  from: string;
  to: string;
  title: string;
  description: string;
  difficulty: string;
  tags?: string[];
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl?: string | null;
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
          create: { slug: map.slug, name: map.name, sortOrder: index }
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

  async createMap(input: { slug: string; name: string; active?: boolean }) {
    return this.prisma.csMap.create({
      data: {
        slug: input.slug.toLowerCase().trim(),
        name: input.name.trim(),
        active: input.active ?? true
      }
    });
  }

  async listLineups(filter: { mapId?: string; mapSlug?: string; type?: string; published?: boolean }) {
    const where: Prisma.GrenadeLineupWhereInput = {
      published: filter.published,
      mapId: filter.mapId,
      map: filter.mapSlug ? { slug: filter.mapSlug } : undefined,
      grenadeType: filter.type ? toPrismaGrenadeType(filter.type) : undefined
    };
    const lineups = await this.prisma.grenadeLineup.findMany({
      where,
      include: { map: true },
      orderBy: [{ updatedAt: "desc" }]
    });
    return lineups.map(serializeLineup);
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
    return {
      url: `/media/${filename}`,
      filename,
      mimetype: file.mimetype
    };
  }

  private toCreateData(input: UpsertLineupInput): Prisma.GrenadeLineupUncheckedCreateInput {
    return {
      mapId: input.mapId,
      side: toPrismaSide(input.side),
      grenadeType: toPrismaGrenadeType(input.grenadeType),
      fromPosition: input.from,
      toPosition: input.to,
      title: input.title,
      description: input.description,
      difficulty: toPrismaDifficulty(input.difficulty),
      tags: input.tags ?? [],
      mediaType: toPrismaMediaType(input.mediaType),
      mediaUrl: input.mediaUrl,
      thumbnailUrl: input.thumbnailUrl,
      published: input.published ?? false
    };
  }

  private toUpdateData(input: Partial<UpsertLineupInput>): Prisma.GrenadeLineupUncheckedUpdateInput {
    const data: Prisma.GrenadeLineupUncheckedUpdateInput = {};
    if (input.mapId !== undefined) data.mapId = input.mapId;
    if (input.side !== undefined) data.side = toPrismaSide(input.side);
    if (input.grenadeType !== undefined) data.grenadeType = toPrismaGrenadeType(input.grenadeType);
    if (input.from !== undefined) data.fromPosition = input.from;
    if (input.to !== undefined) data.toPosition = input.to;
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.difficulty !== undefined) data.difficulty = toPrismaDifficulty(input.difficulty);
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.mediaType !== undefined) data.mediaType = toPrismaMediaType(input.mediaType);
    if (input.mediaUrl !== undefined) data.mediaUrl = input.mediaUrl;
    if (input.thumbnailUrl !== undefined) data.thumbnailUrl = input.thumbnailUrl;
    if (input.published !== undefined) data.published = input.published;
    return data;
  }
}

function mimeToExt(mimetype: string): string {
  if (mimetype.includes("png")) return ".png";
  if (mimetype.includes("jpeg") || mimetype.includes("jpg")) return ".jpg";
  if (mimetype.includes("webp")) return ".webp";
  if (mimetype.includes("mp4")) return ".mp4";
  return ".bin";
}
