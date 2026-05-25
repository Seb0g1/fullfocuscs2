import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

describe("admin api helper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not send JSON content-type for empty DELETE requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204
    });
    vi.stubGlobal("fetch", fetchMock);

    await api("/admin/grenades/lineup-id", { method: "DELETE" });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.has("content-type")).toBe(false);
  });

  it("sends JSON content-type when a JSON body exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    });
    vi.stubGlobal("fetch", fetchMock);

    await api("/admin/settings/welcomeText", { method: "PATCH", body: JSON.stringify({ value: { text: "hi" } }) });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get("content-type")).toBe("application/json");
  });
});
