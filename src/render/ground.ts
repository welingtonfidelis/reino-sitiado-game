/**
 * Chão contínuo por cima da grade hexagonal (que continua valendo para a lógica). Cada
 * hexágono vira seis triângulos sem fresta.
 *
 * Etapa 8: o chão tem textura de grama e de solo (feitas na hora em canvas, sem arquivo),
 * projetadas pela posição no mundo, então não seguem a grade. O peso do solo em cada vértice
 * mistura os terrenos vizinhos, manchas de ruído e o pátio de terra do castelo. Os lagos
 * afundam o chão e ganham uma água com reflexo animado. A borda do mapa tem uma encosta de
 * terra, como uma maquete. As linhas da grade são uma malha à parte, ligada só ao construir.
 */
import * as THREE from 'three';
import { HEX, hexToWorld, worldToHex } from '../sim/index.ts';
import type { Terrain, World } from '../sim/index.ts';

/** Tom por cima da textura (1 = como a textura) e quanto de solo aparece em cada terreno. */
const LOOK: Record<Terrain, { tint: [number, number, number]; soil: number }> = {
  grass: { tint: [1, 1, 1], soil: 0 },
  forest: { tint: [0.78, 0.9, 0.72], soil: 0.15 },
  rock: { tint: [0.95, 0.93, 0.9], soil: 0.85 },
  ore: { tint: [0.98, 0.92, 0.86], soil: 0.75 },
  crystal: { tint: [0.92, 0.94, 1], soil: 0.75 },
  rift: { tint: [0.62, 0.52, 0.72], soil: 1 },
  water: { tint: [1.05, 0.98, 0.85], soil: 1 },
};
const EARTH_TOP = new THREE.Color('#8a6a4a');
const EARTH_BOTTOM = new THREE.Color('#4a3420');
const BASIN = -0.32;

function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Ruído de valor suave (0 a 1). */
function noise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function terrainAt(w: World, x: number, z: number): Terrain | null {
  const h = worldToHex(x, z);
  if (!w.grid.has(h.q, h.r)) return null;
  return w.tiles[w.grid.idx(h.q, h.r)]!.terrain;
}

/** Terrenos em volta do ponto (seis amostras e o próprio). */
function around(w: World, x: number, z: number, own: Terrain): Terrain[] {
  const out: Terrain[] = [own];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    out.push(terrainAt(w, x + Math.cos(a) * 0.55, z + Math.sin(a) * 0.55) ?? own);
  }
  return out;
}

interface Vtx {
  tint: [number, number, number];
  soil: number;
  y: number;
  /** Fração de água em volta (0 a 1): o contorno do lago passa onde ela vale 0,5. */
  wet: number;
}

function vertexAt(w: World, x: number, z: number, own: Terrain, cx: number, cz: number): Vtx {
  const ts = around(w, x, z, own);
  const tint: [number, number, number] = [0, 0, 0];
  let soil = 0;
  for (const t of ts) {
    const l = LOOK[t];
    tint[0] += l.tint[0];
    tint[1] += l.tint[1];
    tint[2] += l.tint[2];
    soil += l.soil;
  }
  const n = ts.length;
  const k = 0.9 + 0.18 * noise(x * 0.3, z * 0.3);
  // Manchas de terra pelo campo e o pátio batido em volta do castelo.
  const patch = Math.max(0, (noise(x * 0.22 + 31, z * 0.22 - 17) - 0.68) * 2.6);
  const yard = Math.max(0, 1 - Math.hypot(x - cx, z - cz) / 2.6);
  const wet = ts.filter((t) => t === 'water').length / n;
  return {
    tint: [(tint[0] / n) * k, (tint[1] / n) * k, (tint[2] / n) * k],
    soil: Math.min(1, soil / n + patch + yard * 0.9),
    // O fundo do lago desce aos poucos a partir da margem.
    y: BASIN * Math.min(1, Math.max(0, (wet - 0.3) / 0.5)),
    wet,
  };
}

/** Textura repetível feita em canvas: grama com folhinhas ou solo com pedrinhas. */
function makeTexture(kind: 'grama' | 'solo'): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rand = (() => {
    let a = kind === 'grama' ? 7 : 13;
    return () => {
      a = (a * 16807) % 2147483647;
      return a / 2147483647;
    };
  })();
  // Desenha em volta da borda também, para a emenda não aparecer.
  const wrap = (draw: (ox: number, oy: number) => void) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) draw(ox, oy);
  };
  if (kind === 'grama') {
    g.fillStyle = '#6e9a3c';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const r = 12 + rand() * 30;
      const col = rand() < 0.5 ? 'rgba(90,128,48,0.35)' : 'rgba(132,170,70,0.3)';
      wrap((ox, oy) => {
        g.fillStyle = col;
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      });
    }
    const blades = ['#5b8a30', '#7fae46', '#94c056', '#4e7a2a', '#a6c866'];
    for (let i = 0; i < 2600; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const h = 3 + rand() * 5;
      const lean = (rand() - 0.5) * 3;
      const col = blades[Math.floor(rand() * blades.length)]!;
      wrap((ox, oy) => {
        g.strokeStyle = col;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + lean, y + oy - h);
        g.stroke();
      });
    }
  } else {
    g.fillStyle = '#9a7a54';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const r = 10 + rand() * 26;
      const col = rand() < 0.5 ? 'rgba(120,92,62,0.4)' : 'rgba(176,146,104,0.35)';
      wrap((ox, oy) => {
        g.fillStyle = col;
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      });
    }
    const stones = ['#7a6450', '#b8a07c', '#8c8070', '#c8b494', '#6a5644'];
    for (let i = 0; i < 700; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const r = 0.8 + rand() * 2.4;
      const col = stones[Math.floor(rand() * stones.length)]!;
      wrap((ox, oy) => {
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(x + ox, y + oy, r * 1.3, r, rand() * 3, 0, Math.PI * 2);
        g.fill();
      });
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let TEX: { grama: THREE.CanvasTexture; solo: THREE.CanvasTexture } | null = null;

function groundMaterial(): THREE.MeshLambertMaterial {
  TEX ??= { grama: makeTexture('grama'), solo: makeTexture('solo') };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrass = { value: TEX!.grama };
    sh.uniforms.uSoil = { value: TEX!.solo };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSoil;\nvarying float vSoil;\nvarying vec2 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSoil = aSoil;\nvGround = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uGrass;\nuniform sampler2D uSoil;\nvarying float vSoil;\nvarying vec2 vGround;')
      .replace(
        '#include <map_fragment>',
        `// Grama e solo pela posição no mundo (um quadro de textura a cada 3,5 m): não segue a grade.
        vec3 grass = texture2D(uGrass, vGround / 3.5).rgb;
        vec3 soil = texture2D(uSoil, vGround / 2.6 + 0.37).rgb;
        float s = smoothstep(0.25, 0.75, vSoil);
        diffuseColor.rgb *= mix(grass, soil, s) * 1.25;`,
      );
  };
  return m;
}

const WATER_VERT = /* glsl */ `
attribute float aShore;
varying float vShore; // aqui: fração de água (o nome ficou da versão anterior)
varying vec2 vXZ;
void main() {
  vShore = aShore;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vXZ = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const WATER_FRAG = /* glsl */ `
uniform float uTime;
varying float vShore;
varying vec2 vXZ;
void main() {
  // Contorno ondulado: a margem passa onde há metade de água, com um pouco de ruído.
  float edge = vShore + 0.06 * sin(vXZ.x * 3.3 + vXZ.y * 2.1) + 0.04 * sin(vXZ.y * 5.7 - vXZ.x * 1.3);
  if (edge < 0.42) discard;
  float depth = smoothstep(0.42, 0.95, edge);
  // Cores em espaço linear (a saída passa para sRGB e clareia).
  vec3 deep = vec3(0.012, 0.07, 0.13);
  vec3 shallow = vec3(0.05, 0.22, 0.26);
  vec3 c = mix(shallow, deep, depth);
  // Brilho que corre na superfície e espuma na margem.
  float w = sin(vXZ.x * 2.7 + uTime * 1.3) * sin(vXZ.y * 3.1 - uTime * 0.9) + sin((vXZ.x + vXZ.y) * 1.6 + uTime * 0.7) * 0.5;
  c += smoothstep(0.9, 1.4, w) * 0.08;
  float foam = 1.0 - smoothstep(0.42, 0.47, edge);
  c = mix(c, vec3(0.62, 0.72, 0.7), foam * (0.6 + 0.2 * sin(uTime * 2.0 + vXZ.x * 4.0)));
  gl_FragColor = vec4(c, 0.9);
  #include <colorspace_fragment>
}`;

export interface Ground {
  ground: THREE.Mesh;
  grid: THREE.LineSegments;
  water: THREE.Mesh | null;
}

export function buildGround(w: World): Ground {
  const pos: number[] = [];
  const col: number[] = [];
  const soil: number[] = [];
  const grid: number[] = [];
  const wpos: number[] = [];
  const wshore: number[] = [];
  const c0 = hexToWorld(0, 0);
  const corner = (cx: number, cz: number, k: number, r = HEX) => {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
  };
  const push = (x: number, y: number, z: number, tint: [number, number, number] | THREE.Color, s: number) => {
    pos.push(x, y, z);
    if (tint instanceof THREE.Color) col.push(tint.r, tint.g, tint.b);
    else col.push(tint[0], tint[1], tint[2]);
    soil.push(s);
  };
  for (const t of w.list) {
    const p = hexToWorld(t.q, t.r);
    const mid = vertexAt(w, p.x, p.z, t.terrain, c0.x, c0.z);
    const nearWater = mid.wet > 0;
    for (let k = 0; k < 6; k++) {
      const a = corner(p.x, p.z, k);
      const b = corner(p.x, p.z, k + 1);
      const va = vertexAt(w, a.x, a.z, t.terrain, c0.x, c0.z);
      const vb = vertexAt(w, b.x, b.z, t.terrain, c0.x, c0.z);
      // Ordem centro, b, a: a face olha para cima.
      push(p.x, mid.y, p.z, mid.tint, mid.soil);
      push(b.x, vb.y, b.z, vb.tint, vb.soil);
      push(a.x, va.y, a.z, va.tint, va.soil);
      grid.push(a.x, 0.02, a.z, b.x, 0.02, b.z);
      if (nearWater || va.wet > 0 || vb.wet > 0) {
        // A água cobre o lago e a beirada; o contorno sai do quanto de água há em volta.
        wpos.push(p.x, -0.07, p.z, b.x, -0.07, b.z, a.x, -0.07, a.z);
        wshore.push(mid.wet, vb.wet, va.wet);
      }
      // Borda do mapa: encosta de terra descendo.
      const ea = Math.PI / 3 + (k * Math.PI) / 3;
      const nx = Math.cos(ea);
      const nz = Math.sin(ea);
      if (terrainAt(w, p.x + nx * 2, p.z + nz * 2) === null) {
        const d = -1.4;
        push(a.x, va.y, a.z, EARTH_TOP, 1);
        push(b.x, vb.y, b.z, EARTH_TOP, 1);
        push(b.x, d, b.z, EARTH_BOTTOM, 1);
        push(a.x, va.y, a.z, EARTH_TOP, 1);
        push(b.x, d, b.z, EARTH_BOTTOM, 1);
        push(a.x, d, a.z, EARTH_BOTTOM, 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSoil', new THREE.Float32BufferAttribute(soil, 1));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, groundMaterial());
  ground.receiveShadow = true;
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false }));
  lines.visible = false;
  lines.renderOrder = 3;
  let water: THREE.Mesh | null = null;
  if (wpos.length) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    wg.setAttribute('aShore', new THREE.Float32BufferAttribute(wshore, 1));
    water = new THREE.Mesh(
      wg,
      new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } } }),
    );
    water.renderOrder = 2;
  }
  return { ground, grid: lines, water };
}
