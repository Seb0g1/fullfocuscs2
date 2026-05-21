import { describe, expect, it } from "vitest";
import { parsePlayerLookupInput, splitCompareInput } from "./input";

describe("parsePlayerLookupInput", () => {
  it("parses faceit player urls", () => {
    expect(parsePlayerLookupInput("https://www.faceit.com/ru/players/Seb0g1")).toMatchObject({
      kind: "faceit_url",
      value: "Seb0g1"
    });
  });

  it("parses steam id64", () => {
    expect(parsePlayerLookupInput("76561198000000000")).toMatchObject({
      kind: "steam_id64",
      value: "76561198000000000"
    });
  });

  it("parses steam vanity urls", () => {
    expect(parsePlayerLookupInput("https://steamcommunity.com/id/example")).toMatchObject({
      kind: "steam_profile_url",
      value: "example",
      isSteamVanity: true
    });
  });
});

describe("splitCompareInput", () => {
  it("splits common compare formats", () => {
    expect(splitCompareInput("Seb0g1 vs donk666")).toEqual(["Seb0g1", "donk666"]);
    expect(splitCompareInput("Seb0g1, donk666")).toEqual(["Seb0g1", "donk666"]);
  });
});
