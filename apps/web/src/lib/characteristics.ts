/**
 * Generuje dynamické tagy/charakteristiky hráče relativně k jeho týmu.
 * Spouští se na FE při každém renderu (ne uloženo v DB).
 */

export interface PlayerTag {
  key: string;
  label: string;
  emoji: string;
  color: "green" | "gold" | "red" | "blue" | "purple" | "muted";
  description: string;
  priority: number; // nižší = vyšší priorita
}

interface PlayerInput {
  overall_rating: number;
  age: number;
  position: string;
  skills?: Record<string, number>;
  personality?: Record<string, number>;
  lifeContext?: Record<string, number>;
}

export function generateCharacteristics(
  player: PlayerInput,
  teamPlayers: PlayerInput[],
  maxTags = 3,
): PlayerTag[] {
  const tags: PlayerTag[] = [];
  const rating = player.overall_rating ?? 0;
  const age = player.age;
  const pos = player.position;
  const s = player.skills ?? {};
  const p = player.personality ?? {};

  // ── A) Pozice v kádru (relativní rating) ──
  if (teamPlayers.length >= 3) {
    const ratings = teamPlayers.map((tp) => tp.overall_rating ?? 0).sort((a, b) => a - b);
    const rank = ratings.filter((r) => r < rating).length;
    const percentile = (rank / ratings.length) * 100;

    if (percentile >= 93) {
      tags.push({ key: "star", label: "Hvězda týmu", emoji: "🌟", color: "gold", description: "Nejlepší hráč kádru", priority: 1 });
    } else if (percentile >= 82) {
      tags.push({ key: "key", label: "Klíčový hráč", emoji: "⭐", color: "green", description: "Patří mezi top hráče v týmu", priority: 2 });
    } else if (percentile >= 68) {
      tags.push({ key: "starter", label: "Pravidelný hráč", emoji: "✅", color: "green", description: "Stabilní člen základní sestavy", priority: 5 });
    } else if (percentile < 18 && age > 30) {
      tags.push({ key: "ballast", label: "Doplněk kádru", emoji: "⚠️", color: "red", description: "Stárnoucí hráč pod úrovní týmu", priority: 20 });
    } else if (percentile < 30) {
      tags.push({ key: "bench", label: "Náhradník", emoji: "🪑", color: "muted", description: "Čeká na šanci v základu", priority: 15 });
    }
  }

  // ── B) Věk + talent ──
  if (age < 20 && rating > age * 2.8) {
    tags.push({ key: "talent", label: "Velký talent", emoji: "💎", color: "blue", description: `V ${age} letech nadprůměrný rating ${rating}`, priority: 3 });
  } else if (age >= 20 && age <= 23) {
    const avgRating = teamPlayers.length > 0 ? teamPlayers.reduce((sum, tp) => sum + (tp.overall_rating ?? 0), 0) / teamPlayers.length : 50;
    if (rating > avgRating * 1.1) {
      tags.push({ key: "rising", label: "Vycházející hvězda", emoji: "🚀", color: "blue", description: "Mladý hráč s nadprůměrným výkonem", priority: 4 });
    }
  }
  if (age >= 30 && age <= 34 && rating > 45) {
    tags.push({ key: "veteran", label: "Zkušený veterán", emoji: "🧓", color: "muted", description: "Přináší zkušenosti a stabilitu", priority: 10 });
  }
  if (age >= 35 && rating > 40) {
    tags.push({ key: "legend", label: "Legenda klubu", emoji: "🏆", color: "gold", description: "Stále naskakuje i ve veteránském věku", priority: 8 });
  }
  if (age >= 35 && rating < 35) {
    tags.push({ key: "declining", label: "Dosluhující veterán", emoji: "👴", color: "red", description: "Nejlepší léta má za sebou", priority: 18 });
  }

  // ── C) Specifické role (podle skills) ──
  if (pos === "FWD" && (s.shooting ?? 0) > 65) {
    tags.push({ key: "scorer", label: "Gólový stroj", emoji: "⚽", color: "gold", description: `Střelba ${s.shooting}`, priority: 6 });
  }
  if (pos === "MID" && ((s.passing ?? 0) + (s.vision ?? 0)) / 2 > 60) {
    tags.push({ key: "playmaker", label: "Tvůrce hry", emoji: "🎨", color: "purple", description: `Přihrávky ${s.passing}, přehled ${s.vision ?? "?"}`, priority: 6 });
  }
  if (pos === "DEF" && ((s.defense ?? 0) + (s.heading ?? 0)) / 2 > 60) {
    tags.push({ key: "rock", label: "Skála obrany", emoji: "🛡️", color: "green", description: `Obrana ${s.defense}, hlavičky ${s.heading}`, priority: 6 });
  }
  if (pos === "GK" && (s.goalkeeping ?? 0) > 60) {
    tags.push({ key: "keeper", label: "Klíčový brankář", emoji: "🧤", color: "green", description: `Brankář ${s.goalkeeping}`, priority: 6 });
  }
  if ((s.speed ?? 0) > 75) {
    tags.push({ key: "fast", label: "Blesk", emoji: "⚡", color: "blue", description: `Rychlost ${s.speed}`, priority: 9 });
  }
  if ((s.stamina ?? 0) > 70 && (p.workRate ?? 50) > 65) {
    tags.push({ key: "engine", label: "Motor týmu", emoji: "🔋", color: "green", description: "Vysoká výdrž a pracovitost", priority: 9 });
  }

  // ── D) Hidden traits / osobnost ──
  if ((p.consistency ?? 50) > 72) {
    tags.push({ key: "reliable", label: "Spolehlivý", emoji: "📏", color: "green", description: "Konzistentní výkony bez výkyvů", priority: 11 });
  }
  if ((p.consistency ?? 50) < 28) {
    tags.push({ key: "wildcard", label: "Nevyzpytatelný", emoji: "🎲", color: "gold", description: "Jednou génius, podruhé neviditelný", priority: 12 });
  }
  if ((p.clutch ?? 50) > 75) {
    tags.push({ key: "clutch", label: "Rozhodující hráč", emoji: "🔥", color: "gold", description: "Dává góly v klíčových momentech", priority: 7 });
  }
  if ((p.leadership ?? 30) > 70) {
    tags.push({ key: "leader", label: "Vůdce kabiny", emoji: "👑", color: "purple", description: "Vysoký leadership, materiál na kapitána", priority: 5 });
  }
  if ((p.alcohol ?? 30) > 68) {
    tags.push({ key: "drinker", label: "Alkáč", emoji: "🍺", color: "red", description: "Vysoký alkoholismus → riziko absence po výhře", priority: 14 });
  }
  if ((p.discipline ?? 50) < 28) {
    tags.push({ key: "undisciplined", label: "Nedisciplinovaný", emoji: "😠", color: "red", description: "Nízká disciplína → častější absence a karty", priority: 13 });
  }
  if ((p.injuryProneness ?? 30) > 68) {
    tags.push({ key: "fragile", label: "Skleněný", emoji: "🩹", color: "red", description: "Vysoký sklon ke zranění", priority: 14 });
  }

  // Seřadit dle priority (nižší číslo = vyšší priorita), oříznout na max
  tags.sort((a, b) => a.priority - b.priority);
  return tags.slice(0, maxTags);
}
