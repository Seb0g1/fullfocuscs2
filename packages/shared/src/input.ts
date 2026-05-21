import type { PlayerLookupInput } from "./types";

const FACEIT_PLAYER_RE = /faceit\.com\/(?:[a-z]{2}\/)?players\/([^/?#\s]+)/i;
const STEAM_ID64_RE = /^\d{17}$/;
const STEAM_PROFILE_RE = /steamcommunity\.com\/profiles\/(\d{17})/i;
const STEAM_VANITY_RE = /steamcommunity\.com\/id\/([^/?#\s]+)/i;

export function parsePlayerLookupInput(input: string): PlayerLookupInput {
  const raw = input.trim();

  const faceitMatch = raw.match(FACEIT_PLAYER_RE);
  if (faceitMatch?.[1]) {
    return {
      kind: "faceit_url",
      raw,
      value: decodeURIComponent(faceitMatch[1]),
      isSteamVanity: false
    };
  }

  const steamProfileMatch = raw.match(STEAM_PROFILE_RE);
  if (steamProfileMatch?.[1]) {
    return {
      kind: "steam_profile_url",
      raw,
      value: steamProfileMatch[1],
      isSteamVanity: false
    };
  }

  const steamVanityMatch = raw.match(STEAM_VANITY_RE);
  if (steamVanityMatch?.[1]) {
    return {
      kind: "steam_profile_url",
      raw,
      value: decodeURIComponent(steamVanityMatch[1]),
      isSteamVanity: true
    };
  }

  if (STEAM_ID64_RE.test(raw)) {
    return {
      kind: "steam_id64",
      raw,
      value: raw,
      isSteamVanity: false
    };
  }

  return {
    kind: "faceit_nickname",
    raw,
    value: raw.replace(/^@/, ""),
    isSteamVanity: false
  };
}

export function splitCompareInput(input: string): [string, string] | null {
  const parts = input
    .split(/\s+(?:vs|VS|против|и)\s+|\s*,\s*|\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  return [parts[0], parts.slice(1).join(" ")];
}
