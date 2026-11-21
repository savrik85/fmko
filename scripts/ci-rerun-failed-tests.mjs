#!/usr/bin/env node
/**
 * V CI zopakuje spadlé testovací soubory v novém procesu.
 *
 * Miniflare na runneru GitHubu občas rozbije celý worker (synchronní D1 dotaz dostane
 * cizí odpověď, `AssertionError: false == true` ve fetch-sync) a pak padá všechno za ním.
 * `retry` ve vitest.config.ts běží ve stejném rozbitém workeru, takže nepomůže, a jeden
 * takový pád zastavil celé nasazení. Skutečná chyba v kódu spadne i napodruhé.
 *
 * Použití: node scripts/ci-rerun-failed-tests.mjs <vitest-report.json>
 * (report z `vitest run --reporter=json --outputFile=...`). Pouští se v adresáři balíčku.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const reportPath = process.argv[2];
if (!reportPath || !existsSync(reportPath)) {
  console.error(`Report testů ${reportPath ?? "(nezadán)"} neexistuje, testy spadly dřív, než doběhly. Nezopakuje se nic.`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const failedFiles = (report.testResults ?? [])
  .filter((r) => r.status === "failed")
  .map((r) => r.name);

if (failedFiles.length === 0) {
  console.error("Vitest skončil chybou, ale žádný soubor neoznačil jako spadlý. Nezopakuje se nic.");
  process.exit(1);
}

console.log(`\nZopakování ${failedFiles.length} spadlých souborů v novém procesu:`);
for (const f of failedFiles) console.log(`  ${f}`);

const rerun = spawnSync("npx", ["vitest", "run", ...failedFiles], { stdio: "inherit" });
if (rerun.error) {
  console.error("Zopakování testů se nepodařilo spustit:", rerun.error);
  process.exit(1);
}
process.exit(rerun.status ?? 1);
