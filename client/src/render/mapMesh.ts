import { BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Vector3 } from 'three';
import { buildSurfaces, type MapDef } from '@paint-rush/shared';
import { BLOCK_COLORS, HEMISPHERE_GROUND_COLOR, SKY_COLOR, SUN_DIRECTION } from './palette';

const VERTEX_SHADER = /* glsl */ `
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vColor = color;
  vNormal = normalize(mat3(modelMatrix) * normal);
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

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPosition;

// 1 where a grid line crosses this pixel, fading to 0 within a pixel (anti-aliased).
float gridLine(vec2 p) {
  vec2 width = fwidth(p);
  vec2 distanceToLine = abs(fract(p - 0.5) - 0.5) / max(width, vec2(1e-4));
  return 1.0 - clamp(min(distanceToLine.x, distanceToLine.y), 0.0, 1.0);
}

void main() {
  vec3 n = normalize(vNormal);
  // Two chunky toon bands with a soft edge, tinted by the sky above and the ground below.
  float sunlit = smoothstep(0.0, 0.08, dot(n, uSunDirection));
  vec3 ambient = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
  vec3 color = vColor * (ambient * 0.5 + uSunColor * mix(0.35, 0.6, sunlit));

  // Faint 1 m grid so speed and distance are easy to read.
  vec3 a = abs(n);
  vec2 p = a.y > 0.5 ? vWorldPosition.xz : (a.x > 0.5 ? vWorldPosition.zy : vWorldPosition.xy);
  color *= 1.0 - 0.08 * gridLine(p);

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

/** Builds the whole map as a single mesh (one draw call) with a toon-lit, gridded look. */
export function createMapMesh(map: MapDef): Mesh {
  const surfaces = buildSurfaces(map.blocks);
  const positions = new Float32Array(surfaces.length * 12);
  const normals = new Float32Array(surfaces.length * 12);
  const colors = new Float32Array(surfaces.length * 12);
  const indices = new Uint32Array(surfaces.length * 6);
  const color = new Color();

  surfaces.forEach((surface, i) => {
    const { origin, uAxis, vAxis, normal, width, height } = surface;
    color.setHex(BLOCK_COLORS[map.blocks[surface.blockIndex].kind]);
    CORNERS.forEach(([u, v], corner) => {
      const k = (i * 4 + corner) * 3;
      positions[k] = origin.x + uAxis.x * u * width + vAxis.x * v * height;
      positions[k + 1] = origin.y + uAxis.y * u * width + vAxis.y * v * height;
      positions[k + 2] = origin.z + uAxis.z * u * width + vAxis.z * v * height;
      normals.set([normal.x, normal.y, normal.z], k);
      colors.set([color.r, color.g, color.b], k);
    });
    const first = i * 4;
    indices.set([first, first + 1, first + 2, first, first + 2, first + 3], i * 6);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));

  const material = new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    vertexColors: true,
    uniforms: {
      uSunDirection: { value: new Vector3(...SUN_DIRECTION).normalize() },
      uSunColor: { value: new Color(0xffffff) },
      uSkyColor: { value: new Color(SKY_COLOR) },
      uGroundColor: { value: new Color(HEMISPHERE_GROUND_COLOR) },
    },
  });
  return new Mesh(geometry, material);
}
