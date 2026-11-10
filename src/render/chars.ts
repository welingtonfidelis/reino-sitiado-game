/**
 * Personagem do KayKit em cena: clone com esqueleto próprio, armas nas mãos e mixer de
 * animação. A troca de animação espera um instante para não piscar entre andar e parar.
 */
import * as THREE from 'three';
import { LARGE, cloneChar, findBone } from './assets.ts';
import type { Art, CharKey, StaticKey, WeaponKey } from './assets.ts';
import type { Res } from '../sim/index.ts';

export type Pose = 'idle' | 'walk' | 'run' | 'attack' | 'shoot' | 'aim' | 'dig' | 'chop' | 'pick' | 'cast' | 'heal' | 'repair' | 'death' | 'shoot2' | 'chop2' | 'spin' | 'cheer' | 'wave' | 'sit' | 'pushups' | 'claw' | 'stab';

const MEDIUM: Record<Pose, string> = {
  idle: 'Idle_A',
  walk: 'Walking_A',
  run: 'Running_A',
  cast: 'Ranged_Magic_Shoot',
  heal: 'Ranged_Magic_Raise',
  repair: 'Hammering',
  attack: 'Melee_1H_Attack_Chop',
  shoot: 'Ranged_Bow_Release',
  aim: 'Ranged_Bow_Aiming_Idle',
  dig: 'Digging',
  chop: 'Chopping',
  pick: 'Pickaxing',
  death: 'Death_A',
  // Heróis (Etapa 14): besta e machado de duas mãos, e o giro do Bárbaro.
  shoot2: 'Ranged_2H_Shoot',
  chop2: 'Melee_2H_Attack_Chop',
  spin: 'Melee_2H_Attack_Spin',
  // Etapa 16: festa da vitória e gente parada (Rig_Medium_Simulation).
  cheer: 'Cheering',
  wave: 'Waving',
  sit: 'Sit_Floor_Idle',
  pushups: 'Push_Ups',
  // Revisão de 2026-11-08: o lobisomem bate com as duas garras (o golpe de corte girava o
  // corpo e ele ficava de costas para o alvo).
  claw: 'Melee_Dualwield_Attack_Chop',
  // Lanceiro (2026-11-09): estocada com a lança.
  stab: 'Melee_1H_Attack_Stab',
};
const BIG: Record<Pose, string> = {
  idle: 'Idle_A',
  walk: 'Walking_A',
  run: 'Running_A',
  cast: 'Idle_A',
  heal: 'Idle_A',
  repair: 'Idle_A',
  attack: 'Melee_2H_Attack',
  shoot: 'Melee_2H_Attack',
  aim: 'Idle_A',
  dig: 'Idle_A',
  chop: 'Idle_A',
  pick: 'Idle_A',
  death: 'Death_A',
  shoot2: 'Melee_2H_Attack',
  chop2: 'Melee_2H_Attack',
  spin: 'Melee_2H_Attack',
  cheer: 'Idle_A',
  wave: 'Idle_A',
  sit: 'Idle_A',
  pushups: 'Idle_A',
  claw: 'Melee_2H_Attack',
  stab: 'Melee_2H_Attack',
};
/** Golpe próprio de quem é do rig grande mas luta com uma mão (espada e escudo). */
const BIG_BY_KIND: Partial<Record<CharKey, Partial<Record<Pose, string>>>> = {
  cavaleiroNegro: { attack: 'Melee_1H_Slash' },
};

/** Poses que contam do começo (o resto entra em laço num ponto qualquer). */
const ONCE = new Set<Pose>(['death', 'spin']);

const GEAR: Partial<Record<CharKey, { r?: WeaponKey; l?: WeaponKey }>> = {
  soldado: { r: 'espada', l: 'escudo' },
  arqueiro: { l: 'arco' },
  esqueleto: { r: 'lamina' },
  orc: { r: 'machado' },
  bruto: { r: 'machadoBruto' },
  golemOssos: { r: 'machadoGolem' },
  mago: { r: 'cajado' },
  clerigo: { r: 'maca' },
  cavaleiro: { r: 'martelo', l: 'escudoPaladino' },
  cavaleiroElmo: { r: 'martelo', l: 'escudoPaladino' },
  engenheiro: { r: 'marreta' },
  necromante: { r: 'cajadoOsso' },
  barbaro: { r: 'machadoGrande' },
  atiradora: { r: 'besta' },
  druida: { r: 'cajadoDruida' },
  cavaleiroNegro: { r: 'espadaNegra', l: 'escudoNegro' },
  esqueletoGuerreiro: { r: 'machadoOsso', l: 'escudoOsso' },
  vampiro: { r: 'espadaVampiro' },
  lanceiro: { r: 'lanca', l: 'escudo' },
  anao: { r: 'espingarda' },
  elfoA: { r: 'bengalaDoce' },
  elfoB: { r: 'bengalaDoce' },
};

/** Crista de crina vermelha do lanceiro: meia-lua achatada, de frente para trás. */
const CREST_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
const CREST_MAT = new THREE.MeshLambertMaterial({ color: '#c0392b', flatShading: true });

/**
 * Levar o trabalho (2026-11-10): o que o aldeão leva ao castelo ou ao celeiro. Tora no ombro
 * (feita aqui: a do KayKit é uma pilha), saco nas costas e carrinho de mão com pedra ou minério
 * na frente. Medidas do mundo, com o boneco de pé na origem, de frente para +z.
 */
const LOG_BARK = new THREE.MeshLambertMaterial({ color: '#7a4e2c', flatShading: true });
const LOG_END = new THREE.MeshLambertMaterial({ color: '#d8b07a', flatShading: true });
const PROPS = new WeakMap<Art, Map<Res, THREE.Group>>();

function staticMesh(art: Art, k: StaticKey, scale: number): THREE.Group {
  const g = new THREE.Group();
  for (const part of art.statics[k].parts) {
    const m = new THREE.Mesh(part.geometry, part.material);
    m.castShadow = true;
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}

function carryProp(art: Art, res: Res): THREE.Group {
  let all = PROPS.get(art);
  if (!all) PROPS.set(art, (all = new Map()));
  let g = all.get(res);
  if (g) return g;
  g = new THREE.Group();
  if (res === 'madeira') {
    const log = new THREE.Group();
    log.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.044, 0.42, 7).rotateX(Math.PI / 2), LOG_BARK));
    for (const z of [-0.212, 0.212]) log.add(new THREE.Mesh(new THREE.CircleGeometry(0.039, 7).rotateY(z > 0 ? 0 : Math.PI).translate(0, 0, z), LOG_END));
    log.position.set(0.12, 0.41, -0.03);
    log.rotation.x = -0.32;
    g.add(log);
  } else if (res === 'comida') {
    const sack = staticMesh(art, 'saco', 2.3);
    sack.position.set(0, 0.33, -0.13);
    sack.rotation.set(-0.5, 0, 0);
    g.add(sack);
  } else {
    const cart = staticMesh(art, 'carrinho', 1.15);
    cart.position.set(0, 0, 0.3);
    g.add(cart);
    const load = staticMesh(art, res === 'pedra' ? 'lascasB' : 'minerio', res === 'pedra' ? 0.055 : 0.07);
    load.position.set(0, 0.13, 0.36);
    g.add(load);
  }
  all.set(res, g);
  return g;
}

/** Etapa 19: material com a armadura trocada, um por material original e por textura. */
const SKIN_MATS = new Map<string, THREE.Material>();
function skinMat(base: THREE.Material, t: THREE.Texture): THREE.Material {
  const key = `${base.uuid}:${t.uuid}`;
  let m = SKIN_MATS.get(key);
  if (!m) {
    m = base.clone();
    (m as THREE.MeshLambertMaterial).map = t;
    SKIN_MATS.set(key, m);
  }
  return m;
}

export class CharView {
  readonly root = new THREE.Group();
  readonly kind: CharKey;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Pose, THREE.AnimationAction>();
  private current: Pose | null = null;
  private want: Pose | null = null;
  private wantFor = 0;
  private art: Art;
  private handR: THREE.Object3D | null = null;
  private tool: THREE.Object3D | null = null;
  private toolKey: WeaponKey | null = null;
  private model: THREE.Object3D;
  /** Etapa 19: malhas com textura (corpo e armas) e o material de cada uma, para trocar a armadura. */
  private skinned: { mesh: THREE.Mesh; base: THREE.Material }[] | null = null;
  private skin: THREE.Texture | null = null;
  /**
   * Ritmo próprio deste boneco (±8%): quem começa junto vai se desencontrando, e ninguém
   * bate a enxada, marcha ou atira no mesmo compasso do vizinho.
   */
  private readonly pace = 0.92 + Math.random() * 0.16;

  constructor(art: Art, kind: CharKey) {
    this.kind = kind;
    const model = cloneChar(art, kind);
    this.model = model;
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    const names = LARGE.has(kind) ? BIG : MEDIUM;
    const clips = LARGE.has(kind) ? art.clipsLarge : art.clips;
    const own = LARGE.has(kind) ? BIG_BY_KIND[kind] : undefined;
    for (const pose of Object.keys(names) as Pose[]) {
      const clip = clips.get(own?.[pose] ?? names[pose]);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (pose === 'death') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(pose, a);
    }
    this.art = art;
    this.handR = findBone(model, ['handslotr', 'handslot.r']) ?? null;
    const gear = GEAR[kind];
    if (gear?.r) this.handR?.add(art.weapons[gear.r].clone(true));
    if (gear?.l) findBone(model, ['handslotl', 'handslot.l'])?.add(art.weapons[gear.l].clone(true));
    // Tropas novas (2026-11-09): crista do lanceiro, elmo de chifres e corpo largo do anão.
    const head = findBone(model, ['head']);
    if (kind === 'lanceiro' && head) {
      const crest = new THREE.Mesh(CREST_GEO, CREST_MAT);
      crest.position.set(0, 0.98, -0.02);
      crest.scale.setScalar(1.15);
      head.add(crest);
    }
    if (kind === 'anao') {
      head?.add(art.weapons.elmoChifres.clone(true));
      model.scale.multiply(new THREE.Vector3(1.12, 0.9, 1.12));
    }
    this.play('idle');
  }

  /**
   * Etapa 19: troca a armadura (textura do corpo e das armas, que usam o mesmo atlas do KayKit);
   * null volta à original.
   */
  setSkin(t: THREE.Texture | null): void {
    if (t === this.skin) return;
    this.skin = t;
    if (!this.skinned) {
      const list: { mesh: THREE.Mesh; base: THREE.Material }[] = [];
      this.model.traverse((o) => {
        if (o instanceof THREE.Mesh && !Array.isArray(o.material) && (o.material as THREE.MeshLambertMaterial).map) list.push({ mesh: o, base: o.material });
      });
      this.skinned = list;
    }
    for (const s of this.skinned) s.mesh.material = t ? skinMat(s.base, t) : s.base;
  }

  private carried: THREE.Object3D | null = null;
  private carriedRes: Res | null = null;

  /** O que vai nos braços (2026-11-10); null = nada. */
  setCarry(res: Res | null): void {
    if (res === this.carriedRes) return;
    if (this.carried) this.root.remove(this.carried);
    this.carried = res ? carryProp(this.art, res).clone(true) : null;
    if (this.carried) this.root.add(this.carried);
    this.carriedRes = res;
  }

  /** Ferramenta na mão direita, trocada conforme o trabalho (null = mãos vazias). */
  setTool(k: WeaponKey | null): void {
    if (k === this.toolKey || !this.handR) return;
    if (this.tool) this.handR.remove(this.tool);
    this.tool = k ? this.art.weapons[k].clone(true) : null;
    if (this.tool) this.handR.add(this.tool);
    this.toolKey = k;
  }

  play(pose: Pose, speed = 1): void {
    const a = this.actions.get(pose) ?? this.actions.get('idle');
    if (!a) return;
    a.timeScale = pose === 'death' ? speed : speed * this.pace;
    if (this.current === pose) {
      this.want = null;
      return;
    }
    if (this.current && pose !== 'death') {
      if (this.want !== pose) {
        this.want = pose;
        this.wantFor = 0;
        return;
      }
      if (this.wantFor < 0.12) return;
    }
    this.want = null;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    a.reset();
    // Animação em laço começa num ponto qualquer dela: quem chega ao serviço, à luta ou à
    // marcha no mesmo instante não fica espelhando o outro. A queda e o giro do Bárbaro
    // contam do começo.
    if (!ONCE.has(pose)) a.time = Math.random() * a.getClip().duration;
    a.play();
    if (prev && prev !== a) a.crossFadeFrom(prev, pose === 'death' ? 0.1 : 0.2, false);
    this.current = pose;
  }

  update(dt: number): void {
    this.wantFor += dt;
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
  }
}
