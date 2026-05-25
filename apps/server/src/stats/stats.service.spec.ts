import { describe, expect, it, vi } from "vitest";
import { HttpException, HttpStatus } from "@nestjs/common";
import { StatsService } from "./stats.service";

describe("StatsService", () => {
  it("builds a FACEIT stat payload from mocked API records", async () => {
    const faceit = {
      getPlayerByNickname: vi.fn().mockResolvedValue({
        player_id: "p1",
        nickname: "Seb0g1",
        country: "RU",
        games: { cs2: { faceit_elo: 2084, skill_level: 10, skill_level_label: "10" } }
      }),
      getPlayerMatchStats: vi.fn().mockResolvedValue({
        items: Array.from({ length: 30 }, (_, index) => ({
          stats: {
            Result: index % 2 ? "0" : "1",
            Kills: "20",
            Deaths: "10",
            Assists: "4",
            ADR: "90",
            "Headshots %": "50",
            "K/D Ratio": "2",
            Elo: String(2084 + index)
          }
        }))
      }),
      getPlayerLifetimeStats: vi.fn().mockResolvedValue({})
    };
    const steam = { resolveVanityUrl: vi.fn() };
    const prisma = {
      playerQueryLog: { create: vi.fn().mockResolvedValue({}) }
    };
    const avatars = { prepareAvatarDataUri: vi.fn().mockResolvedValue(null) };
    const service = new StatsService(faceit as never, steam as never, prisma as never, avatars as never);

    const payload = await service.buildPlayerStatPayload("Seb0g1");

    expect(payload.player.nickname).toBe("Seb0g1");
    expect(avatars.prepareAvatarDataUri).toHaveBeenCalledWith(null);
    expect(payload.currentWindow.matches).toBe(30);
    expect(payload.currentWindow.kd).toBe(2);
    expect(payload.currentWindow.winrate).toBe(50);
  });

  it("logs failed FACEIT lookups", async () => {
    const faceit = {
      getPlayerByNickname: vi.fn().mockRejectedValue(new HttpException("Игрок FACEIT не найден", HttpStatus.NOT_FOUND))
    };
    const prisma = {
      playerQueryLog: { create: vi.fn().mockResolvedValue({}) }
    };
    const service = new StatsService(faceit as never, {} as never, prisma as never, {} as never);

    await expect(service.buildPlayerStatPayload("missing", 30, "42")).rejects.toBeInstanceOf(HttpException);

    expect(prisma.playerQueryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        telegramId: "42",
        query: "missing",
        status: "error:404"
      })
    });
  });

  it("binds FACEIT separately from last viewed player", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const service = new StatsService({} as never, {} as never, { botUser: { upsert } } as never, {} as never);
    const payload = {
      player: { playerId: "p1", nickname: "Seb0g1", elo: 2361 }
    };

    await service.recordBotUser({ id: 42, username: "seb" }, payload as never, { bind: true });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          faceitNickname: "Seb0g1",
          boundFaceitNickname: "Seb0g1",
          boundFaceitElo: 2361
        }),
        create: expect.objectContaining({
          faceitNickname: "Seb0g1",
          boundFaceitNickname: "Seb0g1",
          boundFaceitElo: 2361
        })
      })
    );
  });

  it("keeps bound FACEIT unchanged when viewing another player", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const service = new StatsService({} as never, {} as never, { botUser: { upsert } } as never, {} as never);
    const payload = {
      player: { playerId: "p2", nickname: "donk666", elo: 4449 }
    };

    await service.recordBotUser({ id: 42 }, payload as never, { bind: false });

    const call = upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty("boundFaceitNickname");
    expect(call.create).toMatchObject({
      faceitNickname: "donk666",
      boundFaceitNickname: null
    });
  });
});
