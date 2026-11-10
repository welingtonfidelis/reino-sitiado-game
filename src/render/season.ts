/**
 * Etapa 16: estações do ano, só no visual. Primavera, verão, outono e inverno se revezam a cada
 * cinco ondas: a grama muda de tom, as copas ficam rosadas, verde-escuras, laranja ou geladas,
 * a neve cobre telhados e chão no inverno, e o céu solta pétalas, pólen, folhas, chuva ou neve.
 * Também ficam aqui as sombras das nuvens passando no chão.
 */
import * as THREE from 'three';
import { seasonOf } from '../sim/index.ts';

export { seasonOf };

/** Valores que os materiais leem (os mesmos objetos em todos: mudar aqui muda todos). */
export const SEASON_U = {
  uSnow: { value: 0 },
  uGrassTint: { value: new THREE.Vector3(1, 1, 1) },
  uLeafA: { value: new THREE.Color('#f4a6c6') },
  uLeafB: { value: new THREE.Color('#a6dc74') },
  uLeafMix: { value: 0 },
  uLeafKeep: { value: 0.45 },
  uTime: { value: 0 },
  /** Sombra das nuvens no chão (0 nos gráficos leves). */
  uClouds: { value: 1 },
};

interface Look {
  grass: [number, number, number];
  leafA: string;
  leafB: string;
  leafMix: number;
  /** Quanto a copa guarda o brilho da cor nova (1) em vez da sombra da textura (0). */
  keep: number;
  snow: number;
  sun: string;
  sunK: number;
}

/** Cara de cada estação: tom da grama, das copas (duas cores, metade das árvores cada), neve e sol. */
const LOOKS: Look[] = [
  { grass: [1, 1.04, 0.96], leafA: '#ffb3d6', leafB: '#9fd86c', leafMix: 0.9, keep: 0.85, snow: 0, sun: '#fff4e4', sunK: 1 },
  { grass: [1.06, 1.02, 0.84], leafA: '#5e9e3a', leafB: '#7cae3c', leafMix: 0.25, keep: 0.3, snow: 0, sun: '#fff0d0', sunK: 1.06 },
  { grass: [1.12, 0.9, 0.64], leafA: '#e88a2c', leafB: '#c8462a', leafMix: 0.85, keep: 0.5, snow: 0, sun: '#ffe0bc', sunK: 0.96 },
  { grass: [0.94, 0.97, 1.03], leafA: '#eef3f8', leafB: '#d6e2ee', leafMix: 0.6, keep: 0.65, snow: 0.85, sun: '#e6eeff', sunK: 0.92 },
];

export type WeatherKind = 'petalas' | 'polen' | 'folhas' | 'chuva' | 'neve';

/** O que cai do céu agora. A chuva vem em algumas ondas da primavera e do outono. */
export function weatherOf(season: number, wave: number, attack: boolean, seed: number): WeatherKind {
  const roll = (((seed * 31 + wave * 17) >>> 0) % 6) / 6;
  if (season === 0) return attack && roll < 0.34 ? 'chuva' : 'petalas';
  if (season === 1) return 'polen';
  if (season === 2) return attack && roll < 0.5 ? 'chuva' : 'folhas';
  return 'neve';
}

const SNOW_GLSL = /* glsl */ `
  // Neve em cima do que olha para o céu (telhados, copas, pedras).
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.96), uSnow * smoothstep(0.55, 0.85, vUp));`;

const UP_VERT = /* glsl */ `#include <defaultnormal_vertex>
  vec3 upN = objectNormal;
  #ifdef USE_INSTANCING
    upN = mat3(instanceMatrix) * upN;
    vVar = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  #else
    vVar = 0.5;
  #endif
  vUp = normalize(mat3(modelMatrix) * upN).y;`;

const patched = new WeakSet<THREE.Material>();

/** Prédios, pedras e montanhas: neve por cima no inverno. Muda o material na hora (são compartilhados). */
export function snowy(m: THREE.Material): void {
  if (patched.has(m)) return;
  patched.add(m);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = SEASON_U.uSnow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vUp;\nvarying float vVar;')
      .replace('#include <defaultnormal_vertex>', UP_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnow;\nvarying float vUp;\nvarying float vVar;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + SNOW_GLSL);
  };
  m.customProgramCacheKey = () => 'reino-snowy';
}

/** Árvores: cópia do material com as copas na cor da estação (o tronco marrom fica). */
export function leafy(m: THREE.Material): THREE.Material {
  const c = m.clone();
  patched.add(c);
  c.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uSnow: SEASON_U.uSnow, uLeafA: SEASON_U.uLeafA, uLeafB: SEASON_U.uLeafB, uLeafMix: SEASON_U.uLeafMix, uLeafKeep: SEASON_U.uLeafKeep });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vUp;\nvarying float vVar;')
      .replace('#include <defaultnormal_vertex>', UP_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnow;\nuniform vec3 uLeafA;\nuniform vec3 uLeafB;\nuniform float uLeafMix;\nuniform float uLeafKeep;\nvarying float vUp;\nvarying float vVar;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Folha é o que puxa para o verde; cada árvore pega uma das duas cores da estação.
        float green = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);
        float leaf = smoothstep(0.01, 0.06, green);
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        vec3 tone = mix(uLeafA, uLeafB, step(0.5, vVar));
        float toneLum = max(0.05, dot(tone, vec3(0.3, 0.59, 0.11)));
        vec3 seasonal = tone * mix(lum / toneLum, 1.0, uLeafKeep);
        diffuseColor.rgb = mix(diffuseColor.rgb, seasonal, leaf * uLeafMix);
        ${SNOW_GLSL}`,
      );
  };
  c.customProgramCacheKey = () => 'reino-leafy';
  return c;
}

/** Trecho do chão: tom da grama, neve em manchas e as sombras das nuvens. */
export const GROUND_SEASON = {
  head: /* glsl */ `
uniform float uSnow;
uniform vec3 uGrassTint;
uniform float uTime;
uniform float uClouds;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`,
  body: /* glsl */ `
  // Inverno: neve em manchas por cima da grama (o chão batido aparece mais).
  if (uSnow > 0.001) {
    float sn = uSnow * smoothstep(0.35, 0.6, gNoise(vGround * 0.45) * 0.6 + (1.0 - s) * 0.5);
    // Trilhas e quintais pisados (2026-11-10): a neve fica só na beira e a terra aparece molhada,
    // mais escura que a neve em volta: o caminho da vila não some no inverno.
    sn *= 1.0 - 0.9 * smoothstep(0.25, 0.7, vil);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.88, 0.95), sn);
    diffuseColor.rgb *= 1.0 - 0.14 * uSnow * vil;
  }
  // Sombra das nuvens passando devagar.
  if (uClouds > 0.5) {
    vec2 cw = vGround * 0.05 + uTime * vec2(0.025, 0.012);
    float cl = gNoise(cw) * 0.65 + gNoise(cw * 2.3 + 4.7) * 0.35;
    diffuseColor.rgb *= 1.0 - smoothstep(0.55, 0.75, cl) * 0.2;
  }`,
};

// ------------------------------------------------------------ o que cai do céu

const N = 1000;
const KIND: Record<WeatherKind, { n: number; fall: number; sway: number; size: number; a: string; b: string; alpha: number; id: number }> = {
  petalas: { n: 220, fall: 0.7, sway: 0.9, size: 0.17, a: '#ffc4dc', b: '#f590b8', alpha: 0.95, id: 0 },
  polen: { n: 140, fall: 0.12, sway: 0.5, size: 0.09, a: '#fff6c8', b: '#ffe08a', alpha: 0.8, id: 1 },
  folhas: { n: 200, fall: 1, sway: 1.3, size: 0.2, a: '#f0902c', b: '#b8452a', alpha: 0.95, id: 2 },
  chuva: { n: 900, fall: 15, sway: 0, size: 0.55, a: '#cfe2ff', b: '#a8c4ec', alpha: 0.35, id: 3 },
  neve: { n: 700, fall: 1.1, sway: 0.5, size: 0.13, a: '#ffffff', b: '#dfe8f4', alpha: 0.95, id: 4 },
};
const HALF = 28;
const TOP = 14;

const WEATHER_VERT = /* glsl */ `
attribute float aSeed;
uniform float uPx;
uniform float uSize;
uniform float uTime;
varying float vSeed;
varying float vAng;
void main() {
  vSeed = aSeed;
  vAng = aSeed * 6.28 + uTime * (0.6 + aSeed * 1.6);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * uPx * (0.7 + aSeed * 0.6);
}`;
const WEATHER_FRAG = /* glsl */ `
uniform int uKind;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uAlpha;
varying float vSeed;
varying float vAng;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float a;
  if (uKind == 3) {
    // Chuva: risco fino e um pouco inclinado.
    a = (1.0 - smoothstep(0.02, 0.06, abs(p.x + p.y * 0.25))) * (1.0 - smoothstep(0.3, 0.5, abs(p.y)));
  } else if (uKind == 0 || uKind == 2) {
    // Pétala e folha: elipse que gira e vira enquanto cai.
    float c = cos(vAng);
    float s = sin(vAng);
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    q.x *= 1.0 / (0.35 + 0.65 * abs(sin(vAng * 1.3)));
    q.y *= 1.8;
    a = 1.0 - smoothstep(0.34, 0.44, length(q));
  } else {
    // Pólen e neve: bolinha macia.
    a = 1.0 - smoothstep(0.15, 0.5, length(p));
  }
  if (a < 0.03) discard;
  gl_FragColor = vec4(mix(uColA, uColB, vSeed), a * uAlpha);
  #include <colorspace_fragment>
}`;

/** Partículas do tempo numa caixa que acompanha o centro da vista. */
export class Weather {
  readonly points: THREE.Points;
  private pos = new Float32Array(N * 3);
  private seed = new Float32Array(N);
  private kind: WeatherKind | null = null;
  private fade = 0;
  private mat: THREE.ShaderMaterial;
  private t = 0;
  /** Fração das partículas desenhadas (menos nos gráficos leves). */
  density = 1;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < N; i++) {
      this.seed[i] = Math.random();
      this.pos[i * 3] = (Math.random() * 2 - 1) * HALF;
      this.pos[i * 3 + 1] = Math.random() * TOP;
      this.pos[i * 3 + 2] = (Math.random() * 2 - 1) * HALF;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: WEATHER_VERT,
      fragmentShader: WEATHER_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uPx: { value: 30 },
        uSize: { value: 0.15 },
        uTime: { value: 0 },
        uKind: { value: 0 },
        uColA: { value: new THREE.Color() },
        uColB: { value: new THREE.Color() },
        uAlpha: { value: 1 },
      },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
    scene.add(this.points);
  }

  /** px: pixels da tela por metro (já com a densidade da tela). */
  update(want: WeatherKind, dt: number, cx: number, cz: number, px: number): void {
    this.t += dt;
    // Troca de tempo: some aos poucos e volta com o novo.
    if (want !== this.kind) {
      this.fade -= dt * 1.5;
      if (this.fade <= 0 || this.kind === null) {
        this.fade = 0;
        this.kind = want;
        const k = KIND[want];
        const u = this.mat.uniforms;
        u.uKind!.value = k.id;
        u.uSize!.value = k.size;
        (u.uColA!.value as THREE.Color).set(k.a);
        (u.uColB!.value as THREE.Color).set(k.b);
      }
    } else this.fade = Math.min(1, this.fade + dt * 0.8);
    const k = KIND[this.kind!];
    const u = this.mat.uniforms;
    u.uPx!.value = px;
    u.uTime!.value = this.t;
    u.uAlpha!.value = k.alpha * this.fade;
    const n = Math.round(k.n * this.density);
    this.points.geometry.setDrawRange(0, n);
    const p = this.pos;
    for (let i = 0; i < n; i++) {
      const s = this.seed[i]!;
      const j = i * 3;
      p[j + 1]! -= k.fall * (0.75 + s * 0.5) * dt;
      if (k.id === 1) p[j + 1]! += Math.sin(this.t * 0.7 + s * 20) * 0.25 * dt;
      p[j]! += (Math.sin(this.t * (0.8 + s) + s * 30) * k.sway + (k.id === 3 ? -2.5 : 0.3)) * dt;
      p[j + 2]! += Math.cos(this.t * (0.6 + s) + s * 17) * k.sway * 0.6 * dt;
      // Caiu no chão: volta lá em cima; saiu da caixa (a vista andou): entra pelo outro lado.
      if (p[j + 1]! < 0) {
        p[j + 1] = TOP * (0.8 + Math.random() * 0.2);
        p[j] = cx + (Math.random() * 2 - 1) * HALF;
        p[j + 2] = cz + (Math.random() * 2 - 1) * HALF;
      } else if (p[j + 1]! > TOP) p[j + 1] = 0.5;
      p[j] = cx + wrap(p[j]! - cx);
      p[j + 2] = cz + wrap(p[j + 2]! - cz);
    }
    this.points.geometry.attributes.position!.needsUpdate = true;
  }
}

function wrap(d: number): number {
  if (d > HALF) return d - 2 * HALF;
  if (d < -HALF) return d + 2 * HALF;
  return d;
}

/** Estado atual (vai andando até a estação pedida). */
export class SeasonLook {
  private grass = new THREE.Vector3(1, 1, 1);
  private leafA = new THREE.Color();
  private leafB = new THREE.Color();
  private leafMix = 0;
  private keep = 0.45;
  private snow = 0;
  readonly sun = new THREE.Color('#fff4e4');
  sunK = 1;
  private tmp = new THREE.Color();

  update(season: number, dt: number): void {
    const L = LOOKS[season] ?? LOOKS[0]!;
    const k = dt < 0 ? 1 : 1 - Math.exp(-dt * 0.7);
    this.grass.lerp(new THREE.Vector3(...L.grass), k);
    this.leafA.lerp(this.tmp.set(L.leafA), k);
    this.leafB.lerp(this.tmp.set(L.leafB), k);
    this.leafMix += (L.leafMix - this.leafMix) * k;
    this.keep += (L.keep - this.keep) * k;
    this.snow += (L.snow - this.snow) * k;
    this.sun.lerp(this.tmp.set(L.sun), k);
    this.sunK += (L.sunK - this.sunK) * k;
    SEASON_U.uGrassTint.value.copy(this.grass);
    SEASON_U.uLeafA.value.copy(this.leafA);
    SEASON_U.uLeafB.value.copy(this.leafB);
    SEASON_U.uLeafMix.value = this.leafMix;
    SEASON_U.uLeafKeep.value = this.keep;
    SEASON_U.uSnow.value = this.snow;
  }

  /** Partida nova ou carregada: já começa na estação certa. */
  snap(season: number): void {
    this.update(season, -1);
  }
}
