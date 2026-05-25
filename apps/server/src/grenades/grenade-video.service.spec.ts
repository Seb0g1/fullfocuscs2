import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrenadeVideoService } from "./grenade-video.service";

class TestVideoService extends GrenadeVideoService {
  readonly commands: Array<{ command: string; args: string[] }> = [];
  probeDuration = 4.5;

  protected override async runCommand(command: string, args: string[]) {
    this.commands.push({ command, args });
    if (command === "ffprobe") {
      return {
        stdout: JSON.stringify({
          format: { duration: String(this.probeDuration) },
          streams: [{ codec_type: "video", width: 1080, height: 1920 }]
        }),
        stderr: ""
      };
    }
    return { stdout: "", stderr: "" };
  }
}

describe("GrenadeVideoService", () => {
  let mediaRoot: string;
  let service: TestVideoService;

  beforeEach(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), "fullfocus-video-"));
    const config = {
      get: vi.fn((key: string) => {
        if (key === "MEDIA_ROOT") return mediaRoot;
        if (key === "ADMIN_PUBLIC_URL") return "";
        return undefined;
      })
    };
    service = new TestVideoService(config as never);
  });

  afterEach(async () => {
    await rm(mediaRoot, { recursive: true, force: true });
  });

  it("returns a processed video media item with timing metadata", async () => {
    const result = await service.process({
      file: videoFile("video/webm", Buffer.from("video")),
      flightSeconds: "2.4",
      aimFrameSeconds: "1.2",
      title: "Флешка на Шорт",
      videoScale: "1.25",
      videoOffsetX: "40",
      videoOffsetY: "-80",
      introSeconds: "1.6",
      hideWatermark: "true",
      zoomStartSeconds: "1.1",
      zoomEndSeconds: "2.2",
      zoomScale: "2.2",
      zoomOffsetX: "60",
      zoomOffsetY: "-40",
      sourceCropMode: "center-wide"
    });

    expect(result.mediaItem).toMatchObject({
      type: "video",
      thumbnailUrl: expect.stringMatching(/^\/media\/.+\.jpg$/),
      url: expect.stringMatching(/^\/media\/.+\.mp4$/),
      caption: "Флешка на Шорт",
      flightSeconds: 2.4,
      aimFrameSeconds: 1.2,
      videoScale: 1.25,
      videoOffsetX: 40,
      videoOffsetY: -80,
      introSeconds: 1.6,
      zoomStartSeconds: 1.1,
      zoomEndSeconds: 2.2,
      zoomScale: 2.2,
      zoomOffsetX: 60,
      zoomOffsetY: -40,
      sourceCropMode: "center-wide",
      adapted: true
    });
    expect(result.source).toMatchObject({ durationSeconds: 4.5, width: 1080, height: 1920 });
    expect(result.editor).toEqual({
      flightSeconds: 2.4,
      aimFrameSeconds: 1.2,
      videoScale: 1.25,
      videoOffsetX: 40,
      videoOffsetY: -80,
      introSeconds: 1.6,
      hideWatermark: true,
      zoomStartSeconds: 1.1,
      zoomEndSeconds: 2.2,
      zoomScale: 2.2,
      zoomOffsetX: 60,
      zoomOffsetY: -40,
      sourceCropMode: "center-wide"
    });
    expect(service.commands.map((item) => item.command)).toEqual(["ffprobe", "ffmpeg", "ffmpeg", "ffmpeg"]);
    expect(service.commands[2]?.args.join(" ")).toContain("scale=1350:-2");
    expect(service.commands[2]?.args.join(" ")).toContain("crop=iw:trunc(min(ih\\,iw*9/16)/2)*2");
    expect(service.commands[2]?.args.join(" ")).toContain("overlay=(W-w)/2+40:(H-h)/2-80");
    expect(service.commands[2]?.args.join(" ")).toContain("drawbox=x=w-314:y=h-920");
    expect(service.commands[3]?.args.join(" ")).toContain("trim=duration=1.6");
    expect(service.commands[3]?.args.join(" ")).toContain("split=2[clipSrc][zoomSrc]");
    expect(service.commands[3]?.args.join(" ")).toContain("scale=2376:-2");
    expect(service.commands[3]?.args.join(" ")).toContain("enable='between(t,1.1,2.2)'");
  });

  it("accepts zoomed crop settings up to 4.5 and can skip watermark cover", async () => {
    await service.process({
      file: videoFile("video/mp4", Buffer.from("video")),
      flightSeconds: 2,
      aimFrameSeconds: 1,
      videoScale: "4.5",
      videoOffsetX: "1200",
      videoOffsetY: "-1200",
      hideWatermark: "false",
      sourceCropMode: "none"
    });

    const thumbnailArgs = service.commands[2]?.args.join(" ") ?? "";
    expect(thumbnailArgs).toContain("scale=4860:-2");
    expect(thumbnailArgs).toContain("overlay=(W-w)/2+1200:(H-h)/2-1200");
    expect(thumbnailArgs).not.toContain("drawbox=x=w-314:y=h-920");
  });

  it("rejects editor settings outside safe ranges", async () => {
    await expect(
      service.process({
        file: videoFile("video/mp4", Buffer.from("video")),
        flightSeconds: 2,
        aimFrameSeconds: 1,
        videoScale: 4.6
      })
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      service.process({
        file: videoFile("video/mp4", Buffer.from("video")),
        flightSeconds: 2,
        aimFrameSeconds: 1,
        videoOffsetX: 1201
      })
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      service.process({
        file: videoFile("video/mp4", Buffer.from("video")),
        flightSeconds: 2,
        aimFrameSeconds: 1,
        introSeconds: 0.1
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects unsupported file types", async () => {
    await expect(
      service.process({
        file: videoFile("image/png", Buffer.from("x")),
        flightSeconds: 2,
        aimFrameSeconds: 1
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects empty uploaded video files", async () => {
    await expect(
      service.process({
        file: videoFile("video/mp4", Buffer.alloc(0)),
        flightSeconds: 2,
        aimFrameSeconds: 1
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects stop frame timestamps beyond the video duration", async () => {
    service.probeDuration = 1;

    await expect(
      service.process({
        file: videoFile("video/mp4", Buffer.from("video")),
        flightSeconds: 2,
        aimFrameSeconds: 2
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects zoom segment end timestamps beyond the video duration", async () => {
    service.probeDuration = 1.5;

    await expect(
      service.process({
        file: videoFile("video/mp4", Buffer.from("video")),
        flightSeconds: 2,
        aimFrameSeconds: 1,
        zoomStartSeconds: 1,
        zoomEndSeconds: 2
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

function videoFile(mimetype: string, buffer: Buffer) {
  return {
    filename: "lineup.webm",
    mimetype,
    toBuffer: async () => buffer
  };
}
