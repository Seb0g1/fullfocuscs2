export type GrenadeCallback =
  | { kind: "menu" }
  | { kind: "map"; mapSlug: string }
  | { kind: "side"; mapSlug: string; side: "t" | "ct" }
  | { kind: "area"; mapSlug: string; side: "t" | "ct"; areaSlug: string }
  | { kind: "type"; mapSlug: string; side: "t" | "ct"; areaSlug: string; grenadeType: string }
  | { kind: "position"; lineupId: string };

export function buildGrenadeCallback(callback: GrenadeCallback): string {
  if (callback.kind === "menu") return "grenades";
  if (callback.kind === "map") return `gr:m:${callback.mapSlug}`;
  if (callback.kind === "side") return `gr:s:${callback.mapSlug}:${callback.side}`;
  if (callback.kind === "area") return `gr:a:${callback.mapSlug}:${callback.side}:${callback.areaSlug}`;
  if (callback.kind === "type") return `gr:t:${callback.mapSlug}:${callback.side}:${callback.areaSlug}:${callback.grenadeType}`;
  return `gr:p:${callback.lineupId}`;
}

export function parseGrenadeCallback(value: string): GrenadeCallback | null {
  if (value === "grenades") return { kind: "menu" };
  const parts = value.split(":");
  if (parts[0] !== "gr") return null;

  if (parts[1] === "m" && parts.length === 3) {
    return { kind: "map", mapSlug: parts[2] };
  }
  if (parts[1] === "s" && parts.length === 4 && isSide(parts[3])) {
    return { kind: "side", mapSlug: parts[2], side: parts[3] };
  }
  if (parts[1] === "a" && parts.length === 5 && isSide(parts[3])) {
    return { kind: "area", mapSlug: parts[2], side: parts[3], areaSlug: parts[4] };
  }
  if (parts[1] === "t" && parts.length === 6 && isSide(parts[3])) {
    return { kind: "type", mapSlug: parts[2], side: parts[3], areaSlug: parts[4], grenadeType: parts[5] };
  }
  if (parts[1] === "p" && parts.length === 3) {
    return { kind: "position", lineupId: parts[2] };
  }
  return null;
}

function isSide(value: string): value is "t" | "ct" {
  return value === "t" || value === "ct";
}
