import "reflect-metadata";
import { isAbsolute, join } from "node:path";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: true }));
  const config = app.get(ConfigService);
  const adminOrigin = config.get<string>("ADMIN_PUBLIC_URL") ?? "http://localhost:5030";
  const mediaRootConfig = config.get<string>("MEDIA_ROOT") ?? "media";
  const mediaRoot = isAbsolute(mediaRootConfig) ? mediaRootConfig : join(process.cwd(), mediaRootConfig);

  await app.register(cookie, {
    secret: config.get<string>("JWT_SECRET") ?? "dev-secret"
  });
  await app.register(multipart, {
    limits: { fileSize: 64 * 1024 * 1024 }
  });
  await app.register(fastifyStatic, {
    root: mediaRoot,
    prefix: "/media/"
  });

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: [adminOrigin, "http://localhost:5030", "http://localhost:3000"],
    credentials: true
  });

  const port = Number(config.get<string>("PORT") ?? 4000);
  await app.listen(port, "0.0.0.0");
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
