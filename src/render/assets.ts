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
  // Etapa 19: o castelo do nível 4 (telhados dourados) e os estandartes da porta.
  casteloOuro: 'medieval/building_castle_yellow.gltf',
  // Tropas novas (2026-11-09): a tenda azul (Acampamento) e a torre de canhão (Torre de pólvora).
  acampamento: 'medieval/building_tent_blue.gltf',
  polvora: 'medieval/building_tower_cannon_blue.gltf',
  estandarte: 'medieval/banner_blue_full.gltf',
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
  // Etapa 17: floresta no fim (uma árvore só) e as toras de onde ela acabou.
  arvoreE: 'medieval/tree_single_A.gltf',
  arvoreF: 'medieval/tree_single_B.gltf',
  toras: 'resource/Wood_Log_A.gltf',
  torasB: 'resource/Wood_Log_B.gltf',
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
  // Vila: praça, taverna e mercado do bairro, e os enfeites dos quintais.
  poco: 'medieval/building_well_blue.gltf',
  taverna: 'medieval/building_tavern_blue.gltf',
  mercado: 'medieval/building_market_blue.gltf',
  barril: 'medieval/barrel.gltf',
  caixa: 'medieval/crate_A_small.gltf',
  balde: 'medieval/bucket_water.gltf',
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
export type CharKey = UnitKind | 'trabalhadorB' | 'cavaleiroElmo' | 'elfoA' | 'elfoB' | Exclude<MonsterKind, 'morcego'>;
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
  // Etapa 19: o cavaleiro com elmo, depois da primeira melhoria de armaduras.
  cavaleiroElmo: 'chars/Paladin_with_Helmet.glb',
  // Tropas novas (2026-11-09): o lanceiro é o Knight de bronze, sem viseira e de crista; o anão é
  // o Engenheiro (ruivo) sem os óculos, mais baixo e largo, de elmo de chifres.
  lanceiro: 'chars/Knight.glb',
  anao: 'chars/Engineer.glb',
  // Inimigos novos (2026-11-09).
  esqueletoGuerreiro: 'chars/Skeleton_Warrior.glb',
  vampiro: 'chars/Vampire.glb',
  acumulador: 'chars/Hoarder.glb',
  golemMusgo: 'chars/4GTN_Forgotten.glb',
  // Enfeite do inverno (2026-11-09): elfos passeando pela vila entre as ondas.
  elfoA: 'chars/Helper_A.glb',
  elfoB: 'chars/Helper_B.glb',
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
  cavaleiroElmo: 0.66,
  lanceiro: 0.64,
  anao: 0.5,
  esqueletoGuerreiro: 0.6,
  // O vampiro é meio-chefe: um pouco maior que a horda.
  vampiro: 0.74,
  acumulador: 0.6,
  golemMusgo: 1.85,
  elfoA: 0.48,
  elfoB: 0.48,
};
/**
 * Personagens do rig grande (animações do Rig_Large). O Cavaleiro Negro também é: com as
 * animações do rig médio ele ficava agachado e encolhido (revisão de 2026-11-08).
 */
export const LARGE: ReadonlySet<CharKey> = new Set(['bruto', 'troll', 'golem', 'golemOssos', 'golemMusgo', 'cavaleiroNegro']);

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
  // Rig grande: as versões _Large (o dobro), feitas para a mão dele.
  espadaNegra: 'weapons/BlackKnight_Sword_Large.gltf',
  escudoNegro: 'weapons/BlackKnight_Shield_Large.gltf',
  machadoBruto: 'weapons/Orc_Axe_Large.gltf',
  machadoGolem: 'weapons/Skeleton_Golem_Axe_Large.gltf',
  // Inimigos novos (2026-11-09).
  machadoOsso: 'weapons/Skeleton_Axe.gltf',
  escudoOsso: 'weapons/Skeleton_Shield_Small_A.gltf',
  espadaVampiro: 'weapons/Vampire_Sword.gltf',
  bengalaDoce: 'weapons/Candycane.gltf',
  // Tropas novas (2026-11-09).
  lanca: 'weapons/spear_A.gltf',
  espingarda: 'weapons/shotgun.gltf',
  elmoChifres: 'medieval/helmet.gltf',
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
  /** Etapa 19: armaduras do soldado pelas melhorias da forja (prateada e dourada). */
  skins: { prata: THREE.Texture; ouro: THREE.Texture };
}

/** Peças tiradas do personagem ao carregar (antes de virar uma malha só). */
const DROP: Partial<Record<CharKey, string[]>> = { lanceiro: ['Knight_HelmetVisor'], anao: ['Engineer_Goggles'] };

/**
 * Armadura dourada: a prateada do KayKit com os cinzas puxados para o ouro (pele, olhos e
 * enfeites coloridos ficam como estão). Feita uma vez, ao carregar.
 */
function goldenArmor(silver: THREE.Texture, tone: [number, number, number, number, number] = [1.05, 30, 0.82, 8, 0.3]): THREE.Texture {
  const img = silver.image as HTMLImageElement;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]!;
    const gr = px[i + 1]!;
    const b = px[i + 2]!;
    const hi = Math.max(r, gr, b);
    if (hi - Math.min(r, gr, b) >= 28 || hi <= 70) continue;
    const l = (r + gr + b) / 3;
    px[i] = Math.min(255, l * tone[0] + tone[1]);
    px[i + 1] = Math.min(255, l * tone[2] + tone[3]);
    px[i + 2] = Math.min(255, l * tone[4]);
  }
  g.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  const [st, ch, wp, am, al, orcSkin, silver] = await Promise.all([
    Promise.all((Object.keys(STATIC_MODELS) as StaticKey[]).map(async (k) => [k, await load(STATIC_MODELS[k])] as const)),
    Promise.all((Object.keys(CHAR_FILES) as CharKey[]).map(async (k) => [k, await load(CHAR_FILES[k])] as const)),
    Promise.all((Object.keys(WEAPONS) as WeaponKey[]).map(async (k) => [k, await load(WEAPONS[k])] as const)),
    Promise.all(ANIMS_MEDIUM.map(load)),
    Promise.all(ANIMS_LARGE.map(load)),
    // O orc saqueador vem sem textura no .glb; a do pacote fica à parte.
    new THREE.TextureLoader(manager).loadAsync(base + 'chars/orc_texture_A.png'),
    new THREE.TextureLoader(manager).loadAsync(base + 'chars/knight_texture_alt_A.png'),
  ]);
  silver.flipY = false;
  silver.colorSpace = THREE.SRGBColorSpace;
  orcSkin.flipY = false;
  orcSkin.colorSpace = THREE.SRGBColorSpace;
  const statics = {} as Art['statics'];
  for (const [k, g] of st) statics[k] = toStatic(g.scene);
  const chars = {} as Art['chars'];
  for (const [k, g] of ch) {
    const drop = DROP[k];
    if (drop) {
      const gone: THREE.Object3D[] = [];
      g.scene.traverse((o) => {
        if (drop.some((n) => o.name.startsWith(n))) gone.push(o);
      });
      for (const o of gone) o.removeFromParent();
    }
    if (k === 'lanceiro') {
      // Bronze do lanceiro espartano: a textura do próprio Knight (capa vermelha) com os cinzas
      // da armadura puxados para o bronze, pela mesma conta do ouro.
      const made = new Map<string, THREE.Texture>();
      g.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const m = o.material as THREE.MeshStandardMaterial;
        if (!m.map) return;
        let t = made.get(m.map.uuid);
        if (!t) {
          t = goldenArmor(m.map, [0.95, 30, 0.7, 12, 0.38]);
          made.set(m.map.uuid, t);
        }
        o.material = m.clone();
        (o.material as THREE.MeshStandardMaterial).map = t;
      });
    }
    if (k === 'orc') {
      g.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const m = o.material as THREE.MeshStandardMaterial;
        if (m.map) return;
        m.map = orcSkin;
        m.color.set(0xffffff);
      });
    }
    lambertize(g.scene);
    mergeSkinned(g.scene);
    const box = new THREE.Box3().setFromObject(g.scene);
    chars[k] = { scene: g.scene, scale: CHAR_HEIGHT[k] / (box.max.y - box.min.y || 1) };
  }
  // Sem elmo o cavaleiro fica mais baixo na caixa: usa a escala da versão com elmo, para o
  // corpo não mudar de tamanho quando ganha o elmo.
  chars.cavaleiro.scale = chars.cavaleiroElmo.scale;
  const weapons = {} as Art['weapons'];
  for (const [k, g] of wp) {
    lambertize(g.scene);
    // A pá do RPG Tools Bits vem com a lâmina para baixo do ponto da mão (as outras
    // ferramentas e armas apontam para cima): virada, a lâmina vai para o chão ao cavar.
    if (k === 'pa') g.scene.rotation.x = Math.PI;
    // A besta vem com a frente em +Z e a mão do KayKit aponta a arma em +X no tiro de duas
    // mãos: sem girar, a Atiradora atirava para o lado direito. Parada, aponta para o chão.
    if (k === 'besta') g.scene.rotation.y = Math.PI / 2;
    // O arco vinha com a corda do lado de fora: ao mirar, a corda ficava virada para o inimigo
    // e a barriga do arco para o arqueiro. Virado no eixo do comprimento, a corda vem para ele.
    if (k === 'arco') g.scene.rotation.z = Math.PI;
    // Espingarda do anão: o cano vem em +Z, como a besta.
    if (k === 'espingarda') g.scene.rotation.y = Math.PI / 2;
    // Lança: fica como a espada do soldado (comprimento em Y): de cima ela aparece inteira, com a
    // ponta para a frente e para baixo, e a estocada do KayKit leva a ponta direto no alvo.
    // Elmo de chifres do pack medieval (peça de tabuleiro, pequena): do tamanho da cabeça do anão.
    if (k === 'elmoChifres') {
      g.scene.scale.setScalar(5.6);
      g.scene.position.y = 0.55;
    }
    // Ferramentas 30% maiores, para dar para ver de longe por baixo do chapéu.
    // O machado do orc bruto também: no tamanho do pacote ele some atrás dos braços no golpe.
    if (k === 'pa' || k === 'machadoLenha' || k === 'picareta' || k === 'marreta' || k === 'machadoBruto') g.scene.scale.setScalar(1.3);
    weapons[k] = g.scene;
  }
  const clips = new Map<string, THREE.AnimationClip>();
  for (const g of am) for (const c of g.animations) clips.set(c.name, c);
  const clipsLarge = new Map<string, THREE.AnimationClip>();
  for (const g of al) for (const c of g.animations) clipsLarge.set(c.name, c);
  return { statics, chars, weapons, clips, clipsLarge, skins: { prata: silver, ouro: goldenArmor(silver) } };
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
