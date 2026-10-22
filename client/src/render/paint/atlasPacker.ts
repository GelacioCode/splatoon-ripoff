/** A surface's region of the paint texture, in pixels (padding not included). */
export interface AtlasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AtlasLayout {
  /** Texture width and height (px). */
  size: number;
  /** Paint detail: texture pixels per meter of surface. */
  pixelsPerMeter: number;
  /** Empty border around each region so paint never bleeds into a neighbor (px). */
  padding: number;
  /** One region per surface, or null for surfaces that can't be painted. */
  rects: (AtlasRect | null)[];
}

interface PackableSurface {
  width: number;
  height: number;
  paintable: boolean;
}

/**
 * Lays every paintable surface out on one square texture, using as much detail as fits
 * (up to `maxPixelsPerMeter`). Simple shelf packing: tallest regions first, left to right.
 */
export function packAtlas(
  surfaces: readonly PackableSurface[],
  size: number,
  maxPixelsPerMeter: number,
  padding = 2,
): AtlasLayout {
  const area = surfaces.reduce((sum, s) => (s.paintable ? sum + s.width * s.height : sum), 0);
  // Start from the density that would fill ~70% of the texture, then shrink until it fits.
  let pixelsPerMeter = Math.min(
    maxPixelsPerMeter,
    Math.sqrt((size * size * 0.7) / Math.max(area, 1e-6)),
  );
  for (let attempt = 0; attempt < 60; attempt++) {
    const rects = tryPack(surfaces, size, pixelsPerMeter, padding);
    if (rects) return { size, pixelsPerMeter, padding, rects };
    pixelsPerMeter *= 0.9;
  }
  throw new Error('The map has too many surfaces to fit in the paint texture');
}

function tryPack(
  surfaces: readonly PackableSurface[],
  size: number,
  pixelsPerMeter: number,
  padding: number,
): (AtlasRect | null)[] | null {
  const rects: (AtlasRect | null)[] = surfaces.map(() => null);
  const pixels = (meters: number) => Math.max(1, Math.ceil(meters * pixelsPerMeter));
  const order = surfaces
    .map((_, index) => index)
    .filter((index) => surfaces[index].paintable)
    .sort((a, b) => surfaces[b].height - surfaces[a].height);

  let x = 0;
  let y = 0;
  let shelfHeight = 0;
  for (const index of order) {
    const width = pixels(surfaces[index].width);
    const height = pixels(surfaces[index].height);
    const outerWidth = width + padding * 2;
    const outerHeight = height + padding * 2;
    if (x + outerWidth > size) {
      x = 0;
      y += shelfHeight;
      shelfHeight = 0;
    }
    if (outerWidth > size || y + outerHeight > size) return null;
    rects[index] = { x: x + padding, y: y + padding, width, height };
    x += outerWidth;
    shelfHeight = Math.max(shelfHeight, outerHeight);
  }
  return rects;
}
