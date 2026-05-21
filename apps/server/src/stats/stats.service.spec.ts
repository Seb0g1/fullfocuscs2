import { describe, expect, it, vi } from "vitest";
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
    const service = new StatsService(faceit as never, steam as never, prisma as never);

    const payload = await service.buildPlayerStatPayload("Seb0g1");

    expect(payload.player.nickname).toBe("Seb0g1");
    expect(payload.currentWindow.matches).toBe(30);
    expect(payload.currentWindow.kd).toBe(2);
    expect(payload.currentWindow.winrate).toBe(50);
  });
});
