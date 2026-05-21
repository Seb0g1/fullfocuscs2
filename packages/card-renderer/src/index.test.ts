import { describe, expect, it } from "vitest";
import { calculateWindowStats, type MatchStatRecord, type StatCardPayload } from "@fullfocus/shared";
import { renderComparisonCard, renderComparisonCardSvg, renderLevelBadge, renderStatCard, renderStatCardSvg } from "./index";

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
    avatarDataUri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAXSURBVChTY/jvyvCfGDyqEC+mtkKG/wA26+Ita7hw6QAAAABJRU5ErkJggg==",
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

  it("renders avatar image and png level icon in svg", () => {
    const svg = renderStatCardSvg(payload);
    expect(svg).toContain("<image");
    expect(svg).toContain("LVL");
    expect(svg.match(/data:image\/png;base64/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps an svg fallback badge available", () => {
    expect(renderLevelBadge(10, 24, 24)).toContain(">10</text>");
  });

  it("renders comparison png and svg with both png level icons", async () => {
    const comparison = { generatedAt: payload.generatedAt, botName: payload.botName, seasonLabel: payload.seasonLabel, window: 30, left: payload, right: payload };
    const png = await renderComparisonCard(comparison);
    const svg = renderComparisonCardSvg(comparison);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(svg.match(/data:image\/png;base64/g)?.length).toBeGreaterThanOrEqual(8);
  });
});
