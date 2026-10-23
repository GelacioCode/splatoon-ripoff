import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';
import { OUTLINE_COLOR } from './palette';

const WIDTH = 256;
const HEIGHT = 64;
const FONT_SIZE = 34;
/** On-screen height of the label: about this fraction of the view (stays readable far away). */
const SCREEN_HEIGHT = 0.042;

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/**
 * A player's name floating over their head, in their team color with a dark outline. It keeps
 * the same size on screen at any distance, and walls in front hide it (no seeing names
 * through walls).
 */
export class NameLabel {
  readonly sprite: Sprite;
  private readonly texture: CanvasTexture;
  private readonly material: SpriteMaterial;

  constructor(name: string, color: number) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      let size = FONT_SIZE;
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      // Long names shrink to fit instead of being cut off.
      const width = ctx.measureText(name).width;
      if (width > WIDTH - 16) {
        size = Math.floor((size * (WIDTH - 16)) / width);
        ctx.font = `800 ${size}px system-ui, sans-serif`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 7;
      ctx.strokeStyle = cssColor(OUTLINE_COLOR);
      ctx.strokeText(name, WIDTH / 2, HEIGHT / 2);
      ctx.fillStyle = cssColor(color);
      ctx.fillText(name, WIDTH / 2, HEIGHT / 2);
    }
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      // Fixed size on screen rather than shrinking with distance.
      sizeAttenuation: false,
    });
    this.sprite = new Sprite(this.material);
    this.sprite.scale.set((SCREEN_HEIGHT * WIDTH) / HEIGHT, SCREEN_HEIGHT, 1);
    this.sprite.renderOrder = 10;
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
  }
}
