#!/usr/bin/env node
// Ověří, že každý odkaz na stránku ve webu i v API vede na stránku, která existuje.
//
// Vzniklo po přesunu stránek z /dashboard/… na české adresy. Dřív to nic nehlídalo
// a notifikace „Kabina" posílala hráče na /dashboard/kadr, která nikdy
// neexistovala — hráč skončil na 404 a nikdo si toho nevšiml.
//
// Hledá řetězce začínající lomítkem („/hrac/…", `/zapas/${id}`), ořízne query
// a kotvu a porovná je se stránkami v apps/web/src/app. `${…}` a lomítko na konci
// („/hrac/" + id) znamenají dynamický segment.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(WEB_DIR, "../..");
const APP_DIR = path.join(WEB_DIR, "src/app");

// Řetězce, které začínají lomítkem, ale nejsou stránky webu.
const NON_PAGE_PREFIXES = ["/api/", "/auth/", "/_next/", "/v1beta/"];

// Známé mrtvé odkazy, které existovaly už před přesunem na české adresy a čekají
// na rozhodnutí. Vypíšou se jako varování, build kvůli nim nespadne. Po opravě
// odsud smazat, jinak se na ně zapomene.
const KNOWN_DEAD_LINKS = {
  "apps/web/src/app/create/page.tsx  /team/${result.id}": "starý zakládací formulář, nikdo na něj neodkazuje",
  "apps/web/src/app/(hra)/trenink/page.tsx  /manazer": "stránka /manazer bez ID neexistuje",
  "apps/web/src/components/ui/entity-link.tsx  /village": "stránka obce podle názvu neexistuje (odkaz u týmu)",
};

// Řetězce, které vypadají jako odkaz, ale odkazem nejsou.
const NOT_LINKS = {
  "apps/web/src/components/ui/entity-link.tsx  /hrac": "základ adresy, ID se přidává až za něj",
  "apps/web/src/components/ui/entity-link.tsx  /tym": "základ adresy, ID se přidává až za něj",
  "apps/web/src/context/team-context.tsx  /pozvanka": "seznam veřejných prefixů",
  "apps/web/src/context/team-context.tsx  /klub": "seznam veřejných prefixů",
  "apps/web/src/lib/page-title.ts  /redakce": "titulek v mapě, stránka existuje jen s ID",
};

function collectRoutes(dir, segments = [], routes = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // (skupina) se do adresy nepromítá, [param] je libovolný segment
      const segment = entry.name.startsWith("(") ? null : entry.name.startsWith("[") ? "*" : entry.name;
      collectRoutes(path.join(dir, entry.name), segment === null ? segments : [...segments, segment], routes);
    } else if (/^(page\.tsx|route\.tsx?)$/.test(entry.name)) {
      routes.push(segments);
    }
  }
  return routes;
}

function collectSourceFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(fullPath, files);
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|d)\.ts$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

const routes = collectRoutes(APP_DIR);

function toSegments(link) {
  const pathname = link.split(/[?#]/)[0].replace(/\$\{[^}]*\}/g, "*");
  const segments = pathname.split("/").slice(1);
  // "/hrac/" + id → poslední prázdný segment je dynamický
  if (segments.length > 1 && segments[segments.length - 1] === "") segments[segments.length - 1] = "*";
  return segments.filter((s, i) => s !== "" || i === 0);
}

// mode: "exact" = přesná stránka, "prefix" = startsWith, "substring" = includes/endsWith
function matchesRoute(link, mode) {
  const segments = toSegments(link);
  if (segments.length === 1 && segments[0] === "") return true; // "/"
  const matchesAt = (route, offset) =>
    segments.every((s, i) => s === "*" || route[offset + i] === "*" || route[offset + i] === s);
  return routes.some((route) => {
    if (mode === "substring") {
      for (let offset = 0; offset + segments.length <= route.length; offset++) {
        if (matchesAt(route, offset)) return true;
      }
      return false;
    }
    if (mode === "prefix" ? route.length < segments.length : route.length !== segments.length) return false;
    return matchesAt(route, 0);
  });
}

// Literál začínající lomítkem a malým písmenem, nepředchází mu slovo ani tečka.
const LINK_LITERAL = /(?<![\w.])(["'`])(\/[a-z0-9][^"'`\s]*)/g;
// Definice rout v API (router.get("/teams/:id")) nejsou odkazy na stránky.
const API_ROUTE_DEFINITION = /\.(get|post|put|patch|delete|route|use|all|on)\(\s*["'`]\/?$/;

const errors = [];
const knownFound = [];
const sourceFiles = [
  ...collectSourceFiles(path.join(WEB_DIR, "src")),
  ...collectSourceFiles(path.join(ROOT_DIR, "apps/api/src")),
];
for (const file of sourceFiles) {
  const relativeFile = path.relative(ROOT_DIR, file);
  fs.readFileSync(file, "utf8").split("\n").forEach((line, index) => {
    if (/^(\/\/|\/?\*|\{\/\*|import )/.test(line.trim())) return; // komentáře a importy
    for (const match of line.matchAll(LINK_LITERAL)) {
      const link = match[2];
      const before = line.slice(0, match.index + 1);
      if (API_ROUTE_DEFINITION.test(before)) continue;
      if (NON_PAGE_PREFIXES.some((p) => link.startsWith(p))) continue;
      if (/\.[a-z0-9]{2,5}([?#]|$)/i.test(link)) continue; // statický soubor (/icons/x.png)
      // Adresy hry nemají diakritiku ani čárku: „Kč/měs" je text, `/"/g, ""` regulár.
      if (/[^\x00-\x7F]|,/.test(link)) continue;
      const mode = /startsWith\(\s*["'`]$/.test(before) ? "prefix"
        : /(includes|endsWith)\(\s*["'`]$/.test(before) ? "substring" : "exact";
      if (matchesRoute(link, mode)) continue;
      const key = `${relativeFile}  ${link}`;
      if (NOT_LINKS[key]) continue;
      const location = `${relativeFile}:${index + 1}  ${link}`;
      if (KNOWN_DEAD_LINKS[key]) knownFound.push(`${location}  (${KNOWN_DEAD_LINKS[key]})`);
      else errors.push(location);
    }
  });
}

if (knownFound.length) {
  console.warn(`Známé mrtvé odkazy čekající na opravu (${knownFound.length}):`);
  for (const item of knownFound) console.warn("  " + item);
}
if (errors.length) {
  console.error(`Odkazy na neexistující stránky (${errors.length}):`);
  for (const item of errors) console.error("  " + item);
  process.exit(1);
}
console.log(`odkazy v pořádku (stránek: ${routes.length})`);
