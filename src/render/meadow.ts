/**
 * Chão vivo (protótipo de 2026-11-10, a partir do What the Sea Keeps 0.3): tufos de grama e
 * flores em cima do chão de grama, balançando ao vento. Tudo instanciado (um desenho para a grama
 * e um para as flores). Fica fora de prédio, quintal, trilha, pátio do castelo, fenda e água.
 * A grama segue o tom da estação e embranquece e baixa na neve; as flores somem no inverno e
 * ficam poucas no outono. A densidade vem dos gráficos (no leve, um terço).
 */
import * as THREE from 'three';
import { HEX, hexDist, hexToWorld } from '../sim/index.ts';
import type { World } from '../sim/index.ts';
import { SEASON_U } from './season.ts';

const TUFTS = 14;
const MAX_TUFTS = 32000;
const MAX_FLOWERS = 9000;
const FLOWER_COLORS = ['#ff8fbf', '#ffd84a', '#fff4e6', '#b98cff', '#ff6a5a', '#8fd3ff', '#ffb347'].map((c) => new THREE.Color(c));

/** Uniformes do chão vivo (o vento corre com o tempo do jogo; as flores com a estação). */
export const MEADOW_U = {
  uTime: { value: 0 },
  uFlowers: { value: 1 },
  uBase: { value: new THREE.Color('#4e7a2a') },
  uTip: { value: new THREE.Color('#b4d470') },
};

function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function vnoise(x: number, z: number): number {
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

/**
 * Tufo: sete folhas largas abertas em leque (de cima parece uma estrelinha fofa, como o capim do
 * jogo de referência); `aTip` 0 na base e 1 na ponta.
 */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const tip: number[] = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (k % 2) * 0.35;
    const h = 0.09 + ((k * 37) % 5) * 0.014;
    const out = 0.09 + ((k * 13) % 3) * 0.025;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const w = 0.03;
    pos.push(-cz * w, 0, cx * w);
    pos.push(cz * w, 0, -cx * w);
    pos.push(cx * out, h, cz * out);
    tip.push(0, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  // Normal para cima: a folha pega a luz como o chão, dos dois lados.
  const nor: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) nor.push(0, 1, 0);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** Flor: talo fino e uma corola de seis pétalas (leque); `aPart` 0 talo, 1 pétala, 2 miolo. */
function flowerGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const part: number[] = [];
  const top = 0.12;
  pos.push(-0.008, 0, 0, 0.008, 0, 0, 0, top, 0);
  part.push(0, 0, 0);
  const r = 0.068;
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2;
    const a1 = ((k + 1) / 6) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    // Pétala: do miolo até a ponta arredondada (a ponta do meio vai mais longe).
    pos.push(0, top + 0.004, 0, Math.cos(a1) * r * 0.75, top, Math.sin(a1) * r * 0.75, Math.cos(am) * r, top + 0.002, Math.sin(am) * r);
    part.push(2, 1, 1);
    pos.push(0, top + 0.004, 0, Math.cos(am) * r, top + 0.002, Math.sin(am) * r, Math.cos(a0) * r * 0.75, top, Math.sin(a0) * r * 0.75);
    part.push(2, 1, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  const nor: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) nor.push(0, 1, 0);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

const WIND = /* glsl */ `
  vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
  float wv = sin(uTime * 1.6 + ip.x * 0.45 + ip.z * 0.3) * 0.6 + sin(uTime * 2.7 + ip.x * 1.3 - ip.z * 0.9) * 0.4;`;

function grassMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: MEADOW_U.uTime, uBase: MEADOW_U.uBase, uTip: MEADOW_U.uTip, uSnow: SEASON_U.uSnow, uGrassTint: SEASON_U.uGrassTint });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTip;\nuniform float uTime;\nuniform float uSnow;\nvarying float vTip;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${WIND}
        transformed.x += wv * 0.04 * aTip;
        transformed.z += wv * 0.022 * aTip;
        transformed.y *= 1.0 - 0.45 * uSnow;
        vTip = aTip;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);')
      .replace('#include <common>', '#include <common>\nuniform vec3 uBase;\nuniform vec3 uTip;\nuniform vec3 uGrassTint;\nuniform float uSnow;\nvarying float vTip;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(uBase, uTip, vTip) * uGrassTint;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.96), uSnow * (0.35 + 0.55 * vTip));`,
      );
  };
  m.customProgramCacheKey = () => 'reino-grama';
  return m;
}

function flowerMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: MEADOW_U.uTime, uFlowers: MEADOW_U.uFlowers });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart;\nuniform float uTime;\nuniform float uFlowers;\nvarying float vPart;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${WIND}
        float up = transformed.y / 0.12;
        transformed.x += wv * 0.03 * up;
        transformed.z += wv * 0.018 * up;
        transformed *= uFlowers;
        vPart = aPart;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);')
      .replace('#include <common>', '#include <common>\nvarying float vPart;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Talo verde, pétala na cor da flor, miolo amarelado e mais claro.
        if (vPart < 0.5) diffuseColor.rgb = vec3(0.09, 0.22, 0.04);
        else diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.78, 0.2), smoothstep(1.2, 2.0, vPart) * 0.75) * 1.15;`,
      );
  };
  m.customProgramCacheKey = () => 'reino-flor';
  return m;
}

export interface MeadowAvoid {
  yards: { x: number; z: number }[];
  trails: { x: number; z: number }[][];
}

export class Meadow {
  readonly grass: THREE.InstancedMesh;
  readonly flowers: THREE.InstancedMesh;
  private key = '';
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.grass = new THREE.InstancedMesh(tuftGeometry(), grassMaterial(), MAX_TUFTS);
    this.flowers = new THREE.InstancedMesh(flowerGeometry(), flowerMaterial(), MAX_FLOWERS);
    for (const im of [this.grass, this.flowers]) {
      im.count = 0;
      im.frustumCulled = false;
      im.receiveShadow = true;
      im.userData.noAO = true;
      im.setColorAt(0, new THREE.Color('#ffffff'));
      scene.add(im);
    }
  }

  set visible(v: boolean) {
    this.grass.visible = v;
    this.flowers.visible = v;
  }

  /**
   * Espalha a grama e as flores. Só refaz quando muda o que conta (terreno, prédios, vila e
   * densidade), então pode ser chamado a cada sincronização.
   */
  build(w: World, avoid: MeadowAvoid, density: number): void {
    const busy: number[] = [];
    for (const t of w.list) if (t.b >= 0 || t.ruin) busy.push(t.i);
    const key = `${w.land}|${density}|${busy.join(',')}|${avoid.yards.length}|${avoid.trails.length}`;
    if (key === this.key) return;
    this.key = key;
    const segs: [number, number, number, number][] = [];
    for (const t of avoid.trails) for (let i = 0; i + 1 < t.length; i++) segs.push([t[i]!.x, t[i]!.z, t[i + 1]!.x, t[i + 1]!.z]);
    const blocked = (x: number, z: number) => {
      for (const y of avoid.yards) if ((x - y.x) ** 2 + (z - y.z) ** 2 < 1.25 * 1.25) return true;
      for (const [ax, az, bx, bz] of segs) {
        const dx = bx - ax;
        const dz = bz - az;
        const l = dx * dx + dz * dz || 1;
        const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l));
        if ((x - ax - dx * k) ** 2 + (z - az - dz * k) ** 2 < 0.5 * 0.5) return true;
      }
      return false;
    };
    let ng = 0;
    let nf = 0;
    const r = HEX * 0.86;
    for (const t of w.list) {
      if (t.terrain !== 'grass' || t.b >= 0 || t.ruin || hexDist(t.q, t.r, 0, 0) <= 1) continue;
      const c = hexToWorld(t.q, t.r);
      const n = Math.round(TUFTS * density);
      for (let k = 0; k < n && ng < MAX_TUFTS; k++) {
        const a = hash(t.i, k) * Math.PI * 2;
        const d = Math.sqrt(hash(k, t.i + 0.5)) * r;
        const x = c.x + Math.cos(a) * d;
        const z = c.z + Math.sin(a) * d;
        if (blocked(x, z)) continue;
        const sc = 0.75 + hash(t.i + 3.1, k) * 0.7;
        this.m.compose(this.p.set(x, 0, z), this.q.identity(), this.s.set(sc, sc * (0.8 + hash(k + 9.3, t.i) * 0.5), sc));
        this.grass.setMatrixAt(ng, this.m);
        const v = 0.86 + hash(t.i, k + 7.7) * 0.26;
        this.grass.setColorAt(ng, this.c.setRGB(v, v * (0.97 + hash(k, t.i + 2.2) * 0.06), v * 0.92));
        ng++;
      }
      // Canteiros de flores onde o ruído de longe passa do ponto: dois ou três montinhos de uma cor.
      const patch = vnoise(c.x * 0.16 + 3.7, c.z * 0.16 - 1.3);
      if (patch < 0.56) continue;
      const clumps = 1 + Math.floor(hash(t.i, 41) * 3);
      for (let k = 0; k < clumps; k++) {
        const ca = hash(t.i, 50 + k) * Math.PI * 2;
        const cd = Math.sqrt(hash(60 + k, t.i)) * r * 0.8;
        const cx = c.x + Math.cos(ca) * cd;
        const cz = c.z + Math.sin(ca) * cd;
        const col = FLOWER_COLORS[Math.floor(hash(t.i + k, 77) * FLOWER_COLORS.length)]!;
        const m = Math.round((6 + hash(t.i, 80 + k) * 8) * Math.min(1, density * 1.5));
        for (let j = 0; j < m && nf < MAX_FLOWERS; j++) {
          const a = hash(t.i * 3 + k, j) * Math.PI * 2;
          const d = Math.sqrt(hash(j, t.i * 3 + k)) * 0.38;
          const x = cx + Math.cos(a) * d;
          const z = cz + Math.sin(a) * d;
          if (blocked(x, z)) continue;
          const sc = 0.8 + hash(j + 4.4, t.i) * 0.5;
          this.m.compose(this.p.set(x, 0, z), this.q.setFromAxisAngle(this.s.set(0, 1, 0), a * 3), this.s.set(sc, sc * (0.7 + hash(j, k + 5.5) * 0.6), sc));
          this.flowers.setMatrixAt(nf, this.m);
          this.flowers.setColorAt(nf, col);
          nf++;
        }
      }
    }
    this.grass.count = ng;
    this.flowers.count = nf;
    for (const im of [this.grass, this.flowers]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
