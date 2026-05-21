import { describe, expect, it } from "vitest";
import { calculateWindowStats, inferRole } from "./stats";
import type { MatchStatRecord } from "./types";

const records: MatchStatRecord[] = Array.from({ length: 30 }, (_, index) => ({
  result: index % 2 === 0 ? "W" : "L",
  kills: 20 + index,
  deaths: 10,
  assists: 4,
  adr: 90 + index,
  headshotsPercent: 50,
  kd: (20 + index) / 10,
  kr: null,
  elo: 2000 + index
}));

describe("calculateWindowStats", () => {
  it("aggregates recent windows", () => {
    const stats = calculateWindowStats(records, 20);

    expect(stats.matches).toBe(20);
    expect(stats.wins).toBe(10);
    expect(stats.losses).toBe(10);
    expect(stats.avgKills).toBe(29.5);
    expect(stats.kd).toBe(2.95);
    expect(stats.eloSeries[0]).toBe(2019);
  });
});

describe("inferRole", () => {
  it("returns role only when enough matches exist", () => {
    expect(inferRole(calculateWindowStats(records.slice(0, 5), 5))).toBeNull();
    expect(inferRole(calculateWindowStats(records, 20))).toBe("ENTRY");
  });
});
