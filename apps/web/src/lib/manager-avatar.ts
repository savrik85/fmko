// facesjs config generator pro trenera. Pouzito pri onboardingu a pri editaci profilu.

export function generateManagerFace(): Record<string, unknown> {
  const r = () => Math.random();
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)];

  const skinColors = ["#f2d6cb", "#ddb7a0", "#e8c4a0", "#f5d5c0", "#d4a882"];
  const hairColors = ["#3b2214", "#5b3a1a", "#8b6e3e", "#8e8e8e", "#b0b0b0"];
  const headIds = ["head1", "head3", "head6", "head8", "head9", "head10", "head11", "head13"];
  const eyeIds = ["eye1", "eye3", "eye6", "eye9", "eye11", "eye13"];
  const noseIds = ["nose1", "nose2", "nose6", "nose9", "nose13", "honker"];
  const mouthIds = ["mouth", "mouth2", "mouth3", "smile3", "straight", "closed"];
  const hairIds = ["short-fade", "crop-fade2", "spike4", "short-bald"];
  const earIds = ["ear1", "ear2", "ear3"];
  const eyebrowIds = ["eyebrow2", "eyebrow3", "eyebrow7", "eyebrow10", "eyebrow14"];

  const skinColor = pick(skinColors);
  const bald = r() < 0.35;

  return {
    fatness: 0.3 + r() * 0.35,
    teamColors: ["#555555", "#FFFFFF", "#333333"],
    hairBg: { id: "none" },
    body: { id: pick(["body", "body2", "body3"]), color: skinColor, size: 0.95 + r() * 0.1 },
    jersey: { id: "jersey" },
    ear: { id: pick(earIds), size: 0.6 + r() * 0.4 },
    head: { id: pick(headIds), shave: "rgba(0,0,0,0)", fatness: 0.3 + r() * 0.3 },
    eyeLine: { id: pick(["line1", "line2", "line3"]) },
    smileLine: { id: pick(["line1", "line2"]), size: 0.9 + r() * 0.3 },
    miscLine: { id: "none" },
    facialHair: { id: r() < 0.4 ? pick(["goatee3", "goatee4", "fullgoatee2"]) : "none" },
    eye: { id: pick(eyeIds), angle: -3 + r() * 6 },
    eyebrow: { id: pick(eyebrowIds), angle: -3 + r() * 6 },
    hair: { id: bald ? "short-bald" : pick(hairIds), color: pick(hairColors), flip: r() < 0.5 },
    mouth: { id: pick(mouthIds), flip: r() < 0.5 },
    nose: { id: pick(noseIds), flip: r() < 0.5, size: 0.7 + r() * 0.5 },
    glasses: { id: r() < 0.15 ? "glasses1" : "none" },
    accessories: { id: "none" },
  };
}
