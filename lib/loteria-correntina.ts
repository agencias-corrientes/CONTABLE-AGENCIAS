import * as cheerio from "cheerio";

const OFFICIAL_SOURCE = "https://cnq.lotemovil.com.ar/";
const GAME_SECTIONS = [
  { id: "section-quiniela", name: "Quiniela", sectionUrl: "#section-quiniela" },
  { id: "section-quinielapoceadacorrentina", name: "Quiniela Poceada Correntina", sectionUrl: "#section-quinielapoceadacorrentina" },
  { id: "section-lotoplus", name: "Loto Plus", sectionUrl: "#section-lotoplus" },
  { id: "section-loto5plus", name: "Loto 5 Plus", sectionUrl: "#section-loto5plus" },
  { id: "section-quini6", name: "Quini 6", sectionUrl: "#section-quini6" },
  { id: "section-brinco", name: "Brinco", sectionUrl: "#section-brinco" },
  { id: "section-telekino", name: "Telekino", sectionUrl: "#section-telekino" },
] as const;

const SCHEDULE_MODAL_NAMES: Record<string, string> = {
  quinielaModal: "Quiniela",
  quinielapoceadacorrentinaModal: "Quiniela Poceada Correntina",
  lotoplusModal: "Loto Plus",
  loto5plusModal: "Loto 5 Plus",
  quini6Modal: "Quini 6",
  brincoModal: "Brinco",
  telekinoModal: "Telekino",
};

export type LotterySchedule = {
  game: string;
  drawName: string;
  drawAt: string;
  opensAt: string;
  closesAt: string;
};

export type LotteryArchive = { game: string; date: string; url: string };

export type LotteryFeed = {
  ok: boolean;
  sourceUrl: string;
  updatedAt: string;
  resultTitle: string | null;
  resultDate: string | null;
  schedules: LotterySchedule[];
  archives: LotteryArchive[];
  games: { name: string; url: string }[];
  error?: string;
};

let cachedFeed: { expiresAt: number; feed: LotteryFeed } | null = null;

export async function getOfficialLotteryFeed(): Promise<LotteryFeed> {
  const now = Date.now();
  if (cachedFeed && cachedFeed.expiresAt > now) return cachedFeed.feed;
  const feed = await fetchOfficialLotteryFeed();
  cachedFeed = { expiresAt: now + (feed.ok ? 300_000 : 60_000), feed };
  return feed;
}

async function fetchOfficialLotteryFeed(): Promise<LotteryFeed> {
  const archives: LotteryArchive[] = [];
  const games = GAME_SECTIONS.map((game) => ({
    name: game.name,
    url: new URL(game.sectionUrl, OFFICIAL_SOURCE).toString(),
  }));

  try {
    const response = await fetch(OFFICIAL_SOURCE, {
      headers: { "User-Agent": "AgenciasCorrientes/1.0 (official lottery result links)" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Lotería Correntina respondió HTTP ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const schedules: LotterySchedule[] = [];

    $(".t-body").each((_index, element) => {
      const row = $(element);
      const modalId = row.closest(".modal").attr("id") ?? "";
      const game = SCHEDULE_MODAL_NAMES[modalId] ?? "";
      const cells = row.children("div").map((_cellIndex, cell) =>
        $(cell).text().replace(/\s+/g, " ").trim()
      ).get();
      if (!game || cells.length < 4 || !cells[0] || !cells[1]) return;
      schedules.push({
        game,
        drawName: cells[0],
        drawAt: cells[1],
        opensAt: cells[2] ?? "",
        closesAt: cells[3] ?? "",
      });
    });

    for (const section of GAME_SECTIONS) {
      const sectionNode = $(`#${section.id}`);
      const seen = new Set<string>();
      sectionNode.find('a[href*="/extractos/search"]').each((_index, element) => {
        const anchor = $(element);
        const label = anchor.text().replace(/\s+/g, " ").trim();
        const href = anchor.attr("href");
        const dateMatch = label.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (!href || !dateMatch) return;
        const url = new URL(href, OFFICIAL_SOURCE).toString();
        if (seen.has(url)) return;
        seen.add(url);
        archives.push({
          game: section.name,
          date: dateMatch[1],
          url,
        });
      });
    }

    const resultTitle = $(".resultados-msg").first().text().replace(/\s+/g, " ").trim() || null;
    const dateLine = $(".quiniela-body-slider .px-4").first().text().replace(/\s+/g, " ").trim();
    const resultDate = dateLine.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? null;

    return {
      ok: true, sourceUrl: OFFICIAL_SOURCE, updatedAt: new Date().toISOString(),
      resultTitle, resultDate, schedules, archives, games,
    };
  } catch (cause) {
    return {
      ok: false, sourceUrl: OFFICIAL_SOURCE, updatedAt: new Date().toISOString(),
      resultTitle: null, resultDate: null, schedules: [], archives, games,
      error: cause instanceof Error ? cause.message : "No se pudieron consultar los datos oficiales.",
    };
  }
}
