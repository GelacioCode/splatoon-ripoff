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
import type { Surface, SurfaceSplat } from '@paint-rush/shared';
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
uniform float uSize;
varying vec2 vLocal;
varying vec2 vPixel;
varying float vTeam;
varying float vSeed;
varying vec4 vClip;

void main() {
  vLocal = position.xy * ${QUAD_REACH.toFixed(1)};
  vPixel = aCenter + vLocal * aRadius;
  vTeam = aTeam;
  vSeed = aSeed;
  vClip = aClip;
  gl_Position = vec4(vPixel / uSize * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Draws an irregular blob with a few droplets around it. The output stores coverage in red
// and the team (0 or 1) in green; the map shader turns that into glossy paint.
const FRAGMENT_SHADER = /* glsl */ `
varying vec2 vLocal;
varying vec2 vPixel;
varying float vTeam;
varying float vSeed;
varying vec4 vClip;

void main() {
  // Stay inside this surface's region of the texture.
  if (vPixel.x < vClip.x || vPixel.y < vClip.y || vPixel.x > vClip.z || vPixel.y > vClip.w) discard;

  float angle = atan(vLocal.y, vLocal.x);
  float edge = 0.9 + 0.12 * sin(angle * 5.0 + vSeed * 6.283) + 0.06 * sin(angle * 11.0 + vSeed * 17.0);
  float blob = 1.0 - smoothstep(edge - 0.15, edge, length(vLocal));
  for (int i = 0; i < 3; i++) {
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

  /** Queues the circles from one splat for drawing on the next flush. */
  add(splats: readonly SurfaceSplat[], team: number): void {
    const { padding, pixelsPerMeter } = this.layout;
    for (const splat of splats) {
      const rect = this.layout.rects[splat.surfaceId];
      if (!rect) continue;
      if (this.queued === MAX_SPLATS) this.flush();
      const s = this.surfaces[splat.surfaceId];
      const i = this.queued++;
      this.centers[i * 2] = rect.x + (splat.u / s.width) * rect.width;
      this.centers[i * 2 + 1] = rect.y + (splat.v / s.height) * rect.height;
      this.radii[i] = splat.radius * pixelsPerMeter;
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
    }
  }

  /** Draws all queued splats into the texture. Call once per frame. */
  flush(): void {
    if (this.queued === 0) return;
    for (const name of ['aCenter', 'aRadius', 'aTeam', 'aSeed', 'aClip']) {
      this.geometry.getAttribute(name).needsUpdate = true;
    }
    this.geometry.instanceCount = this.queued;
    this.drawIntoTarget(() => this.renderer.render(this.scene, this.camera));
    this.queued = 0;
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
