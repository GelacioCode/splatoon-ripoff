import type { ObjectiveIcon } from '../game/objective';
import { OUTLINE_COLOR } from './palette';

/** The objective yellow: the arrow over your head and the order badge. */
export const OBJECTIVE_YELLOW = 0xffd23f;

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

const INK = cssColor(OUTLINE_COLOR);
const YELLOW = cssColor(OBJECTIVE_YELLOW);

/** A pole with a paint-drop banner (the same flag as in the arena). */
function flag(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.moveTo(-r * 0.32, -r * 0.58);
  ctx.lineTo(-r * 0.32, r * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.32, -r * 0.6);
  ctx.bezierCurveTo(r * 0.05, -r * 0.6, r * 0.45, -r * 0.42, r * 0.58, -r * 0.3);
  ctx.bezierCurveTo(r * 0.45, -r * 0.18, r * 0.05, -r * 0.02, -r * 0.32, -r * 0.02);
  ctx.closePath();
  ctx.fill();
}

/** One sword pointing up, drawn around the origin. */
function sword(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.lineWidth = r * 0.13;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.66);
  ctx.lineTo(0, r * 0.22);
  ctx.stroke();
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, r * 0.24);
  ctx.lineTo(r * 0.2, r * 0.24);
  ctx.moveTo(0, r * 0.24);
  ctx.lineTo(0, r * 0.48);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, r * 0.55, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
}

/** Two crossed swords. */
function attack(ctx: CanvasRenderingContext2D, r: number): void {
  for (const angle of [-Math.PI / 4, Math.PI / 4]) {
    ctx.save();
    ctx.rotate(angle);
    sword(ctx, r);
    ctx.restore();
  }
}

/** A round-topped shield with a stripe down the middle. */
function defend(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.44);
  ctx.quadraticCurveTo(0, -r * 0.7, r * 0.5, -r * 0.44);
  ctx.lineTo(r * 0.5, r * 0.02);
  ctx.quadraticCurveTo(r * 0.44, r * 0.44, 0, r * 0.64);
  ctx.quadraticCurveTo(-r * 0.44, r * 0.44, -r * 0.5, r * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = YELLOW;
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.42);
  ctx.lineTo(0, r * 0.42);
  ctx.stroke();
}

/** An hourglass. */
function wait(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, -r * 0.56);
  ctx.lineTo(r * 0.4, -r * 0.56);
  ctx.moveTo(-r * 0.4, r * 0.56);
  ctx.lineTo(r * 0.4, r * 0.56);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.5);
  ctx.lineTo(r * 0.3, -r * 0.5);
  ctx.lineTo(r * 0.06, 0);
  ctx.lineTo(r * 0.3, r * 0.5);
  ctx.lineTo(-r * 0.3, r * 0.5);
  ctx.lineTo(-r * 0.06, 0);
  ctx.closePath();
  ctx.fill();
}

const GLYPHS: Record<ObjectiveIcon, (ctx: CanvasRenderingContext2D, r: number) => void> = {
  flag,
  attack,
  defend,
  wait,
};

/**
 * Draws an objective badge filling the canvas: a yellow disc with a thick ink ring, and the
 * icon in ink. Used for the badge over your head and next to the order at the top.
 */
export function drawObjectiveIcon(canvas: HTMLCanvasElement, icon: ObjectiveIcon): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = Math.min(canvas.width, canvas.height);
  const ring = size * 0.07;
  const radius = size / 2 - ring;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = YELLOW;
  ctx.fill();
  ctx.lineWidth = ring * 1.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  GLYPHS[icon](ctx, radius);
  ctx.restore();
}
