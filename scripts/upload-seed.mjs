/**
 * Upload seed data JSON files to Cloudflare R2.
 * Usage: node scripts/upload-seed.mjs [--local]
 *
 * --local: upload to local wrangler R2 emulation
 */

import { execFileSync } from "child_process";
import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedDir = resolve(__dirname, "../data/seed");
const isLocal = process.argv.includes("--local");
const isRemote = process.argv.includes("--remote");

const files = readdirSync(seedDir).filter((f) => f.endsWith(".json"));

for (const file of files) {
  const filePath = resolve(seedDir, file);
  const args = [
    "wrangler", "r2", "object", "put",
    `prales-seed/${file}`,
    `--file=${filePath}`,
    "--content-type=application/json",
  ];
  if (isLocal) args.push("--local");
  if (isRemote) args.push("--remote");

  console.log(`Uploading ${file}...`);
  try {
    execFileSync("npx", args, { stdio: "inherit", cwd: resolve(__dirname, "../apps/api") });
  } catch (e) {
    console.error(`Failed to upload ${file}:`, e.message);
  }
}

console.log(`\nDone! Uploaded ${files.length} files.`);
