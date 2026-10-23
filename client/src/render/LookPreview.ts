import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { Look } from '@paint-rush/shared';
import { BlobCharacter } from './BlobCharacter';
import { HEMISPHERE_GROUND_COLOR, SUN_DIRECTION } from './palette';
import { createToonRamp } from './toon';

/** Neutral lavender until the team (and so the color) is known. */
const PREVIEW_COLOR = 0xb39cff;
/** Turning speed of the preview (radians per second). */
const TURN_SPEED = 0.7;

/**
 * A small turning 3D view of your blob for the customize screen. It has its own little
 * renderer, which only exists while the screen is open: call `dispose` when leaving it.
 */
export class LookPreview {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 20);
  private readonly character: BlobCharacter;
  private frameId = 0;
  private lastTime = 0;
  // Start facing the camera (the blob faces −Z, the camera looks from +Z).
  private yaw = Math.PI;

  constructor(host: HTMLElement, look: Look, weapon: number) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const size = Math.max(120, Math.round(host.clientWidth) || 180);
    this.renderer.setSize(size, size);
    host.replaceChildren(this.renderer.domElement);

    this.scene.add(new HemisphereLight(0xffffff, HEMISPHERE_GROUND_COLOR, 1.4));
    const sun = new DirectionalLight(0xffffff, 2);
    sun.position.set(...SUN_DIRECTION).multiplyScalar(10);
    this.scene.add(sun);

    this.character = new BlobCharacter(PREVIEW_COLOR, createToonRamp(), weapon, look);
    this.scene.add(this.character.root);
    this.camera.position.set(0, 1.05, 4);
    this.camera.lookAt(0, 0.72, 0);
    this.frameId = requestAnimationFrame(this.frame);
  }

  setLook(look: Look): void {
    this.character.setLook(look);
  }

  setWeapon(weapon: number): void {
    this.character.setWeapon(weapon);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.character.dispose();
    this.renderer.dispose();
    // Give the WebGL context back right away (phones only allow a few at once).
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private readonly frame = (timeMs: number): void => {
    const dt = this.lastTime === 0 ? 0 : Math.min((timeMs - this.lastTime) / 1000, 0.1);
    this.lastTime = timeMs;
    this.yaw += TURN_SPEED * dt;
    this.character.update(dt, {
      x: 0,
      y: 0,
      z: 0,
      yaw: this.yaw,
      vx: 0,
      vy: 0,
      vz: 0,
      grounded: true,
      swimBlend: 0,
      submerged: false,
      climbing: false,
    });
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.frame);
  };
}
