import { describe, expect, it } from "vitest";
import { calculateWindowStats, type MatchStatRecord, type StatCardPayload } from "@fullfocus/shared";
import { renderStatCard } from "./index";

const records: MatchStatRecord[] = Array.from({ length: 30 }, (_, index) => ({
  result: index % 3 === 0 ? "L" : "W",
  kills: 18 + index,
  deaths: 12,
  assists: 5,
  adr: 82 + index,
  headshotsPercent: 47,
  kd: (18 + index) / 12,
  kr: null,
  elo: 2100 + index
}));

const payload: StatCardPayload = {
  generatedAt: new Date(0).toISOString(),
  botName: "FullFocus cs2",
  seasonLabel: "SEASON 2026",
  player: {
    playerId: "player",
    nickname: "Seb0g1",
    avatar: null,
    country: "RU",
    faceitUrl: null,
    steamId64: null,
    elo: 2130,
    skillLevel: 10,
    skillLevelLabel: "10"
  },
  currentWindow: calculateWindowStats(records, 30),
  previousWindow: null,
  highlights: { bestAdr: 111, bestKd: 2.5, maxKills: 40, bestRating: 2.5 },
  topTeammates: [],
  role: "ENTRY"
};

describe("renderStatCard", () => {
  it("renders a png buffer", async () => {
    const png = await renderStatCard(payload);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.byteLength).toBeGreaterThan(1000);
  });
});
