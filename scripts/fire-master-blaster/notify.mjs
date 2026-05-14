/**
 * Generuje SQL pro:
 *   1. UPDATE news body (odstranit zmínku o novém trenérovi)
 *   2. INSERT zprávu „📰 Vyšel nový článek..." do conversation Redakce Zpravodaje
 *      pro všech 13 human týmů v Prachatické soutěži.
 *
 * Spustit:
 *   node scripts/fire-master-blaster/notify.mjs
 *   npx wrangler d1 execute prales-db-prod --remote --file scripts/fire-master-blaster/notify.sql
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

const NEWS_ID = "110125a7-13cd-4462-b97b-93778088ae53";
const HEADLINE = "Master Blaster vyhozen — Čkyně hledá kouče, který si pamatuje, kdy je trénink";

const NEW_BODY = `Vedení SK Čkyně se po měsících apatického vedení rozhodlo udělat tlustou čáru: Master Blaster (37, bývalý hráč, poslední dobou převážně bývalý) má padáka. Posledního tréninku se zúčastnilo 12 z 20 chlapů — zbytek sekal trávu do noci, vyklízel stodolu po dědovi, byl na nočce nebo si prostě "myslel, že je trénink zítra". "Když to nebere vážně kouč, proč bysme my?" uvedl pro Hospodský Zpravodaj anonymní záložník.

Master Blaster údajně naposledy dorazil na hřiště před třemi týdny, a to jen aby zkontroloval, zda hospoda U Pumpy ještě stojí. Tu šanci využil důkladně. Klub mu poděkoval za jeho slavnou hráčskou minulost a popřál mu hodně štěstí v dalším angažmá — pokud možno daleko od Čkyně.`;

// Conversation IDs Redakce Zpravodaje pro všech 13 human týmů v lize 7a82b469-...
const conversations = [
  { conv: "587c0b31-b463-44cc-bde9-ef60c9690382", team: "FK Löffler Spůle" },
  { conv: "81c8a422-1dde-4845-bb8a-cd6fec7f9a47", team: "FK Pekařství U Hrocha Bohumilice" },
  { conv: "1b02f8c6-72c4-4bf9-8953-5b93c89928cb", team: "FK KMP Výškovice" },
  { conv: "19557cb0-a5ef-4d09-91bc-b2ace9b68876", team: "FK Šumavský pivovar Vlachovo Březí" },
  { conv: "e8ed119b-b81c-4a29-ac6e-db6c3ccd4774", team: "FK Rohde Čkyně" },
  { conv: "b880fa00-698d-49af-9c7a-d2889d968c12", team: "FK Löffler Hradčany" },
  { conv: "dd141ec7-077b-46f7-af0a-87d763943287", team: "FK AppYours Spůle" },
  { conv: "be7ee63b-ea94-4241-86b2-4913c2e8e57e", team: "1.FC Turecká mohutná menšina ve Čkyni s.r.o." },
  { conv: "ef70805c-447d-472a-a544-e9806f0730e6", team: "FK Löffler Volary" },
  { conv: "d08249f2-396a-44f3-a202-4cf5a969e472", team: "FK Koberce Rod Spůle" },
  { conv: "766d11ad-79b3-44e1-b9f3-87c4aa2485a3", team: "FK Geomapping Čkyně" },
  { conv: "a1bf06da-610c-40f8-831e-04a50b492c39", team: "FK KMP Čkyně" },
  { conv: "5ebc680b-0a9a-43c2-887d-6260f563fdfe", team: "FK Koberce Rod Vimperk" },
];

const sqlStr = (v) => (v === null ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'");

const smsBody = `📰 Vyšel nový článek ve Zpravodaji: „${HEADLINE}"`;
const preview = smsBody.slice(0, 100);

const lines = [];
lines.push(`-- Update news body (remove new manager mention) + notify ${conversations.length} human teams`);
lines.push(`-- Generated: ${new Date().toISOString()}`);
lines.push("");
lines.push(`UPDATE news SET body = ${sqlStr(NEW_BODY)} WHERE id = ${sqlStr(NEWS_ID)};`);
lines.push("");

for (const { conv } of conversations) {
  const msgId = randomUUID();
  lines.push(
    `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (${sqlStr(msgId)}, ${sqlStr(conv)}, 'system', 'Redakce Zpravodaje', ${sqlStr(smsBody)}, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));`,
  );
  lines.push(
    `UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ${sqlStr(preview)}, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ${sqlStr(conv)};`,
  );
}

const outPath = resolve(__dirname, "notify.sql");
writeFileSync(outPath, lines.join("\n") + "\n");

console.log(`OK — SQL zapsáno: ${outPath}`);
console.log(`  Notifikace pro ${conversations.length} týmů`);
console.log(`  Message: "${smsBody}"`);
console.log("");
console.log("Spustit:");
console.log("  npx wrangler d1 execute prales-db-prod --remote --file scripts/fire-master-blaster/notify.sql");
