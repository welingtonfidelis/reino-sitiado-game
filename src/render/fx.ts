/**
 * Efeitos do pixelfx na cena (Etapa 3): quadros de pixel art em quadrados virados para a câmera,
 * presos a um ponto do mundo pela origem do efeito (o chão onde ele acontece). Um tipo de
 * efeito = uma textura e uma malha instanciada; nada é alocado por efeito tocado.
 * A animação anda no tempo de jogo: congela na pausa e acelera no 2× e 3×.
 */
import * as THREE from 'three';
import { FX_SHEETS } from './fxSheets.ts';
import type { FxKey } from './fxSheets.ts';

/** Metros do mundo por pixel do efeito (de perto). */
export const FX_SCALE: Record<FxKey, number> = {
  faisca: 0.013,
  pancada: 0.015,
  espada: 0.012,
  garra: 0.012,
  poof: 0.014,
  explosao: 0.018,
  fogo: 0.024,
  portal: 0.022,
  nivel: 0.03,
  moedas: 0.022,
  mana: 0.012,
  cura: 0.013,
  golpe: 0.012,
  morcego: 0.012,
  alma: 0.011,
  bloom: 0.012,
  // Heróis (Etapa 14): o tamanho na tela casa com o raio do golpe (com SPECIAL_SCALE do world3d).
  giro: 0.018,
  chuva: 0.02,
  raizes: 0.009,
  pisao: 0.02,
  bencao: 0.012,
  // Etapa 16: festa e mundo vivo.
  fogos: 0.02,
  confete: 0.028,
  borboleta: 0.009,
  passaro: 0.03,
  respingo: 0.008,
};
const CAP: Record<FxKey, number> = { faisca: 96, pancada: 64, espada: 48, garra: 64, poof: 64, explosao: 8, fogo: 48, portal: 4, nivel: 2, moedas: 2, mana: 32, cura: 48, golpe: 32, morcego: 128, alma: 32, bloom: 24, giro: 8, chuva: 8, raizes: 24, pisao: 8, bencao: 8, fogos: 16, confete: 4, borboleta: 24, passaro: 8, respingo: 6 };

const VERT = /* glsl */ `
attribute vec4 aPos;   // xyz âncora, w = escala (m por px)
attribute vec4 aData;  // x quadro, y espelha (1 ou -1), z opacidade, w ativo
uniform vec4 uCell;    // cw, ch, ox, oy (px)
uniform vec4 uSheet;   // largura e altura da folha, colunas, piso de escala
varying vec2 vUv;
varying float vAlpha;
void main() {
  if (aData.w < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float s = max(aPos.w, uSheet.w);
  vec4 mv = viewMatrix * vec4(aPos.xyz, 1.0);
  // Canto do quadrado em px do quadro (y para baixo), relativo à origem do efeito.
  float px = position.x * uCell.x;
  float py = (1.0 - position.y) * uCell.y;
  mv.x += (px - uCell.z) * s * aData.y;
  mv.y += (uCell.w - py) * s;
  // Um pouco para a frente: o efeito não entra no corpo de quem apanha.
  mv.z += 1.2;
  gl_Position = projectionMatrix * mv;
  float f = aData.x;
  float col = mod(f, uSheet.z);
  float row = floor(f / uSheet.z);
  vUv = vec2((col * uCell.x + px) / uSheet.x, (row * uCell.y + py) / uSheet.y);
  vAlpha = aData.z;
}`;
const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.02) discard;
  gl_FragColor = vec4(c.rgb, c.a * vAlpha);
  #include <colorspace_fragment>
}`;

interface Slot {
  t: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  flip: number;
  alpha: number;
  loop: boolean;
  on: boolean;
}

class FxKind {
  readonly mesh: THREE.Mesh;
  private pos: THREE.InstancedBufferAttribute;
  private data: THREE.InstancedBufferAttribute;
  private slots: Slot[] = [];
  private next = 0;
  readonly key: FxKey;
  readonly material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, key: FxKey, tex: THREE.Texture) {
    this.key = key;
    const s = FX_SHEETS[key];
    const cap = CAP[key];
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.data.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.pos);
    g.setAttribute('aData', this.data);
    g.instanceCount = cap;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      // Os de aviso (novo nível, moedas) ficam sempre por cima do castelo.
      depthTest: key !== 'nivel' && key !== 'moedas',
      // Espelhado, o quadrado fica de costas: os dois lados contam.
      side: THREE.DoubleSide,
      uniforms: {
        uMap: { value: tex },
        uCell: { value: new THREE.Vector4(s.cw, s.ch, s.ox, s.oy) },
        uSheet: { value: new THREE.Vector4(s.w, s.h, s.cols, 0) },
      },
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    scene.add(this.mesh);
    for (let i = 0; i < cap; i++) this.slots.push({ t: 0, x: 0, y: 0, z: 0, scale: 1, flip: 1, alpha: 1, loop: false, on: false });
  }

  /** Toca uma vez (ou em laço) e devolve o lugar usado. */
  play(x: number, y: number, z: number, scale: number, flip: boolean, loop = false): number {
    let i = this.slots.findIndex((s) => !s.on);
    if (i < 0) {
      if (loop) return -1;
      i = this.next;
      this.next = (this.next + 1) % this.slots.length;
    }
    Object.assign(this.slots[i]!, { t: 0, x, y, z, scale, flip: flip ? -1 : 1, alpha: 1, loop, on: true });
    return i;
  }

  move(i: number, x: number, y: number, z: number): void {
    const s = this.slots[i];
    if (s) Object.assign(s, { x, y, z });
  }

  stop(i: number): void {
    const s = this.slots[i];
    if (s) s.on = false;
  }

  update(dt: number, minScale: number): void {
    const sh = FX_SHEETS[this.key];
    const p = this.pos.array as Float32Array;
    const d = this.data.array as Float32Array;
    this.slots.forEach((s, i) => {
      if (s.on) {
        s.t += dt;
        let f = Math.floor(s.t * sh.fps);
        if (s.loop) f %= sh.frames;
        else if (f >= sh.frames) s.on = false;
        p.set([s.x, s.y, s.z, s.scale], i * 4);
        d.set([Math.min(f, sh.frames - 1), s.flip, s.alpha, s.on ? 1 : 0], i * 4);
      } else d[i * 4 + 3] = 0;
    });
    this.material.uniforms.uSheet!.value.w = minScale;
    this.pos.needsUpdate = true;
    this.data.needsUpdate = true;
  }
}

export class FxLayer {
  private kinds = new Map<FxKey, FxKind>();

  static async load(scene: THREE.Scene, base: string): Promise<FxLayer> {
    const layer = new FxLayer();
    const loader = new THREE.TextureLoader();
    await Promise.all(
      (Object.keys(FX_SHEETS) as FxKey[]).map(async (k) => {
        const tex = await loader.loadAsync(base + FX_SHEETS[k].file);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        layer.kinds.set(k, new FxKind(scene, k, tex));
      }),
    );
    return layer;
  }

  play(key: FxKey, x: number, y: number, z: number, opts: { flip?: boolean; scale?: number; loop?: boolean } = {}): number {
    return this.kinds.get(key)?.play(x, y, z, (opts.scale ?? 1) * FX_SCALE[key], !!opts.flip, !!opts.loop) ?? -1;
  }

  move(key: FxKey, i: number, x: number, y: number, z: number): void {
    this.kinds.get(key)?.move(i, x, y, z);
  }

  stop(key: FxKey, i: number): void {
    this.kinds.get(key)?.stop(i);
  }

  /** `pxPerMeter`: pixels de tela por metro; o efeito nunca fica menor que meio pixel de tela por px. */
  update(dt: number, pxPerMeter: number): void {
    const minScale = 0.5 / Math.max(1, pxPerMeter);
    for (const k of this.kinds.values()) k.update(dt, minScale);
  }
}
