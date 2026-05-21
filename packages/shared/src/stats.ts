import type { MatchStatRecord, MatchWindowStats, StatCardPayload } from "./types";

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function avg(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateWindowStats(records: MatchStatRecord[], window: number): MatchWindowStats {
  const selected = records.slice(0, window);
  const wins = selected.filter((record) => record.result === "W").length;
  const losses = selected.filter((record) => record.result === "L").length;
  const kills = selected.reduce((sum, record) => sum + record.kills, 0);
  const deaths = selected.reduce((sum, record) => sum + record.deaths, 0);
  const assists = selected.reduce((sum, record) => sum + record.assists, 0);
  const adr = avg(selected.map((record) => record.adr).filter((value): value is number => value !== null));
  const hs = avg(selected.map((record) => record.headshotsPercent).filter((value): value is number => value !== null));
  const kdSeries = selected.map((record) => record.kd ?? (record.deaths > 0 ? record.kills / record.deaths : record.kills));

  return {
    window,
    matches: selected.length,
    wins,
    losses,
    winrate: selected.length ? round((wins / selected.length) * 100, 1) : 0,
    kills,
    deaths,
    assists,
    avgKills: selected.length ? round(kills / selected.length, 1) : 0,
    kd: deaths > 0 ? round(kills / deaths, 2) : kills,
    kr: selected.length ? round(kills / selected.length / 24, 2) : 0,
    adr: adr === null ? null : round(adr, 1),
    headshotsPercent: hs === null ? null : round(hs, 1),
    eloSeries: selected.map((record) => record.elo).filter((value): value is number => value !== null).reverse(),
    kdSeries: kdSeries.map((value) => round(value, 2)).reverse(),
    results: selected.map((record) => record.result).filter((value): value is "W" | "L" => value !== null)
  };
}

export function calculateDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) {
    return null;
  }
  return round(current - previous, 2);
}

export function inferRole(stats: MatchWindowStats): string | null {
  if (stats.matches < 10 || stats.adr === null) {
    return null;
  }
  if (stats.avgKills >= 22 && stats.adr >= 95) {
    return "ENTRY";
  }
  if (stats.kd >= 1.25 && stats.winrate >= 50) {
    return "CARRY";
  }
  if (stats.assists / Math.max(stats.matches, 1) >= 5) {
    return "SUPPORT";
  }
  return "RIFLER";
}

export function buildHighlights(records: MatchStatRecord[]): StatCardPayload["highlights"] {
  const adrValues = records.map((record) => record.adr).filter((value): value is number => value !== null);
  const kdValues = records.map((record) => record.kd).filter((value): value is number => value !== null);

  return {
    bestAdr: adrValues.length ? round(Math.max(...adrValues), 1) : null,
    bestKd: kdValues.length ? round(Math.max(...kdValues), 2) : null,
    maxKills: records.length ? Math.max(...records.map((record) => record.kills)) : null,
    bestRating: kdValues.length ? round(Math.max(...kdValues), 2) : null
  };
}
