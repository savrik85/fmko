/**
 * Falešná D1 pro testy incidentů. Mimo testy se nepoužívá.
 *
 * Pravidla se hledají podle SQL, první shoda vyhrává. Bez shody vrací
 * `first` null, `all` prázdné pole a `run` jednu změněnou řádku.
 */

export interface Pravidlo {
  sql: RegExp;
  first?: unknown;
  all?: unknown[];
  changes?: number;
}

export interface ZaznamDotazu {
  sql: string;
  params: unknown[];
}

class FalesnyDotaz {
  constructor(private readonly db: FalesnaD1, readonly sql: string, readonly params: unknown[]) {}

  bind(...params: unknown[]): FalesnyDotaz {
    return new FalesnyDotaz(this.db, this.sql, params);
  }

  private zaznam(): Pravidlo | undefined {
    this.db.dotazy.push({ sql: this.sql, params: this.params });
    return this.db.pravidlo(this.sql);
  }

  async first<T>(): Promise<T | null> {
    return (this.zaznam()?.first ?? null) as T | null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: (this.zaznam()?.all ?? []) as T[] };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    return { meta: { changes: this.zaznam()?.changes ?? 1 } };
  }
}

export class FalesnaD1 {
  /** Jednotlivě spuštěné dotazy. */
  dotazy: ZaznamDotazu[] = [];
  /** Dávky `db.batch`, každá jako seznam dotazů. */
  davky: ZaznamDotazu[][] = [];

  constructor(public pravidla: Pravidlo[] = []) {}

  prepare(sql: string): FalesnyDotaz {
    return new FalesnyDotaz(this, sql, []);
  }

  pravidlo(sql: string): Pravidlo | undefined {
    return this.pravidla.find((p) => p.sql.test(sql));
  }

  async batch(dotazy: FalesnyDotaz[]): Promise<Array<{ results: unknown[]; meta: { changes: number } }>> {
    this.davky.push(dotazy.map((d) => ({ sql: d.sql, params: d.params })));
    return dotazy.map((d) => ({ results: this.pravidlo(d.sql)?.all ?? [], meta: { changes: this.pravidlo(d.sql)?.changes ?? 1 } }));
  }

  /** Kolikrát padl dotaz odpovídající výrazu, jednotlivě i v dávkách. */
  pocet(re: RegExp): number {
    return [...this.dotazy, ...this.davky.flat()].filter((d) => re.test(d.sql)).length;
  }
}

export function jakoD1(db: FalesnaD1): D1Database {
  return db as unknown as D1Database;
}
