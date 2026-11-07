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
  pedreira: 'medieval/tent.gltf',
  pedraCortada: 'medieval/resource_stone.gltf',
  blocos: 'resource/Stone_Bricks_Stack_Large.gltf',
  blocosB: 'resource/Stone_Bricks_Stack_Medium.gltf',
  lascas: 'resource/Stone_Chunks_Large.gltf',
  lascasB: 'resource/Stone_Chunks_Small.gltf',
  caixote: 'medieval/crate_open.gltf',
  mina: 'medieval/building_mine_blue.gltf',
  torre: 'medieval/building_watchtower_blue.gltf',
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

const ANIMS_MEDIUM = ['General', 'MovementBasic', 'CombatMelee', 'CombatRanged', 'Tools', 'Simulation'].map((n) => `anims/Rig_Medium_${n}.glb`);
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

/**
 * As peças de um personagem do KayKit (corpo, cabeça, braços, pernas, chapéu...) vêm separadas,
 * cada uma um desenho. Como todas usam o mesmo esqueleto, viram uma malha só por material:
 * 1 ou 2 desenhos por personagem em vez de 6 a 12 (o que mais pesava no tablet).
 */
function mergeSkinned(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.SkinnedMesh[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh) || Array.isArray(o.material)) return;
    const list = groups.get(o.material) ?? [];
    list.push(o);
    groups.set(o.material, list);
  });
  for (const [material, list] of groups) {
    const first = list[0]!;
    const bones = first.skeleton.bones;
    // Peça com dois materiais vem num grupo à parte (Nome_1, Nome_2): vale juntar se estiver no
    // mesmo lugar do mundo e presa do mesmo jeito ao esqueleto.
    const same = (m: THREE.SkinnedMesh) =>
      m.skeleton.bones.length === bones.length &&
      m.skeleton.bones.every((b, i) => b === bones[i]) &&
      m.bindMatrix.equals(first.bindMatrix) &&
      m.matrixWorld.equals(first.matrixWorld);
    if (list.length < 2 || !list.every(same)) continue;
    const geos = list.map((m) => {
      const src = m.geometry as THREE.BufferGeometry;
      const g = new THREE.BufferGeometry();
      for (const a of ['position', 'normal', 'uv']) {
        const at = src.getAttribute(a);
        if (at) g.setAttribute(a, at.clone());
      }
      // Os índices e pesos dos ossos podem vir em tipos diferentes de peça para peça.
      const si = src.getAttribute('skinIndex');
      const sw = src.getAttribute('skinWeight');
      const n = src.getAttribute('position').count;
      const idx = new Uint16Array(n * 4);
      const wt = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < 4; c++) {
          idx[i * 4 + c] = si.getComponent(i, c);
          wt[i * 4 + c] = sw.getComponent(i, c);
        }
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
      if (src.index) g.setIndex(src.index.clone());
      return g;
    });
    const keys = (g: THREE.BufferGeometry) => Object.keys(g.attributes).sort().join();
    if (!geos.every((g) => keys(g) === keys(geos[0]!))) continue;
    const all = geos.every((g) => g.index) ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeGeometries(all);
    if (!merged) continue;
    const mesh = new THREE.SkinnedMesh(merged, material);
    mesh.name = first.name;
    mesh.matrix.copy(first.matrix);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    first.parent!.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(first.skeleton, first.bindMatrix);
    for (const m of list) m.removeFromParent();
  }
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
    mergeSkinned(g.scene);
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
