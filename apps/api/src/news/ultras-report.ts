// apps/api/src/news/ultras-report.ts
// Rubrika "Prales Ultras" — fan-voice hodnocení atmosféry kola + výběr kotlů pro galerii fotek.
// Model: ai-reporter.ts (inline Gemini fetch, volný text, 1. řádek = headline).
import { logger } from "../lib/logger";
import { calculateFacilityEffects } from "../stadium/stadium-generator";

export interface UltrasPhoto {
  teamId: string;
  teamName: string;
  ultrasText: string;
  bannerColor: string;
  textColor: string;
  level: number;
  attendance: number;
  capacity: number;
  fillPct: number;
  caption: string;
}

interface HomeMatch {
  homeTeamId: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  attendance: number;
  weather: string | null;
  capacity: number;
  fillPct: number;
  ultrasStand: number;
  ultrasText: string | null;
  bannerColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
}

const FACILITY_KEYS = ["changing_rooms", "showers", "refreshments", "stands", "parking", "fence", "roof", "ultras_stand", "toilets"];

function isLightHex(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

/** "1240" -> "1 240" (bez Intl, který je na Workers omezený). */
function fmtNum(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Popisek pro kotel bez „nej" titulu — plachta má přednost, jinak podle vybavení kotle. */
function plainCaption(m: HomeMatch): string {
  if (m.ultrasText) return `plachta „${m.ultrasText}"`;
  if (m.ultrasStand >= 3) return "vlajky, bubny, plné hrdlo";
  if (m.ultrasStand === 2) return "vlajky a buben";
  return "pár vlajek, o to větší hlas";
}

/** Vybere kotle do galerie — VŠECHNY týmy s kotlem, „nej" (návštěva, zaplněnost, velikost kotle) jdou první. */
function pickGallery(homeMatches: HomeMatch[]): UltrasPhoto[] {
  const cands = homeMatches.filter((m) => m.ultrasStand > 0);
  if (cands.length === 0) return [];
  const used = new Set<string>();
  const chosen: UltrasPhoto[] = [];
  const add = (m: HomeMatch | undefined, caption: string) => {
    if (!m || used.has(m.homeTeamId)) return;
    used.add(m.homeTeamId);
    chosen.push({
      teamId: m.homeTeamId,
      teamName: m.homeName,
      ultrasText: m.ultrasText ?? "",
      bannerColor: m.bannerColor,
      textColor: m.textColor,
      level: m.ultrasStand,
      attendance: m.attendance,
      capacity: m.capacity,
      fillPct: m.fillPct,
      caption,
    });
  };
  const byAtt = [...cands].sort((a, b) => b.attendance - a.attendance);
  add(byAtt[0], `${fmtNum(byAtt[0].attendance)} diváků — nejvíc v kole`);

  // Při shodné zaplněnosti (běžné — vyprodáno má víc stadionů) rozhodne počet diváků.
  const byFill = [...cands]
    .sort((a, b) => b.fillPct - a.fillPct || b.attendance - a.attendance)
    .find((m) => !used.has(m.homeTeamId));
  add(byFill, byFill ? "nejnabitější kotel kola" : "");

  const byLevel = [...cands]
    .sort((a, b) => b.ultrasStand - a.ultrasStand || (b.ultrasText ? 1 : 0) - (a.ultrasText ? 1 : 0))
    .find((m) => !used.has(m.homeTeamId));
  add(byLevel, byLevel ? (byLevel.ultrasStand >= 3 ? "největší kotel v lize" : plainCaption(byLevel)) : "");

  // Zbytek — každý kotel v kole má v galerii svoje místo, řazeno podle návštěvy.
  for (const m of byAtt) add(m, plainCaption(m));

  return chosen;
}

/** Deterministický fallback text (když Gemini selže / chybí klíč). Rubrika vyjde vždy. */
function fallbackArticle(gameWeek: number, homeMatches: HomeMatch[]): string {
  if (homeMatches.length === 0) return `Kotel po ${gameWeek}. kole\nToto kolo se doma nehrálo, tak jsme si dali pauzu na pivo.`;
  const byAtt = [...homeMatches].sort((a, b) => b.attendance - a.attendance);
  const top = byAtt[0];
  const bottom = byAtt[byAtt.length - 1];
  const parts: string[] = [];
  parts.push(`Kotel hodnotí ${gameWeek}. kolo`);
  parts.push(`Nejvíc lidí dorazilo na **${top.homeName}** — ${fmtNum(top.attendance)} diváků. Naopak nejprázdněji bylo u **${bottom.homeName}** (${fmtNum(bottom.attendance)}).`);
  const byFill = [...homeMatches].sort((a, b) => b.fillPct - a.fillPct || b.attendance - a.attendance)[0];
  parts.push(`Nejlepší atmosféru kola měl **${byFill.homeName}** — bylo tam ${fullnessDesc(byFill.fillPct)}.`);
  const banners = homeMatches.filter((m) => m.ultrasText);
  if (banners.length > 0) {
    parts.push(`Na plachtách viselo: ${banners.map((m) => `**${m.homeName}** „${m.ultrasText}"`).join(", ")}.`);
  }
  const kotle = homeMatches.filter((m) => m.ultrasStand > 0 && !m.ultrasText);
  if (kotle.length > 0) {
    parts.push(`Bez plachty, zato s vlajkami řvali doma i ${kotle.map((m) => `**${m.homeName}**`).join(", ")}.`);
  }
  return parts.join("\n");
}

export async function generateUltrasReport(
  db: D1Database,
  geminiApiKey: string,
  calendarId: string,
): Promise<{ newsId: string | null; photos: number; skipped: boolean }> {
  // 1. Odvodit league_id, game_week, season_number z kalendáře.
  const cal = await db
    .prepare("SELECT league_id, game_week, season_number FROM season_calendar WHERE id = ?")
    .bind(calendarId)
    .first<{ league_id: string; game_week: number; season_number: number }>();
  if (!cal) {
    logger.warn({ module: "ultras-report" }, `calendar not found: ${calendarId}`);
    return { newsId: null, photos: 0, skipped: true };
  }
  const { league_id: leagueId, game_week: gameWeek, season_number: seasonNumber } = cal;

  // 2. Idempotence — existuje už report pro tuto ligu+kolo?
  const existing = await db
    .prepare("SELECT 1 FROM ultras_reports WHERE league_id = ? AND game_week = ?")
    .bind(leagueId, gameWeek)
    .first();
  if (existing) return { newsId: null, photos: 0, skipped: true };

  // 3. Načíst domácí zápasy kola + stadion + barvy klubu.
  const rows = await db
    .prepare(
      `SELECT m.home_team_id, m.home_score, m.away_score, m.attendance, m.weather,
              t1.name AS home_name, t2.name AS away_name,
              t1.primary_color AS home_primary, t1.secondary_color AS home_secondary,
              s.capacity, s.changing_rooms, s.showers, s.refreshments, s.stands, s.parking, s.fence, s.roof, s.ultras_stand, s.toilets,
              s.ultras_text, s.ultras_banner_color, s.ultras_text_color
       FROM matches m
       JOIN teams t1 ON m.home_team_id = t1.id
       JOIN teams t2 ON m.away_team_id = t2.id
       LEFT JOIN stadiums s ON s.team_id = m.home_team_id
       WHERE m.calendar_id = ? AND m.status = 'simulated'`,
    )
    .bind(calendarId)
    .all();

  const homeMatches: HomeMatch[] = (rows.results as Record<string, unknown>[]).map((r) => {
    const facilities: Record<string, number> = {};
    for (const k of FACILITY_KEYS) facilities[k] = (r[k] as number) ?? 0;
    const capacity = Math.max(1, ((r.capacity as number) ?? 200) + calculateFacilityEffects(facilities).capacityBonus);
    const attendance = (r.attendance as number) ?? 0;
    const primary = (r.home_primary as string) ?? "#2D5F2D";
    const bannerColor = (r.ultras_banner_color as string | null) ?? primary;
    const textColor = (r.ultras_text_color as string | null) ?? (isLightHex(bannerColor) ? "#1a1a1a" : "#ffffff");
    return {
      homeTeamId: r.home_team_id as string,
      homeName: r.home_name as string,
      awayName: r.away_name as string,
      homeScore: (r.home_score as number) ?? 0,
      awayScore: (r.away_score as number) ?? 0,
      attendance,
      weather: (r.weather as string | null) ?? null,
      capacity,
      fillPct: Math.round((100 * attendance) / capacity),
      ultrasStand: (r.ultras_stand as number) ?? 0,
      ultrasText: (r.ultras_text as string | null) ?? null,
      bannerColor,
      textColor,
      primaryColor: primary,
      secondaryColor: (r.home_secondary as string) ?? "#ffffff",
    };
  });

  // 4. Galerie kotlů.
  const photos = pickGallery(homeMatches);

  // 5. Článek přes Gemini (fallback při selhání).
  let article = "";
  try {
    article = await callGeminiUltras(geminiApiKey, gameWeek, homeMatches, photos);
  } catch (e) {
    logger.warn({ module: "ultras-report" }, "gemini failed, using fallback", e);
  }
  if (!article || article.trim().length < 10) article = fallbackArticle(gameWeek, homeMatches);

  const lines = article.trim().split("\n");
  // Model občas vrátí titulek v markdownu — FE ho renderuje doslova, tak ho očistíme (vzor ai-reporter.ts).
  const headline = (lines.shift() ?? `Kotel hodnotí ${gameWeek}. kolo`)
    .replace(/^#+\s*/, "")
    .replace(/^\*+/, "")
    .replace(/\*+$/, "")
    .trim();
  const body = lines.join("\n").trim() || headline;

  // 6. Zápis news + ultras_reports.
  const newsId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'ultras_report', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(newsId, leagueId, headline, body, gameWeek)
    .run();
  await db
    .prepare(
      "INSERT OR IGNORE INTO ultras_reports (id, league_id, calendar_id, game_week, season_number, news_id, photos_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), leagueId, calendarId, gameWeek, seasonNumber ?? 0, newsId, JSON.stringify(photos))
    .run();

  return { newsId, photos: photos.length, skipped: false };
}

/** Inline Gemini REST volání (vzor ai-reporter.ts). Volný text, 1. řádek = headline. */
/** Kotel popsaný lidsky (bez herních „level" termínů) — pro grounding Gemini. */
function kotelDesc(level: number): string {
  if (level >= 3) return "velký kotel (spousta vlajek, bubny)";
  if (level === 2) return "pořádný kotel (vlajky, buben)";
  if (level === 1) return "malý kotel (pár vlajek)";
  return "bez kotle";
}

/** Zaplněnost stadionu slovy (bez procent) — fanouškovské, ne stats. */
function fullnessDesc(fillPct: number): string {
  if (fillPct >= 95) return "vyprodáno";
  if (fillPct >= 80) return "narváno";
  if (fillPct >= 55) return "slušně zaplněno";
  if (fillPct >= 30) return "poloprázdno";
  return "skoro prázdno";
}

async function callGeminiUltras(
  apiKey: string,
  gameWeek: number,
  homeMatches: HomeMatch[],
  photos: UltrasPhoto[],
): Promise<string> {
  const facts = homeMatches
    .map((m) => `- ${m.homeName} (doma) vs ${m.awayName} ${m.homeScore}:${m.awayScore}: dorazilo ${m.attendance} diváků (${fullnessDesc(m.fillPct)}), ${kotelDesc(m.ultrasStand)}${m.ultrasText ? `, na plachtě „${m.ultrasText}"` : ""}${m.weather ? `, ${m.weather}` : ""}`)
    .join("\n");
  const galleryNote = photos.length
    ? `Na fotkách budou kotle: ${photos.map((p) => `${p.teamName} (${p.caption})`).join("; ")}.`
    : "V tomto kole neměl doma pořádný kotel nikdo — zmiň to s nadhledem.";
  const banners = homeMatches.filter((m) => m.ultrasText);
  const bannerNote = banners.length
    ? `PLACHTY, které MUSÍŠ všechny zmínit i s doslovným nápisem: ${banners.map((m) => `${m.homeName} — „${m.ultrasText}"`).join("; ")}.`
    : "V tomto kole nikdo nevyvěsil plachtu s nápisem.";

  const prompt = `Jsi pisatel fanouškovského zpravodaje "Prales Ultras" v amatérské fotbalové lize. Píšeš z pohledu lidí na kotli, zaujatě pro atmosféru, s vtipem a nadsázkou, ale VÝHRADNĚ z dodaných dat — NIKDY nevymýšlej jména ani čísla.

Napiš článek (150–250 slov) hodnotící ATMOSFÉRU ${gameWeek}. kola. Páteří je žebříček:
- kam přišlo NEJVÍC lidí a kam NEJMÍŇ,
- kde bylo vyprodáno / plný dům a kde zely ochozy prázdnotou,
- projdi VŠECHNY týmy, co měly kotel — žádný nevynech, i kdyby jen jednou větou.

PLACHTY: nápisy na plachtách jsou fanouškovský folklor a kotelní recese — patří ke koloritu jako buben. Cituj je doslova tak, jak jsou, a ber je s humorem a nadsázkou. Neupravuj je, necenzuruj, nekomentuj vážně a nemoralizuj nad nimi — jsi fanoušek na kotli, ne rozhodčí. Když je nápis provokativní nebo ujetý, prostě to odlehči vtipem.

DŮLEŽITÉ: Píšeš jako fanoušek, NE jako hra. NIKDY nepoužívej herní ani technické termíny ani procenta zaplněnosti — žádné „level", „úroveň", čísla úrovní kotle, „fill", „kapacita", „X % zaplněno / z kapacity". Počty diváků (kolik lidí dorazilo) používej klidně. Zaplněnost a kotel popiš lidsky: vyprodáno / narváno / poloprázdno, velký/malý kotel, kolik vlajek, jestli buší buben, jestli visí plachta.

DATA (jen tato smíš použít):
${facts}

${bannerNote}

${galleryNote}

Formát: PRVNÍ ŘÁDEK je úderný titulek (bez markdownu). Další řádky jsou tělo článku. V těle smíš zvýraznit **tučně** názvy týmů a klíčová čísla. Piš česky.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.6, thinkingConfig: { thinkingBudget: 0 } },
        // Texty plachet píšou hráči a bývají provokativní — jinak model odpověď utne.
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        ],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  if (!text) {
    const why = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini empty response (${why})`);
  }
  return text;
}
