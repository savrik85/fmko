/**
 * Katalog widgetů — jediné místo, kde se widget „existuje".
 *
 * Backend katalog nezná: validuje jen tvar layoutu. Nový widget je proto čistě
 * frontendová změna (soubor v items/ + řádek tady) a neznámé id z uloženého
 * layoutu se při renderu prostě přeskočí.
 */

import type { WidgetCategory, WidgetDef } from "./types";

import { TodayProgramWidget, NextMatchWidget, FixturesWidget, RecentMatchesWidget } from "./items/match-widgets";
import {
  StandingsWidget, SeasonRecordWidget, TopScorersWidget, TopAssistsWidget, TopRatedWidget,
  ResultsDonutWidget, PointsProgressionWidget, GoalsPerRoundWidget, HomeAwaySplitWidget,
  LeagueScorersWidget, LeagueCardsWidget, CupProgressWidget, SeasonHistoryWidget,
} from "./items/league-widgets";
import {
  SquadStatusWidget, SquadPositionsWidget, SquadAgeWidget, SquadSkillsWidget,
  ConditionRankingWidget, MoraleRankingWidget, SquadValueWidget, WageStructureWidget, InjuriesWidget,
} from "./items/squad-widgets";
import {
  BudgetSummaryWidget, BudgetForecastWidget, BudgetHistoryWidget,
  IncomeBreakdownWidget, ExpenseBreakdownWidget, SponsorsWidget, ConcessionRevenueWidget,
} from "./items/finance-widgets";
import {
  FanSatisfactionWidget, FanSatisfactionHistoryWidget, FanbaseHistoryWidget,
  AttendanceHistoryWidget, StadiumRadarWidget,
} from "./items/fans-widgets";
import {
  ManagerCardWidget, ManagerRadarWidget, ManagerHistoryWidget, ReputationWidget,
  TrainingBreakdownWidget, TopImproversWidget, TrainingAttendanceWidget,
  EquipmentWidget, StaffWidget, U21Widget, TrophiesWidget, TransferOffersWidget, WatchlistWidget,
} from "./items/club-widgets";
import { NewsWidget, AchievementsWidget, HallOfFameWidget, EventsWidget } from "./items/overview-widgets";
import { PubSessionWidget } from "./items/pub-session";

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  prehled: "Přehled",
  kadr: "Kádr",
  zapasy: "Zápasy",
  liga: "Liga",
  finance: "Finance",
  fanousci: "Fanoušci",
  klub: "Klub",
};

export const CATEGORY_ORDER: WidgetCategory[] = ["prehled", "zapasy", "liga", "kadr", "finance", "fanousci", "klub"];

export const WIDGETS: WidgetDef[] = [
  // ── Přehled ───────────────────────────────────────────────────────────────
  {
    id: "today-program", title: "Dnešní program", icon: "📆", category: "prehled",
    description: "Zápasový, tréninkový nebo volný den podle herního kalendáře.",
    defaultWidth: 3, needs: ["team", "schedule"], Component: TodayProgramWidget,
  },
  {
    id: "news", title: "Zpravodaj", icon: "📰", category: "prehled",
    description: "Posledních pět článků o klubu a lize.",
    defaultWidth: 1, needs: ["news"], Component: NewsWidget,
  },
  {
    id: "achievements", title: "Naposledy odemčené úspěchy", icon: "🏅", category: "prehled",
    description: "Tři nejčerstvější odemčené úspěchy.",
    defaultWidth: 2, needs: ["achievements"], Component: AchievementsWidget,
  },
  {
    id: "hall-of-fame", title: "Síň slávy", icon: "👑", category: "prehled",
    description: "Tvoje pořadí mezi lidskými trenéry a počet medailí.",
    defaultWidth: 1, needs: ["hallOfFame", "team"], Component: HallOfFameWidget,
  },
  {
    id: "events", title: "Události", icon: "🎪", category: "prehled",
    description: "Co klub čeká — sezónní události, které ještě čekají na rozhodnutí.",
    defaultWidth: 1, needs: ["events"], Component: EventsWidget,
  },
  {
    id: "pub-session", title: "U nás v hospodě", icon: "🍺", category: "prehled",
    description: "Kdo včera seděl v hospodě a co se tam semlelo.",
    defaultWidth: 3, needs: ["pubSession", "team"], bare: true, Component: PubSessionWidget,
  },

  // ── Zápasy ────────────────────────────────────────────────────────────────
  {
    id: "next-match", title: "Další zápas", icon: "⚽", category: "zapasy",
    description: "Podrobný náhled nejbližšího zápasu — forma, srovnání kádrů, počasí.",
    defaultWidth: 1, needs: ["team", "schedule", "preview"], Component: NextMatchWidget,
  },
  {
    id: "fixtures", title: "Rozpis", icon: "🗓", category: "zapasy",
    description: "Čtyři nejbližší zápasy a stav sestavy u každého.",
    defaultWidth: 1, needs: ["schedule"], Component: FixturesWidget,
  },
  {
    id: "recent-matches", title: "Poslední zápasy", icon: "📋", category: "zapasy",
    description: "Pět posledních výsledků se soupeřem a skóre.",
    defaultWidth: 1, needs: ["matchResults"], Component: RecentMatchesWidget,
  },
  {
    id: "attendance-history", title: "Návštěvnost", icon: "🎟", category: "zapasy",
    description: "Sloupcový graf návštěv domácích zápasů proti kapacitě stadionu.",
    defaultWidth: 2, needs: ["matchResults", "fanbase"], Component: AttendanceHistoryWidget,
  },

  // ── Liga ──────────────────────────────────────────────────────────────────
  {
    id: "standings", title: "Tabulka", icon: "🏆", category: "liga",
    description: "Prvních osm týmů ligy, tvůj tým zvýrazněný.",
    defaultWidth: 1, needs: ["standings"], Component: StandingsWidget,
  },
  {
    id: "season-record", title: "Bilance", icon: "📊", category: "liga",
    description: "Umístění, body, výhry/remízy/prohry, skóre a forma.",
    defaultWidth: 1, needs: ["standings", "matchResults", "team"], Component: SeasonRecordWidget,
  },
  {
    id: "results-donut", title: "Výhry a prohry", icon: "🥧", category: "liga",
    description: "Prstencový graf poměru výher, remíz a proher.",
    defaultWidth: 1, needs: ["matchResults"], Component: ResultsDonutWidget,
  },
  {
    id: "points-progression", title: "Vývoj bodů", icon: "📈", category: "liga",
    description: "Spojnicový graf kumulativních bodů po kolech.",
    defaultWidth: 2, needs: ["matchResults"], Component: PointsProgressionWidget,
  },
  {
    id: "goals-per-round", title: "Góly po kolech", icon: "🥅", category: "liga",
    description: "Vstřelené proti inkasovaným v posledních dvanácti kolech.",
    defaultWidth: 2, needs: ["matchResults"], Component: GoalsPerRoundWidget,
  },
  {
    id: "home-away-split", title: "Doma a venku", icon: "🏟", category: "liga",
    description: "Jak se týmu daří doma a jak na hřištích soupeřů.",
    defaultWidth: 1, needs: ["matchResults"], Component: HomeAwaySplitWidget,
  },
  {
    id: "top-scorers", title: "Střelci", icon: "👟", category: "liga",
    description: "Pět nejlepších střelců tvého týmu.",
    defaultWidth: 1, needs: ["matchResults"], Component: TopScorersWidget,
  },
  {
    id: "top-assists", title: "Nahrávači", icon: "🎯", category: "liga",
    description: "Pět hráčů s nejvíc asistencemi.",
    defaultWidth: 1, needs: ["matchResults"], Component: TopAssistsWidget,
  },
  {
    id: "top-rated", title: "Hodnocení", icon: "⭐", category: "liga",
    description: "Pět nejlépe hodnocených hráčů sezóny.",
    defaultWidth: 1, needs: ["matchResults"], Component: TopRatedWidget,
  },
  {
    id: "league-scorers", title: "Střelci ligy", icon: "🔥", category: "liga",
    description: "Kanonýři celé ligy, tvoji hráči barevně odlišení.",
    defaultWidth: 1, needs: ["leagueStats"], Component: LeagueScorersWidget,
  },
  {
    id: "league-cards", title: "Karty v lize", icon: "🟨", category: "liga",
    description: "Kdo v lize sbírá nejvíc žlutých a červených.",
    defaultWidth: 1, needs: ["leagueStats"], Component: LeagueCardsWidget,
  },
  {
    id: "cup-progress", title: "Pohár", icon: "🏆", category: "liga",
    description: "Jak daleko jste došli a jaké byly pohárové zápasy.",
    defaultWidth: 1, needs: ["cup"], Component: CupProgressWidget,
  },
  {
    id: "season-history", title: "Umístění po sezónách", icon: "🕰", category: "liga",
    description: "Spojnicový graf konečných umístění klubu napříč sezónami.",
    defaultWidth: 2, needs: ["seasonHistory"], Component: SeasonHistoryWidget,
  },

  // ── Kádr ──────────────────────────────────────────────────────────────────
  {
    id: "squad-status", title: "Stav kádru", icon: "👥", category: "kadr",
    description: "Počet hráčů, kondice, rating, morálka a rozpad podle postů.",
    defaultWidth: 1, needs: ["players", "team"], Component: SquadStatusWidget,
  },
  {
    id: "squad-positions", title: "Složení kádru", icon: "🧩", category: "kadr",
    description: "Kolik máš brankářů, obránců, záložníků a útočníků a jak jsou dobří.",
    defaultWidth: 1, needs: ["players"], Component: SquadPositionsWidget,
  },
  {
    id: "squad-age", title: "Věková struktura", icon: "🎂", category: "kadr",
    description: "Sloupcový graf věkových pásem kádru.",
    defaultWidth: 1, needs: ["players"], Component: SquadAgeWidget,
  },
  {
    id: "squad-skills", title: "Dovednosti kádru", icon: "🕸", category: "kadr",
    description: "Radar průměrných dovedností hráčů do pole.",
    defaultWidth: 1, needs: ["players"], Component: SquadSkillsWidget,
  },
  {
    id: "condition-ranking", title: "Kondice hráčů", icon: "🔋", category: "kadr",
    description: "Kdo je nejvíc odrovnaný — šest nejhorších kondic v kádru.",
    defaultWidth: 1, needs: ["players"], Component: ConditionRankingWidget,
  },
  {
    id: "morale-ranking", title: "Morálka hráčů", icon: "😤", category: "kadr",
    description: "Šest hráčů s nejhorší náladou v kabině.",
    defaultWidth: 1, needs: ["players"], Component: MoraleRankingWidget,
  },
  {
    id: "squad-value", title: "Hodnota kádru", icon: "💎", category: "kadr",
    description: "Odhad tržní hodnoty kádru a nejcennější hráči.",
    defaultWidth: 1, needs: ["players", "team"], Component: SquadValueWidget,
  },
  {
    id: "injuries", title: "Zranění", icon: "🩹", category: "kadr",
    description: "Kdo je mimo hru a na jak dlouho.",
    defaultWidth: 1, needs: ["injuries"], Component: InjuriesWidget,
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  {
    id: "budget-summary", title: "Rozpočet", icon: "💰", category: "finance",
    description: "Aktuální stav klubové pokladny.",
    defaultWidth: 1, needs: ["team"], Component: BudgetSummaryWidget,
  },
  {
    id: "budget-forecast", title: "Prognóza rozpočtu", icon: "📉", category: "finance",
    description: "Kam se rozpočet vyvine za šestnáct týdnů při současné bilanci.",
    defaultWidth: 2, needs: ["budget"], Component: BudgetForecastWidget,
  },
  {
    id: "budget-history", title: "Vývoj rozpočtu", icon: "📈", category: "finance",
    description: "Skutečný zůstatek na účtu po jednotlivých pohybech.",
    defaultWidth: 2, needs: ["transactions"], Component: BudgetHistoryWidget,
  },
  {
    id: "income-breakdown", title: "Struktura příjmů", icon: "🪙", category: "finance",
    description: "Odkud týdně tečou peníze — sponzoři, dotace, příspěvky.",
    defaultWidth: 1, needs: ["budget"], Component: IncomeBreakdownWidget,
  },
  {
    id: "expense-breakdown", title: "Struktura výdajů", icon: "🧾", category: "finance",
    description: "Kam týdně mizí peníze — mzdy, údržba, vybavení, trénink.",
    defaultWidth: 1, needs: ["budget"], Component: ExpenseBreakdownWidget,
  },
  {
    id: "wage-structure", title: "Mzdová struktura", icon: "💸", category: "finance",
    description: "Jak se mzdový rozpočet dělí mezi posty.",
    defaultWidth: 1, needs: ["wages"], Component: WageStructureWidget,
  },
  {
    id: "sponsors", title: "Sponzoři", icon: "🤝", category: "finance",
    description: "Aktivní smlouvy a jejich měsíční plnění.",
    defaultWidth: 1, needs: ["sponsors", "team"], Component: SponsorsWidget,
  },
  {
    id: "concession-revenue", title: "Tržby ze stánku", icon: "🌭", category: "finance",
    description: "Tržba a zisk z občerstvení po jednotlivých zápasech.",
    defaultWidth: 2, needs: ["concessionSales"], Component: ConcessionRevenueWidget,
  },

  // ── Fanoušci ──────────────────────────────────────────────────────────────
  {
    id: "fan-satisfaction", title: "Spokojenost fanoušků", icon: "😀", category: "fanousci",
    description: "Ciferníky spokojenosti a loajality včetně dopadu posledního zápasu.",
    defaultWidth: 1, needs: ["fans"], Component: FanSatisfactionWidget,
  },
  {
    id: "fan-satisfaction-history", title: "Vývoj spokojenosti", icon: "📉", category: "fanousci",
    description: "Jak se nálada fanoušků měnila zápas po zápase.",
    defaultWidth: 2, needs: ["fansHistory"], Component: FanSatisfactionHistoryWidget,
  },
  {
    id: "fanbase-history", title: "Fanouškovská základna", icon: "📣", category: "fanousci",
    description: "Skládaný graf vývoje tvrdého jádra, stálých a příležitostných.",
    defaultWidth: 2, needs: ["fanbaseHistory"], Component: FanbaseHistoryWidget,
  },
  {
    id: "stadium-radar", title: "Stadion", icon: "🏟", category: "fanousci",
    description: "Radar vybavenosti stadionu, kapacita a stav hřiště.",
    defaultWidth: 1, needs: ["stadium"], Component: StadiumRadarWidget,
  },

  // ── Klub ──────────────────────────────────────────────────────────────────
  {
    id: "manager-card", title: "Trenér", icon: "🧑‍🏫", category: "klub",
    description: "Portrét trenéra a jeho čtyři hlavní atributy.",
    defaultWidth: 1, needs: ["manager", "team"], Component: ManagerCardWidget,
  },
  {
    id: "manager-radar", title: "Atributy trenéra", icon: "🕸", category: "klub",
    description: "Radar všech šesti trenérských atributů.",
    defaultWidth: 1, needs: ["manager"], Component: ManagerRadarWidget,
  },
  {
    id: "manager-history", title: "Vývoj trenéra", icon: "📈", category: "klub",
    description: "Jak se v čase měnily nejaktivnější atributy trenéra.",
    defaultWidth: 2, needs: ["managerHistory"], Component: ManagerHistoryWidget,
  },
  {
    id: "reputation", title: "Reputace klubu", icon: "🌟", category: "klub",
    description: "Ciferník reputace a její vývoj podle audit logu.",
    defaultWidth: 1, needs: ["reputation"], Component: ReputationWidget,
  },
  {
    id: "training-breakdown", title: "Trénink podle atributů", icon: "🏋️", category: "klub",
    description: "Kde trénink přidává a kde naopak ubírá.",
    defaultWidth: 2, needs: ["trainingStats"], Component: TrainingBreakdownWidget,
  },
  {
    id: "top-improvers", title: "Kdo nejvíc roste", icon: "🚀", category: "klub",
    description: "Pět hráčů, kteří z tréninku vytěžili nejvíc.",
    defaultWidth: 1, needs: ["trainingStats"], Component: TopImproversWidget,
  },
  {
    id: "training-attendance", title: "Docházka na trénink", icon: "✅", category: "klub",
    description: "Docházka celého kádru a kdo ji nejvíc kazí.",
    defaultWidth: 1, needs: ["attendance", "team"], Component: TrainingAttendanceWidget,
  },
  {
    id: "equipment", title: "Vybavení", icon: "🧰", category: "klub",
    description: "Nejopotřebovanější kusy vybavení a jejich stav.",
    defaultWidth: 1, needs: ["equipment"], Component: EquipmentWidget,
  },
  {
    id: "staff", title: "Zaměstnanci", icon: "👔", category: "klub",
    description: "Obsazené role v realizačním týmu a jejich mzdy.",
    defaultWidth: 1, needs: ["staff"], Component: StaffWidget,
  },
  {
    id: "u21", title: "Mládež U21", icon: "🌱", category: "klub",
    description: "Nejlepší talenti mládežnického týmu.",
    defaultWidth: 1, needs: ["u21"], Component: U21Widget,
  },
  {
    id: "trophies", title: "Vitrína trofejí", icon: "🏆", category: "klub",
    description: "Co klub vyhrál.",
    defaultWidth: 1, needs: ["trophies"], Component: TrophiesWidget,
  },
  {
    id: "transfer-offers", title: "Nabídky na hráče", icon: "📨", category: "klub",
    description: "Příchozí nabídky, které čekají na tvoje rozhodnutí.",
    defaultWidth: 1, needs: ["offers"], Component: TransferOffersWidget,
  },
  {
    id: "watchlist", title: "Sledovaní hráči", icon: "👁", category: "klub",
    description: "Hráči, které máš na seznamu.",
    defaultWidth: 1, needs: ["watchlist"], Component: WatchlistWidget,
  },
];

const BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

/** Definice widgetu, nebo undefined u neznámého id z uloženého layoutu. */
export function getWidget(id: string): WidgetDef | undefined {
  return BY_ID.get(id);
}
