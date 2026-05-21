import { z } from "zod";

export type AdminRole = "owner" | "admin" | "editor";

export const adminRoleSchema = z.enum(["owner", "admin", "editor"]);

export const grenadeLineupSchema = z.object({
  id: z.string(),
  mapSlug: z.string(),
  mapName: z.string(),
  side: z.enum(["t", "ct", "both"]),
  grenadeType: z.enum(["smoke", "flash", "molotov", "he"]),
  from: z.string(),
  to: z.string(),
  title: z.string(),
  description: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string()),
  mediaType: z.enum(["image", "video", "external"]),
  mediaUrl: z.string(),
  thumbnailUrl: z.string().nullable(),
  published: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type GrenadeLineup = z.infer<typeof grenadeLineupSchema>;

export interface AdminUser {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  role: AdminRole;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerSummary {
  playerId: string;
  nickname: string;
  avatar: string | null;
  country: string | null;
  faceitUrl: string | null;
  steamId64: string | null;
  elo: number;
  skillLevel: number;
  skillLevelLabel: string | null;
}

export interface MatchStatRecord {
  matchId?: string;
  finishedAt?: number;
  result: "W" | "L" | null;
  kills: number;
  deaths: number;
  assists: number;
  adr: number | null;
  headshotsPercent: number | null;
  kd: number | null;
  kr: number | null;
  elo: number | null;
}

export interface MatchWindowStats {
  window: number;
  matches: number;
  wins: number;
  losses: number;
  winrate: number;
  kills: number;
  deaths: number;
  assists: number;
  avgKills: number;
  kd: number;
  kr: number;
  adr: number | null;
  headshotsPercent: number | null;
  eloSeries: number[];
  kdSeries: number[];
  results: Array<"W" | "L">;
}

export interface StatCardPayload {
  generatedAt: string;
  botName: string;
  seasonLabel: string;
  player: PlayerSummary;
  currentWindow: MatchWindowStats;
  previousWindow: MatchWindowStats | null;
  highlights: {
    bestAdr: number | null;
    bestKd: number | null;
    maxKills: number | null;
    bestRating: number | null;
  };
  topTeammates: Array<{
    nickname: string;
    matches: number;
    wins: number;
    losses: number;
  }>;
  role: string | null;
}

export interface ComparisonSummary {
  generatedAt: string;
  botName: string;
  seasonLabel: string;
  window: number;
  left: StatCardPayload;
  right: StatCardPayload;
}

export type PlayerLookupKind = "faceit_nickname" | "faceit_url" | "steam_id64" | "steam_profile_url";

export interface PlayerLookupInput {
  kind: PlayerLookupKind;
  raw: string;
  value: string;
  isSteamVanity: boolean;
}
