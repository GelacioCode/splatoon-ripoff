import type { Quality } from '../settings';

export type QualityLevel = Exclude<Quality, 'auto'>;

export interface QualityPreset {
  /** Highest device pixel ratio to render at (dynamic resolution may go lower). */
  maxPixelRatio: number;
  /** Paint texture size (px). Smaller = blurrier paint, less memory. */
  paintTextureSize: number;
  /** Most paint droplets on screen at once. */
  particles: number;
  antialias: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { maxPixelRatio: 1, paintTextureSize: 1024, particles: 120, antialias: false },
  medium: { maxPixelRatio: 1.5, paintTextureSize: 2048, particles: 220, antialias: true },
  high: { maxPixelRatio: 2, paintTextureSize: 2048, particles: 300, antialias: true },
};

/** "Auto" means medium on phones and tablets, high on computers. */
export function resolveQuality(quality: Quality, touchDevice: boolean): QualityLevel {
  if (quality !== 'auto') return quality;
  return touchDevice ? 'medium' : 'high';
}
