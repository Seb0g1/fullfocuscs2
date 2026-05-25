import { ExecutionContext, HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminGuard } from "./admin.guard";

function contextWithRequest(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    }),
    getHandler: () => "handler",
    getClass: () => "class"
  } as never;
}

describe("AdminGuard role gates", () => {
  it("allows higher roles to use editor routes", async () => {
    const auth = { getUserFromToken: vi.fn().mockResolvedValue({ role: "admin" }) };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(["editor"]) };
    const request = { headers: { authorization: "Bearer token" }, cookies: {} };
    const guard = new AdminGuard(auth as never, reflector as never);

    await expect(guard.canActivate(contextWithRequest(request))).resolves.toBe(true);
  });

  it("rejects editors from admin routes", async () => {
    const auth = { getUserFromToken: vi.fn().mockResolvedValue({ role: "editor" }) };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(["admin"]) };
    const request = { headers: { authorization: "Bearer token" }, cookies: {} };
    const guard = new AdminGuard(auth as never, reflector as never);

    await expect(guard.canActivate(contextWithRequest(request))).rejects.toBeInstanceOf(HttpException);
  });
});
