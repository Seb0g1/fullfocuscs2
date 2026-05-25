import { describe, expect, it, vi } from "vitest";
import { GrenadeSide, GrenadeType } from "@prisma/client";
import { GrenadesService } from "./grenades.service";

describe("GrenadesService flow filters", () => {
  it("returns unique areas for selected map and side", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { area: "Мид", areaSlug: "mid" },
      { area: "Мид", areaSlug: "mid" },
      { area: "A", areaSlug: "a" }
    ]);
    const service = new GrenadesService({ grenadeLineup: { findMany } } as never, {} as never);

    const areas = await service.listAreas({ mapSlug: "mirage", side: "t" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          map: { slug: "mirage" },
          published: true,
          OR: [{ side: GrenadeSide.T }, { side: GrenadeSide.BOTH }]
        })
      })
    );
    expect(areas).toEqual([
      { area: "Мид", areaSlug: "mid" },
      { area: "A", areaSlug: "a" }
    ]);
  });

  it("lists grenade types for map side and area", async () => {
    const findMany = vi.fn().mockResolvedValue([{ grenadeType: GrenadeType.FLASH }, { grenadeType: GrenadeType.SMOKE }]);
    const service = new GrenadesService({ grenadeLineup: { findMany } } as never, {} as never);

    const types = await service.listTypesForSelection({ mapSlug: "mirage", side: "ct", areaSlug: "mid" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          map: { slug: "mirage" },
          areaSlug: "mid",
          OR: [{ side: GrenadeSide.CT }, { side: GrenadeSide.BOTH }]
        }),
        distinct: ["grenadeType"]
      })
    );
    expect(types).toEqual(["flash", "smoke"]);
  });

  it("rejects unsupported uploaded media types", async () => {
    const service = new GrenadesService({} as never, {} as never);

    await expect(
      service.saveUploadedMedia({
        filename: "payload.txt",
        mimetype: "text/plain",
        toBuffer: async () => Buffer.from("x")
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
