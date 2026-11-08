/**
 * Personagem do KayKit em cena: clone com esqueleto próprio, armas nas mãos e mixer de
 * animação. A troca de animação espera um instante para não piscar entre andar e parar.
 */
import * as THREE from 'three';
import { LARGE, cloneChar, findBone } from './assets.ts';
import type { Art, CharKey, WeaponKey } from './assets.ts';

export type Pose = 'idle' | 'walk' | 'run' | 'attack' | 'shoot' | 'aim' | 'dig' | 'chop' | 'pick' | 'cast' | 'heal' | 'repair' | 'death' | 'shoot2' | 'chop2' | 'spin' | 'cheer' | 'wave' | 'sit' | 'pushups' | 'claw';

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
  engenheiro: { r: 'marreta' },
  necromante: { r: 'cajadoOsso' },
  barbaro: { r: 'machadoGrande' },
  atiradora: { r: 'besta' },
  druida: { r: 'cajadoDruida' },
  cavaleiroNegro: { r: 'espadaNegra', l: 'escudoNegro' },
};

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
  /**
   * Ritmo próprio deste boneco (±8%): quem começa junto vai se desencontrando, e ninguém
   * bate a enxada, marcha ou atira no mesmo compasso do vizinho.
   */
  private readonly pace = 0.92 + Math.random() * 0.16;

  constructor(art: Art, kind: CharKey) {
    this.kind = kind;
    const model = cloneChar(art, kind);
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
    this.play('idle');
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
