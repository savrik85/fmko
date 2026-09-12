/**
 * Generuje dynamické tagy/charakteristiky hráče relativně k jeho týmu.
 * Spouští se na FE při každém renderu (ne uloženo v DB).
 *
 * Odznaky z části A a B se poměřují s VLASTNÍM kádrem hráče. U dorostence to je dorost,
 * ne áčko — a protože odznak výhledu vedle nich mluví o áčku, stálo u dvacetiletého
 * dorostence „Hvězda týmu" hned vedle „Výhled: možná sestava". Obojí pravda, dohromady
 * nesmysl. Proto se u dorostu do popisků píše, že jde o dorost.
 */
export interface PlayerTag {
    key: string;
    label: string;
    emoji: string;
    color: "green" | "gold" | "red" | "blue" | "purple" | "muted";
    description: string;
    priority: number;
}
interface PlayerInput {
    overall_rating: number;
    age: number;
    position: string;
    skills?: Record<string, number>;
    personality?: Record<string, number>;
    lifeContext?: Record<string, number>;
    is_celebrity?: number;
}
export declare function generateCharacteristics(player: PlayerInput, teamPlayers: PlayerInput[], maxTags?: number, 
/** Hráč hraje za dorost — odznaky vztažené ke kádru pak mluví o dorostu. */
jeDorost?: boolean): PlayerTag[];
export {};
//# sourceMappingURL=characteristics.d.ts.map