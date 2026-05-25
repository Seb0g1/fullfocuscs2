import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AdminGuard, AdminRoles } from "../admin/admin.guard";
import { GrenadesService, type UpsertLineupInput } from "./grenades.service";
import { GrenadeVideoService } from "./grenade-video.service";

@Controller()
export class GrenadesController {
  constructor(
    private readonly grenades: GrenadesService,
    private readonly videos: GrenadeVideoService
  ) {}

  @Get("grenades/maps")
  async publicMaps() {
    return this.grenades.listPublishedMaps();
  }

  @Get("grenades")
  async publicLineups(@Query("map") mapSlug?: string, @Query("type") type?: string) {
    return this.grenades.listLineups({ mapSlug, type, published: true });
  }

  @Get("admin/maps")
  @UseGuards(AdminGuard)
  @AdminRoles("editor")
  async maps() {
    return this.grenades.listMaps();
  }

  @Post("admin/maps")
  @UseGuards(AdminGuard)
  @AdminRoles("editor")
  async createMap(
    @Body()
    body: {
      slug: string;
      name: string;
      active?: boolean;
      overviewImageUrl?: string | null;
      emoji?: string | null;
      premiumEmojiId?: string | null;
      buttonStyle?: string | null;
    }
  ) {
    return this.grenades.createMap(body);
  }

  @Put("admin/maps/:id")
  @UseGuards(AdminGuard)
  @AdminRoles("editor")
  async updateMap(
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      active?: boolean;
      overviewImageUrl?: string | null;
      emoji?: string | null;
      premiumEmojiId?: string | null;
      buttonStyle?: string | null;
    }
  ) {
    return this.grenades.updateMap(id, body);
  }

  @Get("admin/grenades")
  @UseGuards(AdminGuard)
  @AdminRoles("editor")
  async lineups(
    @Query("mapId") mapId?: string,
    @Query("type") type?: string,
    @Query("side") side?: string,
    @Query("areaSlug") areaSlug?: string,
    @Query("published") published?: string
  ) {
    return this.grenades.listLineups({
      mapId,
      type,
      side,
      areaSlug,
      published: published === undefined || published === "" ? undefined : published === "true"
    });
  }

  @Post("admin/grenades")
  @UseGuards(AdminGuard)
  @AdminRoles("editor")
  async createLineup(@Body() body: UpsertLineupInput) {
    return this.grenades.createLineup(body);
  }

  @Put("admin/grenades/:id")
  @UseGuards(AdminGuard)
  @AdminRoles("editor")
  async updateLineup(@Param("id") id: string, @Body() body: Partial<UpsertLineupInput>) {
    return this.grenades.updateLineup(id, body);
  }

  @Delete("admin/grenades/:id")
  @UseGuards(AdminGuard)
  @AdminRoles("editor")
  async deleteLineup(@Param("id") id: string) {
    return this.grenades.deleteLineup(id);
  }

  @Post("admin/media")
  @UseGuards(AdminGuard)
  @AdminRoles("editor")
  async upload(@Req() request: FastifyRequest) {
    const file = await (request as never as { file: () => Promise<{ filename: string; mimetype: string; toBuffer: () => Promise<Buffer> }> }).file();
    return this.grenades.saveUploadedMedia(file);
  }

  @Post("admin/media/grenade-video")
  @UseGuards(AdminGuard)
  @AdminRoles("editor")
  async processGrenadeVideo(@Req() request: FastifyRequest) {
    const { file, fields } = await readMultipartForm(request);
    return this.videos.process({
      file,
      flightSeconds: fields.flightSeconds,
      aimFrameSeconds: fields.aimFrameSeconds,
      title: fields.title,
      videoScale: fields.videoScale,
      videoOffsetX: fields.videoOffsetX,
      videoOffsetY: fields.videoOffsetY,
      introSeconds: fields.introSeconds,
      hideWatermark: fields.hideWatermark,
      zoomStartSeconds: fields.zoomStartSeconds,
      zoomEndSeconds: fields.zoomEndSeconds,
      zoomScale: fields.zoomScale,
      zoomOffsetX: fields.zoomOffsetX,
      zoomOffsetY: fields.zoomOffsetY,
      sourceCropMode: fields.sourceCropMode,
      hideSourceLogo: fields.hideSourceLogo,
      logoCoverX: fields.logoCoverX,
      logoCoverY: fields.logoCoverY,
      logoCoverWidth: fields.logoCoverWidth,
      logoCoverHeight: fields.logoCoverHeight
    });
  }
}

type UploadedMultipartFile = { filename: string; mimetype: string; toBuffer: () => Promise<Buffer> };

async function readMultipartForm(request: FastifyRequest): Promise<{ file: UploadedMultipartFile; fields: Record<string, string> }> {
  const source = request as never as {
    parts?: () => AsyncIterable<
      | { type: "file"; filename: string; mimetype: string; toBuffer: () => Promise<Buffer> }
      | { type: "field"; fieldname: string; value: unknown }
    >;
  };
  if (typeof source.parts !== "function") {
    throw new HttpException("Multipart upload недоступен", HttpStatus.BAD_REQUEST);
  }

  let file: UploadedMultipartFile | null = null;
  const fields: Record<string, string> = {};

  for await (const part of source.parts()) {
    if (part.type === "file") {
      if (file) {
        throw new HttpException("Загрузи только один видеофайл", HttpStatus.BAD_REQUEST);
      }
      const buffer = await part.toBuffer();
      file = {
        filename: part.filename,
        mimetype: part.mimetype,
        toBuffer: async () => buffer
      };
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  if (!file) {
    throw new HttpException("Видео не загружено", HttpStatus.BAD_REQUEST);
  }

  return { file, fields };
}
