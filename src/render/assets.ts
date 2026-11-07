/**
 * Arte do KayKit (CC0). Os modelos parados (ladrilho, natureza, prédios, muralha) viram uma
 * geometria só por material, para desenhar instanciado. Os personagens são clonados com
 * esqueleto próprio e recebem as animações dos arquivos de rig.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { MonsterKind, UnitKind } from '../sim/index.ts';

export const STATIC_MODELS = {
  castelo: 'medieval/building_castle_blue.gltf',
  casaA: 'medieval/building_home_A_blue.gltf',
  casaB: 'medieval/building_home_B_blue.gltf',
  fazenda: 'medieval/building_grain.gltf',
  moinho: 'medieval/building_windmill_blue.gltf',
  serraria: 'medieval/building_lumbermill_blue.gltf',
  pedreira: 'medieval/building_mine_yellow.gltf',
  mina: 'medieval/building_mine_blue.gltf',
  torre: 'medieval/building_tower_A_blue.gltf',
  quartel: 'medieval/building_barracks_blue.gltf',
  campo: 'medieval/building_archeryrange_blue.gltf',
  torreMago: 'medieval/building_tower_B_blue.gltf',
  capela: 'medieval/building_church_blue.gltf',
  estabulo: 'medieval/building_stables_blue.gltf',
  forja: 'medieval/building_blacksmith_blue.gltf',
  oficina: 'medieval/building_workshop_blue.gltf',
  catapulta: 'medieval/building_tower_catapult_blue.gltf',
  pedraCerco: 'medieval/projectile_catapult.gltf',
  obra: 'medieval/building_scaffolding.gltf',
  ruina: 'medieval/building_destroyed.gltf',
  muro: 'medieval/wall_straight.gltf',
  portao: 'medieval/wall_straight_gate.gltf',
  poste: 'medieval/building_tower_base_blue.gltf',
  arvoreA: 'medieval/trees_A_large.gltf',
  arvoreB: 'medieval/trees_B_large.gltf',
  arvoreC: 'medieval/trees_A_medium.gltf',
  arvoreD: 'medieval/trees_B_medium.gltf',
  rochaA: 'forest/Rock_1_A_Color1.gltf',
  rochaB: 'forest/Rock_2_A_Color1.gltf',
  rochaC: 'forest/Rock_3_A_Color1.gltf',
  rochaD: 'forest/Rock_4_A_Color1.gltf',
  montanhaA: 'medieval/mountain_A.gltf',
  montanhaB: 'medieval/mountain_B.gltf',
  montanhaC: 'medieval/mountain_C.gltf',
  morro: 'medieval/hill_single_C.gltf',
  pedraA: 'medieval/rock_single_A.gltf',
  pedraC: 'medieval/rock_single_C.gltf',
  minerio: 'resource/Iron_Nuggets.gltf',
  bandeira: 'medieval/flag_blue.gltf',
  feno: 'medieval/haybale.gltf',
  saco: 'medieval/sack.gltf',
  carrinho: 'medieval/wheelbarrow.gltf',
  flecha: 'medieval/projectile_arrow.gltf',
} as const;
export type StaticKey = keyof typeof STATIC_MODELS;

export interface StaticPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}
export interface StaticModel {
  parts: StaticPart[];
  box: THREE.Box3;
}

/** O morcego não é personagem: é um sprite do pixelfx (Etapa 6). */
export type CharKey = UnitKind | 'trabalhadorB' | Exclude<MonsterKind, 'morcego'>;
const CHAR_FILES: Record<CharKey, string> = {
  trabalhador: 'chars/Farmer_A.glb',
  trabalhadorB: 'chars/Farmer_B.glb',
  soldado: 'chars/Knight.glb',
  arqueiro: 'chars/Ranger.glb',
  esqueleto: 'chars/Skeleton_Minion.glb',
  lobisomem: 'chars/Werewolf_Wolf.glb',
  orc: 'chars/OrcRaider.glb',
  bruto: 'chars/OrcBrute.glb',
  mago: 'chars/Mage.glb',
  clerigo: 'chars/Cleric.glb',
  cavaleiro: 'chars/Paladin.glb',
  engenheiro: 'chars/Engineer.glb',
  bruxa: 'chars/Witch.glb',
  troll: 'chars/Monstrosity.glb',
  necromante: 'chars/Necromancer.glb',
  golem: 'chars/FrostGolem.glb',
  golemOssos: 'chars/Skeleton_Golem.glb',
  barbaro: 'chars/Barbarian.glb',
  atiradora: 'chars/Rogue_Hooded.glb',
  druida: 'chars/Druid.glb',
  cavaleiroNegro: 'chars/BlackKnight.glb',
};
/** Altura de cada personagem no mundo (um hexágono tem 2 m; a casa tem ~1 m). */
export const CHAR_HEIGHT: Record<CharKey, number> = {
  trabalhador: 0.55,
  trabalhadorB: 0.55,
  soldado: 0.6,
  arqueiro: 0.58,
  esqueleto: 0.55,
  lobisomem: 0.66,
  orc: 0.66,
  bruto: 1.0,
  mago: 0.62,
  clerigo: 0.58,
  cavaleiro: 0.66,
  engenheiro: 0.56,
  bruxa: 0.64,
  troll: 1.15,
  necromante: 0.66,
  golem: 1.8,
  golemOssos: 1.9,
  // Heróis um pouco maiores que as tropas, para a criança achar de longe.
  barbaro: 0.74,
  atiradora: 0.7,
  druida: 0.7,
  cavaleiroNegro: 0.78,
};
/** Personagens do rig grande (animações do Rig_Large). */
export const LARGE: ReadonlySet<CharKey> = new Set(['bruto', 'troll', 'golem', 'golemOssos']);

/** Arma na mão direita (e escudo na esquerda). */
const WEAPONS = {
  espada: 'weapons/sword_1handed.gltf',
  escudo: 'weapons/shield_round_color.gltf',
  arco: 'weapons/bow_withString.gltf',
  lamina: 'weapons/Skeleton_Blade.gltf',
  machado: 'weapons/Orc_Axe.glb',
  cajado: 'weapons/staff.gltf',
  maca: 'weapons/Cleric_Mace.gltf',
  martelo: 'weapons/paladin_hammer.gltf',
  escudoPaladino: 'weapons/paladin_shield.gltf',
  marreta: 'tools/hammer.gltf',
  // Ferramentas dos trabalhadores (RPG Tools Bits).
  machadoLenha: 'tools/axe.gltf',
  picareta: 'tools/pickaxe.gltf',
  pa: 'tools/shovel.gltf',
  cajadoOsso: 'weapons/Skeleton_Staff.gltf',
  machadoGrande: 'weapons/axe_2handed.gltf',
  cajadoDruida: 'weapons/druid_staff.gltf',
  besta: 'weapons/crossbow_2handed.gltf',
  espadaNegra: 'weapons/BlackKnight_Sword.gltf',
  escudoNegro: 'weapons/BlackKnight_Shield.gltf',
} as const;
export type WeaponKey = keyof typeof WEAPONS;

const ANIMS_MEDIUM = ['General', 'MovementBasic', 'CombatMelee', 'CombatRanged', 'Tools'].map((n) => `anims/Rig_Medium_${n}.glb`);
const ANIMS_LARGE = ['General', 'MovementBasic', 'CombatMelee'].map((n) => `anims/Rig_Large_${n}.glb`);

export interface Art {
  statics: Record<StaticKey, StaticModel>;
  chars: Record<CharKey, { scene: THREE.Object3D; scale: number }>;
  weapons: Record<WeaponKey, THREE.Object3D>;
  clips: Map<string, THREE.AnimationClip>;
  clipsLarge: Map<string, THREE.AnimationClip>;
}

const matCache = new Map<string, THREE.Material>();

/** Lambert com a mesma textura: mais barato que o PBR do glTF e sem precisar de ambiente. */
function lambertOf(m: THREE.Material): THREE.Material {
  const src = m as THREE.MeshStandardMaterial;
  const key = src.map?.uuid ?? src.color?.getHexString() ?? m.uuid;
  let out = matCache.get(key);
  if (!out) {
    out = new THREE.MeshLambertMaterial({ map: src.map ?? null, color: src.map ? 0xffffff : src.color });
    matCache.set(key, out);
  }
  return out;
}

function toStatic(root: THREE.Object3D): StaticModel {
  root.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const g = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    const mat = lambertOf(mats[0]!);
    const list = byMat.get(mat) ?? [];
    list.push(g.index ? g.toNonIndexed() : g);
    byMat.set(mat, list);
  });
  const parts: StaticPart[] = [];
  for (const [material, geos] of byMat) parts.push({ geometry: geos.length === 1 ? geos[0]! : mergeGeometries(geos)!, material });
  const box = new THREE.Box3().setFromObject(root);
  return { parts, box };
}

function lambertize(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = Array.isArray(o.material) ? o.material.map(lambertOf) : lambertOf(o.material);
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
}

export async function loadArt(base: string, onProgress?: (k: number) => void): Promise<Art> {
  const manager = new THREE.LoadingManager();
  if (onProgress) manager.onProgress = (_u, done, total) => onProgress(done / total);
  const loader = new GLTFLoader(manager);
  const load = (f: string) => loader.loadAsync(base + f);
  const [st, ch, wp, am, al] = await Promise.all([
    Promise.all((Object.keys(STATIC_MODELS) as StaticKey[]).map(async (k) => [k, await load(STATIC_MODELS[k])] as const)),
    Promise.all((Object.keys(CHAR_FILES) as CharKey[]).map(async (k) => [k, await load(CHAR_FILES[k])] as const)),
    Promise.all((Object.keys(WEAPONS) as WeaponKey[]).map(async (k) => [k, await load(WEAPONS[k])] as const)),
    Promise.all(ANIMS_MEDIUM.map(load)),
    Promise.all(ANIMS_LARGE.map(load)),
  ]);
  const statics = {} as Art['statics'];
  for (const [k, g] of st) statics[k] = toStatic(g.scene);
  const chars = {} as Art['chars'];
  for (const [k, g] of ch) {
    lambertize(g.scene);
    const box = new THREE.Box3().setFromObject(g.scene);
    chars[k] = { scene: g.scene, scale: CHAR_HEIGHT[k] / (box.max.y - box.min.y || 1) };
  }
  const weapons = {} as Art['weapons'];
  for (const [k, g] of wp) {
    lambertize(g.scene);
    // A pá do RPG Tools Bits vem com a lâmina para baixo do ponto da mão (as outras
    // ferramentas e armas apontam para cima): virada, a lâmina vai para o chão ao cavar.
    if (k === 'pa') g.scene.rotation.x = Math.PI;
    // Ferramentas 30% maiores, para dar para ver de longe por baixo do chapéu.
    if (k === 'pa' || k === 'machadoLenha' || k === 'picareta' || k === 'marreta') g.scene.scale.setScalar(1.3);
    weapons[k] = g.scene;
  }
  const clips = new Map<string, THREE.AnimationClip>();
  for (const g of am) for (const c of g.animations) clips.set(c.name, c);
  const clipsLarge = new Map<string, THREE.AnimationClip>();
  for (const g of al) for (const c of g.animations) clipsLarge.set(c.name, c);
  return { statics, chars, weapons, clips, clipsLarge };
}

export function cloneChar(art: Art, kind: CharKey): THREE.Object3D {
  const src = art.chars[kind];
  const o = SkeletonUtils.clone(src.scene);
  o.scale.setScalar(src.scale);
  return o;
}

export function findBone(root: THREE.Object3D, names: string[]): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && names.includes(o.name)) found = o;
  });
  return found;
}
