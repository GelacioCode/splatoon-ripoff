import type { MapDef, PaintGrid, Surface } from '@paint-rush/shared';
import { TEAM_COLORS } from '../render/palette';

/** Drawing scale of the minimap canvas (pixels per meter). Paint uses one pixel per cell. */
const PIXELS_PER_METER = 6;
/** How long new paint takes to fade in on the map (ms). */
const PAINT_FADE_MS = 300;

export interface MinimapPoint {
  x: number;
  z: number;
}

/** What moves on the minimap this frame. */
export interface MinimapFrame {
  /** You: position and facing (yaw 0 looks toward −Z). */
  me: (MinimapPoint & { yaw: number }) | null;
  /** Your teammates (enemies are never shown). */
  mates: MinimapPoint[];
  /** The flag, its color (CSS), and whether someone is carrying it. */
  flag: (MinimapPoint & { color: string; carried: boolean }) | null;
}

function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

/**
 * A top view of the arena in the corner: the layout, live team paint (fading in as it
 * changes), you as an arrow, your teammates as dots and the flag as a pulsing marker. It's
 * turned so your team always attacks upward. Tap it or press M to open a big version.
 */
export class Minimap {
  private readonly root = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  /** The arena layout, drawn once. */
  private readonly layout = document.createElement('canvas');
  /** Paint before and after the latest refresh, for the fade. */
  private paintOld = document.createElement('canvas');
  private paintNew = document.createElement('canvas');
  private paintChangedAt = 0;
  private readonly map: MapDef;
  private readonly surfaces: Surface[];
  private readonly paint: PaintGrid;
  /** Floor-like surfaces, lowest first, so higher ledges paint over what's under them. */
  private readonly floors: Surface[];
  private readonly cellsX: number;
  private readonly cellsZ: number;
  private team = 0;
  private visible = false;
  private expanded = false;

  constructor(map: MapDef, surfaces: Surface[], paint: PaintGrid) {
    this.map = map;
    this.surfaces = surfaces;
    this.paint = paint;
    this.floors = surfaces
      .filter((s) => s.paintable && s.normal.y > 0.7)
      .sort((a, b) => a.origin.y - b.origin.y);
    const width = map.bounds.maxX - map.bounds.minX;
    const depth = map.bounds.maxZ - map.bounds.minZ;
    this.cellsX = Math.ceil(width / paint.cellSize);
    this.cellsZ = Math.ceil(depth / paint.cellSize);
    for (const c of [this.canvas, this.layout]) {
      c.width = Math.round(width * PIXELS_PER_METER);
      c.height = Math.round(depth * PIXELS_PER_METER);
    }
    for (const c of [this.paintOld, this.paintNew]) {
      c.width = this.cellsX;
      c.height = this.cellsZ;
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Minimap: no 2D canvas');
    this.ctx = ctx;

    this.root.className = 'minimap';
    this.root.hidden = true;
    this.root.append(this.canvas);
    this.root.addEventListener('click', () => this.setExpanded(!this.expanded));
    document.body.append(this.root);
    window.addEventListener('keydown', this.onKey);
    this.drawLayout();
  }

  /** Turns the map so `team` attacks upward. */
  setTeam(team: number): void {
    if (team === this.team) return;
    this.team = team;
    this.drawLayout();
    this.refreshPaint(true);
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.hidden = !visible;
    if (!visible) this.setExpanded(false);
  }

  /** Re-reads the paint grid; the change fades in over a moment (or instantly). */
  refreshPaint(instant = false): void {
    // The new paint becomes the "old" one to fade from.
    [this.paintOld, this.paintNew] = [this.paintNew, this.paintOld];
    const ctx = this.paintNew.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(this.cellsX, this.cellsZ);
    const colors = TEAM_COLORS.map(rgb);
    const size = this.paint.cellSize;
    const floors = new Set(this.floors.map((s) => s.id));
    // Lowest floors first: the paint grid lists surfaces in their own order, so sort per cell
    // height by drawing higher surfaces later.
    const painted: { x: number; z: number; y: number; team: number }[] = [];
    this.paint.forEachPaintedCell((surfaceId, u, v, team) => {
      if (!floors.has(surfaceId)) return;
      const s = this.surfaces[surfaceId];
      painted.push({
        x: s.origin.x + s.uAxis.x * u + s.vAxis.x * v,
        z: s.origin.z + s.uAxis.z * u + s.vAxis.z * v,
        y: s.origin.y,
        team,
      });
    });
    painted.sort((a, b) => a.y - b.y);
    for (const cell of painted) {
      const px = this.toPixel(cell.x, cell.z, 1 / size);
      const ix = Math.floor(px.x);
      const iz = Math.floor(px.y);
      if (ix < 0 || iz < 0 || ix >= this.cellsX || iz >= this.cellsZ) continue;
      const [r, g, b] = colors[cell.team] ?? colors[0];
      const o = (iz * this.cellsX + ix) * 4;
      image.data[o] = r;
      image.data[o + 1] = g;
      image.data[o + 2] = b;
      image.data[o + 3] = 235;
    }
    ctx.putImageData(image, 0, 0);
    this.paintChangedAt = instant ? 0 : performance.now();
  }

  /** Call every frame while visible. */
  draw(frame: MinimapFrame, timeMs: number): void {
    if (!this.visible) return;
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.layout, 0, 0);
    // Paint: the previous refresh, with the latest fading in over it.
    ctx.imageSmoothingEnabled = true;
    const fade = Math.min(1, (timeMs - this.paintChangedAt) / PAINT_FADE_MS);
    ctx.globalAlpha = 1;
    if (fade < 1) ctx.drawImage(this.paintOld, 0, 0, width, height);
    ctx.globalAlpha = fade;
    ctx.drawImage(this.paintNew, 0, 0, width, height);
    ctx.globalAlpha = 1;

    const color = cssColor(TEAM_COLORS[this.team] ?? TEAM_COLORS[0]);
    for (const mate of frame.mates) {
      const p = this.toPixel(mate.x, mate.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1d1135';
      ctx.stroke();
    }

    if (frame.flag) {
      const p = this.toPixel(frame.flag.x, frame.flag.z);
      const pulse = 1 + Math.sin(timeMs / 180) * 0.15;
      if (frame.flag.carried) {
        // A ring around the carrier, in their color.
        ctx.beginPath();
        ctx.arc(p.x, p.y, 16 * pulse, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = frame.flag.color;
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#1d1135';
      ctx.fillRect(-1.5, -12, 3, 18);
      ctx.beginPath();
      ctx.moveTo(1.5, -12);
      ctx.lineTo(13, -7);
      ctx.lineTo(1.5, -2);
      ctx.closePath();
      ctx.fillStyle = frame.flag.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1d1135';
      ctx.stroke();
      ctx.restore();
    }

    if (frame.me) {
      const p = this.toPixel(frame.me.x, frame.me.z);
      // Facing: yaw 0 looks toward −Z; on the canvas that's "up" for team 0.
      const forward = this.toPixel(
        frame.me.x - Math.sin(frame.me.yaw),
        frame.me.z - Math.cos(frame.me.yaw),
      );
      const angle = Math.atan2(forward.y - p.y, forward.x - p.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-8, 9);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-8, -9);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded && this.visible;
    this.root.classList.toggle('expanded', this.expanded);
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.code === 'KeyM' && !event.repeat && this.visible) this.setExpanded(!this.expanded);
  };

  /**
   * World (x, z) → canvas pixels, at `scale` pixels per meter. Team 0 attacks toward +Z, team 1
   * toward −Z; either way that's up, so team 1's view is turned 180°.
   */
  private toPixel(x: number, z: number, scale = PIXELS_PER_METER) {
    const { minX, maxX, minZ, maxZ } = this.map.bounds;
    return this.team === 0
      ? { x: (maxX - x) * scale, y: (maxZ - z) * scale }
      : { x: (x - minX) * scale, y: (z - minZ) * scale };
  }

  /** The arena from above: floor, then blocks, lighter the higher they are, and the bases. */
  private drawLayout(): void {
    const ctx = this.layout.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.layout;
    ctx.clearRect(0, 0, width, height);
    roundRect(ctx, 0, 0, width, height, 18);
    ctx.fillStyle = 'rgb(29 17 53 / 78%)';
    ctx.fill();

    const blocks = this.map.blocks
      .filter((b) => b.kind !== 'boundary' && b.kind !== 'floor')
      .sort((a, b) => a.center.y + a.size.y / 2 - (b.center.y + b.size.y / 2));
    for (const block of blocks) {
      // Ramps are tilted around X: their footprint is shorter along Z.
      const depth = block.size.z * Math.cos(block.rotation.x);
      const a = this.toPixel(block.center.x - block.size.x / 2, block.center.z - depth / 2);
      const b = this.toPixel(block.center.x + block.size.x / 2, block.center.z + depth / 2);
      const top = block.center.y + block.size.y / 2;
      const light = Math.min(92, 56 + top * 9);
      roundRect(
        ctx,
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(b.x - a.x),
        Math.abs(b.y - a.y),
        5,
      );
      ctx.fillStyle = `hsl(258 30% ${light}%)`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgb(29 17 53 / 60%)';
      ctx.stroke();
    }

    this.map.bases.forEach((zone, team) => {
      const a = this.toPixel(zone.center.x - zone.size.x / 2, zone.center.z - zone.size.z / 2);
      const b = this.toPixel(zone.center.x + zone.size.x / 2, zone.center.z + zone.size.z / 2);
      roundRect(
        ctx,
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(b.x - a.x),
        Math.abs(b.y - a.y),
        6,
      );
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 4;
      ctx.strokeStyle = cssColor(TEAM_COLORS[team]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }
}
