import { describe, expect, it } from 'vitest';
import { packAtlas, type AtlasRect } from './atlasPacker';

function overlaps(a: AtlasRect, b: AtlasRect, padding: number): boolean {
  return (
    a.x - padding < b.x + b.width + padding &&
    b.x - padding < a.x + a.width + padding &&
    a.y - padding < b.y + b.height + padding &&
    b.y - padding < a.y + a.height + padding
  );
}

const SURFACES = [
  { width: 10, height: 4, paintable: true },
  { width: 3, height: 3, paintable: true },
  { width: 6, height: 1, paintable: false },
  { width: 2, height: 8, paintable: true },
  { width: 1, height: 1, paintable: true },
];

describe('packAtlas', () => {
  it('places every paintable surface inside the texture without overlaps', () => {
    const layout = packAtlas(SURFACES, 256, 16);
    const placed = layout.rects.filter((r): r is AtlasRect => r !== null);
    expect(placed).toHaveLength(4);
    expect(layout.rects[2]).toBeNull();
    for (const r of placed) {
      expect(r.x).toBeGreaterThanOrEqual(layout.padding);
      expect(r.y).toBeGreaterThanOrEqual(layout.padding);
      expect(r.x + r.width + layout.padding).toBeLessThanOrEqual(layout.size);
      expect(r.y + r.height + layout.padding).toBeLessThanOrEqual(layout.size);
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i], placed[j], layout.padding)).toBe(false);
      }
    }
  });

  it('uses less detail when the surfaces would not fit otherwise', () => {
    const roomy = packAtlas(SURFACES, 1024, 16);
    const cramped = packAtlas(SURFACES, 64, 16);
    expect(roomy.pixelsPerMeter).toBe(16);
    expect(cramped.pixelsPerMeter).toBeLessThan(16);
  });
});
