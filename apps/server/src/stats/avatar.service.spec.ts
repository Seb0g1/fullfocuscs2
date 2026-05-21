import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarService, isSafeImageUrl } from "./avatar.service";

describe("AvatarService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unsafe avatar urls", () => {
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeImageUrl("ftp://example.com/a.png")).toBe(false);
    expect(isSafeImageUrl("https://cdn.faceit.com/avatar.png")).toBe(true);
  });

  it("fetches and caches avatar data uri", async () => {
    const cache = {
      getJson: vi.fn().mockResolvedValue(null),
      setJson: vi.fn().mockResolvedValue(undefined)
    };
    const png = Buffer.from([137, 80, 78, 71]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "image/png", "content-length": String(png.byteLength) }),
        arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength)
      })
    );

    const service = new AvatarService(cache as never);
    const dataUri = await service.prepareAvatarDataUri("https://cdn.faceit.com/avatar.png");

    expect(dataUri).toBe(`data:image/png;base64,${png.toString("base64")}`);
    expect(cache.setJson).toHaveBeenCalledOnce();
  });
});
