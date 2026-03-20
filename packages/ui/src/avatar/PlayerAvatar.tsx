import React from "react";
import type { AvatarConfig, BodyType } from "@okresni-masina/shared";
import { Head, Eyes, Nose, Mouth, Ears, Body, Hair, FacialHair, Glasses } from "./parts";
import { SKIN_TONES, HAIR_COLORS } from "./palettes";

export interface PlayerAvatarProps {
  config: AvatarConfig;
  jerseyColor?: string;
  size?: "sm" | "md" | "lg";
}

const SIZES: Record<string, number> = {
  sm: 40,
  md: 80,
  lg: 200,
};

/**
 * FMK-32: React PlayerAvatar komponenta.
 *
 * Skládá SVG vrstvy do kompletního avataru hráče.
 * Deterministické renderování — stejné vstupy = stejný avatar.
 *
 * Vrstvy (odspodu):
 * tělo → uši → hlava → oči → nos → ústa → vlasy → vousy → brýle
 */
export function PlayerAvatar({
  config,
  jerseyColor = "#2563eb",
  size = "md",
}: PlayerAvatarProps) {
  const skin = SKIN_TONES[config.skinTone] ?? SKIN_TONES.medium_light;
  const hairColor = HAIR_COLORS[config.hairColor] ?? HAIR_COLORS.brown;
  const px = SIZES[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 160"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Player avatar"
    >
      {/* Body / jersey */}
      <Body bodyType={config.bodyType} fill={skin.base} jerseyColor={jerseyColor} />

      {/* Ears (behind head) */}
      <Ears variant={config.ears} fill={skin.base} shadow={skin.shadow} />

      {/* Head */}
      <Head variant={config.head} fill={skin.base} shadow={skin.shadow} />

      {/* Eyes */}
      <Eyes variant={config.eyes} />

      {/* Nose */}
      <Nose variant={config.nose} fill={skin.shadow} />

      {/* Mouth */}
      <Mouth variant={config.mouth} />

      {/* Hair */}
      <Hair style={config.hair} color={hairColor} />

      {/* Facial hair */}
      <FacialHair style={config.facialHair} color={hairColor} />

      {/* Glasses */}
      <Glasses style={config.glasses} />
    </svg>
  );
}
