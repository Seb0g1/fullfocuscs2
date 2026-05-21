import { Body, Controller, Post } from "@nestjs/common";
import { BotService } from "./bot.service";

@Controller("telegram")
export class BotController {
  constructor(private readonly bot: BotService) {}

  @Post("webhook")
  async webhook(@Body() update: unknown) {
    await this.bot.handleWebhookUpdate(update);
    return { ok: true };
  }
}
