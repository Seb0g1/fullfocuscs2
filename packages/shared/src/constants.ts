export const GAME_ID = "cs2";

export const FACEIT_API_BASE_URL = "https://open.faceit.com/data/v4";

export const DEFAULT_MATCH_WINDOWS = [1, 20, 30] as const;

export const CS2_MAPS = [
  { slug: "mirage", name: "Mirage" },
  { slug: "inferno", name: "Inferno" },
  { slug: "dust2", name: "Dust II" },
  { slug: "nuke", name: "Nuke" },
  { slug: "ancient", name: "Ancient" },
  { slug: "anubis", name: "Anubis" },
  { slug: "overpass", name: "Overpass" },
  { slug: "vertigo", name: "Vertigo" },
  { slug: "train", name: "Train" }
] as const;

export const GRENADE_TYPES = [
  { slug: "smoke", label: "Smoke" },
  { slug: "flash", label: "Flash" },
  { slug: "molotov", label: "Molotov" },
  { slug: "he", label: "HE" }
] as const;

export const SIDES = [
  { slug: "t", label: "T" },
  { slug: "ct", label: "CT" },
  { slug: "both", label: "T/CT" }
] as const;
