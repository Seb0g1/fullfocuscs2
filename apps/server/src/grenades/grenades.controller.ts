import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AdminGuard } from "../admin/admin.guard";
import { GrenadesService, type UpsertLineupInput } from "./grenades.service";

@Controller()
export class GrenadesController {
  constructor(private readonly grenades: GrenadesService) {}

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
  async maps() {
    return this.grenades.listMaps();
  }

  @Post("admin/maps")
  @UseGuards(AdminGuard)
  async createMap(@Body() body: { slug: string; name: string; active?: boolean }) {
    return this.grenades.createMap(body);
  }

  @Get("admin/grenades")
  @UseGuards(AdminGuard)
  async lineups(@Query("mapId") mapId?: string, @Query("type") type?: string) {
    return this.grenades.listLineups({ mapId, type });
  }

  @Post("admin/grenades")
  @UseGuards(AdminGuard)
  async createLineup(@Body() body: UpsertLineupInput) {
    return this.grenades.createLineup(body);
  }

  @Put("admin/grenades/:id")
  @UseGuards(AdminGuard)
  async updateLineup(@Param("id") id: string, @Body() body: Partial<UpsertLineupInput>) {
    return this.grenades.updateLineup(id, body);
  }

  @Delete("admin/grenades/:id")
  @UseGuards(AdminGuard)
  async deleteLineup(@Param("id") id: string) {
    return this.grenades.deleteLineup(id);
  }

  @Post("admin/media")
  @UseGuards(AdminGuard)
  async upload(@Req() request: FastifyRequest) {
    const file = await (request as never as { file: () => Promise<{ filename: string; mimetype: string; toBuffer: () => Promise<Buffer> }> }).file();
    return this.grenades.saveUploadedMedia(file);
  }
}
