import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return {
      ok: true,
      service: "FullFocus cs2",
      time: new Date().toISOString()
    };
  }
}
