/**
 * Soupeř láká prací (F8): nabídka virtuálního klubu občas nese i práci („seženeme mu práci
 * na pile"). Hráče bez práce nebo směnaře to táhne (faktor zájmu „Práce u nich") a když trenér
 * nabídku odmítne, chtěl odejít i kvůli práci (důvod `job`, unrest-reasons.ts). Dohoda je
 * sehnat mu práci u sponzora (transfers/unrest.ts `find_job`). Čisté funkce bez DB.
 */
import { smenaProPovolani } from "../generators/occupations";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { jobBlockForPlayer } from "../sponsors/player-jobs";

export interface JobLure {
  /** Povolání z `generators/occupations.ts`. */
  occupation: string;
  /** Ve 4. pádě: „seženeme mu {label}". */
  label: string;
}

export const JOB_LURES: readonly JobLure[] = [
  { occupation: "Dělník v pile", label: "práci na pile" },
  { occupation: "Skladník", label: "místo ve skladu" },
  { occupation: "Zedník", label: "práci na stavbě" },
  { occupation: "Automechanik", label: "místo v servisu" },
];

/** Kolik českých nabídek nese práci. */
export const JOB_LURE_SHARE = 0.25;

/** Nese nabídka práci? Deterministicky podle klíče, hlavní los nabídek se tím neposune. */
export function pickJobLure(seedKey: string): JobLure | null {
  const rng = createRng(seedFromString(`job-lure|${seedKey}`));
  if (rng.random() >= JOB_LURE_SHARE) return null;
  return rng.pick([...JOB_LURES]);
}

/** Kdo práci od soupeře vezme vážně: dospělý v produktivním věku, ne student ani důchodce. */
export function canTakeJob(age: number, occupation: string): boolean {
  return jobBlockForPlayer(age, occupation) === null;
}

/**
 * Jak moc práce u soupeře hráče táhne (body zájmu). Bez práce hodně, směnaře a večerní provoz
 * víc než denní práci, kdo dělá u sponzora (šéf ho pouští na zápasy), toho nenaláká.
 */
export function jobLurePull(i: { unemployed: boolean; sponsorJob: boolean; occupation: string }): number {
  if (i.sponsorJob) return 0;
  if (i.unemployed) return 14;
  const shift = smenaProPovolani(i.occupation);
  return shift === "smenny" || shift === "vecerni" ? 7 : 3;
}

/** Práce z `virtual_team_data` nabídky, null = nabídka práci nenese. */
export function jobLureOf(virtualTeamData: unknown): JobLure | null {
  if (typeof virtualTeamData !== "string" || !virtualTeamData) return null;
  try {
    const job = (JSON.parse(virtualTeamData) as { job?: Partial<JobLure> } | null)?.job;
    return job && typeof job.occupation === "string" && typeof job.label === "string" ? { occupation: job.occupation, label: job.label } : null;
  } catch (e) {
    logger.warn({ module: "job-lure" }, "nečitelná virtual_team_data nabídky", e);
    return null;
  }
}
