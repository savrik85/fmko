"use client";

import { EffectComposer, N8AO, Bloom, Vignette, ToneMapping, SMAA, TiltShift2 } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { TimeOfDay } from "./constants";

/**
 * Post-processing řetězec 3D areálu (jen desktop).
 *
 * - N8AO: ambient occlusion — usadí tribuny, budovy a diváky na zem, bez něj vše „plave".
 * - Bloom: záře reflektorů, světelné tabule, světlic a slunečního kotouče. Práh 1.0 znamená,
 *   že září jen HDR hodnoty (emissive > 1, kotouč slunce), ne běžná bílá obloha.
 * - TiltShift2 (jen `miniature`, tedy pohledy z nadhledu): ostrý pruh přes hřiště, popředí
 *   a obzor se rozmažou. Scéna pak působí jako model na stole. Dva průchody v kolmých
 *   směrech, jeden by rozmazával jen po úhlopříčce do šmouh.
 * - Vignette: jemné ztmavení okrajů, soustředí pohled na hřiště.
 * - ToneMapping: EffectComposer vypíná tone mapping rendereru (scéna se kreslí do HDR
 *   bufferu), takže ACES se musí aplikovat tady, jinak je obraz přepálený.
 * - SMAA: vyhlazení hran. Multisampling je vypnutý, aby N8AO četlo hloubku bez resolve.
 */
/** Ostrý pruh leží ve středu obrazu, kde je z nadhledu hřiště. */
const FOCUS_START: [number, number] = [0, 0.5];
const FOCUS_END: [number, number] = [1, 0.5];

export function PostFX({ timeOfDay, miniature = false }: { timeOfDay: TimeOfDay; miniature?: boolean }) {
  const isNight = timeOfDay === "night";
  const tilt = miniature ? 0.14 : 0;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO
        aoRadius={2.4}
        distanceFalloff={1.0}
        intensity={isNight ? 2.2 : 3.2}
        quality="medium"
        halfRes
        color="#06100a"
      />
      <Bloom
        mipmapBlur
        luminanceThreshold={isNight ? 0.9 : 1.0}
        luminanceSmoothing={0.2}
        intensity={isNight ? 1.15 : 0.55}
        radius={0.75}
      />
      <TiltShift2 blur={tilt} taper={0.45} start={FOCUS_START} end={FOCUS_END} direction={[1, 1]} samples={8} />
      <TiltShift2 blur={tilt} taper={0.45} start={FOCUS_START} end={FOCUS_END} direction={[1, -1]} samples={8} />
      <Vignette eskil={false} offset={0.28} darkness={isNight ? 0.6 : 0.42} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}
