/**
 * Správce hřiště U21.
 *
 * Každý U21 tým má vlastní řádek `stadiums`, jenže všechno, co trávník spravuje
 * (sekačka, správce, zavlažování, brigády obce, události), míří na áčko. Denní tick
 * přitom U21 hřišti ubíral bod za bodem, takže na produ hrála U21 na trávníku
 * se stavem kolem 37 (áčka kolem 68) a zranění bylo o 60 % víc.
 *
 * Manažer o U21 hřiště pečovat nemá, starost se nepřenáší na áčko: o trávník se
 * stará správce zdarma. Denní úbytek se U21 nepočítá, správce každý den dorovná
 * pár bodů až k udržovanému stavu. Zápasy a mráz trávník dál opotřebují, správce
 * to během týdne spraví.
 */

/** Stav trávníku, na kterém správce U21 hřiště drží. */
export const U21_PITCH_TARGET = 70;

/** Kolik bodů za den správce dorovná. Zápas ubere 3–8, za dva dny je spravený. */
export const U21_PITCH_DAILY_CARE = 3;

/** Týmy, jejichž hřiště hlídá správce. Pro `team_id NOT IN (…)` v denním úbytku. */
export const U21_TEAMS_SQL = "SELECT id FROM teams WHERE team_type = 'u21'";

/** Denní práce správce. Vrací počet hřišť, na kterých dnes něco dělal. */
export async function maintainU21Pitches(db: D1Database): Promise<number> {
  const res = await db.prepare(
    `UPDATE stadiums SET pitch_condition = MIN(?, pitch_condition + ?)
      WHERE team_id IN (${U21_TEAMS_SQL})
        AND COALESCE(pitch_type, 'natural') != 'artificial'
        AND pitch_condition < ?`,
  ).bind(U21_PITCH_TARGET, U21_PITCH_DAILY_CARE, U21_PITCH_TARGET).run();
  return res.meta?.changes ?? 0;
}
