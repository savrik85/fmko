/**
 * Jak moc diváci právě prožívají dění na hřišti (0 klid, 1 gól jejich týmu, -1 inkasovaný gól), zvlášť domácí a hosté. Zapisuje ho záznam zápasu
 * každý snímek, čte dav na tribunách a sektor hostů. Mimo záznam je pořád 0 a dav se chová jako dřív.
 */
export const crowdMood = { home: 0, away: 0 };

/**
 * Jak silně (0–1) reaguje jeden divák. Každý má svůj práh `keen` (0–1): při gólu se zvedne většina tribuny,
 * při šanci jen pár lidí, a nikdy všichni naráz.
 */
export const crowdLift = (mood: number, keen: number) => Math.min(1, Math.max(0, (mood * 0.8 - keen) * 4));
