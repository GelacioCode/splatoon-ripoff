import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Vector3 } from 'three';
import type { MapDef, Surface } from '@paint-rush/shared';
import type { PaintAtlas } from './paint/PaintAtlas';
import { SUN_DIRECTION, TEAM_COLORS } from './palette';
import { THEME_LOOKS, type ThemeLook } from './themes';

const VERTEX_SHADER = /* glsl */ `
attribute vec2 aPaintUv;
attribute vec3 aTangent;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vWorldPosition;
varying vec2 vPaintUv;

void main() {
  vColor = color;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vTangent = normalize(mat3(modelMatrix) * aTangent);
  vPaintUv = aPaintUv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform sampler2D uPaint;
uniform float uTexel;
uniform vec3 uTeamColor0;
uniform vec3 uTeamColor1;
// The theme's bare-ground pattern: 0 grid, 1 grass, 2 sand, 3 carpet (see PATTERN).
uniform float uPattern;

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vWorldPosition;
varying vec2 vPaintUv;

// 1 where a grid line crosses this pixel, fading to 0 within a pixel (anti-aliased).
float gridLine(vec2 p) {
  vec2 width = fwidth(p);
  vec2 distanceToLine = abs(fract(p - 0.5) - 0.5) / max(width, vec2(1e-4));
  return 1.0 - clamp(min(distanceToLine.x, distanceToLine.y), 0.0, 1.0);
}

// 1 on lines across one axis only (horizontal bands on walls).
float bandLine(float p) {
  return 1.0 - clamp(abs(fract(p - 0.5) - 0.5) / max(fwidth(p), 1e-4), 0.0, 1.0);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Smooth value noise, 0…1.
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// How the theme marks bare surfaces: a multiplier on the base color.
float pattern(vec3 p, bool top, vec2 gridPosition) {
  if (uPattern < 0.5) {
    // Grid: a faint 1 m grid everywhere.
    return 1.0 - 0.08 * gridLine(gridPosition);
  }
  if (uPattern < 1.5) {
    // Grass: soft light and dark patches on top; stone courses on the sides.
    if (top) return mix(0.9, 1.06, noise(p.xz * 0.45)) * mix(0.96, 1.03, noise(p.xz * 3.1));
    return 1.0 - 0.07 * gridLine(vec2(p.y * 2.0, (p.x + p.z) * 1.0));
  }
  if (uPattern < 2.5) {
    // Sand: wind ripples on top; layered sandstone bands on the sides.
    if (top) {
      float wave = sin(dot(p.xz, vec2(0.9, 0.4)) * 3.0 + noise(p.xz * 0.6) * 4.0);
      return 1.0 + 0.045 * wave - 0.04 * noise(p.xz * 0.3);
    }
    return 1.0 - 0.09 * bandLine(p.y * 1.6 + noise(p.xz * 0.8) * 0.4);
  }
  // Carpet: 1 m tiles in two soft shades with seams; plain panels on the sides.
  if (top) {
    float checker = mod(floor(p.x) + floor(p.z), 2.0);
    return (0.95 + 0.05 * checker) * (1.0 - 0.1 * gridLine(p.xz)) * mix(0.97, 1.02, hash(floor(p.xz * 12.0)));
  }
  return 1.0 - 0.05 * bandLine(p.y * 0.5);
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 ambient = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);

  // Bare surface: two chunky toon bands with a soft edge, plus the theme's pattern.
  float sunlit = smoothstep(0.0, 0.08, dot(n, uSunDirection));
  vec3 color = vColor * (ambient * 0.5 + uSunColor * mix(0.35, 0.6, sunlit));
  vec3 a = abs(n);
  vec2 gridPosition = a.y > 0.5 ? vWorldPosition.xz : (a.x > 0.5 ? vWorldPosition.zy : vWorldPosition.xy);
  color *= pattern(vWorldPosition, n.y > 0.5, gridPosition);

  // Paint. Sampled everywhere (screen-space derivatives need it outside branches), then
  // switched off on unpaintable surfaces, whose paint UV is (−1, −1).
  // Red = paint coverage (soft), green = team. A sharp threshold gives crisp, blobby edges.
  vec2 paintSample = texture2D(uPaint, vPaintUv).rg;
  float soft = fwidth(paintSample.r) + 0.02;
  float paint = smoothstep(0.5 - soft, 0.5 + soft, paintSample.r) * step(0.0, vPaintUv.x);
  vec3 ink = mix(uTeamColor0, uTeamColor1, step(0.5, paintSample.g));

  // Bump the normal along the coverage slope so paint edges look thick and wet.
  float dx = texture2D(uPaint, vPaintUv + vec2(uTexel, 0.0)).r - texture2D(uPaint, vPaintUv - vec2(uTexel, 0.0)).r;
  float dy = texture2D(uPaint, vPaintUv + vec2(0.0, uTexel)).r - texture2D(uPaint, vPaintUv - vec2(0.0, uTexel)).r;
  vec3 t = normalize(vTangent);
  vec3 b = cross(n, t);
  vec3 bumped = normalize(n - (t * dx + b * dy) * 1.5);

  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float inkSunlit = smoothstep(0.0, 0.08, dot(bumped, uSunDirection));
  vec3 inkColor = ink * (ambient * 0.55 + uSunColor * mix(0.4, 0.62, inkSunlit));
  // Glossy toon highlight and a soft rim, so the paint reads as wet.
  float highlight = smoothstep(0.86, 0.9, dot(bumped, normalize(uSunDirection + viewDirection)));
  float rim = smoothstep(0.55, 0.95, 1.0 - max(dot(bumped, viewDirection), 0.0));
  inkColor += vec3(highlight * 0.55 + rim * 0.12);
  color = mix(color, inkColor, paint);

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const CORNERS: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * Builds the whole map as a single mesh (one draw call). It's toon-lit in the theme's colors
 * with its ground pattern, and draws the paint stored in the paint atlas on top. A theme's
 * objects (props) are left out: they're drawn as themselves (see arenaProps).
 */
export function createMapMesh(
  map: MapDef,
  allSurfaces: Surface[],
  atlas: PaintAtlas,
  look: ThemeLook = THEME_LOOKS.yard,
): Mesh {
  const surfaces = allSurfaces.filter((s) => !map.blocks[s.blockIndex].prop);
  const vertexCount = surfaces.length * 4;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const tangents = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const paintUvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(surfaces.length * 6);
  const color = new Color();

  surfaces.forEach((surface, i) => {
    const { origin, uAxis, vAxis, normal, width, height } = surface;
    color.setHex(look.blocks[map.blocks[surface.blockIndex].kind]);
    CORNERS.forEach(([u, v], corner) => {
      const vertex = i * 4 + corner;
      const k = vertex * 3;
      positions[k] = origin.x + uAxis.x * u * width + vAxis.x * v * height;
      positions[k + 1] = origin.y + uAxis.y * u * width + vAxis.y * v * height;
      positions[k + 2] = origin.z + uAxis.z * u * width + vAxis.z * v * height;
      normals.set([normal.x, normal.y, normal.z], k);
      tangents.set([uAxis.x, uAxis.y, uAxis.z], k);
      colors.set([color.r, color.g, color.b], k);
      // Unpaintable surfaces get (−1, −1), which the shader treats as "no paint".
      paintUvs.set(atlas.uvFor(surface.id, u * width, v * height) ?? [-1, -1], vertex * 2);
    });
    const first = i * 4;
    indices.set([first, first + 1, first + 2, first, first + 2, first + 3], i * 6);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('aTangent', new BufferAttribute(tangents, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('aPaintUv', new BufferAttribute(paintUvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));

  const material = new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    vertexColors: true,
    uniforms: {
      uSunDirection: { value: new Vector3(...SUN_DIRECTION).normalize() },
      uSunColor: { value: new Color(look.sunColor) },
      uSkyColor: { value: new Color(look.sky) },
      uGroundColor: { value: new Color(look.groundLight) },
      uPattern: { value: look.pattern },
      uPaint: { value: atlas.texture },
      uTexel: { value: 1 / atlas.layout.size },
      uTeamColor0: { value: new Color(TEAM_COLORS[0]) },
      uTeamColor1: { value: new Color(TEAM_COLORS[1]) },
    },
  });
  return new Mesh(geometry, material);
}
