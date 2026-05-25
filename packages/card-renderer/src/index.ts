import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { ComparisonSummary, MatchWindowStats, PlayerSummary, StatCardPayload } from "@fullfocus/shared";

const WIDTH = 1080;
const HEIGHT = 1215;
const COMPARISON_HEIGHT = 600;
const levelIconCache = new Map<string, string | null>();

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(digits).replace(/\.0$/, "");
}

function trimText(value: string, max = 28): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function fitFontSize(value: string, baseSize: number, maxWidth: number, minSize = 18): number {
  const estimated = value.length * baseSize * 0.58;
  if (estimated <= maxWidth) {
    return baseSize;
  }
  return Math.max(minSize, Math.floor(maxWidth / Math.max(value.length * 0.58, 1)));
}

function fitLabel(label: string, baseSize: number, maxWidth: number): { text: string; size: number; spacing: number } {
  const text = label.toUpperCase();
  let size = baseSize;
  let spacing = text.length > 8 ? 1.25 : 2.25;
  const estimate = () => text.length * size * 0.56 + Math.max(0, text.length - 1) * spacing;

  while (estimate() > maxWidth && size > 10) {
    size -= 1;
  }
  if (estimate() > maxWidth) {
    spacing = 0;
  }

  return { text, size, spacing };
}

function lineChart(values: number[], x: number, y: number, w: number, h: number, color: string): string {
  if (values.length < 2) {
    return `<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity=".95"/>`;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const chartTop = y + 8;
  const chartHeight = Math.max(1, h - 16);
  const pointList = values
    .map((value, index) => {
      const px = x + (index / (values.length - 1)) * w;
      const py = span > 0 ? chartTop + chartHeight - ((value - min) / span) * chartHeight : y + h / 2;
      return { px, py };
    });
  const points = pointList.map((point) => `${point.px.toFixed(1)},${point.py.toFixed(1)}`).join(" ");
  const areaPoints = `${pointList[0].px.toFixed(1)},${(y + h).toFixed(1)} ${points} ${pointList[pointList.length - 1].px.toFixed(1)},${(y + h).toFixed(1)}`;

  return `
    ${span > 0 ? `<polygon points="${areaPoints}" fill="${color}" opacity=".12"/>` : ""}
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

function chartPanel(title: string, values: number[], fallbackValue: number | null, x: number, y: number, w: number, h: number, color: string, emptyLabel?: string): string {
  const hasValues = values.length > 0;
  const chartValues = hasValues ? values : fallbackValue === null ? [] : [fallbackValue, fallbackValue];
  const chartX = x + 40;
  const chartY = y + 70;
  const chartW = w - 80;
  const chartH = h - 104;
  const valueLabel = fallbackValue === null ? "" : fmt(fallbackValue, title.includes("K/D") ? 2 : 0);

  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
    <text x="${x + 24}" y="${y + 35}" fill="#a1a1aa" font-size="17" letter-spacing="4">${esc(title.toUpperCase())}</text>
    ${valueLabel ? `<text x="${x + w - 24}" y="${y + 36}" fill="#f7f7fa" font-size="20" font-weight="900" text-anchor="end">${esc(valueLabel)}</text>` : ""}
    <line x1="${chartX}" y1="${chartY}" x2="${chartX + chartW}" y2="${chartY}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>
    <line x1="${chartX}" y1="${chartY + chartH / 2}" x2="${chartX + chartW}" y2="${chartY + chartH / 2}" stroke="rgba(255,255,255,.07)" stroke-width="1"/>
    <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>
    ${lineChart(chartValues, chartX, chartY, chartW, chartH, color)}
    ${!hasValues && emptyLabel ? `<text x="${x + w / 2}" y="${y + h - 26}" fill="#7f838e" font-size="15" text-anchor="middle">${esc(emptyLabel)}</text>` : ""}
  `;
}

function statBox(label: string, value: string, x: number, y: number, w = 150, h = 95, valueSize = 30): string {
  const labelFit = fitLabel(label, w < 130 ? 14 : label.length > 9 ? 15 : 17, w - 40);
  const fittedValueSize = fitFontSize(value, valueSize, w - 46, Math.max(20, valueSize - 8));
  const labelY = y + (h < 80 ? 28 : 34);
  const valueY = y + (h < 80 ? h - 12 : 72);
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="${x + 18}" y="${labelY}" fill="#9a9aa5" font-size="${labelFit.size}" letter-spacing="${labelFit.spacing}">${esc(labelFit.text)}</text>
      <text x="${x + 18}" y="${valueY}" fill="#f7f7fa" font-size="${fittedValueSize}" font-weight="900">${esc(value)}</text>
      <circle cx="${x + w - 28}" cy="${y + h - 28}" r="12" fill="#ff6a00" opacity=".18"/>
    </g>
  `;
}

function faceitLevelBox(player: PlayerSummary, x: number, y: number, w = 160, h = 95): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      ${renderLevelIcon(player, x + w / 2 - 43, y + h / 2 - 43, 86)}
    </g>
  `;
}

export function renderLevelBadge(level: number, cx: number, cy: number, radius = 38): string {
  const clamped = Math.max(0, Math.min(10, Math.round(level || 0)));
  const accent = clamped >= 10 ? "#ff6a00" : "#e84b4b";
  return `
    <g>
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="#10131c" stroke="${accent}" stroke-width="${Math.max(7, radius * 0.22)}"/>
      <circle cx="${cx}" cy="${cy}" r="${radius + 8}" fill="${accent}" opacity=".1"/>
      <text x="${cx}" y="${cy + radius * 0.28}" fill="#ffffff" font-size="${Math.round(radius * 0.72)}" font-weight="900" text-anchor="middle">${clamped}</text>
    </g>
  `;
}

function renderLevelIcon(player: PlayerSummary, x: number, y: number, size: number): string {
  const dataUri = getLevelIconDataUri(player);
  if (!dataUri) {
    return renderLevelBadge(player.skillLevel, x + size / 2, y + size / 2, size / 2);
  }

  return `<image href="${esc(dataUri)}" xlink:href="${esc(dataUri)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
}

function getLevelIconDataUri(player: PlayerSummary): string | null {
  const iconName = getLevelIconName(player);
  if (levelIconCache.has(iconName)) {
    return levelIconCache.get(iconName) ?? null;
  }

  for (const directory of getAssetDirectories()) {
    const filePath = join(directory, iconName);
    if (!existsSync(filePath)) {
      continue;
    }

    const dataUri = `data:image/png;base64,${readFileSync(filePath).toString("base64")}`;
    levelIconCache.set(iconName, dataUri);
    return dataUri;
  }

  levelIconCache.set(iconName, null);
  return null;
}

function getLevelIconName(player: PlayerSummary): string {
  const label = player.skillLevelLabel?.toLowerCase().trim();
  if (label === "challenger" || player.skillLevel > 10) {
    return "challenger.png";
  }

  const level = Math.max(1, Math.min(10, Math.round(player.skillLevel || 1)));
  return `${level}.png`;
}

function getAssetDirectories(): string[] {
  return [
    process.env.FULLFOCUS_ASSETS_DIR,
    resolve(process.cwd(), "public"),
    resolve(process.cwd(), "..", "..", "public"),
    resolve(__dirname, "..", "..", "..", "public")
  ].filter((directory, index, directories): directory is string => Boolean(directory) && directories.indexOf(directory) === index);
}

function renderAvatar(player: PlayerSummary, x: number, y: number, size: number, clipId: string): string {
  const name = (player.nickname || "F").slice(0, 1).toUpperCase();
  if (player.avatarDataUri) {
    return `
      <clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="18"/></clipPath>
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="18" fill="#242632"/>
      <image href="${esc(player.avatarDataUri)}" xlink:href="${esc(player.avatarDataUri)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>
    `;
  }

  return `
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="18" fill="#242632" stroke="rgba(255,255,255,.08)"/>
    <text x="${x + size / 2}" y="${y + size / 2 + size * 0.18}" fill="#ff6a00" font-size="${Math.round(size * 0.48)}" font-weight="900" text-anchor="middle">${esc(name)}</text>
  `;
}

function resultsPills(stats: MatchWindowStats, x: number, y: number): string {
  return stats.results
    .slice(0, 30)
    .map((result, index) => {
      const px = x + (index % 15) * 28;
      const py = y + Math.floor(index / 15) * 31;
      const fill = result === "W" ? "#35d47d" : "#ff646d";
      return `<g><rect x="${px}" y="${py}" width="22" height="22" rx="6" fill="${fill}"/><text x="${px + 11}" y="${py + 16}" fill="#101014" font-size="13" font-weight="900" text-anchor="middle">${result}</text></g>`;
    })
    .join("");
}

function renderBaseDefs(): string {
  return `
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#06080d"/>
        <stop offset=".58" stop-color="#101018"/>
        <stop offset="1" stop-color="#1f0d07"/>
      </linearGradient>
      <linearGradient id="panel" x1="0" x2="1">
        <stop offset="0" stop-color="#1b171d"/>
        <stop offset=".56" stop-color="#161721"/>
        <stop offset="1" stop-color="#0f1a22"/>
      </linearGradient>
      <radialGradient id="flare" cx="82%" cy="12%" r="52%">
        <stop offset="0" stop-color="#ff6a00" stop-opacity=".46"/>
        <stop offset=".48" stop-color="#ff6a00" stop-opacity=".1"/>
        <stop offset="1" stop-color="#ff6a00" stop-opacity="0"/>
      </radialGradient>
      <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#ff6a00" flood-opacity=".26"/>
      </filter>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#000000" flood-opacity=".46"/>
      </filter>
    </defs>
  `;
}

function teammateRows(payload: StatCardPayload): string {
  if (!payload.topTeammates.length) {
    return `<text x="808" y="902" fill="#a1a1aa" font-size="21" text-anchor="middle">Недостаточно данных</text>`;
  }
  return payload.topTeammates
    .slice(0, 4)
    .map(
      (mate, index) =>
        `<text x="610" y="${875 + index * 23}" fill="#f7f7fa" font-size="18" font-weight="800">${esc(trimText(mate.nickname, 15))}</text><text x="1002" y="${875 + index * 23}" fill="#a1a1aa" font-size="15" text-anchor="end">${mate.matches} игр · ${mate.wins}W/${mate.losses}L</text>`
    )
    .join("");
}

function highlightBox(label: string, value: string, x: number): string {
  const labelSize = label.length > 6 ? 12 : 14;
  const valueSize = fitFontSize(value, 28, 82, 22);
  return `
    <g>
      <rect x="${x}" y="1080" width="106" height="58" rx="14" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.07)"/>
      <text x="${x + 18}" y="1105" fill="#9a9aa5" font-size="${labelSize}" letter-spacing="1.5">${esc(label.toUpperCase())}</text>
      <text x="${x + 18}" y="1132" fill="#f7f7fa" font-size="${valueSize}" font-weight="900">${esc(value)}</text>
    </g>
  `;
}

function renderStatSvg(payload: StatCardPayload): string {
  const stats = payload.currentWindow;
  const role = payload.role ?? "МАЛО ДАННЫХ";
  const title = `${trimText(payload.player.nickname, 14)} НА FACEIT`;
  const titleSize = fitFontSize(title, 64, 805, 48);
  const kadValue = `${stats.kills} / ${stats.assists} / ${stats.deaths}`;
  const kadValueSize = fitFontSize(kadValue, 32, 390, 24);
  const roleSize = fitFontSize(role, 32, 390, 24);
  const rightX = 585;
  const rightW = 445;
  const rightGap = 14;
  const rightBoxW = 139;
  const rightCol2 = rightX + rightBoxW + rightGap;
  const rightCol3 = rightCol2 + rightBoxW + rightGap;

  return `
  <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    ${renderBaseDefs()}
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#flare)"/>
    <rect x="18" y="18" width="${WIDTH - 36}" height="${HEIGHT - 36}" rx="30" fill="rgba(0,0,0,.24)" stroke="rgba(255,255,255,.09)"/>
    <text x="48" y="72" fill="#ffffff" font-size="26" font-weight="900">FULLFOCUS</text>
      <text x="250" y="72" fill="#8b8c96" font-size="16" letter-spacing="6">CS2 BOT</text>
    <text x="830" y="72" fill="#9ca3af" font-size="16" letter-spacing="6">${esc(payload.seasonLabel)}</text>
    <text x="48" y="145" fill="#a1a1aa" font-size="28" letter-spacing="9">СТАТИСТИКА</text>
    <text x="48" y="232" fill="#f7f7fa" font-size="${titleSize}" font-weight="900">${esc(title)}</text>
    <text x="48" y="292" fill="#777984" font-size="28" letter-spacing="8">ЗА ПОСЛЕДНИЕ ${stats.window} МАТЧЕЙ</text>

    <g filter="url(#shadow)">
      <rect x="48" y="325" width="500" height="126" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.11)"/>
      ${renderAvatar(payload.player, 72, 347, 82, "avatar-main")}
      <text x="178" y="387" fill="#f7f7fa" font-size="34" font-weight="900">${esc(trimText(payload.player.nickname, 18))}</text>
      <text x="178" y="420" fill="#a1a1aa" font-size="18">${esc((payload.player.country ?? "WORLD").toUpperCase())}</text>
      <path d="M472 385 L520 360 L520 410 Z" fill="#ff6a00" filter="url(#softGlow)"/>

      ${statBox("Матчи", String(stats.matches), 48, 468, 155)}
      ${statBox("ELO", String(payload.player.elo), 218, 468, 155)}
      ${faceitLevelBox(payload.player, 388, 468, 160)}

      ${chartPanel("График ELO", stats.eloSeries, payload.player.elo, 48, 595, 500, 190, "#ff6a00", "Тренд ELO появится после матчей")}
      ${chartPanel("График K/D", stats.kdSeries, stats.kd, 48, 810, 500, 190, "#5aa2ff", "Мало данных для графика")}

      <rect x="48" y="1026" width="500" height="125" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="72" y="1062" fill="#f7f7fa" font-size="20" letter-spacing="2">ХАЙЛАЙТЫ</text>
      ${highlightBox("ADR", fmt(payload.highlights.bestAdr), 72)}
      ${highlightBox("K/D", fmt(payload.highlights.bestKd, 2), 190)}
      ${highlightBox("KILLS", fmt(payload.highlights.maxKills, 0), 308)}
      ${highlightBox("Рейт.", fmt(payload.highlights.bestRating, 2), 432)}

      ${statBox("Рейт. 3.0", fmt(stats.kd, 2), rightX, 325, rightBoxW, 92)}
      ${statBox("AVG KILLS", fmt(stats.avgKills), rightCol2, 325, rightBoxW, 92)}
      ${statBox("K/D", fmt(stats.kd, 2), rightCol3, 325, rightBoxW, 92)}
      ${statBox("K/R", fmt(stats.kr, 2), rightX, 430, rightBoxW, 92)}
      ${statBox("HS%", `${fmt(stats.headshotsPercent)}%`, rightCol2, 430, rightBoxW, 92)}
      ${statBox("Винрейт", `${fmt(stats.winrate, 0)}%`, rightCol3, 430, rightBoxW, 92)}
      ${statBox("ADR", fmt(stats.adr), rightX, 535, rightBoxW, 92)}
      ${statBox("K/A/D", `${stats.kills}/${stats.assists}/${stats.deaths}`, rightCol2, 535, rightBoxW * 2 + rightGap, 92, 28)}

      <rect x="${rightX}" y="660" width="${rightW}" height="130" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="610" y="700" fill="#a1a1aa" font-size="15" letter-spacing="2">ПОСЛЕДНИЕ МАТЧИ</text>
      <text x="1004" y="700" fill="#f7f7fa" font-size="23" font-weight="900" text-anchor="end">${stats.wins} W / ${stats.losses} L</text>
      ${resultsPills(stats, 610, 724)}

      <rect x="${rightX}" y="812" width="${rightW}" height="145" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="610" y="847" fill="#a1a1aa" font-size="15" letter-spacing="2">ТОП ТИММЕЙТЫ</text>
      ${teammateRows(payload)}

      <rect x="${rightX}" y="980" width="${rightW}" height="76" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="610" y="1007" fill="#a1a1aa" font-size="16" letter-spacing="4">K / A / D</text>
      <text x="610" y="1042" fill="#f7f7fa" font-size="${kadValueSize}" font-weight="900">${esc(kadValue)}</text>

      <rect x="${rightX}" y="1078" width="${rightW}" height="76" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="610" y="1106" fill="#a1a1aa" font-size="16" letter-spacing="5">РОЛЬ</text>
      <text x="610" y="1142" fill="#f7f7fa" font-size="${roleSize}" font-weight="900">${esc(role)}</text>
    </g>
  </svg>`;
}

function compactPlayerPanel(payload: StatCardPayload, x: number, clipId: string): string {
  const stats = payload.currentWindow;
  const y = 235;

  return `
    <g filter="url(#shadow)">
      <rect x="${x}" y="${y}" width="495" height="330" rx="24" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      ${renderAvatar(payload.player, x + 32, y + 35, 74, clipId)}
      <text x="${x + 125}" y="${y + 70}" fill="#f7f7fa" font-size="32" font-weight="900">${esc(trimText(payload.player.nickname, 15))}</text>
      <text x="${x + 125}" y="${y + 103}" fill="#a1a1aa" font-size="17">${esc((payload.player.country ?? "WORLD").toUpperCase())} · ELO ${payload.player.elo}</text>
      ${renderLevelIcon(payload.player, x + 405, y + 40, 66)}
      ${statBox("Рейт. 3.0", fmt(stats.kd, 2), x + 32, y + 145, 215, 64, 30)}
      ${statBox("K/D", fmt(stats.kd, 2), x + 260, y + 145, 200, 64, 30)}
      ${statBox("ADR", fmt(stats.adr), x + 32, y + 223, 215, 64, 30)}
      ${statBox("Винрейт", `${fmt(stats.winrate, 0)}%`, x + 260, y + 223, 200, 64, 30)}
    </g>
  `;
}

function renderComparisonSvg(payload: ComparisonSummary): string {
  return `
  <svg width="${WIDTH}" height="${COMPARISON_HEIGHT}" viewBox="0 0 ${WIDTH} ${COMPARISON_HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    ${renderBaseDefs()}
    <rect width="${WIDTH}" height="${COMPARISON_HEIGHT}" fill="url(#bg)"/>
    <rect width="${WIDTH}" height="${COMPARISON_HEIGHT}" fill="url(#flare)"/>
    <rect x="18" y="18" width="${WIDTH - 36}" height="${COMPARISON_HEIGHT - 36}" rx="30" fill="rgba(0,0,0,.24)" stroke="rgba(255,255,255,.09)"/>
    <text x="48" y="72" fill="#ffffff" font-size="26" font-weight="900">FULLFOCUS</text>
    <text x="250" y="72" fill="#8b8c96" font-size="16" letter-spacing="6">CS2 BOT</text>
    <text x="830" y="72" fill="#9ca3af" font-size="16" letter-spacing="6">${esc(payload.seasonLabel)}</text>
    <text x="48" y="138" fill="#a1a1aa" font-size="24" letter-spacing="8">СРАВНЕНИЕ</text>
    <text x="48" y="190" fill="#f7f7fa" font-size="48" font-weight="900">${esc(trimText(payload.left.player.nickname, 12))} VS ${esc(trimText(payload.right.player.nickname, 12))}</text>
    <text x="48" y="226" fill="#777984" font-size="20" letter-spacing="6">ЗА ПОСЛЕДНИЕ ${payload.window} МАТЧЕЙ</text>
    ${compactPlayerPanel(payload.left, 36, "avatar-left")}
    ${compactPlayerPanel(payload.right, 549, "avatar-right")}
  </svg>`;
}

function svgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: {
      fontFiles: [],
      loadSystemFonts: true,
      defaultFontFamily: "Arial"
    }
  });
  return resvg.render().asPng();
}

export async function renderStatCard(payload: StatCardPayload): Promise<Buffer> {
  return svgToPng(renderStatSvg(payload));
}

export async function renderComparisonCard(payload: ComparisonSummary): Promise<Buffer> {
  return svgToPng(renderComparisonSvg(payload));
}

export function renderStatCardSvg(payload: StatCardPayload): string {
  return renderStatSvg(payload);
}

export function renderComparisonCardSvg(payload: ComparisonSummary): string {
  return renderComparisonSvg(payload);
}
