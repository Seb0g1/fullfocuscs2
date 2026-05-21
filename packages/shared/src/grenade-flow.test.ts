import { describe, expect, it } from "vitest";
import { buildGrenadeCallback, parseGrenadeCallback } from "./grenade-flow";

describe("grenade callback helpers", () => {
  it("builds and parses the bot flow callbacks", () => {
    const callbacks = [
      { kind: "menu" as const },
      { kind: "map" as const, mapSlug: "mirage" },
      { kind: "side" as const, mapSlug: "mirage", side: "t" as const },
      { kind: "area" as const, mapSlug: "mirage", side: "t" as const, areaSlug: "mid" },
      { kind: "type" as const, mapSlug: "mirage", side: "t" as const, areaSlug: "mid", grenadeType: "flash" },
      { kind: "position" as const, lineupId: "lineup_1" }
    ];

    for (const callback of callbacks) {
      expect(parseGrenadeCallback(buildGrenadeCallback(callback))).toEqual(callback);
    }
  });
});
