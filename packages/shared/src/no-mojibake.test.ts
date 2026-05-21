import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const scannedExtensions = new Set([".ts", ".tsx", ".md", ".example"]);
const ignoredDirectories = new Set([".git", ".next", "dist", "node_modules", "coverage"]);
const suspiciousFragments = [
  "Рџ",
  "Р’",
  "Р°",
  "Рµ",
  "Рё",
  "РЅ",
  "Рѕ",
  "Рї",
  "Р»",
  "Рј",
  "Рґ",
  "Рє",
  "Рі",
  "Р±",
  "Р·",
  "Р№",
  "Рњ",
  "Рќ",
  "Рћ",
  "РЎ",
  "Р”",
  "Рљ",
  "Рў",
  "РҐ",
  "СЊ",
  "С‹",
  "СЏ",
  "СЋ",
  "СЂ",
  "СЃ",
  "С‚",
  "С‡",
  "С€",
  "С‰",
  "С†",
  "вЂ",
  "в†",
  "вљ",
  "рџ",
  "В·"
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
        offenders.push(`${file.replace(`${root}\\`, "").replace(`${root}/`, "")}: ${found.join(", ")}`);
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
