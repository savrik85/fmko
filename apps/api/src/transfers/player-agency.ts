/**
 * Hráčská agentura — rozhodování volného hráče, jestli podepíše.
 * Faktory: reputace, vzdálenost, velikost kádru, mzda, patriotismus.
 */

import type { Rng } from "../generators/rng";

export interface AgencyFactor {
  name: string;
  value: number;
  detail: string;
}

export interface AgencyDecision {
  accepted: boolean;
  probability: number;
  explanation: string;
  factors: AgencyFactor[];
}

/** Haversine distance in km */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function evaluateSigningChance(
  agent: { weekly_wage: number; personality: Record<string, number>; village_id?: string | null; district?: string | null },
  team: { reputation: number; villageLat: number; villageLon: number; squadSize: number; district?: string | null },
  agentVillage: { lat: number; lng: number } | null,
  offeredWage: number,
  rng: Rng,
): AgencyDecision {
  const factors: AgencyFactor[] = [];

  // ── Celebrity override — special rejection logic ──
  const celebType = agent.personality?.celebrityType as unknown as string | undefined;
  const celebTier = agent.personality?.celebrityTier as unknown as string | undefined;
  if (celebType) {
    let distKm = 0;
    if (agentVillage) {
      distKm = haversineKm(team.villageLat, team.villageLon, agentVillage.lat, agentVillage.lng);
    }
    // Base rejection by type/tier
    const baseReject: Record<string, number> = { S: 30, A: 20, B: 10, C: 5 };
    let rejectChance = celebType === "legend"
      ? (baseReject[celebTier ?? "C"] ?? 10)
      : 10; // fallen_star/glass_man are more humble
    // Distance penalty: +2% per km over 5km for legends, +1% for others
    const distPenalty = celebType === "legend"
      ? Math.max(0, (distKm - 5) * (celebTier === "S" ? 2 : 1.5))
      : Math.max(0, (distKm - 5) * 1);
    rejectChance += distPenalty;
    // Reputation bonus
    rejectChance -= Math.max(0, Math.min(15, (team.reputation - 50)));
    // Capacity bonus (handled via reputation already)
    rejectChance = Math.max(5, Math.min(60, rejectChance)); // cap 5-60%

    const celebRejectReasons = [
      "Je to moc daleko, nechce se mu dojíždět.",
      "Říká, že by to bylo pod jeho úroveň.",
      "Prý se mu nelíbí vaše zázemí.",
      "Čeká na lepší nabídku.",
      "Říká, že ho nebaví jezdit po okresu.",
      "Nesedl mu trenér na první schůzce.",
      "Řekl, že si to ještě rozmyslí. Pak přestal brát telefon.",
      "Prý mu to kamarád z repre nedoporučil.",
    ];
    const celebAcceptReasons = [
      "Říká, že se těší na kluky. Prý to bude sranda.",
      "Kývnul! Prý mu připomíná jeho začátky.",
      "Souhlasí — říká, že okresní fotbal je jiný level a chce to zažít.",
      "Podepsal! Prý je rád, že si zase může zahrát.",
    ];

    if (rng.random() * 100 < rejectChance) {
      return {
        accepted: false,
        probability: Math.round(100 - rejectChance),
        explanation: rng.pick(celebRejectReasons),
        factors: [{ name: "Celebrita", value: -Math.round(rejectChance), detail: `${celebType === "legend" ? `Tier ${celebTier}` : celebType} — má nároky` }],
      };
    }
    return {
      accepted: true,
      probability: Math.round(100 - rejectChance),
      explanation: rng.pick(celebAcceptReasons),
      factors: [{ name: "Celebrita", value: Math.round(100 - rejectChance), detail: "Podepsal!" }],
    };
  }

  let total = 40; // base

  // 1. Reputace týmu (-15 až +25)
  const repScore = Math.max(-15, Math.min(25, (team.reputation - 30) * 0.5));
  total += repScore;
  factors.push({
    name: "Reputace",
    value: Math.round(repScore),
    detail: team.reputation >= 60 ? "Klub má dobré jméno" : team.reputation >= 40 ? "Průměrný klub" : "O klubu moc neslyšel",
  });

  // 2. Vzdálenost (-20 až +15)
  let distScore = 0;
  let distKm = 0;
  if (agentVillage) {
    distKm = haversineKm(team.villageLat, team.villageLon, agentVillage.lat, agentVillage.lng);
    if (distKm < 5) distScore = 15;
    else if (distKm < 15) distScore = 5;
    else if (distKm < 30) distScore = 0;
    else if (distKm < 50) distScore = -10;
    else distScore = -20;
  }
  total += distScore;
  factors.push({
    name: "Vzdálenost",
    value: distScore,
    detail: distKm < 5 ? "Bydlí blízko" : distKm < 15 ? `${Math.round(distKm)} km — ujde to` : distKm < 30 ? `${Math.round(distKm)} km — dost daleko` : `${Math.round(distKm)} km — moc daleko`,
  });

  // 3. Velikost kádru (-15 až +5)
  const sqScore = team.squadSize < 15 ? 5 : team.squadSize <= 20 ? 0 : team.squadSize <= 25 ? -10 : -15;
  total += sqScore;
  factors.push({
    name: "Kádr",
    value: sqScore,
    detail: team.squadSize < 15 ? "Tým potřebuje hráče" : team.squadSize <= 20 ? "Normální kádr" : "Přeplněný kádr",
  });

  // 4. Mzda (-20 až +15)
  const expectedWage = agent.weekly_wage || 50;
  const wageRatio = offeredWage / expectedWage;
  const wageScore = Math.max(-20, Math.min(15, Math.round((wageRatio - 1) * 30)));
  total += wageScore;
  factors.push({
    name: "Mzda",
    value: wageScore,
    detail: wageRatio >= 1.3 ? "Štědrá nabídka" : wageRatio >= 0.9 ? "Slušná mzda" : "Nízká nabídka",
  });

  // 5. Patriotismus (-10 až +10)
  const patriotism = agent.personality?.patriotism ?? 50;
  const patScore = patriotism >= 70 && distKm < 10 ? 10 : patriotism >= 50 ? 3 : patriotism >= 30 ? 0 : -5;
  total += patScore;
  factors.push({
    name: "Patriotismus",
    value: patScore,
    detail: patriotism >= 70 ? "Lokální patriot" : patriotism < 30 ? "Nezáleží mu na klubu" : "Normální přístup",
  });

  // 6. Meziligový přestup (-15 až -25, patrioti -30)
  const agentDistrict = agent.district ?? null;
  const teamDistrict = team.district ?? null;
  const isCrossDistrict = agentDistrict && teamDistrict && agentDistrict !== teamDistrict;
  if (isCrossDistrict) {
    const crossPenalty = patriotism >= 70 ? -30 : rng.int(-25, -15);
    total += crossPenalty;
    factors.push({
      name: "Jiný okres",
      value: crossPenalty,
      detail: patriotism >= 70 ? "Lokální patriot — nechce pryč z regionu" : "Nechce se stěhovat do jiného okresu",
    });
  }

  // 7. Náhoda (-10 až +10)
  const randomScore = rng.int(-10, 10);
  total += randomScore;

  const probability = Math.max(5, Math.min(95, total));
  const accepted = rng.random() * 100 < probability;

  // České vysvětlení
  const name = "Hráč";
  let explanation: string;
  if (accepted) {
    const reasons = [
      "Prý se mu líbí, že tady mají dobré pivo u hřiště.",
      "Říkal, že to zná z vyprávění. Těší se.",
      "Souhlasí! Přijde na nejbližší trénink.",
      "Kývnul. Prý mu to kamarád doporučil.",
      "Souhlasí — prý lepší než sedět doma.",
    ];
    explanation = rng.pick(reasons);
  } else {
    // Pick reason based on worst factor
    const worst = factors.reduce((a, b) => a.value < b.value ? a : b);
    if (worst.name === "Vzdálenost") {
      explanation = rng.pick([
        `Dojíždět ${Math.round(distKm)} km na trénink? To prý ne.`,
        `Řekl, že tak daleko nejezdí ani do práce.`,
        `Odmítl — prý nemá auto a autobusem to netrefí.`,
      ]);
    } else if (worst.name === "Mzda") {
      explanation = rng.pick([
        `Smál se nabídce. Za tolik prý nepřijde ani na brigádu.`,
        `Řekl, že jinde dostane víc.`,
        `Odmítl — mzda mu nestojí za námahu.`,
      ]);
    } else if (worst.name === "Reputace") {
      explanation = rng.pick([
        `O vašem klubu prý neslyšel. Zkusí to jinde.`,
        `Říkal, že chce do lepšího týmu.`,
        `Odmítl — prý nemáte dost dobrou pověst.`,
      ]);
    } else if (worst.name === "Jiný okres") {
      explanation = rng.pick([
        `Řekl, že do jiného okresu se mu nechce. Má to tu rád.`,
        `Odmítl — prý nechce dojíždět tak daleko.`,
        `Říkal, že všichni jeho kamarádi hrajou tady. Proč by měnil?`,
      ]);
    } else if (worst.name === "Kádr") {
      explanation = rng.pick([
        `Nechce sedět na lavičce s dalšími 25 chlapy.`,
        `Řekl, že u vás by stejně nehrál.`,
      ]);
    } else {
      explanation = rng.pick([
        `Řekl, že si to ještě rozmyslí. Pak přestal zvedat telefon.`,
        `Odmítl bez udání důvodu.`,
        `Prý má jiné plány.`,
      ]);
    }
  }

  return { accepted, probability, explanation, factors };
}
