# Inventář seznamů

Pořízeno 16. 11. 2026 nad větví `testing` (commit 36636da4). Čísla řádků se po úpravách posunou: před prací na stránce si je ověř přes grep. Cesty jsou relativní k `apps/web/src`.

```text
INVENTORY OF LISTS in apps/web/src (scope: app/(hra)/** minus admin, zapas/[id]/zaznam; components/** minus stadium, MatchReplayViewer)
All paths are relative to /Users/savrik/Projects/fmko/apps/web/src.
Key: TABLE = <table>, ROWS = mapped row list without a table. For ROWS the format is L=left, M=main text, S=secondary, R=right, click=whether the row is a link or clickable, sep=how rows are separated. "(?)" = borderline list.

Two shared components are dead code:
- components/players/squad-table.tsx (SquadTable) is not imported anywhere.
- components/players/player-card.tsx (PlayerCardCompact) is not imported anywhere.
- components/match/live-match.tsx and sms-roulette.tsx are also not imported.

Compiled .js copies sit next to some sources (they show up in greps): app/(hra)/pohar/tym/[id]/page.js, app/(hra)/u21/page.js, components/staff/StaffTaskBox.js.

==================== /kadr ====================
- app/(hra)/kadr/page.tsx:265 — TABLE via SquadAttributeTable (components/players/squad-attribute-table.tsx:205, rows map :235) — squad players with attributes.
  - Headers: Jméno, Poz, Věk, Hod, Pot, Rch, Tch, Stř, Přh, Hlv, Obr, Pře, Zku, Kre, Std, Brk, Výd, Síl, Kon, Mor, Vzt, Mzda.
  - Sortable: yes (th onClick, arrows ↑↓, aria-sort).
  - Wrapper "card overflow-x-auto table-scroll"; no min-w; first column sticky; nothing hidden on mobile; no mobile variant.
  - Position filter above it: PositionFilter, same file :144, used at kadr:262.
- kadr/page.tsx:296 (rows :326) — TABLE — player season match stats.
  - Headers: Jméno, Poz, Záp, Min, G, A, G+A, ŽK, ČK, CS, MoM, Ø.
  - Sortable (th onClick ↑↓). Wrapper "card overflow-x-auto table-scroll"; no min-w; sticky name column; no mobile hiding; hand-rolled.
- kadr/page.tsx:457 (DochazkaTab, rows :485) — TABLE — player attendance.
  - Headers: Jméno, Poz, Tréninky %, Tréninky, Zápasy, Zranění, Stopka, Výmluvy, Lavička, Nenominován.
  - Sortable. Same wrapper and sticky column; hand-rolled.
- kadr/page.tsx:538 (PlayerTopList, local fn :520; 14 instances :358-371) — ROWS — top players per attribute.
  - L: medal or "N." plus PositionBadge. M: name. R: value in pitch-600 plus suffix.
  - Whole row is a Link; sep space-y-1.5; empty "Žádná data.". Local component.
- kadr/page.tsx:577 (TopList, local fn :559; 7 instances :378-386) — ROWS — season leaders (goals, assists…). Same layout as PlayerTopList; local.
- kadr:411 → components/players/squad-body-tab.tsx:124 (rows :147) — TABLE — players' weight and body status.
  - Headers: Jméno, Poz, Váha, Stav, Měsíc, Postih, Proč, "" (SMS button).
  - Not sortable. Wrapper "card overflow-x-auto table-scroll"; sticky first column.
- kadr:413 → components/players/squad-analysis-tab.tsx:
  - :914 ROWS (LineRow) — squad lines vs league. M: line label, power meter, verdict. S: "Chybí…". R: chevron. Whole row is a button; sep "divide-y divide-gray-100".
  - :442 ROWS (PlayerRow, li :420) — players of a line. M: PlayerLink plus age plus "Zraněný" pill. S: skill chips. Not clickable; sep "border-t first:border-t-0".
  - :472-474 ROWS (InsightRow) — strengths/weaknesses. L: +/− circle. M: title. S: text. sep space-y-3.
  - :631 ROWS (PersonList) — growing/young/veteran players. M: PlayerLink. R: note plus accent. sep border-t first:border-t-0. Empty <p text-sm text-muted>.
  - :800 ROWS — tactics fit. M: label. S: reason. R: pill.
  - :828 ROWS — warnings. L: icon. M: text.
  - :393 (?) — CompareRow attribute bars.

==================== /tym/[id] ====================
- app/(hra)/tym/[id]/page.tsx:305 → ForeignSquad (tym/[id]/ForeignSquad.tsx:35) → PlayerBrowseTable — other team's squad.
  - columns={{condition:true}}.
  - Desktop table at PlayerBrowseTable.tsx:206 (rows :226). Headers: Poz, Hráč, [Klub], Věk, Hod, Rch, Tch, Stř, Při, Hlv, Obr, Brn, [Kon], [Forma], [Cena], Cena(value), Stav, [Sleduji od], [remove], [action].
  - Sortable via a local header() fn (th onClick ↑↓). Wrapper "hidden md:block overflow-x-auto -mx-4 sm:-mx-5 table-scroll"; table min-w-[960px].
  - Mobile variant: card list at PlayerBrowseTable.tsx:278 (md:hidden): PositionBadge plus avatar plus name/age/club plus rating chip in team color, then 4 key skills. Mobile sorting is a <select>.
- tym/[id]/page.tsx:428 (rows :438) — TABLE — team's match results.
  - Headers: Kolo, Soupeř, Výsledek, Diváci.
  - Not sortable. Wrapper "overflow-x-auto -mx-4 sm:-mx-5 table-scroll"; table min-w-[480px].
  - Opponent cell: BadgePreview plus link to /zapas/{id}/zaznam. Score chip colored by W/L/D.
- tym/[id]/page.tsx:472 — ROWS — team top players.
  - M: name plus "(bývalý)". S: hand-rolled POS_LABELS · N zápasů. R: goals, assists, card bars, avg-rating chip (bg-pitch-50 if ≥7).
  - Row is an <a> unless the player has left; sep "border-b border-gray-50 last:border-b-0".
- tym/[id]/page.tsx:528 (rows :547) — TABLE — own squad (desktop).
  - SortHeader (local, :684, arrows ▲▼) headers: "" (position), Hráč, Věk, Hod., Rch, Tch, Stř, Při, Hlv, Obr, Brn, Kon. Plus Mor, not sortable.
  - Wrapper "hidden md:block overflow-x-auto -mx-4 sm:-mx-5 table-scroll"; table min-w-[900px]. Row onClick goes to the player.
  - Mobile variant :591 — ROWS card list (md:hidden). L: PositionBadge plus avatar. M: name. S: age/nickname. R: 4 rounded skills plus rating chip. Whole row clickable; sep "flex flex-col gap-2" of .card.
  - Near-duplicate of PlayerBrowseTable.
- tym/[id]/TransferOverview.tsx:58 (rendered from page :658) — ROWS — team transfers in/out.
  - L: FaceAvatar (40px). M: player link. S: direction/kind, other club with badge, fee, season. R: none.
  - sep "divide-y divide-gray-200"; empty "Zatím žádné přestupy.".
- tym/[id]/page.tsx:80 (?) — inline "same owner" club links.
- tym/[id]/page.tsx:267 — form chips in the hero header (hand-rolled, see section 5).

==================== /hrac/[id] ====================
- app/(hra)/hrac/[id]/page.tsx:1208 — ROWS — player's club history.
  - L: BadgePreview (32px). M: team name. S: season, joined/left dates. R: join-type pill. Sub-line: swap or fee.
  - The inner <a> is clickable; sep "border-b border-gray-50 last:border-b-0".
- :1292 — ROWS — coach-relationship log. L: RelationTrend. M: description. R: date. Same separator.
- :1316 — ROWS — squad relationships (first 3, then "Zobrazit všechny").
  - L: emoji. M: player link plus PositionBadge plus type label. S: effect.
- :1373 (?) — last-5 form tiles (rating chip, opponent, V/R/P letter); flex-wrap tiles.
- :1476 (?) — league-rank rows with bars.
- :1622 (rows :1637) — TABLE — career stats per season.
  - Headers: Sezóna, Klub, Liga, Z, G, A, ŽK, ČK, Hod.
  - Not sortable. Wrapper "overflow-x-auto -mx-4 sm:-mx-5 table-scroll"; min-w-[600px].
- :1708 (rows :1722) — TABLE — player match history.
  - Headers: Kolo, Soupeř, Výsledek, Hodnocení, Min, G, A, Karty.
  - Not sortable; filter chips Všechny/Výhry/Remízy/Prohry. Same wrapper; min-w-[760px]. Rating bar "hidden sm:block". Empty row via colSpan.
- :1893 and :1902 (RowItem :1856) — ROWS — missed matches (absences / bench).
  - M: round plus opponent link. Then reason pill, SMS quote, score at right.
  - sep space-y-2 of "rounded-soft bg-gray-50/60" tiles; second list sits inside <details>.
- :1917 (?) — watcher clubs as badge-plus-name chips.
- :2127 (?) — scout picker radio list inside a dialog.
- :2330 (rows :2340) — TABLE — training attribute changes (TrainingDevelopment).
  - Headers: Datum, Atribut, Trénink, Změna.
  - Not sortable. Wrapper "overflow-x-auto"; no min-w. Trénink is "hidden md:table-cell"; on mobile the value moves under Atribut (md:hidden).
- :2411 (rows :2421) — TABLE — weight log. Headers: Kdy, Zdroj, Váha, Změna. No wrapper, no min-w.
- :2514 (rows :2524) — TABLE — condition log.
  - Headers: Kdy, Zdroj, Detail, Změna.
  - Wrapper "overflow-x-auto". Detail is "hidden md:table-cell" with an md:hidden copy under Zdroj.
- :1272 → components/players/promise-card.tsx:31 (PromiseCard) — ROWS — promises to the player. L: 🤞. M: text. S: dates. R: status pill. sep "border-b … last:border-b-0".
- (?) Key-value rows, not entity lists: DetailRow :2183, AttrRow :2203, TraitRow :2234. They use "flex justify-between py-1.5 border-b border-gray-50 last:border-b-0".

==================== /liga ====================
- app/(hra)/liga/page.tsx:546 (StandingsTab, rows :565) — TABLE — league standings.
  - Headers: #, Tým (colSpan 2), Z, V, R, P, Skóre, B, Forma.
  - Sortable via th onClick (↑↓), except Forma.
  - Wrapper "card overflow-x-auto table-scroll"; no min-w. Z, V, R, P and Forma are "hidden sm:table-cell".
  - BadgePreview in its own td. Form chips hand-rolled (FORM_COLORS/FORM_LABELS :36-40). Promotion/relegation legend below. Empty "Zatím žádné výsledky." (card p-8).
- liga/page.tsx:372 (PastSeasonView, rows :384) — TABLE — final standings of an archived season.
  - Headers: #, Tým, Z, V-R-P, Skóre, B.
  - Not sortable. Wrapper "card overflow-x-auto table-scroll". Z is hidden sm:table-cell.
- liga/page.tsx:648/655 (ScheduleTab) — ROWS — league fixtures and results grouped by round.
  - L: BadgePreview. M: home/away names. R: score or "vs".
  - Whole row is a Link if the match is played. sep by conditional "border-b border-gray-50".
  - Mobile variant inside each row: "sm:hidden" stacked teams / "hidden sm:flex" side by side. Hand-rolled, not FixtureRow.
- liga/page.tsx:481 (ArticleBody round_results) — ROWS — round results parsed from article text. Home, score chip, away; sep "border-b … last:border-b-0".
- liga/page.tsx:329 — ROWS — other league's news, as cards (space-y-3).
- liga/page.tsx:404 (?) — best-eleven chips.
- liga:324 → LeagueStatsTab (components/league/league-stats.tsx):
  - :377 StatTable (rows :379) — TABLE — player leaderboards.
    - No thead; card title strip "px-4 py-2.5 bg-gray-50 border-b border-gray-100".
    - Columns: rank | PositionBadge, player link, team (badge plus name) | value.
    - "stat-table w-full text-sm table-fixed"; wrapper "card overflow-hidden" (no overflow-x). Team is "sm:hidden" under the name vs "hidden sm:flex" to the side. Not sortable. 13 instances.
  - :348 TeamTable (rows :350) — TABLE — team leaderboards. Columns: rank | badge plus team | value. Same structure; 10 instances.
  - :316 CuriosityCard (?) — link cards.

==================== /rozpis ====================
- app/(hra)/rozpis/page.tsx:231 and :242 (MatchRow :291) — ROWS — my upcoming and played matches.
  - Mobile: round or icon, opponent badge plus name, score plus V/R/P circle (or date/time).
  - Desktop: home – score – away plus result circle. Both variants live in one card (md:hidden / hidden md:flex).
  - Whole card is a Link; sep "flex flex-col gap-3" of ".card shadow-lg".
- rozpis/page.tsx:269/278 (LeagueMatchRow :416) — ROWS — league schedule by round. Home | score | away; card per match; Link if played; sep space-y-1.5.

==================== /pohar ====================
- app/(hra)/pohar/page.tsx:166 — ROWS via FixtureRow inside FixtureGroup — my cup path.
- pohar/page.tsx:254 (TieRow :66) — ROWS via FixtureRow inside RoundPager — cup bracket matches.
- pohar/page.tsx:213 — ROWS — cup top scorers. L: "N.". M: name link, team. R: assists, cards, goals. sep "border-b border-gray-50 last:border-b-0".
- pohar/page.tsx:143 (?) — prize grid.
- pohar/page.tsx:258 (?) — inline list of byes.
- app/(hra)/pohar/tym/[id]/page.tsx:97 — ROWS — cup team's path: round, "home vs away", score plus POSTUP/KONEC chip. Same separator.
- pohar/tym/[id]/page.tsx:125 (rows :137) — TABLE — cup team roster.
  - Headers: Poz, Hráč, Věk, Hodnocení, Kondice, Morálka.
  - Not sortable. Wrapper "card mt-2 overflow-x-auto table-scroll"; no min-w. Rows "border-t border-gray-50". Position is hand-rolled text (BR/OB/ZÁ/ÚT).

==================== /turnaj ====================
- app/(hra)/turnaj/competition.tsx:181 (DayBlock :178) — ROWS via FixtureRow inside FixtureGroup — tournament matches by day.
  - Used at :338, :339, :360 (in RoundPager), :378, and app/(hra)/turnaj/hriste/[id]/page.tsx:142.
- competition.tsx:196 (Standings :186) — ROWS (div table) — tournament standings.
  - Header row "flex … text-sm text-muted border-b border-gray-100" with #, Tým, Z, Skóre, B.
  - L: BadgePreview. R: Z, score, points. A "border-b-2" line marks the advancement cut. Used ×3 (groups and thirds).
- competition.tsx:70 (Awards) — ROWS — tournament award winners. L: icon. M: player link, team, stat line. sep "card divide-y divide-gray-100".
- competition.tsx:389 — ROWS — tournament scorers (same pattern as the pohar scorers).
- app/(hra)/turnaj/page.tsx:256 — ROWS — entered clubs. L: color dot. M: team link. R: district. Same separator.
- turnaj/page.tsx:278 — ROWS — venues. M: name. R: capacity and ›. Whole row is a Link.
- turnaj/page.tsx:113 (?) — TermRow static info rows.

==================== /zapas (lineup) ====================
- app/(hra)/zapas/page.tsx:1079 (rows :1101) — TABLE — player picker for a slot (desktop).
  - Headers: #, Hráč, Hod, Rch, Tch, Stř, Obr, Kon, Mor.
  - Wrapper "hidden lg:block card overflow-x-auto mb-3 table-scroll". Row onClick.
  - Mobile variant :1465 — ROWS bottom sheet via portal (lg:hidden). L: squad-number circle (POS_BG). M: name plus PositionBadge. S: rating/condition. R: morale. Each row is a button; sep "border-b border-gray-50".
- zapas/page.tsx:1156 (rows :1172) — TABLE — starting XI.
  - Headers: #, Hráč, Hod, Rch, Tch, Stř, Obr, Kon, Mor, Hod.
  - Wrapper "card overflow-x-auto mb-3 table-scroll". Not sortable; row click edits the slot.
- zapas/page.tsx:1232 (renderBenchRow :1248; maps :1294, :1295, :1316) — TABLE — bench plus "Nejedou na zápas". Same headers; two tbodies.
- zapas/page.tsx:1581 (rows :1597; TakerPicker) — TABLE — captain and set-piece taker candidates.
  - Headers: "Kdo rozhoduje" plus attribute shorts with % weights (e.g. Std / Tch / Stř).
  - No wrapper. Rows clickable (radio dot). Top 5, then "Celý kádr (N)".
- zapas/page.tsx:1379 and :1395 (?) — chemistry pair text rows.
- zapas/page.tsx:1369 (?) — relationship chips.

==================== /zapas/[id] (match detail; zaznam excluded) ====================
- app/(hra)/zapas/[id]/page.tsx:561 — ROWS — top performers per team. M: player link. S: position plus goals/cards icons. R: rating chip. sep "divide-y divide-gray-100".
- :689 and :746 — ROWS — lineups grouped by position, plus bench. L: squad-number circle. M: name plus icons. R: rating bar (hidden sm:block) plus rating chip. Left border colored by position; divide-y.
- :597, :809, :822 (EventRow :965) — ROWS — match events. L: minute plus team color bar plus icon. M: player and description. Rows are tinted rounded tiles.
- :785 and :788 (GoalRow :953) — ROWS — goals: minute, icon, scorer, source.
- :920 — ROWS — commentary. L: minute chip. M: text. sep "divide-y divide-gray-50" inside a max-h-[500px] scroll box.
- :423 and :454 — ROWS — referee incidents and fan incidents, as left-border cards.
- :841 and :862 — ROWS — excused players. L: reason pill. M: name. S: SMS quote.

==================== /prestupy ====================
PlayerBrowseTable is used four times on this page:
- app/(hra)/prestupy/page.tsx:1762 — transfer search. columns {club:true, value:false}. Capped at VYPIS_MAX = 60 rows.
- :2025 — free agents. columns {club, action, value:false}; action is a "Podepsat" button.
- :2053 — players for sale. columns {club, price, action, value:false}.
- :2077 — players for loan. Same columns as for sale.

Other lists on prestupy/page.tsx:
- :1500 (RecentTransferRow :386) — ROWS — recent transfers. L: avatar. M: name, PositionBadge, age. R: fee or loan/free/swap label. S: from → to club links. sep "border-b border-gray-100 last:border-b-0".
- :1485 (MidTransferCard) (?) — 2-column card grid of top 2–5 transfers.
- :1515 (SpeculationCard) (?) — card grid.
- :1531 and :1562 — ROWS — top earning / spending clubs. L: "N." plus ClubBadge. M: team link plus bar. R: amount. sep space-y-2.5.
- :1596 — ROWS — most active clubs. L: rank plus badge. M: team. R: ↓in ↑out total.
- :1213 (renderMyListings) — ROWS as cards — my listings. L: avatar. M: name, PositionBadge, age, price. R: "Stáhnout". Nested lists: :1252 loan requests (rows with a Rozhodnout link) and :1270 bids (rows with Přijmout/Odmítnout).
- :2115 (flatMap; radek() :2142) — ROWS — closed transfer history. L: avatar. M: name, PositionBadge, status. S: other club, kind, amount, date. R: ›. Whole card is a Link; sep space-y-2.
- :2202 — ROWS as cards — new player offers. L: avatar. M: name, flag, PositionBadge, age. S: source, quote, skills, wage. R: Přijmout/Odmítnout buttons.
- :2309 — ROWS as cards — incoming offers. L: avatar. M: player link, PositionBadge. S: blurred skills, offer, terms, interest pill. R: action buttons.
- :2442 — ROWS as cards — my outgoing offers. Same shape.
- :2545 and :2620 — dead code: legacy bids, gated by `false &&`.
- :2708 and :2735 — ROWS as cards — loaned out / loaned in. M: name link, PositionBadge, club. R: days and date plus button.
- :2888 (SquadTransferTable, rows :2911) — TABLE — own players with a "Na trh" action.
  - Headers: Jméno, Poz, Věk, Hod, Rch, Tch, Stř, Přh, Obr, Výd, Mzda, Hodnota. Plus Status and Akce, which are not sortable.
  - Sortable (th onClick ↑↓). Wrapper "card overflow-x-auto table-scroll"; no min-w.
  - Rch through Hodnota and Status are "hidden sm:table-cell"; on mobile the value moves under the name (sm:hidden).
- :2107 and :2436 → components/transfers/AiNegotiationsList.tsx:59 — ROWS — negotiations with outside clubs. L: avatar. M: name, PositionBadge, age, rating range. S: club, terms, state line. R: →. Whole card is a Link; sep space-y-2.
- :101 (?) — swap player chips.

Sub-tab files:
- app/(hra)/prestupy/WatchlistTab.tsx:82 → PlayerBrowseTable — watchlist. columns {club, form, watchedSince}; onRemove; emptyText set.
- prestupy/DemandsTab.tsx:157, :187, :229 — ROWS as cards — transfer demands. DemandHead: PositionBadge, role, age, club. R: Nabídnout/Stáhnout.
  - Nested :98 MyPitches (tiles).
  - Nested :245 — offered players. M: name link, PositionBadge, age, team. sep "border-b border-gray-50 last:border-b-0".
  - :450 (?) — PitchSheet radio picker list.
- prestupy/LoansTab.tsx:75 and :81 (LoanCard :14) — ROWS as card Links — loan agreements. M: name, PositionBadge, age, rating. S: club, playing-time state, stats.
- prestupy/ObligationsTab.tsx:119 and :125 (DealCard :36) — ROWS as cards — installment deals, with progress bar and a key-value grid.
- ObligationsTab.tsx:131 and :138 (ClauseRow :67) — ROWS as cards — sell-on clauses. M: player link. R: "% z příštího přestupu".
- app/(hra)/prestupy/hostovani/[id]/page.tsx:178 (rows :189) — TABLE — loanee's matches.
  - Headers: Datum, Soupeř, Skóre, Hrál, Známka.
  - Wrapper "mt-4 overflow-x-auto -mx-1"; no min-w; rows "border-t border-gray-100"; not sortable.
- hostovani/[id]/page.tsx:238 (?) — skill before→now rows (li, border-b).
- app/(hra)/prestupy/nabidka/[id]/components/OfferTimeline.tsx:93 (?) — negotiation timeline as chat bubbles. Also used in prestupy/jednani/[id]/page.tsx:251.

==================== /finance ====================
- app/(hra)/finance/page.tsx:855 (rows :866) — TABLE — transaction history.
  - Headers: "" (icon), Popis, Částka, Zůstatek, Kdy.
  - Not sortable; filter chips Vše/Příjmy/Výdaje. Wrapper "overflow-x-auto -mx-4 sm:-mx-5 table-scroll"; min-w-[500px].
  - Data is limited server-side (limit=50).
- finance:387 — ROWS — sponsor contracts. L: icon. M: name. S: sector. R: Kč/týd and Kč/měs. sep "border-b … last:border-b-0".
- finance:452 — ROWS — best paid players. L: PositionBadge. M: name. R: wage. Whole row is an <a>.
- finance:803 — ROWS — loan history. M: amounts. S: status. R: remaining.
- finance:257, :266 and the BarRow blocks (?) — bar rows.
- finance:626 (?) — last home match lines (key-value).

==================== /fanousci ====================
- app/(hra)/fanousci/page.tsx:837 — ROWS — satellite villages. M: village. S: km, population, conversion. R: ★ total, streak. sep "border-b border-gray-100 last:border-b-0".
- fanousci:1081 — ROWS — satisfaction history per match. L: V/R/P circle (resultBadge). M: opponent, date, attendance. S: reasons. R: delta and before→after.
- fanousci:1208 (rows :1218) — TABLE — coach influence bands (static).
  - Headers: Vliv, Po zápase, Loajalita, Jak to fanoušci berou.
  - Wrapper "overflow-x-auto"; not sortable.
- fanousci:1584 — ROWS as bordered cards — concession sales per match, with a nested 3-column product grid.
- fanousci:1425 (?) — product management cards (forms).
- fanousci:1404 (?) — weather hint rows.
- app/(hra)/fanousci/FanGroupsPanel.tsx:318 — fan group cards.
- FanGroupsPanel.tsx:375 — ROWS — recent club events. M: date plus label.
- FanGroupsPanel.tsx:402 — ROWS — stand incidents. M: date. R: fine. S: text.
- FanGroupsPanel.tsx:245 — LeaderRadek (single row).
- app/(hra)/fanousci/ChoralyPanel.tsx:101 (?) — chant cards.

==================== /u21 ====================
- app/(hra)/u21/page.tsx:329 and :368 (PlayerList :667, rows :720) — ROWS — A-team youngsters and U21 squad.
  - L: avatar. M: name. S: PositionBadge, age, flags. R: rating plus growth.
  - Each row is <details> that expands to stats and actions; sep "divide-y divide-gray-200"; sorting via <select>.
- u21/page.tsx:590 (StandingsTable, rows :605) — TABLE — U21 league standings.
  - Headers: #, Tým, Z, V, R, P, Skóre, B.
  - Sortable via a <button> inside each th (aria-sort, ↑↓). Wrapper "card overflow-hidden"; no overflow-x, no min-w.
  - V, R, P are hidden sm:table-cell; on mobile a "V · R · P" line appears under the team (sm:hidden). Empty row via colSpan.
- u21/page.tsx:420/429 — ROWS — U21 fixtures per round. Home and away stacked with badges plus score. sep "divide-y divide-gray-200". Hand-rolled round pager at :408-416.
- u21:454 → LeagueStatsTab.
- u21:456 → U21Attributes (components/players/u21-attributes.tsx:44) → SquadAttributeTable.
- u21:458 → components/players/u21-rozvoj.tsx:241 — ROWS as card grid — youth development. L: avatar. M: name, PositionBadge, age, TalentStars. R: readiness pill. Plus bar.

==================== /akademie ====================
- components/players/academy-card.tsx (AcademyCard, rendered by app/(hra)/akademie/page.tsx:17):
  - :471 — ROWS — academy kids by age group, inside <details>. L: avatar. M: name plus pills. S: position/age, strengths, verdict, potential bar, action. sep "border-t md:odd:border-r" in a 2-column grid.
  - :594 — incoming poach attempts (tiles).
  - :621 — nearby targets (tiles).
  - :699 (?) — volunteer radio list.
  - :734 — staff market (tiles).
  - :767 — equipment tiles.

==================== /zamestnanci ====================
- app/(hra)/zamestnanci/page.tsx:563 and :585 (renderMemberCard) — staff cards grid (?).
- zamestnanci/page.tsx:629 — candidate cards (market).
- zamestnanci/page.tsx:437 (?) — course option buttons.
- app/(hra)/zamestnanci/skaut/page.tsx:511 — ROWS — players watched by the scout. M: player link. S: report and cost. R: "Zrušit". sep "divide-y divide-gray-100".
- skaut/page.tsx:904 and :916 (ReportRow :99) — ROWS — scout reports. L: avatar. M: name, PositionBadge, age, rating range. S: club, km, status. R: →. Whole card is a button; sep space-y-2. Older reports toggle at :911.
- skaut/page.tsx:318 (?) — scout selector cards.
- components/staff/StaffTaskBox.tsx:339 — ROWS (picker) — task candidates. Checkbox/radio. L: position text. M: name. S: info. sep "divide-y divide-gray-100" in a max-h-72 scroll box.

==================== /trenink ====================
- app/(hra)/trenink/page.tsx:196 — ROWS — players absent today. M: name link. R: reason.
- trenink:560 and :582 — ROWS — staff and equipment impact. L: avatar or icon. M: name. S: role. R: detail. Whole row is a Link.
- trenink:603 (?) — strained player chips.
- trenink:628 — ROWS (picker) — rest-day selection. Checkbox. M: name link. R: position plus condition. Row clickable; sep "divide-y divide-gray-50" in a max-h-80 scroll box.
- trenink:757 — ROWS — morale changes after training.
- trenink:796 and :820 — ROWS — improvements and declines per player with attribute bars. sep "border-b … last:border-b-0".
- trenink:877 — ROWS — training absences (✕, name, reason).
- trenink:917 — ROWS — top improvers. "N.", name plus bar, +N.
- trenink:970 and :989 — ROWS — best and worst attendance. "N.", name, attended/total, %.
- trenink:945 (?) — attribute bars.
- trenink:862 (?) — inline player links.

==================== /manazer/[id] ====================
- app/(hra)/manazer/[id]/page.tsx:376 — ROWS — coach attribute history. L: delta circle. M: attribute. S: description. R: date plus value. sep "border-b border-gray-50 last:border-b-0".
- manazer:307 (AttrRow :506) (?) — attribute rows with bars; "divide-y divide-gray-50".
- manazer:472 (?) — achievements grid.
- manazer:356 → components/manager/CoachKabinaTab.tsx:207 — ROWS — players' relationship to the coach. L: avatar. M: name, PositionBadge. R: band label. S: bar, flags, last change. sep "border-b border-gray-100/80 last:border-b-0".
- CoachKabinaTab.tsx:268 — ROWS — dressing-room feed. L: DeltaBubble. M: player. S: text. R: date plus icon.
- manazer:366 → components/manager/CoachEducationTab.tsx:
  - :203 (?) — licence ladder.
  - :338, :357, :364 (OfferRow :399) — ROWS — course offers. M: title plus chips. R: "Přihlásit se".
  - :376 — ROWS — completed courses. L: ✅/❌. M: title. R: "Skripta".
- manazer:359 and :363 → components/relations/RelationSection.tsx:
  - :540 FamilyCard — ROWS.
  - :625 (PeerRow :561) — ROWS — other coaches. L: avatar. M: coach plus licence. S: team, status. R: respect/heat. sep "border-b … last:border-b-0". The "others" group is collapsible.
  - :306 (RelationCard) — ROWS — shared history with a coach.

==================== /reputace ====================
- app/(hra)/reputace/page.tsx:351 — ROWS — reputation history (same pattern as the manazer history).
- reputace:257 (?) — unlock tiles grid.
- reputace:316 and :328 (?) — SourceRow info rows.
- reputace:286-303 — EarnRow key-value rows.

==================== /udalosti ====================
- app/(hra)/udalosti/page.tsx:216 — event cards awaiting a decision, with choice buttons.
- udalosti:264 — ROWS as cards — upcoming events. L: icon. M: title. S: description. R: "za N kol".
- udalosti:290/296 (DiaryItem :319) — ROWS — club diary by week. L: icon. M: title. S: choice and effect chips.
- app/(hra)/udalosti/DistrictEvents.tsx:164 — EventCard. Inside it, :132 (PersonRow :70) — ROWS — people involved. L: avatar. M: name link plus team. S: effect chips.

==================== /hospoda ====================
- app/(hra)/hospoda/page.tsx:349 — pub-evening cards.
- hospoda:374 (?) — attendee chips.
- hospoda:434 — ROWS — pub incidents. L: icon. M: text. S: effects plus link. sep "divide-y divide-gray-100".
- hospoda:271 — NPC cards.
- hospoda:319 (?) — top drinkers card grid.
- hospoda:264 → components/relations/StammtischCard.tsx:
  - :149 — invite cards.
  - :176 — ROWS — invited coaches. M: name plus team. R: status pill.
  - :223 (?) — checkbox list of managers.

==================== /obec, /obec/[id] ====================
- app/(hra)/obec/page.tsx:548, :565, :583 — cards waiting for a decision (pub, investments, petitions).
- obec:610 — council member cards grid. Nested :635 — mini rows of rival clubs' favor.
- obec:668 — ROWS — invite council members to a match. M: role, name, favor. R: button or status. sep "divide-y divide-gray-100".
- obec:714 — brigade cards.
- obec:747 — ROWS — clubs in the village. L: club badge SVG. M: team link plus FavorBar. R: favor label.
- obec:788 — ROWS — local players. M: name link. R: position, rating, stats.
- obec:815 — ROWS — village chronicle. L: icon. M: text. S: date, team.
- obec:1032 — ROWS (picker) — brigade players, checkboxes; "divide-y" in a scroll box (dialog).
- app/(hra)/obec/[id]/page.tsx:378 — ClubCard cards; nested :163 recent home matches (li).
- obec/[id]:360 (?) — officials grid.
- obec/[id]:420 and :436 (?) — coaches and residents grid of avatar rows.
- obec/[id]:461 — bus fans (li).
- obec/[id]:476 — chronicle (same as obec:815).
- obec/[id]:181 RecordRow — key-value.
- app/(hra)/obec/DistrictVillages.tsx:91 — club list.
- DistrictVillages.tsx:122 (?) — village link cards grid.
- DistrictVillages.tsx:150 (?) — village chips.

==================== /telefon ====================
- app/(hra)/telefon/page.tsx:257 — ROWS — conversations. L: avatar or emoji. M: title plus status pill. S: last message. R: time plus unread badge. Whole row is a Link; sep "divide-y divide-gray-100".
- app/(hra)/telefon/Adresar.tsx:133, :149, :166, :183 (Radek; Sekce :72) — ROWS — contacts: groups, players, coaches, owners. L: avatar. M: name. S: subtitle. R: channel tag plus ›. Row is a button; "divide-y" under sticky headers.
- telefon/Hovory.tsx:110 — ROWS — missed calls (iOS style). Expandable. sep is an inset box-shadow.
- telefon/Oznameni.tsx:109 and :113 (Karta :138) — notification cards (dark).
- telefon/Tribuna.tsx:174 — ROWS — fan posts. L: avatar. M: author, handle, time. S: body plus likes. Tone shown as left border; "divide-y".
- telefon/SocialFeed.tsx:1067 — FeedCard cards. Nested :770 lines, :801 comments.
- SocialFeed.tsx:926 — ROWS — muted items. M: label. R: "Vrátit".
- app/(hra)/telefon/[id]/page.tsx:559/565 (?) — chat messages.

==================== /zpravodaj, /redakce ====================
These use a newspaper style (np-* classes, divide-ink).
- app/(hra)/zpravodaj/page.tsx:535 — promotion articles.
- zpravodaj:642, :671, :698 — Rozhovor interview rows; "divide-y divide-ink/10".
- zpravodaj:731 — transfer article grid.
- zpravodaj:751 and :764 — round results and misc articles.
- zpravodaj:795 — classifieds.
- zpravodaj:876 — editors grid.
- zpravodaj:1083 — round-result rows. All of these marked (?).
- app/(hra)/zpravodaj/Interviews.tsx:111 — ROWS — interview invitations. L: avatar. M: journalist. S: question count plus expiry. R: "Odpovědět". Whole card is a Link.
- app/(hra)/redakce/[id]/page.tsx:153 — ROWS — journalist's relations to clubs; "divide-y divide-ink/10".
- redakce/[id]:177 — article list.

==================== /soutez ====================
- app/(hra)/soutez/page.tsx:508 and :559 — ProposalCard cards.
- soutez/page.tsx:749 (?) — inline voter list.
- app/(hra)/soutez/panels.tsx:175 — ROWS — competition ledger entries. M: description. S: type plus team link. R: amount. sep "divide-y" with style borderColor var(--color-line).
- panels.tsx:128 and :164 — Row key-value lines (soutez/ui.tsx:128).
- panels.tsx:243 — leadership roles.
- panels.tsx:358 — ROWS — election candidates. L: Portrait. M: PersonLine. R: "Dát hlas".
- panels.tsx:444 — ROWS — election results (Portrait plus PersonLine).
- panels.tsx:916 — sponsor offers.
- panels.tsx:1025 — message thread (Vlakno).
- panels.tsx:1082 (ZapisyPanel) — ROWS — meeting minutes items. M: title, note, vote ratio. R: DecisionPill. "divide-y".
- app/(hra)/soutez/discipline.tsx:80 and :98 (SanctionRow :116) — sanction cards.
- discipline.tsx:340 (PitchLine :363) — ROWS — pitch condition per club. M: team link plus bar. R: value. "divide-y". Wrapped in Rozbaleni.
- app/(hra)/soutez/referees-panel.tsx:66 (MatchRow :358) — ROWS — referee delegation. M: home – away. S: referee. R: grade.
- referees-panel.tsx:104 — ROWS — referees and grades. M: name plus flags. S: matches. R: grade. Plus buttons below.
- app/(hra)/soutez/integrity-panel.tsx:152, :194, :252 — ROWS — suspicious transfers, bet book, money friendlies. "divide-y divide-gray-50" inside Rozbaleni.
- app/(hra)/soutez/club-audit-section.tsx:119 — ROWS — clubs to audit. M: team plus audit date. R: button.
- club-audit-section.tsx:189 (rows :198) — TABLE, inside a modal — ledger by category.
  - Headers: Druh, Příjmy, Výdaje.
  - tbody "divide-y divide-gray-50"; no wrapper; not sortable.
- club-audit-section.tsx:214 and :225 (ItemRow :46) — ROWS — ledger items. L: icon. M: description. S: type plus date. R: amount.
- soutez/page.tsx:569 → components/dashboard/gremium-vyveska.tsx:133 — ROWS — board decisions. M: title. S: note, date, ratio. R: DecisionPill. "divide-y".

==================== /sazky ====================
- app/(hra)/sazky/kurzy.tsx:243 (ZapasKarta) — match cards. Nested :70/:103 RadekTymu team rows, :178 scorer rows (?).
- app/(hra)/sazky/tikety.tsx:153 and :163 (TiketKarta) — ticket cards. Nested :51 — ROWS — selections. L: IkonaTipu. M: match. S: pick. R: odds. "divide-y divide-gray-50".
- app/(hra)/sazky/arena.tsx:247 (ArenaKarta) — shared tickets. Nested :190 tips (same row pattern), :96 comments.
- app/(hra)/sazky/tiket.tsx:142 — ROWS — bet slip. M: match plus pick. R: odds plus remove button. "divide-y divide-dashed divide-line".

==================== /pratelaky ====================
- app/(hra)/pratelaky/FriendlyRecord.tsx:180 (rows :192) — TABLE — friendlies ladder (top 10 plus me).
  - Headers: #, Klub, Z, V-R-P, Skóre, B.
  - Not sortable. No overflow wrapper (parent "card p-0 overflow-hidden"). Z and Skóre are hidden sm:table-cell.
- FriendlyRecord.tsx:238 — ROWS — played friendlies. L: score tile colored by result plus ClubCrest. M: TeamLink. S: date, venue, stake. R: "Záznam" link. "divide-y divide-gray-100".
- FriendlyRecord.tsx:222 (?) — RivalryCard grid; first 6, then "Všichni rivalové".
- app/(hra)/pratelaky/page.tsx:145, :173, :224, :238, :256, :269 — ROWS as cards via FixtureCard / FriendlyCard (pratelaky/friendly-ui.tsx:190, :226). L: DateTile. M: crest plus TeamLink plus status. S: place plus tags. R: action buttons.

==================== /sin-slavy, /napoveda, /rozhodci, /hlasovani ====================
- app/(hra)/sin-slavy/page.tsx:56 (rows :69) — TABLE — Hall of Fame coach ranking.
  - Headers: #, Trenér, Tým, 🥇, 🥈, 🥉, Σ.
  - Wrapper "card" only (no overflow-x, no min-w). The medal columns are hidden sm:table-cell. Not sortable.
  - Cells hold avatar plus coach link and badge plus team link.
- app/(hra)/napoveda/page.tsx:44 (rows :60) — TABLE (static reference) — attributes by position.
  - Headers: Atribut, BRA, OBR, ZÁL, ÚTO (with color dots), Význam. Wrapper "overflow-x-auto".
- napoveda/page.tsx:240 (rows :250) — TABLE (static) — coach influence bands.
  - Headers: Vliv, Po zápase, Loajalita, Jak to fanoušci berou. Wrapper "overflow-x-auto".
- app/(hra)/rozhodci/page.tsx:73 — ROWS as card Links — referee ranking. L: rank plus avatar. M: name. S: archetype plus stats. R: grade plus word.
- app/(hra)/rozhodci/[id]/page.tsx:161 — ROWS as card Links — referee's matches. M: score line. S: round plus incident. R: grade.
- rozhodci → components/referees/disciplinary-panel.tsx:
  - :44 (ListinaPokut) — fine cards. M: team. S: badge plus date. R: amount.
  - :140 — top-3 rows with medal.
  - :162 — remaining rows with rank. sep space-y-2 of cards.
- app/(hra)/hlasovani/page.tsx:229 and :239 — VoteCard cards. Nested :128 (?) — voter avatar grid.

==================== /sponzori, /sponzor/[id] ====================
- components/sponsors/contracts-tab.tsx:69, :99, :193 (OffersList) — card lists: running negotiations, ContractCard, offers.
- components/sponsors/firms-tab.tsx:109 (FirmCard :18) — firm cards. M: SponsorLink. S: type/owner/holder. R: FavorBadge.
- components/sponsors/popularity-tab.tsx:22 (FirmList) and :115 — ROWS — firms by favor and recent favor changes. M: SponsorLink. S: owner/reason. R: FavorBadge or delta. "divide-y divide-line-soft".
- components/sponsors/history-tab.tsx:39 — ROWS — main sponsor by season.
- history-tab.tsx:62 — ended contracts as cards.
- app/(hra)/sponzor/[id]/page.tsx:122 and :142 — ROWS — firm's other contracts and history. M: TeamLink. R/S: category/status. "divide-y divide-gray-100".
- components/sponsors/negotiation/rounds-history.tsx:30 (?) — negotiation rounds.
- components/sponsors/request-section.tsx:45 and :65 (?) — owner request history.

==================== /vybaveni, /stadion, /incidenty ====================
- app/(hra)/vybaveni/BazarTab.tsx:54 — ROWS — my bazaar listings. L: icon. M: category plus level. S: price, condition, expiry. R: "Stáhnout". sep "border-b border-gray-100 last:border-0".
- BazarTab.tsx:116 — listing cards grid.
- BazarTab.tsx:233 — ROWS — sales history. L: icon. M: category. R: result.
- app/(hra)/vybaveni/page.tsx:332 (?) — equipment cards grid.
- app/(hra)/stadion/page.tsx:1682 — ROWS — construction history. M: label. S: date. R: cost. "divide-y".
- stadion/page.tsx:1241 and :1411 (Radek :373) (?) — pitch action and upgrade rows. M: name plus description. R: action button. sep "border-b border-gray-100 last:border-b-0".
- app/(hra)/incidenty/page.tsx:110 — ROWS — broken equipment. M: label plus cost. R: "Opravit".
- incidenty/page.tsx:142 (Karta :147) — incident cards (bordered).

==================== /prehled (dashboard widgets, components/dashboard/widgets/items) ====================
Every widget truncates its list with rowsForHeight() and ends with a MoreLink.
- league-widgets.tsx:26 (rows :39) — TABLE — standings widget.
  - Headers: #, Tým, Z, V, R, P, B.
  - Wrapper "overflow-x-auto -mx-4 sm:-mx-5 table-scroll"; not sortable.
- match-widgets.tsx:399 (rows :408) — TABLE — recent matches.
  - Headers: Kolo, Soupeř, Výsledek. Same wrapper. Score chip colored by result.
- league-widgets.tsx:132 (TopList → ScorerRow from items/shared.tsx:44) — ROWS — top scorers / assists / rating. "N.", name, value. Row is an <a>.
- league-widgets.tsx:303 — ROWS — league cards (name plus yellow/red bars).
- league-widgets.tsx:343 — ROWS — cup path.
- match-widgets.tsx:343 — ROWS — fixtures. Round, opponent, D/V, lineup flag, date. Row is a Link.
- overview-widgets.tsx:23 — news (Link rows). :53 — achievements. :116 — events.
- market-widgets.tsx:44 and :79 — ROWS — free agents and listings. L: PosTag. M: name. S: age/village. R: wage or price plus Rating chip.
- market-widgets.tsx:111 — league transfers.
- club-widgets.tsx:328 — staff. :405 — transfer offers. :429 — watchlist. :381 (?) — trophies grid.
- social-widgets.tsx:27 — rivals (with bars). :98 — squad chemistry. :184 — upcoming dates.
- analysis-widgets.tsx:350 — discipline (bars).
- fan-groups-widgets.tsx:55, :99, :123, :156/:170, :195, :253, :285 (?) — fan groups, core, rivals, favourites, campaigns, damage, chants.
- pub-session.tsx:107 — pub incidents ("divide-y").
- tribuna-widget.tsx:54 — last 5 fan posts.
- Many other widgets render HBarChart (charts/h-bar-chart.tsx), a list of label/value/bar rows (?).

==================== /vice, /trener, misc (?) ====================
- app/(hra)/vice/page.tsx:165 (?) — pending alerts as Link rows (nav-like).
- app/(hra)/trener/test/page.tsx:478 (?) — exam review.
- app/(hra)/trener/skripta:139 — lesson pager (ignore).
- app/(hra)/zapas/BusSelector.tsx:198 (?) — ordered buses rows.


==================== 1. EXISTING REUSABLE LIST-LIKE COMPONENTS ====================
For each: file, export, props signature verbatim, who imports it.

- components/players/squad-table.tsx — SquadTable
  - Signature: `export function SquadTable({ rows, compact, teamColor }: { rows: SquadRow[]; compact?: boolean; teamColor?: string; })`
  - Row type SquadRow: {id?, name, position, rating, age, height?, weight?, foot?, linkHref?}.
  - Div-based sortable table (header buttons with ▲▼).
  - Importers: NONE (dead).
- components/players/PlayerBrowseTable.tsx — PlayerBrowseTable
  - Signature: `export function PlayerBrowseTable({ rows, color, onColorText, ratingColor, columns, onRemove, emptyText, defaultSort = "position" }: { rows: BrowseRow[]; color: string; onColorText: string; ratingColor: string; columns: { club?: boolean; condition?: boolean; form?: boolean; watchedSince?: boolean; price?: boolean; action?: boolean; value?: boolean }; onRemove?: (row: BrowseRow) => void; emptyText?: string; defaultSort?: SortKey; })`
  - Row type BrowseRow: id, firstName, lastName, nickname?, age, position, rating, skills, avatar?, condition?, injury?, club?, form?, watchedSince?, onOpen?, clubLabel?, clubIsAi?, price?, tag?: ReactNode, action?: ReactNode.
  - Importers: app/(hra)/tym/[id]/ForeignSquad.tsx, app/(hra)/prestupy/WatchlistTab.tsx, app/(hra)/prestupy/page.tsx.
- components/players/squad-attribute-table.tsx
  - SquadAttributeTable: `export function SquadAttributeTable({ players, potential = new Map(), promises = new Map() }: { players: Player[]; potential?: PotentialMap; promises?: Map<string, string>; })`
  - PositionFilter: `export function PositionFilter({ players, value, onChange }: { players: Array<{ position: string }>; value: PosFilter; onChange: (value: PosFilter) => void; })`
  - Types: PosFilter, PotentialMap.
  - Importers: app/(hra)/kadr/page.tsx, components/players/u21-attributes.tsx. squad-body-tab.tsx imports only the type PosFilter.
- components/players/player-card.tsx — PlayerCardCompact
  - Signature: `export function PlayerCardCompact({ player, teamColor }: { player: Player; teamColor: string; })`
  - Importers: NONE (dead).
- components/match/fixture-row.tsx
  - FixtureRow: `export function FixtureRow({ home, away, score, kickoff, winner, href, hrefLabel, meta, accent, boardColor }: FixtureRowProps)`
  - FixtureRowProps: {home: FixtureSide; away: FixtureSide; score?: FixtureScore|null; kickoff?: string|null; winner?: "home"|"away"|null; href?: string|null; hrefLabel?: string; meta?: ReactNode; accent?: string|null; boardColor?: string|null}.
  - FixtureGroup: `export function FixtureGroup({ title, note, children }: { title: ReactNode; note?: ReactNode; children: ReactNode })` — renders "card overflow-hidden divide-y divide-gray-100".
  - Importers: app/(hra)/pohar/page.tsx, app/(hra)/turnaj/competition.tsx.
- components/match/round-pager.tsx — RoundPager
  - Signature: `export function RoundPager({ pages, initialKey, accent, children }: { pages: RoundPage[]; initialKey?: string | null; accent?: string | null; children: (key: string) => ReactNode; })`
  - Importers: pohar/page.tsx, turnaj/competition.tsx.
- components/league/league-stats.tsx — LeagueStatsTab
  - Signature: `export function LeagueStatsTab({ data, loaded }: { data: StatsData | null; loaded: boolean })`
  - Internal, not exported: StatTable({title, rows, valueKey, label, decimal?, renderValue?}), TeamTable({title, rows, renderValue}), CuriosityCard.
  - Importers: liga/page.tsx, u21/page.tsx.
- app/(hra)/kadr/page.tsx — PlayerTopList and TopList (local, not exported)
  - `function PlayerTopList({ title, items, valueOf, suffix = "" }: { title: string; items: Player[]; valueOf: (p: Player) => string | number; suffix?: string; })`
  - `function TopList({ title, items, valueOf, suffix = "" }: { title: string; items: PlayerSeasonStats[]; valueOf: (s: PlayerSeasonStats) => string | number; suffix?: string; })`
- components/dashboard/widgets/items/league-widgets.tsx — TopList (local)
  - `function TopList({ data, kind, empty }: { data: WidgetProps["data"]; kind: "goals" | "assists" | "rating"; empty: string })`
- components/dashboard/widgets/items/shared.tsx
  - `export function ScorerRow({ p, i, children }: { p: { playerId: string; name: string; isDeparted?: boolean }; i: number; children: ReactNode; })` — used by league-widgets.
  - `export function MoreLink({ href, children }: { href: string; children: ReactNode })` — used by 9 widget files.
  - `export function FormChip({ result }: { result: string })` — used by league-widgets.
  - `export function AttrPill({ label, value }: { label: string; value: number })` — used by club-widgets; tym/[id] has its own copy.
- components/dashboard/widgets/charts/h-bar-chart.tsx — HBarChart
  - Signature: `export function HBarChart({ data, max, showTrack = true, scale = "magnitude" }: { data: HBarDatum[]; max?: number; showTrack?: boolean; scale?: "magnitude" | "quality"; })`
  - HBarDatum: {label, value, display?, color?, href?, prefix?: ReactNode}.
  - Importers: analysis-, club-, finance-, league-, social-, squad-widgets.
- components/dashboard/widgets/charts/chart-shell.tsx — ChartEmpty: `export function ChartEmpty({ children }: { children: ReactNode })`. Used in 9 widget files.
- components/dashboard/widgets/widget-frame.tsx
  - `export function WidgetSkeleton({ rows = 3 }: { rows?: number })`
  - `export function WidgetError()`
- components/dashboard/widgets/widget-heights.ts — `export function rowsForHeight(height: WidgetHeight, rowPx: number, reservedPx = 0): number` plus ROW_PX.
- app/(hra)/turnaj/competition.tsx — DayBlock: `export function DayBlock({ title, matches, myTeamId, showTags = true }: { title: string; matches: CompetitionMatch[]; myTeamId: string | null; showTags?: boolean })`. Importers: competition.tsx, turnaj/hriste/[id]/page.tsx. Local Standings({rows, advancing, myTeamId, footer}) and MatchRow.
- app/(hra)/pratelaky/friendly-ui.tsx
  - `export function FixtureCard({ date, today, crest, title, status, place, tags, message, warning, actions }: {...})`
  - `export function FriendlyCard({ f, status, children }: { f: FriendlyView; status?: ReactNode; children?: ReactNode })`
  - Also FormChip, StatusPill, ClubCrest, TeamLink, DateTile.
  - Importers: pratelaky/page.tsx, FriendlyRecord.tsx, FriendlyForm.tsx.
- app/(hra)/sazky/ui.tsx
  - `export function Forma({ form }: { form: string[] })`
  - `export function Prazdno({ nadpis, children }: { nadpis: string; children: ReactNode })`
  - Also StavPill, IkonaTipu, Statek, Radek, OddsButton.
  - Importers: sazky/arena, kurzy, page, tiket, tikety, extra-markets.
- app/(hra)/soutez/ui.tsx
  - `export function Empty({ children }: { children: React.ReactNode })`
  - `export function Row({ label, value, strong, danger }: {...})`
  - `export function Rozbaleni({ title, right, note, children }: {...})` — details/summary collapser for long lists.
  - `export function PersonLine({ managerName, coachIsAi = false, teamId, teamName, note }: {...})`
  - Also Portrait, StatusPill, Ornament.
  - Importers: soutez page, panels, discipline, referees-panel, integrity-panel, club-audit-section.
- app/(hra)/prestupy/ObligationsTab.tsx
  - `export function DealCard({ deal, side }: { deal: Deal; side: "paying" | "receiving" })`
  - `export function ClauseRow({ clause, side }: { clause: Clause; side: "owed" | "claim" })`
  - Used only inside the same file.
- components/transfers/AiNegotiationsList.tsx — `export function AiNegotiationsList({ teamId, view }: { teamId: string | null; view: "active" | "closed" })`. Importer: prestupy/page.tsx.
- app/(hra)/tym/[id]/TransferOverview.tsx — `export function TransferOverview({ teamId }: { teamId: string })`. Importer: tym/[id]/page.tsx.
- components/players/promise-card.tsx
  - `export function PromiseCard({ promises }: { promises: PlayerPromiseView[] })` — importer hrac/[id]/page.tsx.
  - PromiseBadge — used by squad-attribute-table.
- components/sponsors/firms-tab.tsx — `export function FirmCard({ firm: f, isOurStadiumSponsor = false }: { firm: DistrictFirm; isOurStadiumSponsor?: boolean })`. Used in firms-tab only.
- components/relations/RelationSection.tsx
  - `export function RelationsOverview({ teamId }: { teamId: string })` (with local PeerRow) and FamilyCard. Importer: manazer/[id].
- components/referees/disciplinary-panel.tsx — DisciplinaryPanel({ teamId }). Importer: rozhodci/page.tsx.
- components/dashboard/gremium-vyveska.tsx
  - `export function GremiumVyveska({ limit = 6 }: { limit?: number })` — importer soutez/page.tsx.
  - DecisionPill — used by soutez/panels.
- Not list components but used in rows:
  - components/ui/position-badge.tsx: PositionBadge, PositionDot.
  - components/ui/entity-link.tsx: EntityLink.
  - components/sponsors/sponsor-link.tsx and favor-badge.tsx.
  - components/ui/section-label.tsx.
  - components/ui/card.tsx: Card, CardBody.
  - BadgePreview (components/ui) for crests.
  - FaceAvatar (components/players/face-avatar.tsx).
  - TeamName and CoachName (components/manager).

==================== 2. HEADER CLASS STRINGS (<thead><tr className=...>) ====================
- "text-left text-label border-b border-gray-200 text-micro uppercase tracking-wide" — 6 files: hrac/[id] ×2, sin-slavy, finance, tym/[id] (results), league-widgets, match-widgets.
- "border-b-2 border-gray-200" — 5 files: kadr ×2, squad-attribute-table, squad-body-tab, liga (StandingsTab), napoveda ×2.
- "border-b-2 border-gray-200 text-muted" — 2 files: liga (PastSeason), pratelaky/FriendlyRecord.
- "text-left border-b border-gray-200" — 2 files: tym/[id] (own squad), PlayerBrowseTable.
- "border-b border-gray-200 text-muted" — 1 file: zapas/page ×3.
- "border-b border-gray-100 text-xs text-muted uppercase" — 1 file: hrac/[id] ×2.
- "border-b border-gray-100 text-sm text-muted uppercase" — 1 file: hrac/[id] (WeightLog).
- "border-b border-gray-100" — 1 file: prestupy (SquadTransferTable).
- "text-muted border-b border-gray-100" — 1 file: zapas (TakerPicker).
- "border-b border-gray-200" — 1 file: fanousci.
- "border-b border-gray-200 text-left text-xs text-gray-500 uppercase" — 1 file: u21.
- "text-xs text-muted uppercase font-heading" — 1 file: pohar/tym/[id].
- "text-micro text-muted uppercase tracking-wide" — 1 file: soutez/club-audit-section.
- "text-left text-xs text-muted font-heading uppercase tracking-wide" — 1 file: prestupy/hostovani/[id].
- No thead at all: league-stats StatTable and TeamTable. They use a title strip "px-4 py-2.5 bg-gray-50 border-b border-gray-100".
- Div header rows (not tables):
  - squad-table.tsx:74 "flex items-center gap-1 px-3 {py} border-b border-gray-200"
  - turnaj/competition.tsx:189 "flex items-center gap-2 px-4 py-2 text-sm text-muted border-b border-gray-100"

Sortable <th> styles also differ:
- kadr and squad-attribute-table: "py-2.5 px-1.5 font-heading uppercase cursor-pointer… text-pitch-600 bg-pitch-50" with ↑↓.
- liga: "py-2.5 px-1.5 text-xs font-heading uppercase cursor-pointer…" with ↑↓.
- PlayerBrowseTable: "pb-2 pr-2 text-sm font-heading font-bold uppercase cursor-pointer…" with ↑↓.
- tym SortHeader: "pb-2 pr-1 text-micro uppercase tracking-wide…" with ▲▼.
- prestupy: "py-2 px-2 text-xs font-heading uppercase cursor-pointer…" with ↑↓.
- u21: a <button className="min-h-11"> inside the th, plus aria-sort.
- squad-table: header buttons with ▲▼.

Row class variants:
- Most common: "border-b border-gray-50 hover:bg-gray-50/50 transition-colors".
- Also "… hover:bg-pitch-50/30", "border-b border-gray-50 last:border-b-0", "border-t border-gray-50", "border-b border-gray-100" (u21).
- The "mine" highlight varies: bg-pitch-50/60, bg-pitch-50/40, bg-pitch-50.

==================== 3. EMPTY-LIST RENDERINGS (counts are of occurrences found) ====================
a) Big card, centered: "card p-8 text-center text-muted" (~10). Examples:
   - liga:510 "Zatím žádné výsledky.", liga:643 "Rozpis není dostupný" / "Žádné odehrané zápasy"
   - league-stats:81/92 "Zatím žádné statistiky."
   - rozpis:250 (with "Odehraj první zápas!"), rozpis:265
   - Variant "card p-8 text-center text-muted text-sm" (~6): pohar:109/232, turnaj/page:182, competition:368/386, hlasovani:222.
   - With icon and heading: prestupy:1442 📭 "Zatím žádné přestupy", zamestnanci:602 👔 "Nikdo volný", BazarTab:105 📦.
b) "card p-6 text-center text-muted" (~6): prestupy:1767/1777 "Žádný hráč neodpovídá…", :2048, :2074, :2112 "Zatím žádná uzavřená jednání.", :2690; ObligationsTab:145.
   - Variant "… text-sm" (4): DemandsTab:154/184/224, pratelaky:142.
   - With a reset button, "card p-6 text-center space-y-3" (3): prestupy:2015, pratelaky:278, skaut:304.
c) Left-aligned card "card p-4 text-sm text-muted" (~6): manazer:370 "Zatím tu nic není.", u21-attributes:38, academy-card:459, u21:418, RelationsOverview:605, hrac:1814.
   - Variant "card p-4 text-sm text-muted text-center" (2): kadr:447 and squad-body-tab:121 "Žádní hráči neodpovídají filtru.".
   - Similar: LoansTab:71 "card p-5 text-sm text-muted", skaut:899 "card p-5 text-center text-muted text-sm", turnaj/hriste:140 "card p-6 text-center text-sm text-muted".
d) Card plus CardBody plus <p className="text-center text-sm text-muted py-3"> (6, all in components/sponsors/*), e.g. "Zatím žádná skončená smlouva.".
   - Similar: sponzor/[id]:139 "text-center text-muted py-3", udalosti:308 "text-center text-muted py-4".
e) Plain <p className="text-sm text-muted"> inside an existing card (most common, roughly 25+). Examples:
   - TransferOverview:55 "Zatím žádné přestupy."
   - hrac:1666, :2309, :2409, :2493
   - prestupy:1248 "Zatím nikdo nepožádal."
   - DemandsTab:241
   - fanousci:832 (as a div)
   - CoachKabinaTab:262, CoachEducationTab:375
   - FanGroupsPanel:396
   - popularity-tab:19/112
   - squad-analysis PersonList:628
   - skaut:506
   - obec:711/772/812, obec/[id]:381
   - soutez panels:173/1023, club-audit:115
   - hospoda:345
   - PlayerBrowseTable:154 (default "Nikdo tu není.")
f) Small centered text inside a card (each about once):
   - "py-4 text-sm text-muted text-center": fanousci:1060 and :1555
   - "py-6 text-sm text-muted text-center": reputace:346
   - "text-center text-muted py-8 text-sm": sin-slavy:127
   - "text-center text-muted text-sm py-8 italic": finance:886 "Zatím žádné transakce."
   - "text-muted text-sm text-center py-8": liga:328
   - "px-4 py-5 text-sm text-muted text-center": turnaj:255
   - "px-4 py-4 text-sm text-muted text-center": pohar:163
   - "px-4 py-4 text-sm text-muted": FriendlyRecord:178
   - "px-3 py-3 text-sm text-muted italic" showing "-": zapas/[id]:560
   - "text-xs text-muted italic" "Všichni dorazili": zapas/[id]:861
   - "text-sm text-muted italic" "Žádná historie": OfferTimeline:82
   - "text-sm text-gray-500": u21:327/366
   - "text-xs text-muted" "Žádná data.": kadr:530/569
g) Empty row inside a table, <tr><td colSpan>:
   - squad-attribute-table:316 "py-6 text-center text-sm text-muted"
   - hrac:1778 "py-4 text-center text-sm text-muted italic"
   - u21:641 "text-center text-gray-500 py-6" ("Žádné odehrané zápasy")
   - zapas:1298 "px-3 py-2 text-sm text-muted"
h) Shared empty components:
   - ChartEmpty "text-sm text-muted text-center py-6" (~40 call sites in 9 widget files).
   - WidgetError "text-sm text-muted py-4 text-center".
   - fan-groups-widgets local Prazdno "text-sm text-muted text-center py-4".
   - tribuna-widget:35 and match-widgets:366/394 use the same shape.
   - league-widgets TopList "text-sm text-muted py-2".
   - sazky/ui Prazdno (card p-8 text-center plus 🎫 plus heading): 4 uses.
   - soutez/ui Empty "card p-5 text-center text-base text-muted" on paper background: ~6 uses.
i) Phone screens:
   - telefon/page:251 "p-6 text-center text-muted" with two <p>; Adresar:199.
   - Tribuna:164 and SocialFeed:1061 add an emoji.
   - Hovory:103 "px-6 py-10 text-center".
   - Oznameni:106 "text-center text-sm text-white/60 mt-10".
j) Newspaper: zpravodaj:814 "text-center text-muted text-sm italic mb-4 py-3"; redakce:148/174 "np-text text-[15px]".
k) No empty state at all (returns null): AiNegotiationsList, FamilyCard, GremiumVyveska, DistrictEvents, PromiseCard, PlayerObligationsCard, FanGroupsPanel recentEvents, prestupy overview sub-lists.

==================== 4. PAGINATION / SHOW-MORE / TRUNCATION ====================
Show-more toggles and collapsing:
- prestupy/page.tsx:468 VYPIS_MAX = 60; :1302 slice; :1756-1758 note "zobrazeno prvních 60". Hard cap, no button.
- hrac/[id]/page.tsx:1316 and :1335-1338 — relationships: first 3, then "Zobrazit všechny (N) →" (one-way).
- hrac/[id]/page.tsx:2285 PREVIEW_ROWS = 8:
  - TrainingDevelopment :2302 and :2363-2366 "Zobrazit všechny (N) →" / "Sbalit".
  - ConditionLog :2486 and :2551-2554, same.
- hrac/[id]/page.tsx:1897-1903 — bench list inside <details> "rozbalit".
- pratelaky/FriendlyRecord.tsx:117 RIVALS_SHOWN = 6; :222 and :226-229 "Všichni rivalové (N)" / "Jen hlavní rivalové". Also :126 ladder slice(0,10) plus "mine" appended.
- zapas/page.tsx:1554-1571 and :1644-1646 — TakerPicker top 5, "Celý kádr (N)" / "Méně".
- zapas/page.tsx:1395-1405 — "a další N…".
- zamestnanci/skaut/page.tsx:909-919 — "Starší hlášení (N) ▲/▼".
- components/relations/RelationSection.tsx:595 and :617-625 — "Ukázat" / "Skrýt" for the others group.
- components/manager/CoachKabinaTab.tsx:197-203 — filter toggle "Jen problémy (N)" / "Ukázat všechny" (?).
- soutez/ui.tsx:178 Rozbaleni — details-based collapse used for long lists (discipline, integrity, club-audit).
- academy-card.tsx:465 — details per age group.

Cursor pagination (the only one):
- telefon/SocialFeed.tsx:983-1001 and :1070-1077 — "Starší příspěvky", using nextBefore; end text "Starší příspěvky už nejsou."
- Inside feed cards: :773-780 "Další přestupy (N)" / "Všechny výsledky (N)" / "Číst dál"; :795-798 "Zobrazit další komentáře (N)".

Per-round pagers:
- RoundPager at pohar/page.tsx:239 and turnaj/competition.tsx:353.
- Hand-rolled prev/next plus <select> at u21/page.tsx:408-416.

Dashboard:
- Every list widget truncates with rowsForHeight (widget-heights.ts:86), e.g. league-widgets:39/276/296, market-widgets:44/79/111, club-widgets:328/381/405/429, overview-widgets:17/47/110, social-widgets:22/92/142/171, match-widgets:337/408, analysis-widgets:344. Each ends with a MoreLink "… →".

Server-side limits with no "load more":
- finance:124/137 transactions limit=50 (the total is shown in the heading)
- fanousci:330 limit=20, :334 limit=60
- hospoda:150 limit=30
- obec:347 limit=20
- manazer:80 limit=25
- Oznameni:62 limit=30
- Tribuna:135 limit=60
- gremium-vyveska limit=6, plus "Všechna rozhodnutí →"

Fixed slices:
- tribuna-widget:54 (5), fan-groups FanTrouble:262 (3), request-section:65 (3)
- prestupy overview biggest slice(1,5) and speculations slice(0,4)
- zpravodaj transferArticles slice(0,9) and promotion slice(0,3)
- disciplinary-panel top-3 then the rest
- MatchBreakdown:140 (5), trenink:945 (8)

==================== 5. POSITION BADGES, RATING NUMBERS, FORM CHIPS ====================
Position
- Shared: components/ui/position-badge.tsx — PositionBadge({position}) and PositionDot({position}). CSS .pos-badge / .pos-dot / .pos-gk|def|mid|fwd in app/globals.css:379-396.
- Used in list code: kadr, tym/[id], hrac/[id], liga (via league-stats), finance, prestupy (+DemandsTab, LoansTab, hostovani, jednani, nabidka PlayerHero), u21, zapas, skaut, CoachKabinaTab, PlayerBrowseTable, squad-attribute-table, squad-body-tab, squad-table, player-card, u21-rozvoj, AiNegotiationsList, ScoutReportSheet.
- Hand-rolled text labels:
  - tym/[id]/page.tsx:20 POS_LABELS (used :480)
  - pohar/tym/[id]/page.tsx:24 POS_LABEL BR/OB/ZÁ/ÚT (:139)
  - obec/[id]/page.tsx:90 POS_LABEL (:442)
  - zapas/[id]/page.tsx:76 POS_LABEL (:524, :573, :895)
  - market-widgets.tsx:12-20 PosTag
  - StaffTaskBox.tsx:41 (:356)
  - telefon/Adresar.tsx:23 POSICE
  - academy-card.tsx:91 POSITION_CS (full words)
  - hrac/[id]/PlayerCompare.tsx:14 POS_SHORT
  - reveal-card.tsx:17/143 uses the .pos-badge class directly
- Raw codes printed: liga:406, prestupy:356 ("{position}·{rating}"), trenink:656, obec:794 and :1050.
- Position colors used other ways: zapas/page.tsx:94 POS_BG squad-number circles; zapas/[id]:631-636 posConfig left borders; squad-attribute-table:57 POS_DOT_COLOR header dots; napoveda:15 POS_COLOR.

Ratings and attribute numbers
- Shared: lib/player-attrs.ts:34 attrBg(value) gives the value-chip background. Used only in squad-attribute-table (VALUE_BADGE "w-8 h-6 rounded") and hrac/[id] AttrRow (:2227).
- Duplicated text-color helpers:
  - attrColor: PlayerBrowseTable.tsx:97, tym/[id]:42, hrac/[id]:75, player-card.tsx:26, zamestnanci:70, manazer/[id]:33
  - zapas/page.tsx:96 attrC and :102 condC
  - prestupy/page.tsx:2807 attrCellColor and :541 skillColor
  - prestupy/nabidka/[id]/components/PlayerHero.tsx:23 skillColor
  - squad-attribute-table:129 condColor
- Overall rating rendering varies:
  - Team-color text: PlayerBrowseTable desktop and tym own table.
  - Team-color chip: PlayerBrowseTable mobile and tym mobile.
  - squad-table: teamColor text. player-card: text-xl readableOnLight.
  - kadr top lists: text-pitch-600 font-[800].
  - market-widgets.tsx:22 Rating chip, thresholds 60/40.
  - Plain bold: SquadTransferTable, zapas, pohar/tym, watchlist widget.
  - Range text via ratingText (components/scouting/WillingnessBadge): AiNegotiationsList, skaut ReportRow.
- Match ratings (1–10), every one hand-rolled:
  - tym/[id]:487 and league-widgets:135 — chip, ≥7 gets bg-pitch-50.
  - zapas/[id]:563-580 and :692-736 — chips, 7.5/6.5 thresholds (pitch-100 / amber-100 / red-100).
  - hrac/[id]:1374 form tiles (7.5/6.5/5.5).
  - hrac/[id]:1725-1765 history text color plus bar.
  - MVP box zapas/[id]:536; flop chip :900.
- Referee grades: lib/referee-info.ts:135 gradeColor, duplicated as a local copy in soutez/referees-panel.tsx:19.
- Morale and condition helpers duplicated: moraleIcon/getMoraleEmoji in tym, hrac, player-card, zapas, squad-attribute-table, StaffTaskBox; conditionLabel in tym, hrac, player-card, dashboard shared.

Form chips (V/R/P)
- Shared, but three different versions:
  - components/dashboard/widgets/items/shared.tsx:93 FormChip({result}). Takes W/D/L, prints V/R/P. w-6 h-6, draw = gray-400. Used by league-widgets SeasonRecordWidget.
  - app/(hra)/pratelaky/friendly-ui.tsx:254 FormChip({result, size}). md/lg sizes, draw = gray-400. Used by FriendlyRecord:159.
  - app/(hra)/sazky/ui.tsx:123 Forma({form}). Takes letters already in V/R/P, w-5 h-5. Colors V pitch-400, R gold-500, P card-red, deliberately matching /liga. Used by sazky/kurzy.
- Hand-rolled:
  - liga/page.tsx:36-40 FORM_COLORS / FORM_LABELS, used at :610-614 (draw = gold-500).
  - tym/[id]/page.tsx:267-270 hero form (draw = gray-500, 18/24px).
  - match-widgets.tsx:324 MiniForm (draw = gray-300).
  - rozpis/page.tsx:86-95 matchResult (round circles, draw = gold-500).
  - fanousci/page.tsx:240 resultBadge (round w-7, takes win/draw/loss) and :248 resultLabel (words).
  - hrac/[id]:1378 letter-only text.
- Score-by-result chips, also hand-rolled:
  - tym/[id]:439-456, hrac/[id]:1723-1756, match-widgets:409-426 (bg pitch-50 / red-50 / gray-50)
  - CupProgressWidget league-widgets:349
  - pohar/tym:108 POSTUP/KONEC
  - FriendlyRecord:239-246 score tile
- zapas/page.tsx:108 FormBadge means something else: "forma ↑/↓" (recent performance), not V/R/P.

Crest and avatar at the left of rows (context):
- Crests: BadgePreview (components/ui), sizes 12–32 everywhere. Wrappers around it: prestupy ClubBadge (:136), friendly-ui ClubCrest, fixture-row Crest. obec uses the clubBadgeSvg string via dangerouslySetInnerHTML.
- Avatars: FaceAvatar with a hand-rolled initials fallback, re-implemented per file (PlayerBrowseTable, tym, sin-slavy, telefon, soutez Portrait, CoachKabinaTab…).
```
