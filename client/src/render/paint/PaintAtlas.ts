import {
  BufferAttribute,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { Surface, SurfaceSplat, SurfaceStroke } from '@paint-rush/shared';
import type { AtlasLayout } from './atlasPacker';

/** Splats drawn per batch; more just means another batch. */
const MAX_SPLATS = 512;
/** The splat quad extends this far past the splat radius, to leave room for droplets. */
const QUAD_REACH = 1.6;

const VERTEX_SHADER = /* glsl */ `
attribute vec2 aCenter;
attribute float aRadius;
attribute float aTeam;
attribute float aSeed;
attribute vec4 aClip;
// x = stretch along the angle, y = angle (radians), z = 1 for a splat with droplets,
// w = half the length of a straight line's middle (in radii; 0 for a round mark).
attribute vec4 aStyle;
uniform float uSize;
varying vec2 vLocal;
varying vec2 vPixel;
varying float vTeam;
varying float vSeed;
varying vec4 vClip;
varying float vDroplets;
varying float vStretch;
varying float vLine;

void main() {
  vLocal = position.xy * ${QUAD_REACH.toFixed(1)};
  // Stretch the quad along its angle (long enough for a line), then place it.
  vec2 stretched = vec2(vLocal.x * aStyle.x, vLocal.y);
  float c = cos(aStyle.y);
  float s = sin(aStyle.y);
  vPixel = aCenter + vec2(c * stretched.x - s * stretched.y, s * stretched.x + c * stretched.y) * aRadius;
  vTeam = aTeam;
  vSeed = aSeed;
  vClip = aClip;
  vDroplets = aStyle.z;
  vStretch = aStyle.x;
  vLine = aStyle.w;
  gl_Position = vec4(vPixel / uSize * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Draws an irregular blob with a few droplets around it, or a smooth straight line (a shot's
// trail). The output stores coverage in red and the team (0 or 1) in green; the map shader
// turns that into glossy paint.
const FRAGMENT_SHADER = /* glsl */ `
varying vec2 vLocal;
varying vec2 vPixel;
varying float vTeam;
varying float vSeed;
varying vec4 vClip;
varying float vDroplets;
varying float vStretch;
varying float vLine;

void main() {
  // Stay inside this surface's region of the texture.
  if (vPixel.x < vClip.x || vPixel.y < vClip.y || vPixel.x > vClip.z || vPixel.y > vClip.w) discard;

  if (vLine > 0.0) {
    // A trail line: round-ended, with a clean edge, so pieces join into one straight line.
    vec2 q = vec2(vLocal.x * vStretch, vLocal.y);
    float d = length(vec2(max(abs(q.x) - vLine, 0.0), q.y));
    float line = 1.0 - smoothstep(0.7, 1.0, d);
    if (line <= 0.001) discard;
    gl_FragColor = vec4(1.0, vTeam, 0.0, line);
    return;
  }

  float angle = atan(vLocal.y, vLocal.x);
  // Full splats get a wobbly edge; small trail dots stay smooth.
  float wobble = mix(0.3, 1.0, vDroplets);
  float edge = 0.9 + (0.12 * sin(angle * 5.0 + vSeed * 6.283) + 0.06 * sin(angle * 11.0 + vSeed * 17.0)) * wobble;
  float blob = 1.0 - smoothstep(edge - 0.15, edge, length(vLocal));
  for (int i = 0; i < 3; i++) {
    if (vDroplets < 0.5) break;
    float fi = float(i);
    float dropAngle = vSeed * 40.0 + fi * 2.1;
    float dropDistance = 1.15 + 0.2 * fract(vSeed * 13.0 + fi * 0.37);
    float dropRadius = 0.12 + 0.08 * fract(vSeed * 7.0 + fi * 0.61);
    vec2 dropCenter = vec2(cos(dropAngle), sin(dropAngle)) * dropDistance;
    blob = max(blob, 1.0 - smoothstep(dropRadius - 0.06, dropRadius, length(vLocal - dropCenter)));
  }
  if (blob <= 0.001) discard;
  gl_FragColor = vec4(1.0, vTeam, 0.0, blob);
}
`;

/**
 * The visual paint layer: one texture holding a region for every paintable surface. Splats
 * are queued and drawn into it in batches; the map shader reads it every frame.
 */
export class PaintAtlas {
  readonly layout: AtlasLayout;
  private readonly renderer: WebGLRenderer;
  private readonly surfaces: Surface[];
  private readonly target: WebGLRenderTarget;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera();
  private readonly geometry = new InstancedBufferGeometry();
  private readonly centers = new Float32Array(MAX_SPLATS * 2);
  private readonly radii = new Float32Array(MAX_SPLATS);
  private readonly teams = new Float32Array(MAX_SPLATS);
  private readonly seeds = new Float32Array(MAX_SPLATS);
  private readonly clips = new Float32Array(MAX_SPLATS * 4);
  private readonly styles = new Float32Array(MAX_SPLATS * 4);
  private readonly savedClearColor = new Color();
  private queued = 0;

  constructor(renderer: WebGLRenderer, surfaces: Surface[], layout: AtlasLayout) {
    this.renderer = renderer;
    this.surfaces = surfaces;
    this.layout = layout;
    this.target = new WebGLRenderTarget(layout.size, layout.size, {
      depthBuffer: false,
      magFilter: LinearFilter,
      minFilter: LinearFilter,
      generateMipmaps: false,
    });

    const quad = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
    this.geometry.setAttribute('position', new BufferAttribute(quad, 3));
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.addInstanceAttribute('aCenter', this.centers, 2);
    this.addInstanceAttribute('aRadius', this.radii, 1);
    this.addInstanceAttribute('aTeam', this.teams, 1);
    this.addInstanceAttribute('aSeed', this.seeds, 1);
    this.addInstanceAttribute('aClip', this.clips, 4);
    this.addInstanceAttribute('aStyle', this.styles, 4);

    const material = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: { uSize: { value: layout.size } },
      transparent: true,
      blending: NormalBlending,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new Mesh(this.geometry, material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.clear();
  }

  get texture(): Texture {
    return this.target.texture;
  }

  /** Texture coordinates (0–1) of a point on a surface, or null when it can't be painted. */
  uvFor(surfaceId: number, u: number, v: number): [number, number] | null {
    const rect = this.layout.rects[surfaceId];
    if (!rect) return null;
    const s = this.surfaces[surfaceId];
    return [
      (rect.x + (u / s.width) * rect.width) / this.layout.size,
      (rect.y + (v / s.height) * rect.height) / this.layout.size,
    ];
  }

  /**
   * Queues the circles from one splat for drawing on the next flush. With `dotRadius` (m),
   * they're small smooth trail dots of at most that size instead of splats with droplets.
   */
  add(splats: readonly SurfaceSplat[], team: number, dotRadius?: number): void {
    const { pixelsPerMeter } = this.layout;
    for (const splat of splats) {
      const i = this.queue(splat, team);
      if (i < 0) continue;
      if (dotRadius !== undefined) {
        this.radii[i] = Math.min(splat.radius, dotRadius) * pixelsPerMeter;
        this.styles.set([1, 0, 0, 0], i * 4);
      } else {
        this.radii[i] = splat.radius * pixelsPerMeter;
        this.styles.set([1, 0, 1, 0], i * 4);
      }
    }
  }

  /**
   * Queues straight trail lines `halfWidth` (m) either side, drawn with round ends so pieces
   * that meet join into one line.
   */
  addStrokes(strokes: readonly SurfaceStroke[], team: number, halfWidth: number): void {
    const radius = halfWidth * this.layout.pixelsPerMeter;
    if (radius <= 0) return;
    for (const stroke of strokes) {
      const rect = this.layout.rects[stroke.surfaceId];
      const s = this.surfaces[stroke.surfaceId];
      if (!rect || !s) continue;
      const i = this.queue(
        {
          surfaceId: stroke.surfaceId,
          u: (stroke.u0 + stroke.u1) / 2,
          v: (stroke.v0 + stroke.v1) / 2,
          radius: halfWidth,
        },
        team,
      );
      if (i < 0) continue;
      // The line in texture pixels, then its half length in radii.
      const du = ((stroke.u1 - stroke.u0) * rect.width) / s.width;
      const dv = ((stroke.v1 - stroke.v0) * rect.height) / s.height;
      const halfLength = Math.hypot(du, dv) / 2 / radius;
      // The quad has to reach past the round end of the line.
      const stretch = Math.max(1, (halfLength + 1.05) / QUAD_REACH);
      this.radii[i] = radius;
      this.styles.set([stretch, Math.atan2(dv, du), 0, Math.max(halfLength, 1e-3)], i * 4);
    }
  }

  /** Queues a soft round blob with no droplets, e.g. to redraw one cell of a paint snapshot. */
  addBlob(splat: SurfaceSplat, team: number): void {
    const i = this.queue(splat, team);
    if (i < 0) return;
    this.radii[i] = splat.radius * this.layout.pixelsPerMeter;
    this.styles.set([1, 0, 0, 0], i * 4);
  }

  /** Reserves the next splat slot and fills in where it goes; returns −1 if it can't be painted. */
  private queue(splat: SurfaceSplat, team: number): number {
    const rect = this.layout.rects[splat.surfaceId];
    if (!rect) return -1;
    if (this.queued === MAX_SPLATS) this.flush();
    const { padding } = this.layout;
    const s = this.surfaces[splat.surfaceId];
    const i = this.queued++;
    this.centers[i * 2] = rect.x + (splat.u / s.width) * rect.width;
    this.centers[i * 2 + 1] = rect.y + (splat.v / s.height) * rect.height;
    this.teams[i] = team;
    this.seeds[i] = Math.random();
    // Paint may spill into the padding (so edges look right) but never past it.
    this.clips.set(
      [
        rect.x - padding,
        rect.y - padding,
        rect.x + rect.width + padding,
        rect.y + rect.height + padding,
      ],
      i * 4,
    );
    return i;
  }

  /** Draws all queued splats into the texture. Call once per frame. */
  flush(): void {
    if (this.queued === 0) return;
    for (const name of ['aCenter', 'aRadius', 'aTeam', 'aSeed', 'aClip', 'aStyle']) {
      this.geometry.getAttribute(name).needsUpdate = true;
    }
    this.geometry.instanceCount = this.queued;
    this.drawIntoTarget(() => this.renderer.render(this.scene, this.camera));
    this.queued = 0;
  }

  /** Frees the GPU memory (when the arena is swapped for a new layout). */
  dispose(): void {
    this.target.dispose();
    this.geometry.dispose();
    for (const child of this.scene.children) {
      if (child instanceof Mesh) (child.material as ShaderMaterial).dispose();
    }
  }

  /** Wipes all paint. */
  clear(): void {
    this.queued = 0;
    this.drawIntoTarget(() => {
      this.renderer.getClearColor(this.savedClearColor);
      const alpha = this.renderer.getClearAlpha();
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, false, false);
      this.renderer.setClearColor(this.savedClearColor, alpha);
    });
  }

  private drawIntoTarget(draw: () => void): void {
    const previousTarget = this.renderer.getRenderTarget();
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.setRenderTarget(this.target);
    draw();
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.autoClear = autoClear;
  }

  private addInstanceAttribute(name: string, array: Float32Array, size: number): void {
    const attribute = new InstancedBufferAttribute(array, size);
    attribute.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute(name, attribute);
  }
}
