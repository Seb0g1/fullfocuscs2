import { Resvg } from "@resvg/resvg-js";
import type { ComparisonSummary, MatchWindowStats, PlayerSummary, StatCardPayload } from "@fullfocus/shared";

const WIDTH = 1080;
const HEIGHT = 1215;
const COMPARISON_HEIGHT = 600;

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
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function lineChart(values: number[], x: number, y: number, w: number, h: number, color: string): string {
  if (values.length < 2) {
    return `<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity=".95"/>`;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const px = x + (index / (values.length - 1)) * w;
      const py = y + h - ((value - min) / span) * h;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");

  return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function statBox(label: string, value: string, x: number, y: number, w = 150, h = 95, valueSize = 30): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="${x + 18}" y="${y + 34}" fill="#9a9aa5" font-size="17" letter-spacing="3">${esc(label.toUpperCase())}</text>
      <text x="${x + 18}" y="${y + 72}" fill="#f7f7fa" font-size="${valueSize}" font-weight="900">${esc(value)}</text>
      <circle cx="${x + w - 28}" cy="${y + h - 28}" r="12" fill="#ff6a00" opacity=".18"/>
    </g>
  `;
}

function faceitLevelBox(player: PlayerSummary, x: number, y: number, w = 160, h = 95): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="${x + 18}" y="${y + 34}" fill="#9a9aa5" font-size="17" letter-spacing="3">FACEIT</text>
      <text x="${x + 18}" y="${y + 72}" fill="#f7f7fa" font-size="30" font-weight="900">LVL</text>
      ${renderLevelBadge(player.skillLevel, x + w - 34, y + 48, 30)}
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
        <stop offset="0" stop-color="#07090f"/>
        <stop offset=".55" stop-color="#111018"/>
        <stop offset="1" stop-color="#260f08"/>
      </linearGradient>
      <linearGradient id="panel" x1="0" x2="1">
        <stop offset="0" stop-color="#1b171c"/>
        <stop offset=".58" stop-color="#171721"/>
        <stop offset="1" stop-color="#101822"/>
      </linearGradient>
      <radialGradient id="flare" cx="82%" cy="12%" r="52%">
        <stop offset="0" stop-color="#ff6a00" stop-opacity=".55"/>
        <stop offset=".48" stop-color="#ff6a00" stop-opacity=".12"/>
        <stop offset="1" stop-color="#ff6a00" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity=".5"/>
      </filter>
    </defs>
  `;
}

function teammateRows(payload: StatCardPayload): string {
  if (!payload.topTeammates.length) {
    return `<text x="642" y="870" fill="#a1a1aa" font-size="24">Недостаточно данных</text>`;
  }
  return payload.topTeammates
    .slice(0, 4)
    .map(
      (mate, index) =>
        `<text x="642" y="${850 + index * 28}" fill="#f7f7fa" font-size="22" font-weight="800">${esc(trimText(mate.nickname, 18))}</text><text x="930" y="${850 + index * 28}" fill="#a1a1aa" font-size="18" text-anchor="end">${mate.matches} игр · ${mate.wins}W/${mate.losses}L</text>`
    )
    .join("");
}

function highlightBox(label: string, value: string, x: number): string {
  return `
    <g>
      <rect x="${x}" y="1080" width="106" height="58" rx="14" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.07)"/>
      <text x="${x + 18}" y="1105" fill="#9a9aa5" font-size="14" letter-spacing="2">${esc(label.toUpperCase())}</text>
      <text x="${x + 18}" y="1132" fill="#f7f7fa" font-size="28" font-weight="900">${esc(value)}</text>
    </g>
  `;
}

function renderStatSvg(payload: StatCardPayload): string {
  const stats = payload.currentWindow;
  const role = payload.role ?? "МАЛО ДАННЫХ";

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
    <text x="48" y="232" fill="#f7f7fa" font-size="64" font-weight="900">${esc(trimText(payload.player.nickname, 14))} НА FACEIT</text>
    <text x="48" y="292" fill="#777984" font-size="28" letter-spacing="8">ЗА ПОСЛЕДНИЕ ${stats.window} МАТЧЕЙ</text>

    <g filter="url(#shadow)">
      <rect x="48" y="325" width="500" height="126" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.11)"/>
      ${renderAvatar(payload.player, 72, 347, 82, "avatar-main")}
      <text x="178" y="387" fill="#f7f7fa" font-size="34" font-weight="900">${esc(trimText(payload.player.nickname, 18))}</text>
      <text x="178" y="420" fill="#a1a1aa" font-size="18">${esc((payload.player.country ?? "WORLD").toUpperCase())}</text>
      <path d="M472 385 L520 360 L520 410 Z" fill="#ff6a00"/>

      ${statBox("Матчи", String(stats.matches), 48, 468, 155)}
      ${statBox("ELO", String(payload.player.elo), 218, 468, 155)}
      ${faceitLevelBox(payload.player, 388, 468, 160)}

      <rect x="48" y="595" width="500" height="190" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="72" y="630" fill="#a1a1aa" font-size="18" letter-spacing="5">ГРАФИК ELO</text>
      ${lineChart(stats.eloSeries.length ? stats.eloSeries : [payload.player.elo, payload.player.elo], 88, 665, 420, 86, "#ff6a00")}

      <rect x="48" y="810" width="500" height="190" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="72" y="845" fill="#a1a1aa" font-size="18" letter-spacing="5">ГРАФИК K/D</text>
      ${lineChart(stats.kdSeries, 88, 880, 420, 86, "#5aa2ff")}

      <rect x="48" y="1026" width="500" height="125" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="72" y="1062" fill="#f7f7fa" font-size="20" letter-spacing="2">ХАЙЛАЙТЫ</text>
      ${highlightBox("ADR", fmt(payload.highlights.bestAdr), 72)}
      ${highlightBox("K/D", fmt(payload.highlights.bestKd, 2), 190)}
      ${highlightBox("KILLS", fmt(payload.highlights.maxKills, 0), 308)}
      ${highlightBox("Рейтинг", fmt(payload.highlights.bestRating, 2), 432)}

      ${statBox("Рейтинг 3.0", fmt(stats.kd, 2), 585, 325)}
      ${statBox("AVG KILLS", fmt(stats.avgKills), 755, 325)}
      ${statBox("K/D", fmt(stats.kd, 2), 925, 325, 105)}
      ${statBox("K/R", fmt(stats.kr, 2), 585, 440)}
      ${statBox("HS%", `${fmt(stats.headshotsPercent)}%`, 755, 440)}
      ${statBox("Винрейт", `${fmt(stats.winrate, 0)}%`, 925, 440, 105)}
      ${statBox("ADR", fmt(stats.adr), 585, 555)}
      ${statBox("K/A/D", `${stats.kills}/${stats.assists}/${stats.deaths}`, 755, 555, 275, 95, 28)}

      <rect x="585" y="682" width="445" height="110" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="610" y="724" fill="#a1a1aa" font-size="18" letter-spacing="5">ПОСЛЕДНИЕ МАТЧИ</text>
      <text x="965" y="724" fill="#f7f7fa" font-size="24" font-weight="900" text-anchor="end">${stats.wins} W / ${stats.losses} L</text>
      ${resultsPills(stats, 610, 742)}

      <rect x="585" y="815" width="445" height="140" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="610" y="850" fill="#a1a1aa" font-size="18" letter-spacing="5">ТОП ТИММЕЙТЫ</text>
      ${teammateRows(payload)}

      <rect x="585" y="980" width="445" height="76" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="610" y="1028" fill="#f7f7fa" font-size="34" font-weight="900">K / A / D ${stats.kills} / ${stats.assists} / ${stats.deaths}</text>

      <rect x="585" y="1078" width="445" height="76" rx="20" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      <text x="610" y="1106" fill="#a1a1aa" font-size="16" letter-spacing="5">РОЛЬ</text>
      <text x="610" y="1142" fill="#f7f7fa" font-size="32" font-weight="900">${esc(role)}</text>
    </g>
  </svg>`;
}

function compactPlayerPanel(payload: StatCardPayload, x: number, clipId: string): string {
  const stats = payload.currentWindow;

  return `
    <g filter="url(#shadow)">
      <rect x="${x}" y="215" width="495" height="330" rx="24" fill="url(#panel)" stroke="rgba(255,255,255,.1)"/>
      ${renderAvatar(payload.player, x + 32, 250, 74, clipId)}
      <text x="${x + 125}" y="285" fill="#f7f7fa" font-size="32" font-weight="900">${esc(trimText(payload.player.nickname, 15))}</text>
      <text x="${x + 125}" y="318" fill="#a1a1aa" font-size="17">${esc((payload.player.country ?? "WORLD").toUpperCase())} · ELO ${payload.player.elo} · LVL ${payload.player.skillLevel}</text>
      ${renderLevelBadge(payload.player.skillLevel, x + 445, 287, 34)}
      ${statBox("Рейтинг 3.0", fmt(stats.kd, 2), x + 32, 360, 215, 64, 30)}
      ${statBox("K/D", fmt(stats.kd, 2), x + 260, 360, 200, 64, 30)}
      ${statBox("ADR", fmt(stats.adr), x + 32, 438, 215, 64, 30)}
      ${statBox("Винрейт", `${fmt(stats.winrate, 0)}%`, x + 260, 438, 200, 64, 30)}
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
