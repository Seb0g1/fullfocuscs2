import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const scannedExtensions = new Set([".ts", ".tsx", ".md", ".example"]);
const ignoredDirectories = new Set([".git", ".next", "dist", "node_modules", "coverage"]);
const suspiciousFragments = [
  "\u0420\u045F",
  "\u0420\u2019",
  "\u0420\u00B0",
  "\u0420\u00B5",
  "\u0420\u0451",
  "\u0420\u0405",
  "\u0420\u0455",
  "\u0420\u0457",
  "\u0420\u00BB",
  "\u0420\u0458",
  "\u0420\u0491",
  "\u0420\u0454",
  "\u0420\u0456",
  "\u0420\u00B1",
  "\u0420\u00B7",
  "\u0420\u2116",
  "\u0420\u045A",
  "\u0420\u045C",
  "\u0420\u045B",
  "\u0420\u040E",
  "\u0420\u201D",
  "\u0420\u0459",
  "\u0420\u045E",
  "\u0420\u0490",
  "\u0421\u040A",
  "\u0421\u2039",
  "\u0421\u040F",
  "\u0421\u040B",
  "\u0421\u0402",
  "\u0421\u0403",
  "\u0421\u201A",
  "\u0421\u2021",
  "\u0421\u20AC",
  "\u0421\u2030",
  "\u0421\u2020",
  "\u0432\u0402",
  "\u0432\u2020",
  "\u0432\u0459",
  "\u0440\u045F",
  "\u0412\u00B7",
  "\u0420\u00A0\u0421",
  "\u0420\u00A0\u00D0",
  "\u00D0\u00A0",
  "\u00C2\u00B7"
];

describe("repository text encoding", () => {
  it("does not contain common mojibake fragments", () => {
    const offenders: string[] = [];

    for (const file of walk(root)) {
      if (!shouldScan(file)) {
        continue;
      }

      const text = readFileSync(file, "utf8");
      const found = suspiciousFragments.filter((fragment) => text.includes(fragment));
      if (found.length) {
        offenders.push(`${file.replace(`${root}\\`, "").replace(`${root}/`, "")}: ${found.length} suspicious fragments`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

function* walk(directory: string): Generator<string> {
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue;
    }

    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      yield* walk(fullPath);
    } else {
      yield fullPath;
    }
  }
}

function shouldScan(file: string): boolean {
  if (basename(file) === "no-mojibake.test.ts") {
    return false;
  }

  if (file.endsWith(".env.example") || file.endsWith(".env.tiktok.example")) {
    return true;
  }

  return scannedExtensions.has(extname(file));
}
