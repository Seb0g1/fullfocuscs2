import { Resvg } from "@resvg/resvg-js";
import type { ComparisonSummary, MatchWindowStats, StatCardPayload } from "@fullfocus/shared";

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
    return "—";
  }
  return value.toFixed(digits).replace(/\.0$/, "");
}

function lineChart(values: number[], x: number, y: number, w: number, h: number, color: string): string {
  if (values.length < 2) {
    return `<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="${color}" stroke-width="4" opacity=".8"/>`;
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

function statBox(label: string, value: string, x: number, y: number, w = 150, h = 95, accent = "#ff6a00"): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="url(#card)" stroke="rgba(255,255,255,.08)"/>
      <text x="${x + 18}" y="${y + 34}" fill="#8e8f98" font-size="17" letter-spacing="3">${esc(label.toUpperCase())}</text>
      <text x="${x + 18}" y="${y + 72}" fill="#f7f7fa" font-size="30" font-weight="800">${esc(value)}</text>
      <circle cx="${x + w - 28}" cy="${y + h - 28}" r="12" fill="${accent}" opacity=".16"/>
    </g>
  `;
}

function resultsPills(stats: MatchWindowStats, x: number, y: number): string {
  return stats.results
    .slice(0, 30)
    .map((result, index) => {
      const px = x + (index % 15) * 28;
      const py = y + Math.floor(index / 15) * 31;
      const fill = result === "W" ? "#35d47d" : "#ff646d";
      return `<g><rect x="${px}" y="${py}" width="22" height="22" rx="6" fill="${fill}"/><text x="${px + 6}" y="${py + 16}" fill="#111" font-size="13" font-weight="900">${result}</text></g>`;
    })
    .join("");
}

function renderBaseDefs(): string {
  return `
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#090a0f"/>
        <stop offset=".55" stop-color="#151319"/>
        <stop offset="1" stop-color="#241009"/>
      </linearGradient>
      <linearGradient id="card" x1="0" x2="1">
        <stop offset="0" stop-color="#1b171a"/>
        <stop offset="1" stop-color="#11131b"/>
      </linearGradient>
      <radialGradient id="flare" cx="80%" cy="12%" r="45%">
        <stop offset="0" stop-color="#ff6a00" stop-opacity=".45"/>
        <stop offset=".55" stop-color="#ff6a00" stop-opacity=".08"/>
        <stop offset="1" stop-color="#ff6a00" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity=".45"/>
      </filter>
    </defs>
  `;
}

function renderStatSvg(payload: StatCardPayload): string {
  const stats = payload.currentWindow;
  const role = payload.role ?? "МАЛО ДАННЫХ";
  const teammateRows = payload.topTeammates.length
    ? payload.topTeammates
        .slice(0, 4)
        .map(
          (mate, index) =>
            `<text x="642" y="${850 + index * 28}" fill="#f7f7fa" font-size="22" font-weight="700">${esc(mate.nickname)}</text><text x="930" y="${850 + index * 28}" fill="#a1a1aa" font-size="18" text-anchor="end">${mate.matches} игр · ${mate.wins}W/${mate.losses}L</text>`
        )
        .join("")
    : `<text x="642" y="858" fill="#a1a1aa" font-size="22">Недостаточно данных</text>`;

  return `
  <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    ${renderBaseDefs()}
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#flare)"/>
    <rect x="18" y="18" width="${WIDTH - 36}" height="${HEIGHT - 36}" rx="30" fill="rgba(0,0,0,.22)" stroke="rgba(255,255,255,.08)"/>
    <text x="48" y="72" fill="#ffffff" font-size="24" font-weight="900">FULLFOCUS</text>
    <text x="210" y="72" fill="#7e7f89" font-size="16" letter-spacing="5">CS2 BOT</text>
    <text x="830" y="72" fill="#9ca3af" font-size="16" letter-spacing="5">${esc(payload.seasonLabel)}</text>
    <text x="48" y="145" fill="#a1a1aa" font-size="28" letter-spacing="8">СТАТИСТИКА</text>
    <text x="48" y="232" fill="#f7f7fa" font-size="64" font-weight="900">${esc(payload.player.nickname)} НА FACEIT</text>
    <text x="48" y="292" fill="#777984" font-size="28" letter-spacing="8">ЗА ПОСЛЕДНИЕ ${stats.window} МАТЧЕЙ</text>

    <g filter="url(#shadow)">
      <rect x="48" y="325" width="500" height="126" rx="20" fill="url(#card)" stroke="rgba(255,255,255,.1)"/>
      <rect x="72" y="347" width="82" height="82" rx="18" fill="#242632"/>
      <text x="178" y="387" fill="#f7f7fa" font-size="34" font-weight="900">${esc(payload.player.nickname)}</text>
      <text x="178" y="420" fill="#a1a1aa" font-size="18">${esc((payload.player.country ?? "WORLD").toUpperCase())}</text>
      <path d="M472 385 L520 360 L520 410 Z" fill="#ff6a00"/>

      ${statBox("Матчи", String(stats.matches), 48, 468, 155)}
      ${statBox("ELO", String(payload.player.elo), 218, 468, 155)}
      ${statBox("FACEIT", `LVL ${payload.player.skillLevel}`, 388, 468, 160)}

      <rect x="48" y="595" width="500" height="190" rx="20" fill="url(#card)" stroke="rgba(255,255,255,.1)"/>
      <text x="72" y="630" fill="#a1a1aa" font-size="18" letter-spacing="4">ГРАФИК ELO</text>
      ${lineChart(stats.eloSeries.length ? stats.eloSeries : [payload.player.elo, payload.player.elo], 88, 665, 420, 85, "#ff6a00")}

      <rect x="48" y="810" width="500" height="190" rx="20" fill="url(#card)" stroke="rgba(255,255,255,.1)"/>
      <text x="72" y="845" fill="#a1a1aa" font-size="18" letter-spacing="4">ГРАФИК K/D</text>
      ${lineChart(stats.kdSeries, 88, 880, 420, 85, "#5aa2ff")}

      <rect x="48" y="1026" width="500" height="125" rx="20" fill="url(#card)" stroke="rgba(255,255,255,.1)"/>
      <text x="72" y="1062" fill="#f7f7fa" font-size="20" letter-spacing="2">ХАЙЛАЙТЫ</text>
      ${statBox("Лучший ADR", fmt(payload.highlights.bestAdr), 72, 1080, 105, 52)}
      ${statBox("Лучший K/D", fmt(payload.highlights.bestKd, 2), 190, 1080, 105, 52)}
      ${statBox("Макс. убийства", fmt(payload.highlights.maxKills, 0), 308, 1080, 110, 52)}
      ${statBox("Лучший рейтинг", fmt(payload.highlights.bestRating, 2), 432, 1080, 92, 52)}

      ${statBox("Рейтинг 3.0", fmt(stats.kd, 2), 585, 325)}
      ${statBox("AVG KILLS", fmt(stats.avgKills), 755, 325)}
      ${statBox("K/D", fmt(stats.kd, 2), 925, 325, 105)}
      ${statBox("K/R", fmt(stats.kr, 2), 585, 440)}
      ${statBox("HS%", `${fmt(stats.headshotsPercent)}%`, 755, 440)}
      ${statBox("Винрейт", `${fmt(stats.winrate, 0)}%`, 925, 440, 105)}
      ${statBox("ADR", fmt(stats.adr), 585, 555)}
      ${statBox("K/A/D", `${stats.kills}/${stats.assists}/${stats.deaths}`, 755, 555, 275)}

      <rect x="585" y="682" width="445" height="110" rx="20" fill="url(#card)" stroke="rgba(255,255,255,.1)"/>
      <text x="610" y="724" fill="#a1a1aa" font-size="18" letter-spacing="4">ПОСЛЕДНИЕ МАТЧИ</text>
      <text x="965" y="724" fill="#f7f7fa" font-size="24" font-weight="900" text-anchor="end">${stats.wins} W / ${stats.losses} L</text>
      ${resultsPills(stats, 610, 742)}

      <rect x="585" y="815" width="445" height="140" rx="20" fill="url(#card)" stroke="rgba(255,255,255,.1)"/>
      <text x="610" y="850" fill="#a1a1aa" font-size="18" letter-spacing="4">ТОП ТИММЕЙТЫ</text>
      ${teammateRows}

      <rect x="585" y="980" width="445" height="76" rx="20" fill="url(#card)" stroke="rgba(255,255,255,.1)"/>
      <text x="610" y="1028" fill="#f7f7fa" font-size="34" font-weight="900">K / A / D ${stats.kills} / ${stats.assists} / ${stats.deaths}</text>

      <rect x="585" y="1078" width="445" height="76" rx="20" fill="url(#card)" stroke="rgba(255,255,255,.1)"/>
      <text x="610" y="1106" fill="#a1a1aa" font-size="16" letter-spacing="4">РОЛЬ</text>
      <text x="610" y="1142" fill="#f7f7fa" font-size="32" font-weight="900">${esc(role)}</text>
    </g>
  </svg>`;
}

function compactPlayerPanel(payload: StatCardPayload, x: number): string {
  const stats = payload.currentWindow;

  return `
    <g filter="url(#shadow)">
      <rect x="${x}" y="215" width="495" height="330" rx="24" fill="url(#card)" stroke="rgba(255,255,255,.1)"/>
      <rect x="${x + 32}" y="250" width="74" height="74" rx="18" fill="#242632"/>
      <text x="${x + 125}" y="285" fill="#f7f7fa" font-size="32" font-weight="900">${esc(payload.player.nickname)}</text>
      <text x="${x + 125}" y="318" fill="#a1a1aa" font-size="17">${esc((payload.player.country ?? "WORLD").toUpperCase())} · ELO ${payload.player.elo} · LVL ${payload.player.skillLevel}</text>
      <circle cx="${x + 445}" cy="287" r="34" fill="none" stroke="#ff6a00" stroke-width="8"/>
      <text x="${x + 445}" y="296" fill="#f7f7fa" font-size="22" font-weight="900" text-anchor="middle">${payload.player.skillLevel}</text>
      ${statBox("Рейтинг 3.0", fmt(stats.kd, 2), x + 32, 360, 215, 64)}
      ${statBox("K/D", fmt(stats.kd, 2), x + 260, 360, 200, 64)}
      ${statBox("ADR", fmt(stats.adr), x + 32, 438, 215, 64)}
      ${statBox("Винрейт", `${fmt(stats.winrate, 0)}%`, x + 260, 438, 200, 64)}
    </g>
  `;
}

function renderComparisonSvg(payload: ComparisonSummary): string {
  return `
  <svg width="${WIDTH}" height="${COMPARISON_HEIGHT}" viewBox="0 0 ${WIDTH} ${COMPARISON_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    ${renderBaseDefs()}
    <rect width="${WIDTH}" height="${COMPARISON_HEIGHT}" fill="url(#bg)"/>
    <rect width="${WIDTH}" height="${COMPARISON_HEIGHT}" fill="url(#flare)"/>
    <rect x="18" y="18" width="${WIDTH - 36}" height="${COMPARISON_HEIGHT - 36}" rx="30" fill="rgba(0,0,0,.22)" stroke="rgba(255,255,255,.08)"/>
    <text x="48" y="72" fill="#ffffff" font-size="24" font-weight="900">FULLFOCUS</text>
    <text x="210" y="72" fill="#7e7f89" font-size="16" letter-spacing="5">CS2 BOT</text>
    <text x="48" y="138" fill="#a1a1aa" font-size="24" letter-spacing="7">СРАВНЕНИЕ</text>
    <text x="48" y="190" fill="#f7f7fa" font-size="48" font-weight="900">${esc(payload.left.player.nickname)} VS ${esc(payload.right.player.nickname)}</text>
    <text x="48" y="226" fill="#777984" font-size="20" letter-spacing="6">ЗА ПОСЛЕДНИЕ ${payload.window} МАТЧЕЙ</text>
    ${compactPlayerPanel(payload.left, 36)}
    ${compactPlayerPanel(payload.right, 549)}
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
