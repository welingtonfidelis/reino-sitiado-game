/**
 * O reino em 3D. O que é parado (chão, natureza, prédios, muralhas) é desenhado instanciado e
 * só é refeito quando `world.ver` muda. Gente e monstros são personagens com esqueleto;
 * flechas e barras de vida são instanciadas a cada quadro.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILDINGS, CONFIG, CROPS, DIRS, HEX, MONSTERS, cropOf, farmStage, hexToWorld, isHero, openRifts, resourceDir, stage, tileAt } from '../sim/index.ts';
import type { Building, BuildingKind, Crop, MonsterKind, Res, SimEvent, UnitKind, World } from '../sim/index.ts';
import type { Art, CharKey, StaticKey, StaticModel, StaticPart } from './assets.ts';
import { CharView } from './chars.ts';
import { buildGround, paintVillage } from './ground.ts';
import { Bubbles } from './bubbles.ts';
import type { BubbleIcon } from './bubbles.ts';
import { planVillage } from './village.ts';
import type { Home } from './village.ts';
import { SEASON_U, SeasonLook, Weather, leafy, snowy, weatherOf } from './season.ts';
import type { QualityLook } from './quality.ts';
import type { FxLayer } from './fx.ts';
import type { Pose } from './chars.ts';

class Instanced {
  readonly meshes: THREE.InstancedMesh[] = [];
  count = 0;
  ids: number[] = [];
  private cap: number;
  constructor(scene: THREE.Scene, model: StaticModel, cap: number, cast: boolean, receive: boolean) {
    this.cap = cap;
    for (const p of model.parts) {
      const m = new THREE.InstancedMesh(p.geometry, p.material, cap);
      m.castShadow = cast;
      m.receiveShadow = receive;
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
      this.meshes.push(m);
    }
  }
  begin(): void {
    this.count = 0;
    this.ids = [];
  }
  push(m: THREE.Matrix4, id = -1): void {
    if (this.count >= this.cap) return;
    for (const mesh of this.meshes) mesh.setMatrixAt(this.count, m);
    this.ids.push(id);
    this.count++;
  }
  end(): void {
    for (const mesh of this.meshes) {
      mesh.count = this.count;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
}

const BAR_VERT = /* glsl */ `
varying vec3 vColor;
void main() {
  vec3 c = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float sx = length(instanceMatrix[0].xyz);
  float sy = length(instanceMatrix[1].xyz);
  float anchor = length(instanceMatrix[2].xyz);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  mv.x += position.x * sx - anchor * 0.5;
  mv.y += position.y * sy;
  vColor = instanceColor;
  gl_Position = projectionMatrix * mv;
}`;
const BAR_FRAG = /* glsl */ `
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }`;

/** Barras de vida sempre de frente para a câmera. */
class Bars {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  constructor(scene: THREE.Scene) {
    const g = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    const mat = new THREE.ShaderMaterial({ vertexShader: BAR_VERT, fragmentShader: BAR_FRAG, depthTest: false, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(g, mat, 1200);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1200 * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
  }
  begin(): void {
    this.n = 0;
  }
  /** Barra centrada em (x, y, z), largura w metros, fração f. */
  add(x: number, y: number, z: number, w: number, f: number, color: string): void {
    if (this.n + 2 > 1200) return;
    const h = 0.07;
    // A escala em z é a largura de referência: o shader alinha a barra pela borda esquerda.
    this.m.makeScale(w + 0.04, h + 0.04, w + 0.04).setPosition(x, y, z);
    this.put(this.m, '#120e0a');
    this.m.makeScale(Math.max(0.001, w * f), h, w).setPosition(x, y, z);
    this.put(this.m, color);
  }
  private put(m: THREE.Matrix4, color: string): void {
    this.mesh.setMatrixAt(this.n, m);
    this.mesh.setColorAt(this.n, this.c.set(color));
    this.n++;
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

interface Flight {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  t: number;
  dur: number;
}

const HOME: Record<BuildingKind, StaticKey> = {
  castelo: 'castelo',
  casa: 'casaA',
  celeiro: 'moinho',
  fazenda: 'fazenda',
  serraria: 'serraria',
  pedreira: 'pedreira',
  mina: 'mina',
  muralha: 'muro',
  portao: 'portao',
  torre: 'torre',
  quartel: 'quartel',
  campo: 'campo',
  torreMago: 'torreMago',
  capela: 'capela',
  estabulo: 'estabulo',
  forja: 'forja',
  oficina: 'oficina',
  acampamento: 'acampamento',
  polvora: 'polvora',
  catapulta: 'catapulta',
  piche: 'obra',
  estacas: 'obra',
};

/** Altura do topo de cada prédio (para barras e para o arqueiro na torre). */
/**
 * Gente parada (Etapa 16): trabalhador sem serviço senta para descansar; tropas de corpo a corpo
 * fazem flexões de vez em quando; as outras acenam. Cada um no seu ritmo (pelo id).
 */
function idlePose(kind: UnitKind, id: number, t: number): Pose {
  if (kind === 'trabalhador') return 'sit';
  const phase = (t + id * 3.7) % 18;
  if (kind === 'soldado' || kind === 'lanceiro' || kind === 'cavaleiro' || kind === 'barbaro' || kind === 'cavaleiroNegro') return phase < 4 ? 'pushups' : 'idle';
  return phase < 2.5 ? 'wave' : 'idle';
}

/** Plantação: ângulo das fileiras, apontando para o celeiro vizinho. */
function farmAngle(w: World, b: Building): number {
  const p = hexToWorld(b.q, b.r);
  for (const [dq, dr] of DIRS) {
    const n = tileAt(w, b.q + dq, b.r + dr);
    const nb = n && n.b >= 0 ? w.buildings.get(n.b) : undefined;
    if (nb?.kind !== 'celeiro') continue;
    const c = hexToWorld(nb.q, nb.r);
    return Math.atan2(c.z - p.z, c.x - p.x);
  }
  return 0;
}

/** Pose de luta por tipo (os heróis usam as de duas mãos). */
const FIGHT_POSE: Partial<Record<UnitKind, Pose>> = { arqueiro: 'shoot', mago: 'cast', clerigo: 'heal', atiradora: 'shoot2', barbaro: 'chop2', druida: 'cast', lanceiro: 'stab', anao: 'shoot2' };
/**
 * Golpe dos monstros que não brandem arma (revisão de 2026-11-08): a bruxa e o necromante
 * lançam magia, e o lobisomem arranha com as duas garras.
 */
const MONSTER_ATTACK: Partial<Record<MonsterKind, Pose>> = { bruxa: 'cast', necromante: 'cast', lobisomem: 'claw' };

/** Balão do acumulador: o desenho do recurso que ele leva. */
const LOOT_ICON: Record<Res, BubbleIcon> = { madeira: 'arvore', pedra: 'pedra', ferro: 'ferro', cristal: 'cristal', comida: 'trigo', ouro: 'ouro' };
/** Tamanho dos golpes especiais na tela (o giro cobre o raio do golpe). */
const SPECIAL_SCALE: Record<'giro' | 'chuva' | 'raizes' | 'pisao', number> = { giro: 1.4, chuva: 1.3, raizes: 0.9, pisao: 1.8 };

/** Etapa 17: segundos que o recurso novo leva para crescer do chão. */
const SPROUT_TIME = 1.6;
/**
 * Etapa 19: o castelo cresce a cada nível (no 4 os telhados ficam dourados), com a bandeira do
 * topo maior; os estandartes da porta aparecem no nível 2. A subida de nível cresce em 1,2 s.
 */
const CASTLE_SCALE = [0.86, 0.96, 1.06, 1.14];
const CASTLE_FLAG = [1.1, 1.3, 1.6, 2.0];
const CASTLE_GROW = 1.2;

/** Torre dos arqueiros: a torre de vigia aberta do KayKit, maior, com os arqueiros na plataforma. */
const TOWER_SCALE = 1.8;
/** Piso da plataforma e os quatro cantos (em medidas do modelo, antes da escala). */
const PLATFORM_Y = 0.79;
const PLATFORM: [number, number][] = [
  [-0.17, -0.17],
  [0.17, 0.17],
  [-0.17, 0.17],
  [0.17, -0.17],
];

const TOP: Partial<Record<BuildingKind, number>> = { acampamento: 1.3, polvora: 2.0, catapulta: 1.6, piche: 0.3, estacas: 0.6, castelo: 4.1, torre: 2.6, quartel: 1.7, campo: 1.8, muralha: 1.2, portao: 1.4, torreMago: 2.4, capela: 1.9, estabulo: 1.3, forja: 1.4, oficina: 1.3 };

/** Fosso de piche (Etapa 9): mancha escura e lustrosa no chão. */
function pitchModel(): StaticModel {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.62, 0.68, 0.04, 20).translate(0, 0.02, 0)];
  for (const [x, z, r] of [[0.3, 0.2, 0.09], [-0.25, -0.3, 0.07], [-0.4, 0.25, 0.06]] as const) parts.push(new THREE.SphereGeometry(r, 8, 6).scale(1, 0.5, 1).translate(x, 0.04, z));
  const geometry = mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
  return { parts: [{ geometry, material: new THREE.MeshPhongMaterial({ color: '#2a2018', specular: '#8a7a60', shininess: 60 }) }], box: new THREE.Box3(new THREE.Vector3(-0.86, 0, -0.86), new THREE.Vector3(0.86, 0.1, 0.86)) };
}

/** Estacas (Etapa 9): uma roda de pontas de madeira inclinadas para fora. */
function spikesModel(): StaticModel {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const r = k % 2 ? 0.55 : 0.3;
    const g = new THREE.ConeGeometry(0.06, 0.6, 5).translate(0, 0.3, 0);
    g.rotateZ(0.45).rotateY(-a).translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    parts.push(g.toNonIndexed());
  }
  const geometry = mergeGeometries(parts)!;
  return { parts: [{ geometry, material: new THREE.MeshLambertMaterial({ color: '#8a6238', flatShading: true }) }], box: new THREE.Box3(new THREE.Vector3(-0.7, 0, -0.7), new THREE.Vector3(0.7, 0.6, 0.7)) };
}

/**
 * Plantações em hexágono (fazenda em teste, 2026-11-07): canteiro de terra do tamanho do ladrilho
 * e uma planta por plantação (milho, tomate, trigo, alface, cenoura, abóbora), em fileiras ao longo
 * de x; quem desenha gira a plantação para as fileiras apontarem para o celeiro.
 */
const FIELD_R = HEX * 0.998;
const lambert = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const soil = lambert('#7a5a3a');

/** Junta peças (indexadas ou não) numa geometria só. */
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

/** Pontos em fileiras (ao longo de x) dentro do hexágono, com folga da borda. */
function fieldPoints(dx: number, dz: number, margin: number): [number, number][] {
  const R = FIELD_R - margin;
  const out: [number, number][] = [];
  for (let z = -R; z <= R + 1e-6; z += dz) {
    const half = (Math.sqrt(3) / 2) * R * Math.min(1, (R - Math.abs(z)) / (R / 2));
    const n = Math.floor((2 * half) / dx);
    for (let i = 0; i <= n; i++) out.push([-half + (2 * half - n * dx) / 2 + i * dx, z]);
  }
  return out;
}

function cropModel(crop: Crop): StaticModel {
  const plot = new THREE.CylinderGeometry(FIELD_R, FIELD_R, 0.06, 6).translate(0, 0.03, 0);
  const parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [{ geometry: plot, material: soil }];
  const add = (color: string, list: THREE.BufferGeometry[]) => list.length && parts.push({ geometry: merge(list), material: lambert(color) });
  const green: THREE.BufferGeometry[] = [];
  const fruit: THREE.BufferGeometry[] = [];
  if (crop === 'trigo') {
    for (let k = -5; k <= 5; k++) {
      const z = k * 0.2;
      const half = (Math.sqrt(3) / 2) * FIELD_R * Math.min(1, (FIELD_R - Math.abs(z)) / (FIELD_R / 2)) - 0.07;
      if (half > 0.08) fruit.push(new THREE.BoxGeometry(half * 2, 0.16, 0.11).translate(0, 0.12, z));
    }
    add('#c9a646', fruit);
  } else if (crop === 'milho') {
    for (const [x, z] of fieldPoints(0.2, 0.3, 0.12)) {
      green.push(new THREE.BoxGeometry(0.045, 0.46, 0.045).translate(x, 0.29, z));
      green.push(new THREE.BoxGeometry(0.16, 0.025, 0.04).rotateZ(0.5).translate(x + 0.05, 0.22, z));
      fruit.push(new THREE.BoxGeometry(0.07, 0.13, 0.07).translate(x + 0.035, 0.34, z));
    }
    add('#5f9a3a', green);
    add('#f2c94c', fruit);
  } else if (crop === 'tomate') {
    for (const [x, z] of fieldPoints(0.3, 0.32, 0.14)) {
      green.push(new THREE.IcosahedronGeometry(0.12, 0).scale(1, 0.85, 1).translate(x, 0.15, z));
      for (const [ox, oy, oz] of [[0.07, 0.2, 0.04], [-0.06, 0.17, 0.07], [0.01, 0.24, -0.07]] as const) fruit.push(new THREE.SphereGeometry(0.038, 6, 4).translate(x + ox, oy, z + oz));
    }
    add('#4f8a34', green);
    add('#d9452e', fruit);
  } else if (crop === 'alface') {
    for (const [x, z] of fieldPoints(0.24, 0.26, 0.12)) green.push(new THREE.IcosahedronGeometry(0.1, 0).scale(1, 0.75, 1).translate(x, 0.12, z));
    add('#8fd06a', green);
  } else if (crop === 'cenoura') {
    for (const [x, z] of fieldPoints(0.18, 0.24, 0.12)) {
      green.push(new THREE.ConeGeometry(0.05, 0.16, 4).translate(x, 0.17, z));
      fruit.push(new THREE.CylinderGeometry(0.04, 0.03, 0.05, 6).translate(x, 0.085, z));
    }
    add('#5fa83e', green);
    add('#f08a2a', fruit);
  } else {
    // Abóbora: ramas finas ao longo das fileiras e abóboras espaçadas.
    for (let k = -2; k <= 2; k++) {
      const z = k * 0.42;
      const half = (Math.sqrt(3) / 2) * FIELD_R * Math.min(1, (FIELD_R - Math.abs(z)) / (FIELD_R / 2)) - 0.1;
      if (half > 0.1) green.push(new THREE.BoxGeometry(half * 2, 0.03, 0.05).translate(0, 0.075, z));
    }
    for (const [x, z] of fieldPoints(0.42, 0.42, 0.18)) {
      fruit.push(new THREE.SphereGeometry(0.13, 8, 6).scale(1, 0.7, 1).translate(x, 0.14, z));
      green.push(new THREE.BoxGeometry(0.03, 0.07, 0.03).translate(x, 0.25, z));
    }
    add('#4f8a34', green);
    add('#e8892e', fruit);
  }
  return { parts, box: new THREE.Box3(new THREE.Vector3(-FIELD_R, 0, -FIELD_R), new THREE.Vector3(FIELD_R, 0.5, FIELD_R)) };
}

/** Cristais de um veio azul (não há modelo de cristal no KayKit local): prismas de seis faces. */
function crystalModel(): StaticModel {
  const parts: THREE.BufferGeometry[] = [];
  const spots: [number, number, number, number, number][] = [
    [0, 0, 0.62, 0, 0],
    [0.18, 0.08, 0.42, 0.35, 0.4],
    [-0.16, 0.1, 0.46, -0.3, 1.2],
    [0.05, -0.17, 0.36, 0.25, 2.3],
    [-0.12, -0.12, 0.3, -0.4, 3.4],
  ];
  for (const [x, z, h, tilt, turn] of spots) {
    const g = new THREE.CylinderGeometry(0, 0.075 * (h / 0.4), h, 6, 1).translate(0, h / 2, 0);
    g.rotateZ(tilt).rotateY(turn).translate(x, 0, z);
    parts.push(g);
  }
  const geometry = mergeGeometries(parts)!;
  const material = new THREE.MeshLambertMaterial({ color: '#7fd8ff', emissive: '#1f5f9a', emissiveIntensity: 0.6, flatShading: true });
  return { parts: [{ geometry, material }], box: new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute) };
}

export class World3D {
  readonly scene: THREE.Scene;
  private art: Art;
  private sets = new Map<StaticKey, Instanced>();
  private ver = -1;
  /**
   * Prédios de mudança (desmontando ou remontando): o que desenhar e onde, montado no syncStatic.
   * O desenho em si vai a cada quadro (o prédio baixa ou sobe dentro do andaime).
   */
  private movers = new Map<number, { parts: StaticPart[]; x: number; z: number; rot: number; scale: number }>();
  private moverMeshes = new Map<number, THREE.Group>();
  private moverDust = new Map<number, number>();
  /** Muralha de mudança: o pedaço é refeito no syncStatic, então ele roda de tempos em tempos. */
  private wallsMoving = false;
  private wallSync = 0;
  /** Etapa 17: versão do terreno já desenhada (o chão é refeito quando o recurso acaba ou brota). */
  private land = 0;
  /** Hexágonos que brotaram (índice -> instante): o recurso cresce do chão em SPROUT_TIME. */
  private sprouting = new Map<number, number>();
  /** Etapa 19: crescimento do castelo na subida de nível e o tamanho com que foi desenhado. */
  private castleFrom = CASTLE_SCALE[0]!;
  private castleT0 = -99;
  private castleSync = 0;
  private castleDrawn = { level: 1, scale: CASTLE_SCALE[0]! };
  private sproutSync = 0;
  /** Balões de ícone: prédio sem recurso e recurso novo. */
  private bubbles: Bubbles;
  private chars = new Map<number, CharView>();
  private flights: Flight[] = [];
  /**
   * Etapa 19: rastro das flechas melhoradas na forja: curto e branco no nível 1, azul no 2 e
   * dourado no 3. (A aljava a mais ficou de fora: o arqueiro do KayKit já tem uma nas costas.)
   */
  private trail: THREE.InstancedMesh;
  private bars: Bars;
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private rifts: THREE.Mesh[] = [];
  /** Os grupos das fendas (buraco, borda e brilho), para tirar da cena quando o mapa troca. */
  private riftGroups: THREE.Group[] = [];
  private ghost = new THREE.Group();
  private ghostMat = new THREE.MeshBasicMaterial({ color: '#8cc56a', transparent: true, opacity: 0.5, depthWrite: false });
  private ghostKey: string | null = null;
  private ring: THREE.LineLoop;
  private range: THREE.LineLoop;
  readonly sun: THREE.DirectionalLight;
  private time = 0;
  /** Tropas escolhidas pelo jogador (anel dourado no chão). */
  selectedUnits: number[] = [];
  private unitRings: THREE.InstancedMesh;
  private heroRings: THREE.InstancedMesh;
  /** Até quando o Bárbaro está na animação do giro (Etapa 14). */
  private spinUntil = new Map<number, number>();
  private rallyFlag = new THREE.Group();
  private crystals!: Instanced;
  private orbs!: THREE.InstancedMesh;
  private spells: Flight[] = [];
  private batSlots = new Map<number, number>();
  /** Efeitos do pixelfx (carregados à parte, Etapa 3). */
  fx: FxLayer | null = null;
  /** Pixels de tela por metro (para o tamanho mínimo dos efeitos) e o giro da câmera. */
  pxPerMeter = 30;
  camYaw = Math.PI / 6;
  private burning = new Map<number, number>();
  private portals: number[] = [];
  private ground: THREE.Mesh | null = null;
  private grid: THREE.LineSegments | null = null;
  private water: THREE.Mesh | null = null;
  /** Uma leva de plantações por planta (fazenda em teste). */
  private farms = new Map<Crop, Instanced>();
  private pitch!: Instanced;
  private spikes!: Instanced;
  private rocksInFlight: Flight[] = [];
  private pitchFire = new Map<number, number[]>();
  private hemi!: THREE.HemisphereLight;
  private night = 0;
  private weather!: Weather;
  private look = new SeasonLook();
  private rain = 0;
  /** Pixels de tela por pixel CSS (o que o desenho usa de verdade). */
  dpr = 1;
  /** Bichinhos e sombra das nuvens (desligados nos gráficos leves). */
  private extras = true;

  /** Gráficos normais ou leves: sombra do sol, partículas, bichinhos e nuvens. */
  setQuality(look: QualityLook): void {
    this.sun.castShadow = look.shadows;
    this.weather.density = look.weather;
    this.extras = look.extras;
    SEASON_U.uClouds.value = look.extras ? 1 : 0;
  }

  /** Centro da vista (o tempo cai em volta dele). */
  readonly focus = { x: 0, z: 0 };

  constructor(scene: THREE.Scene, art: Art) {
    this.scene = scene;
    this.art = art;
    const big = (k: StaticKey, cap: number, cast = true, receive = false) => this.sets.set(k, new Instanced(scene, art.statics[k], cap, cast, receive));
    for (const k of ['arvoreA', 'arvoreB', 'arvoreC', 'arvoreD', 'arvoreE', 'arvoreF', 'montanhaA', 'montanhaB', 'montanhaC', 'morro', 'minerio', 'pedraA', 'pedraC', 'ruina'] as StaticKey[]) big(k, 400);
    // Etapa 17: toras onde a floresta acabou.
    for (const k of ['toras', 'torasB'] as StaticKey[]) big(k, 300);
    for (const k of ['feno', 'saco', 'carrinho', 'pedraCortada', 'blocos', 'blocosB', 'lascas', 'lascasB', 'caixote'] as StaticKey[]) big(k, 120);
    for (const k of ['castelo', 'casaA', 'casaB', 'fazenda', 'moinho', 'serraria', 'pedreira', 'mina', 'torre', 'quartel', 'campo', 'obra', 'portao', 'bandeira', 'torreMago', 'capela', 'estabulo', 'forja', 'oficina', 'acampamento', 'polvora'] as StaticKey[]) big(k, 200);
    big('casteloOuro', 4);
    big('estandarte', 8);
    this.crystals = new Instanced(scene, crystalModel(), 200, true, false);
    for (const c of CROPS) this.farms.set(c, new Instanced(scene, cropModel(c), 60, true, true));
    this.pitch = new Instanced(scene, pitchModel(), 120, false, true);
    this.spikes = new Instanced(scene, spikesModel(), 160, true, false);
    big('catapulta', 100);
    big('pedraCerco', 40, false);
    for (const k of ['rochaA', 'rochaB', 'rochaC', 'rochaD'] as StaticKey[]) big(k, 300);
    // Vila: praça, taverna e mercado, e enfeites dos quintais.
    for (const k of ['poco', 'taverna', 'mercado'] as StaticKey[]) big(k, 60);
    for (const k of ['barril', 'caixa', 'balde'] as StaticKey[]) big(k, 600);
    // Etapa 16: estações. Árvores com copa da estação (cópia do material); o resto ganha neve por cima.
    const trees = new Set<StaticKey>(['arvoreA', 'arvoreB', 'arvoreC', 'arvoreD', 'arvoreE', 'arvoreF']);
    const leafMats = new Map<THREE.Material, THREE.Material>();
    for (const [k, set] of this.sets) {
      if (k === 'flecha' || k === 'pedraCerco') continue;
      for (const m of set.meshes) {
        const mat = m.material as THREE.Material;
        if (trees.has(k)) {
          let lm = leafMats.get(mat);
          if (!lm) leafMats.set(mat, (lm = leafy(mat)));
          m.material = lm;
        } else snowy(mat);
      }
    }
    this.weather = new Weather(scene);
    this.bubbles = new Bubbles(scene);
    const orbGeo = new THREE.SphereGeometry(0.11, 10, 8);
    this.orbs = new THREE.InstancedMesh(orbGeo, new THREE.MeshBasicMaterial({ color: '#b48cff' }), 64);
    this.orbs.count = 0;
    this.orbs.frustumCulled = false;
    scene.add(this.orbs);
    this.trail = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      1200,
    );
    this.trail.count = 0;
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    big('muro', 1400);
    big('poste', 700);
    big('flecha', 400, false);
    this.bars = new Bars(scene);

    const hemi = new THREE.HemisphereLight('#f4f6ff', '#6a5a44', 1.35);
    scene.add(hemi);
    this.hemi = hemi;
    const sun = new THREE.DirectionalLight('#fff4e4', 1.9);
    sun.position.set(-18, 34, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    // A sombra cobre o mapa inteiro (o canto do mapa fica a uns 2R metros do castelo).
    const reach = 2 * CONFIG.mapRadius + 5;
    sc.left = -reach;
    sc.right = reach;
    sc.top = reach;
    sc.bottom = -reach;
    sc.near = 1;
    sc.far = 90;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    // Contorno do hexágono selecionado e o alcance de quem atira.
    const hexPts: THREE.Vector3[] = [];
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      hexPts.push(new THREE.Vector3(Math.cos(a) * HEX * 0.96, 0.03, Math.sin(a) * HEX * 0.96));
    }
    this.ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(hexPts), new THREE.LineBasicMaterial({ color: '#e9b949' }));
    this.ring.visible = false;
    this.ring.renderOrder = 5;
    scene.add(this.ring);
    const circ: THREE.Vector3[] = [];
    for (let k = 0; k < 64; k++) circ.push(new THREE.Vector3(Math.cos((k / 64) * Math.PI * 2), 0.04, Math.sin((k / 64) * Math.PI * 2)));
    this.range = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circ), new THREE.LineDashedMaterial({ color: '#e9b949', dashSize: 0.4, gapSize: 0.3, transparent: true, opacity: 0.7 }));
    this.range.computeLineDistances();
    this.range.visible = false;
    scene.add(this.range);
    this.ghost.visible = false;
    scene.add(this.ghost);
    const gold = new THREE.MeshBasicMaterial({ color: '#e9b949', transparent: true, opacity: 0.9, depthWrite: false });
    this.unitRings = new THREE.InstancedMesh(new THREE.RingGeometry(0.2, 0.28, 24).rotateX(-Math.PI / 2), gold, 300);
    this.unitRings.count = 0;
    this.unitRings.frustumCulled = false;
    this.heroRings = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.34, 0.46, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#f2c94c', transparent: true, opacity: 0.85, depthWrite: false }),
      8,
    );
    this.heroRings.count = 0;
    this.heroRings.frustumCulled = false;
    scene.add(this.heroRings);
    this.unitRings.renderOrder = 4;
    scene.add(this.unitRings);
    for (const part of art.statics.bandeira.parts) {
      const m = new THREE.Mesh(part.geometry, part.material);
      m.scale.setScalar(1.3);
      this.rallyFlag.add(m);
    }
    const base = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.34, 24).rotateX(-Math.PI / 2), gold);
    base.position.y = 0.03;
    this.rallyFlag.add(base);
    this.rallyFlag.visible = false;
    scene.add(this.rallyFlag);
  }

  /** Linhas da grade: só ao construir ou mover. */
  showGrid(on: boolean): void {
    if (this.grid) this.grid.visible = on;
  }

  /** Bandeira do ponto de encontro do prédio selecionado. */
  showRally(p: { x: number; z: number } | null): void {
    this.rallyFlag.visible = !!p;
    if (p) this.rallyFlag.position.set(p.x, 0, p.z);
  }

  /** Chão, fendas: só uma vez por partida. */
  buildTerrain(w: World): void {
    // A sombra cobre o mapa desta partida (raio 22, ou 16 nos gráficos leves e nos salvos antigos).
    const reach = 2 * w.grid.R + 5;
    const sc = this.sun.shadow.camera;
    sc.left = -reach;
    sc.right = reach;
    sc.top = reach;
    sc.bottom = -reach;
    sc.updateProjectionMatrix();
    // Chão contínuo: a grade hexagonal fica só na lógica (e aparece ao construir).
    for (const o of [this.ground, this.grid, this.water]) {
      if (!o) continue;
      this.scene.remove(o);
      o.geometry.dispose();
    }
    const { ground, grid, water } = buildGround(w);
    this.ground = ground;
    this.grid = grid;
    this.water = water;
    this.scene.add(ground, grid);
    if (water) this.scene.add(water);
    // Lugares onde um peixe pode pular (miolo dos lagos).
    this.waterSpots = [];
    for (const t of w.tiles) {
      if (t?.terrain !== 'water') continue;
      const p = hexToWorld(t.q, t.r);
      this.waterSpots.push({ x: p.x, z: p.z });
    }
    // Tira os grupos inteiros: as fendas mudam de lugar a cada partida desde 2026-11-07.
    for (const g of this.riftGroups) {
      this.scene.remove(g);
      for (const m of g.children as THREE.Mesh[]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    }
    this.riftGroups = [];
    this.rifts = [];
    w.rifts.forEach((i) => {
      const t = w.tiles[i]!;
      const p = hexToWorld(t.q, t.r);
      const g = new THREE.Group();
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.82, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#07060a' }));
      hole.position.y = 0.02;
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.98, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9a4ad0', transparent: true }));
      rim.position.y = 0.03;
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(1.9, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#9a4ad0', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      glow.position.y = 0.04;
      g.add(hole, rim, glow);
      g.position.set(p.x, 0, p.z);
      this.scene.add(g);
      this.riftGroups.push(g);
      this.rifts.push(rim);
    });
    this.ver = -1;
    this.land = w.land;
    this.sprouting.clear();
    this.castleT0 = -99;
    this.look.snap(this.season);
  }

  private place(set: StaticKey, x: number, y: number, z: number, rot: number, scale = 1, id = -1, sx = scale): void {
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    this.s.set(sx, scale, scale);
    this.p.set(x, y, z);
    this.tmp.compose(this.p, this.q, this.s);
    this.sets.get(set)!.push(this.tmp, id);
  }

  private isWall(w: World, q: number, r: number): boolean {
    const t = tileAt(w, q, r);
    if (!t || t.b < 0) return false;
    const b = w.buildings.get(t.b);
    return !!b && (b.kind === 'muralha' || b.kind === 'portao');
  }

  /** Prédios, muralhas e natureza: refeito quando o mundo muda. */
  syncStatic(w: World): void {
    if (w.ver === this.ver) return;
    this.ver = w.ver;
    const keys: StaticKey[] = ['rochaA', 'rochaB', 'rochaC', 'rochaD', 'arvoreA', 'arvoreB', 'arvoreC', 'arvoreD', 'montanhaA', 'montanhaB', 'montanhaC', 'morro', 'minerio', 'pedraA', 'pedraC', 'ruina', 'castelo', 'casteloOuro', 'estandarte', 'casaA', 'casaB', 'fazenda', 'moinho', 'feno', 'saco', 'carrinho', 'pedraCortada', 'blocos', 'blocosB', 'lascas', 'lascasB', 'caixote', 'serraria', 'pedreira', 'mina', 'torre', 'quartel', 'campo', 'obra', 'portao', 'bandeira', 'muro', 'poste', 'torreMago', 'capela', 'estabulo', 'forja', 'oficina', 'acampamento', 'polvora', 'catapulta', 'poco', 'taverna', 'mercado', 'barril', 'caixa', 'balde', 'arvoreE', 'arvoreF', 'toras', 'torasB'];
    // Etapa 17: o terreno mudou (recurso acabou ou brotou): refaz o chão antes de pintar a vila.
    if (w.land !== this.land) this.rebuildGround(w);
    for (const k of keys) this.sets.get(k)!.begin();
    this.crystals.begin();
    this.pitch.begin();
    this.spikes.begin();
    for (const f of this.farms.values()) f.begin();
    const sixth = Math.PI / 3;
    for (const t of w.list) {
      const p = hexToWorld(t.q, t.r);
      const rot = (t.deco % 6) * sixth;
      if (t.b >= 0) continue;
      if (t.ruin) this.place('ruina', p.x, 0, p.z, rot, 0.9);
      // Etapa 17: o recurso rareia em três degraus e cresce do chão quando brota.
      const st = stage(t);
      const g = this.sproutGrow(t.i);
      if (t.terrain === 'forest') {
        // Cheia: o grupo de árvores; pela metade: o grupo menor; no fim: uma árvore só.
        const key = (st === 2 ? ['arvoreA', 'arvoreB', 'arvoreC', 'arvoreD'] : st === 1 ? ['arvoreC', 'arvoreD'] : ['arvoreE', 'arvoreF'])[t.deco % (st === 2 ? 4 : 2)] as StaticKey;
        this.place(key, p.x, 0, p.z, rot, g * (st === 0 ? 1.3 : 1));
      } else if (t.terrain === 'rock') {
        // Rochedo de pedras soltas (Forest Nature Pack): sem a base sextavada das montanhas.
        const k = (st === 2 ? 1 : st === 1 ? 0.75 : 0.5) * g;
        const big = (['rochaC', 'rochaA'] as StaticKey[])[t.deco % 2]!;
        this.place(big, p.x + ((t.deco % 5) - 2) * 0.08, 0, p.z + ((t.deco % 3) - 1) * 0.1, (t.deco % 13) * 0.5, (1.9 + (t.deco % 4) * 0.15) * k);
        if (st > 0) this.place((['rochaB', 'rochaD'] as StaticKey[])[t.deco % 2]!, p.x + 0.55, 0, p.z - 0.35, t.deco * 0.7, 1.3 * k);
        if (st === 2) this.place('rochaA', p.x - 0.5, 0, p.z + 0.45, t.deco * 1.3, (0.9 + (t.deco % 3) * 0.2) * g);
        if (st < 2) this.place('lascasB', p.x - 0.45, 0, p.z + 0.4, t.deco * 1.1, 0.35 * g);
      }
      else if (t.terrain === 'crystal') {
        this.place('pedraA', p.x - 0.4, 0, p.z + 0.25, rot, 2.4 * g);
        this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        this.tmp.compose(this.p.set(p.x + 0.1, 0, p.z - 0.05), this.q, this.s.setScalar((st === 2 ? 1.2 : st === 1 ? 0.9 : 0.6) * g));
        this.crystals.push(this.tmp);
      } else if (t.terrain === 'ore') {
        this.place('pedraA', p.x - 0.35, 0, p.z + 0.2, rot, 2.6 * g);
        this.place('pedraC', p.x + 0.4, 0, p.z - 0.25, rot, 2.4 * g);
        this.place('minerio', p.x, 0, p.z, rot, (st === 2 ? 1.4 : st === 1 ? 1 : 0.6) * g);
      } else if (t.left === 1) {
        // Floresta que acabou: toras caídas no chão.
        this.place('toras', p.x - 0.2, 0, p.z + 0.1, rot, 0.22);
        this.place('torasB', p.x + 0.3, 0, p.z - 0.25, rot + 1.1, 0.19);
        this.place('torasB', p.x + 0.05, 0, p.z + 0.4, rot + 2.3, 0.17);
      } else if (t.left === 2) {
        // Rocha que acabou: cascalho.
        this.place('lascasB', p.x - 0.25, 0, p.z + 0.15, rot, 0.4);
        this.place('lascas', p.x + 0.3, 0, p.z - 0.2, rot + 2, 0.3);
        this.place('pedraC', p.x + 0.05, 0, p.z + 0.45, rot, 1);
      } else if (t.terrain === 'grass' && !t.ruin && t.deco % 23 === 0 && Math.hypot(p.x, p.z) > 5) {
        this.place(t.deco % 2 ? 'pedraA' : 'pedraC', p.x + ((t.deco % 7) - 3) * 0.15, 0, p.z + ((t.deco % 5) - 2) * 0.15, rot, 1.4);
      }
    }
    // Vila: casas viradas para a trilha, quintal com enfeites, poço, taverna e mercado.
    const village = planVillage(w);
    for (const v of village.pieces) this.place(v.key, v.x, 0, v.z, v.rot, v.scale, v.id);
    // Portas das casas: onde os elfos do inverno passeiam.
    this.doors = [...village.homes.values()].map((h) => ({ x: h.x + Math.sin(h.rot) * 0.95, z: h.z + Math.cos(h.rot) * 0.95 }));
    paintVillage(village.yards, village.trails);
    this.movers.clear();
    this.wallsMoving = false;
    for (const b of w.buildings.values()) {
      const p = hexToWorld(b.q, b.r);
      const home = village.homes.get(b.id);
      // Mudança: andaime aqui e bandeira no lugar guardado; o prédio vai a cada quadro (syncDynamic).
      if (b.moveTo || (b.moved && b.built < 1)) {
        if (b.moveTo) {
          const d = hexToWorld(b.moveTo.q, b.moveTo.r);
          this.place('bandeira', d.x, 0, d.z, 0, 1.8);
        }
        if (b.kind === 'muralha' || b.kind === 'portao') {
          this.wallsMoving = true;
          this.wallPiece(w, b, p.x, p.z);
          continue;
        }
        this.place('obra', p.x, 0, p.z, 0, 0.85, b.id);
        this.movers.set(b.id, this.moverLook(w, b, home));
        continue;
      }
      if (home) {
        this.place(home.model, home.x, 0, home.z, home.rot, home.scale, b.id);
        continue;
      }
      if (b.kind === 'muralha' || b.kind === 'portao') {
        this.wallPiece(w, b, p.x, p.z);
        continue;
      }
      if (b.built < 1) {
        this.place('obra', p.x, 0, p.z, 0, 0.85, b.id);
        continue;
      }
      const key = HOME[b.kind];
      // Prédio ligado às ruas: porta para a trilha; os outros giram pelo id.
      const rot = b.kind === 'castelo' ? 0 : village.turns.get(b.id) ?? ((b.id * 7) % 6) * sixth;
      if (b.kind === 'piche' || b.kind === 'estacas') {
        this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.id * 0.7);
        this.tmp.compose(this.p.set(p.x, 0, p.z), this.q, this.s.setScalar(1));
        (b.kind === 'piche' ? this.pitch : this.spikes).push(this.tmp, b.id);
        continue;
      }
      if (b.kind === 'fazenda') {
        // Plantação no hexágono, com as fileiras apontando para o celeiro vizinho. Etapa 17: as
        // plantas baixam conforme a colheita (colhida, fica o toco) e crescem de novo ao replantar.
        this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -farmAngle(w, b));
        const tall = [0.2, 0.55, 0.8, 1][farmStage(b) + 1]! * this.sproutGrow(w.grid.idx(b.q, b.r));
        this.tmp.compose(this.p.set(p.x, 0, p.z), this.q, this.s.set(1, Math.max(0.12, tall), 1));
        this.farms.get(cropOf(w, b))!.push(this.tmp, b.id);
        continue;
      }
      if (b.kind === 'celeiro') {
        // Celeiro: o moinho no centro do hexágono, com feno, sacos e o carrinho em volta.
        this.place('moinho', p.x, 0, p.z, rot, 1, b.id);
        this.place('feno', p.x + 0.55, 0, p.z + 0.5, 0.4, 0.9, b.id);
        this.place('feno', p.x + 0.78, 0, p.z + 0.05, 1.3, 0.8, b.id);
        this.place('saco', p.x - 0.62, 0, p.z + 0.45, 0.8, 0.9, b.id);
        this.place('carrinho', p.x - 0.7, 0, p.z - 0.25, 2.2, 0.8, b.id);
        continue;
      }
      if (b.kind === 'pedreira') {
        this.quarry(w, b, p.x, p.z);
        continue;
      }
      if (b.kind === 'castelo') {
        const lv = Math.max(1, Math.min(b.level, CASTLE_SCALE.length));
        const s = this.castleScale(lv);
        this.castleDrawn = { level: lv, scale: s };
        this.place(lv >= 4 ? 'casteloOuro' : 'castelo', p.x, 0, p.z, 0, s, b.id);
        this.place('bandeira', p.x, 4.0 * s, p.z, 0, CASTLE_FLAG[lv - 1]!, b.id);
        if (lv >= 2) for (const sx of [-1, 1]) this.place('estandarte', p.x + sx * 0.47 * s, 0, p.z + 1.06 * s, 0, 1.5, b.id);
        continue;
      }
      this.place(key, p.x, 0, p.z, rot, b.kind === 'torre' ? TOWER_SCALE : 1, b.id);
      if (b.kind === 'mina') {
        // O minério ao lado da mina diminui com o veio (some quando ele acaba).
        const vein = tileAt(w, b.q, b.r)!;
        if (vein.terrain === 'ore') this.place('minerio', p.x + 0.6, 0, p.z + 0.5, 0, [0.2, 0.28, 0.35][stage(vein)]!, b.id);
      }
    }
    for (const k of keys) this.sets.get(k)!.end();
    // Mina em veio azul mostra os cristais ao lado.
    for (const b of w.buildings.values()) {
      const vein = tileAt(w, b.q, b.r);
      if (b.kind !== 'mina' || vein?.terrain !== 'crystal') continue;
      const p = hexToWorld(b.q, b.r);
      this.tmp.compose(this.p.set(p.x + 0.6, 0, p.z + 0.5), this.q.identity(), this.s.setScalar([0.45, 0.62, 0.8][stage(vein)]!));
      this.crystals.push(this.tmp);
    }
    this.crystals.end();
    for (const f of this.farms.values()) f.end();
    this.pitch.end();
    this.spikes.end();
  }

  /**
   * Etapa 17: refaz o chão quando o terreno muda (floresta que acabou some do tom do chão, rocha
   * nova ganha terra em volta). A grade continua ligada ou não, como estava.
   */
  private rebuildGround(w: World): void {
    this.land = w.land;
    const gridOn = this.grid?.visible ?? false;
    for (const o of [this.ground, this.grid, this.water]) {
      if (!o) continue;
      this.scene.remove(o);
      o.geometry.dispose();
    }
    const { ground, grid, water } = buildGround(w);
    this.ground = ground;
    this.grid = grid;
    this.water = water;
    grid.visible = gridOn;
    this.scene.add(ground, grid);
    if (water) this.scene.add(water);
  }

  /** Quanto o recurso que brotou já cresceu (1 = pronto), com um pulinho no fim. */
  /** Etapa 19: tamanho do castelo no nível, crescendo com um leve passo além na subida. */
  private castleScale(level: number): number {
    const to = CASTLE_SCALE[level - 1]!;
    const k = (this.time - this.castleT0) / CASTLE_GROW;
    if (k >= 1 || k < 0) return to;
    const c = 1.70158;
    const e = 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
    return this.castleFrom + (to - this.castleFrom) * e;
  }

  private sproutGrow(i: number): number {
    const t0 = this.sprouting.get(i);
    if (t0 === undefined) return 1;
    const k = Math.min(1, Math.max(0, (this.time - t0) / SPROUT_TIME));
    const c = 1.7;
    return Math.max(0.02, 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2);
  }

  /**
   * Etapa 17 a cada quadro: o broto cresce (o syncStatic roda de tempos em tempos enquanto isso)
   * e os balões de ícone acompanham os prédios sem recurso e os recursos novos.
   */
  private syncDeposits(w: World, events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'sprout') {
        let x = 0;
        let z = 0;
        for (const i of e.tiles) {
          this.sprouting.set(i, this.time);
          const t = w.tiles[i]!;
          const p = hexToWorld(t.q, t.r);
          x += p.x / e.tiles.length;
          z += p.z / e.tiles.length;
          this.fx?.play('cura', p.x, 0.1, p.z, { scale: 1.2 });
        }
        const vein = e.tiles.map((i) => w.tiles[i]!.terrain).find((k) => k === 'crystal' || k === 'ore');
        this.bubbles.flash(e.terrain === 'forest' ? 'arvore' : vein === 'crystal' ? 'cristal' : vein === 'ore' ? 'ferro' : 'pedra', x, 2.4, z, this.time, 6);
      } else if (e.type === 'replanted') {
        // Replantou: as plantas crescem do chão de novo, com brilho.
        const b = w.buildings.get(e.id);
        if (b) {
          const p = hexToWorld(b.q, b.r);
          this.sprouting.set(w.grid.idx(b.q, b.r), this.time);
          this.fx?.play('cura', p.x, 0.1, p.z, { scale: 1.2 });
        }
      } else if (e.type === 'depleted') {
        const t = w.tiles[e.i]!;
        const p = hexToWorld(t.q, t.r);
        this.fx?.play('poof', p.x, 0.1, p.z, { scale: 0.9 });
      }
    }
    // Etapa 19: castelo crescendo na subida de nível.
    if (this.time - this.castleT0 < CASTLE_GROW + 0.1 && this.time - this.castleSync > 0.04) {
      this.castleSync = this.time;
      this.ver = -1;
    }
    if (this.sprouting.size) {
      if (this.time - this.sproutSync > 0.06) {
        this.sproutSync = this.time;
        this.ver = -1;
      }
      for (const [i, t0] of this.sprouting) if (this.time - t0 > SPROUT_TIME + 0.1) this.sprouting.delete(i);
    }
    // Prédio sem recurso: balão com o recurso riscado em cima dele (some na mudança).
    const dry = new Map<number, { icon: BubbleIcon; x: number; y: number; z: number }>();
    for (const b of w.buildings.values()) {
      if (!b.dry || b.moveTo || b.moved) continue;
      const p = hexToWorld(b.q, b.r);
      const icon = b.kind === 'serraria' ? 'semMadeira' : b.kind === 'pedreira' ? 'semPedra' : b.kind === 'fazenda' ? 'semComida' : 'semFerro';
      dry.set(b.id, { icon, x: p.x, y: b.kind === 'fazenda' ? 0.35 : this.topOf(b) + 0.9, z: p.z });
    }
    // Acumulador fugindo: o que ele leva aparece num balão em cima da mochila (2026-11-09).
    for (const m of w.monsters.values()) {
      if (m.state === 'dead' || !m.loot || m.loot.n <= 0) continue;
      dry.set(m.id, { icon: LOOT_ICON[m.loot.res], x: m.x, y: 1.35, z: m.z });
    }
    this.bubbles.sync(dry, this.time);
  }

  /** O que desenhar de um prédio de mudança: o modelo principal, sem os enfeites em volta. */
  private moverLook(w: World, b: Building, home: Home | undefined): { parts: StaticPart[]; x: number; z: number; rot: number; scale: number } {
    const p = hexToWorld(b.q, b.r);
    const fromSet = (set: Instanced): StaticPart[] => set.meshes.map((m) => ({ geometry: m.geometry, material: m.material as THREE.Material }));
    if (home) return { parts: this.art.statics[home.model].parts, x: home.x, z: home.z, rot: home.rot, scale: home.scale };
    if (b.kind === 'piche' || b.kind === 'estacas') return { parts: fromSet(b.kind === 'piche' ? this.pitch : this.spikes), x: p.x, z: p.z, rot: b.id * 0.7, scale: 1 };
    if (b.kind === 'fazenda') return { parts: fromSet(this.farms.get(cropOf(w, b))!), x: p.x, z: p.z, rot: -farmAngle(w, b), scale: 1 };
    const rot = ((b.id * 7) % 6) * (Math.PI / 3);
    if (b.kind === 'celeiro') return { parts: this.art.statics.moinho.parts, x: p.x, z: p.z, rot, scale: 1 };
    if (b.kind === 'pedreira') return { parts: this.art.statics.pedreira.parts, x: p.x, z: p.z, rot, scale: 1.4 };
    return { parts: this.art.statics[HOME[b.kind]].parts, x: p.x, z: p.z, rot, scale: b.kind === 'torre' ? TOWER_SCALE : 1 };
  }

  /**
   * Mudança a cada quadro: o prédio baixa dentro do andaime enquanto é desmontado e sobe enquanto
   * é montado no lugar novo, com poeirinha em volta.
   */
  private syncMovers(w: World, dt: number): void {
    if (this.wallsMoving && this.time - this.wallSync > 0.25) {
      this.wallSync = this.time;
      this.ver = -1;
    }
    for (const [id, look] of this.movers) {
      const b = w.buildings.get(id);
      if (!b) continue;
      let g = this.moverMeshes.get(id);
      if (!g) {
        g = new THREE.Group();
        for (const part of look.parts) {
          const m = new THREE.Mesh(part.geometry, part.material);
          m.castShadow = true;
          g.add(m);
        }
        this.scene.add(g);
        this.moverMeshes.set(id, g);
      }
      g.position.set(look.x, 0, look.z);
      g.rotation.y = look.rot;
      g.scale.set(look.scale, look.scale * Math.max(0.03, Math.min(1, b.built)), look.scale);
      const left = (this.moverDust.get(id) ?? 0) - dt;
      if (left <= 0 && dt > 0 && this.fx) {
        this.fx.play('poof', look.x + (Math.random() - 0.5) * 1.3, 0.1, look.z + (Math.random() - 0.5) * 1.3, { scale: 0.45, flip: Math.random() < 0.5 });
        this.moverDust.set(id, 0.45 + Math.random() * 0.4);
      } else this.moverDust.set(id, left);
    }
    for (const [id, g] of this.moverMeshes) {
      if (this.movers.has(id)) continue;
      this.scene.remove(g);
      this.moverMeshes.delete(id);
      this.moverDust.delete(id);
    }
  }

  /**
   * Pedreira a céu aberto: barraca, blocos cortados, lascas e carrinho, com a beira que dá para a
   * rocha livre para os trabalhadores (eles ficam ali, virados para o rochedo vizinho).
   */
  private quarry(w: World, b: Building, x: number, z: number): void {
    const d = resourceDir(w, b) ?? { x: 1, z: 0 };
    // u: rumo à rocha; v: de lado.
    const put = (k: StaticKey, u: number, v: number, turn: number, scale: number) =>
      this.place(k, x + d.x * u - d.z * v, 0, z + d.z * u + d.x * v, Math.atan2(d.x, d.z) + turn, scale, b.id);
    put('pedreira', -0.5, 0.42, 0.5, 1.6);
    put('blocos', -0.42, -0.42, 0.2, 0.34);
    put('blocosB', 0.05, -0.62, 1.1, 0.3);
    put('pedraCortada', 0.1, 0.05, 0.9, 1.5);
    put('lascas', 0.55, 0, 0.4, 0.26);
    put('lascasB', 0.95, 0, 2.1, 0.3);
    put('carrinho', 0.35, 0.62, Math.PI / 2, 0.9);
    put('caixote', -0.05, 0.75, 1.6, 1.1);
  }

  private wallPiece(w: World, b: Building, x: number, z: number): void {
    const dirs: number[] = [];
    DIRS.forEach(([dq, dr], k) => {
      if (this.isWall(w, b.q + dq, b.r + dr)) dirs.push(k);
    });
    const ang = (k: number) => {
      const [dq, dr] = DIRS[k]!;
      const o = hexToWorld(dq, dr);
      return Math.atan2(o.z, o.x);
    };
    const grow = b.built < 1 ? Math.max(0.2, b.built) : 1;
    if (b.kind === 'portao') {
      // O portão segue a linha da muralha (dois vizinhos opostos), senão o primeiro vizinho.
      let a = dirs.length ? ang(dirs[0]!) : 0;
      for (const k of dirs) if (dirs.includes((k + 3) % 6)) a = ang(k);
      this.place(b.built < 1 ? 'obra' : 'portao', x, 0, z, -a, b.built < 1 ? 0.6 : 1, b.id);
      return;
    }
    for (const k of dirs) {
      const a = ang(k);
      // Meio muro do centro até a borda: dois meios formam um muro inteiro.
      this.place('muro', x + Math.cos(a) * 0.5, 0, z + Math.sin(a) * 0.5, -a, grow, b.id, 0.5);
    }
    const straight = dirs.length === 2 && (dirs[0]! + 3) % 6 === dirs[1];
    if (!straight) this.place('poste', x, 0, z, 0, 0.85 * grow, b.id);
  }

  /** Fantasma do que vai ser construído (verde pode, vermelho não). */
  setGhost(kind: BuildingKind | null, q: number, r: number, ok: boolean): void {
    if (!kind) {
      this.ghost.visible = false;
      return;
    }
    const key: StaticKey = kind === 'muralha' ? 'poste' : HOME[kind];
    if (this.ghostKey !== key) {
      this.ghost.clear();
      for (const part of this.art.statics[key].parts) this.ghost.add(new THREE.Mesh(part.geometry, this.ghostMat));
      this.ghostKey = key;
    }
    const p = hexToWorld(q, r);
    this.ghost.position.set(p.x, 0.01, p.z);
    this.ghostMat.color.set(ok ? '#8cc56a' : '#e2675a');
    this.ghost.visible = true;
    this.showRing(q, r, ok ? '#8cc56a' : '#e2675a', kind === 'torre' ? CONFIG.tower.range : 0);
  }

  showRing(q: number, r: number, color: string, range: number): void {
    const p = hexToWorld(q, r);
    this.ring.position.set(p.x, 0, p.z);
    (this.ring.material as THREE.LineBasicMaterial).color.set(color);
    this.ring.visible = true;
    this.range.visible = range > 0;
    if (range > 0) {
      this.range.position.set(p.x, 0, p.z);
      this.range.scale.setScalar(range);
    }
  }

  hideRing(): void {
    this.ring.visible = false;
    this.range.visible = false;
  }

  /** Prédio sob o raio (id) ou -1. */
  pickBuilding(ray: THREE.Raycaster): number {
    let best = -1;
    let bd = Infinity;
    for (const set of [...this.farms.values(), this.pitch, this.spikes])
    for (const m of set.meshes)
      for (const h of ray.intersectObject(m, false)) {
        const id = h.instanceId !== undefined ? (set.ids[h.instanceId] ?? -1) : -1;
        if (id >= 0 && h.distance < bd) {
          bd = h.distance;
          best = id;
        }
      }
    for (const [k, set] of this.sets) {
      if (k === 'flecha') continue;
      for (const m of set.meshes) {
        const hits = ray.intersectObject(m, false);
        for (const h of hits) {
          const id = h.instanceId !== undefined ? (set.ids[h.instanceId] ?? -1) : -1;
          if (id >= 0 && h.distance < bd) {
            bd = h.distance;
            best = id;
          }
        }
      }
    }
    return best;
  }

  topOf(b: Building): number {
    // Etapa 19: o castelo muda de tamanho com o nível.
    if (b.kind === 'castelo') return (TOP.castelo ?? 1.2) * this.castleDrawn.scale;
    return TOP[b.kind] ?? 1.2;
  }

  /** Gente, monstros, flechas e barras: a cada quadro. */
  /** dt: tempo do mundo (zero na pausa e na derrota); fxDt: tempo dos efeitos, da queda e da festa. */
  syncDynamic(w: World, events: SimEvent[], dt: number, fxDt = dt): void {
    this.time += dt;
    this.realTime += fxDt;
    const fx = this.fx;
    this.stepFall(fxDt);
    this.stepParty(fxDt);
    this.syncMovers(w, dt);
    this.syncDeposits(w, events);
    // Na festa, a gente comemora mesmo com o jogo parado esperando o relatório.
    const animDt = this.partying ? fxDt : dt;
    const flip = (dx: number, dz: number) => dx * Math.cos(this.camYaw) - dz * Math.sin(this.camYaw) < 0;
    const castleAt = () => {
      for (const b of w.buildings.values()) if (b.kind === 'castelo') return hexToWorld(b.q, b.r);
      return null;
    };
    for (const e of events) {
      if (e.type === 'shot') {
        const d = Math.hypot(e.x2 - e.x1, e.z2 - e.z1);
        this.flights.push({ ...e, t: 0, dur: 0.12 + d / 22 });
      } else if (e.type === 'siege') {
        const d = Math.hypot(e.x2 - e.x1, e.z2 - e.z1);
        this.rocksInFlight.push({ x1: e.x1, y1: 1.5, z1: e.z1, x2: e.x2, y2: 0.2, z2: e.z2, t: 0, dur: 0.5 + d / 14 });
      } else if (e.type === 'spell') {
        const d = Math.hypot(e.x2 - e.x1, e.z2 - e.z1);
        this.spells.push({ x1: e.x1, y1: 0.7, z1: e.z1, x2: e.x2, y2: 0.3, z2: e.z2, t: 0, dur: 0.15 + d / 12 });
      } else if (!fx) continue;
      else if (e.type === 'hit') fx.play(e.fx, e.x, 0, e.z, { flip: flip(e.dx, e.dz), scale: e.fx === 'faisca' ? 0.6 : 1 });
      else if (e.type === 'death' && e.monster) fx.play('poof', e.x, 0, e.z, { flip: Math.random() < 0.5 });
      else if (e.type === 'packed') {
        // Acabou de desmontar: nuvem de poeira onde ele estava.
        const p = hexToWorld(e.q, e.r);
        fx.play('poof', p.x, 0.1, p.z, { scale: 1.2 });
      }
      else if (e.type === 'monsterFx') fx.play(e.fx, e.x, 0, e.z);
      else if (e.type === 'gun') {
        // Espingarda do anão: fumaça na boca do cano e faísca onde o tiro pega.
        const d = Math.hypot(e.x2 - e.x1, e.z2 - e.z1) || 1;
        fx.play('poof', e.x1 + ((e.x2 - e.x1) / d) * 0.55, 0.3, e.z1 + ((e.z2 - e.z1) / d) * 0.55, { scale: 0.18 });
        fx.play('faisca', e.x2, e.fly ? CONFIG.flyHeight : 0.3, e.z2, { scale: 0.7 });
      }
      else if (e.type === 'special') {
        fx.play(e.fx, e.x, 0, e.z, { scale: SPECIAL_SCALE[e.fx] });
        if (e.fx === 'giro') this.spinUntil.set(e.id, this.time + 0.9);
      } else if (e.type === 'heroLevel') fx.play('nivel', e.x, 0, e.z + 0.3, { scale: 0.7 });
      else if (e.type === 'heroBack') fx.play('bencao', e.x, 0, e.z, { scale: 1.4 });
      else if (e.type === 'destroyed') {
        const p = hexToWorld(e.q, e.r);
        if (e.kind === 'castelo') this.startFall(p.x, p.z);
        else fx.play('explosao', p.x, 0, p.z, { scale: e.kind === 'muralha' || e.kind === 'portao' ? 0.6 : 1 });
      } else if (e.type === 'waveEnd') {
        const p = castleAt();
        if (p) fx.play('moedas', p.x, 4.3, p.z);
        if (p) this.startParty(p.x, p.z, e.wave % CONFIG.bossEvery === 0);
      } else if (e.type === 'upgrade') {
        const p = castleAt();
        if (p) fx.play('nivel', p.x, 0, p.z + 0.9);
        this.castleFrom = this.castleDrawn.scale;
        this.castleT0 = this.time;
      }
    }
    // Personagens.
    const seen = new Set<number>();
    // Etapa 19: as melhorias de armaduras da forja aparecem nas tropas: elmo no cavaleiro (1),
    // armadura prateada (2) e dourada (3) no soldado. As de flechas, no rastro das flechas.
    const armor = w.forge.armaduras;
    const soldierSkin = armor >= 3 ? this.art.skins.ouro : armor >= 2 ? this.art.skins.prata : null;
    for (const u of w.units.values()) {
      seen.add(u.id);
      const kind: CharKey = u.kind === 'trabalhador' && u.id % 2 ? 'trabalhadorB' : u.kind === 'cavaleiro' && armor >= 1 ? 'cavaleiroElmo' : u.kind;
      const v = this.charFor(u.id, kind);
      if (u.kind === 'soldado') v.setSkin(soldierSkin);
      let x = u.x;
      let y = 0;
      let z = u.z;
      let facing = u.facing;
      let pose: Pose = 'idle';
      if (u.state === 'shelter') {
        // Recolhido no castelo: não aparece.
        v.root.visible = false;
        v.update(animDt);
        continue;
      }
      if (u.state === 'tower') {
        // Torre aberta: cada arqueiro num canto da plataforma; atirando, vira para o monstro,
        // senão olha para fora.
        const t = w.buildings.get(u.tower);
        if (t) {
          const c = hexToWorld(t.q, t.r);
          const [ox, oz] = PLATFORM[Math.max(0, t.archers.indexOf(u.id)) % PLATFORM.length]!;
          const rot = ((t.id * 7) % 6) * (Math.PI / 3);
          x = c.x + (ox * Math.cos(rot) + oz * Math.sin(rot)) * TOWER_SCALE;
          z = c.z + (-ox * Math.sin(rot) + oz * Math.cos(rot)) * TOWER_SCALE;
          y = PLATFORM_Y * TOWER_SCALE;
          if (u.cd <= 0) facing = Math.atan2(x - c.x, z - c.z);
        }
        pose = this.partying ? 'cheer' : u.cd > 0 ? 'shoot' : 'idle';
      } else if (u.state === 'dead') pose = 'death';
      else if (u.state === 'walk') pose = u.kind === 'cavaleiro' ? 'run' : 'walk';
      else if ((this.spinUntil.get(u.id) ?? 0) > this.time) pose = 'spin';
      else if (u.state === 'fight') pose = FIGHT_POSE[u.kind] ?? 'attack';
      else if (this.partying) pose = 'cheer';
      else if (u.state === 'idle') pose = idlePose(u.kind, u.id, this.realTime);
      else if (u.state === 'work' && u.kind === 'engenheiro') {
        pose = 'repair';
      } else if (u.state === 'work') {
        const b = w.buildings.get(u.job);
        // Prédio de mudança: quem trabalha nele desmonta e monta a marretadas.
        if (b && (b.moveTo || (b.moved && b.built < 1))) pose = 'repair';
        else pose = b?.kind === 'fazenda' ? 'dig' : b?.kind === 'serraria' ? 'chop' : b ? 'pick' : 'idle';
      }
      if (u.kind === 'trabalhador' && u.state !== 'dead') {
        // A ferramenta do trabalho vai na mão desde que ele sai para o serviço (marreta na mudança).
        const jb = w.buildings.get(u.job);
        const jk = jb?.kind;
        if (jb && (jb.moveTo || (jb.moved && jb.built < 1))) v.setTool('marreta');
        else v.setTool(jk === 'fazenda' ? 'pa' : jk === 'serraria' ? 'machadoLenha' : jk === 'pedreira' || jk === 'mina' ? 'picareta' : null);
      }
      v.root.visible = true;
      v.root.position.set(x, y, z);
      v.root.rotation.y = facing;
      v.play(pose);
      v.update(animDt);
    }
    const bats = new Set<number>();
    for (const m of w.monsters.values()) {
      if (m.kind === 'morcego') {
        // Morcego: sprite do pixelfx voando, batendo asas em laço (Etapa 6).
        if (!fx) continue;
        bats.add(m.id);
        const y = CONFIG.flyHeight + Math.sin(this.time * 4 + m.id) * 0.12;
        let slot = this.batSlots.get(m.id);
        if (m.state === 'dead') {
          if (slot !== undefined) {
            fx.stop('morcego', slot);
            fx.play('poof', m.x, y - 0.4, m.z, { scale: 0.7 });
            this.batSlots.set(m.id, -1);
          }
          continue;
        }
        if (slot === undefined) {
          slot = fx.play('morcego', m.x, y, m.z, { loop: true, flip: flip(Math.sin(m.facing), Math.cos(m.facing)) });
          this.batSlots.set(m.id, slot);
        }
        if (slot >= 0) fx.move('morcego', slot, m.x, y, m.z);
        continue;
      }
      seen.add(m.id);
      const v = this.charFor(m.id, m.kind);
      v.root.position.set(m.x, 0, m.z);
      v.root.rotation.y = m.facing;
      v.play(m.state === 'dead' ? 'death' : m.state === 'attack' ? (MONSTER_ATTACK[m.kind] ?? 'attack') : 'walk', m.kind === 'lobisomem' ? 1.5 : 1);
      v.update(dt);
    }
    for (const [id, slot] of this.batSlots) {
      if (bats.has(id)) continue;
      if (slot >= 0) fx?.stop('morcego', slot);
      this.batSlots.delete(id);
    }
    for (const [id, v] of this.chars) {
      if (seen.has(id)) continue;
      this.scene.remove(v.root);
      v.dispose();
      this.chars.delete(id);
    }
    // Anéis das tropas escolhidas.
    let n = 0;
    for (const id of this.selectedUnits) {
      const u = w.units.get(id);
      if (!u || u.state === 'dead' || n >= 300) continue;
      this.tmp.makeTranslation(u.x, 0.03, u.z);
      this.unitRings.setMatrixAt(n++, this.tmp);
    }
    this.unitRings.count = n;
    // Anel dourado no chão debaixo de cada herói de pé.
    let h = 0;
    for (const u of w.units.values()) {
      if (!isHero(u.kind) || u.state === 'dead' || u.state === 'shelter' || h >= 8) continue;
      this.tmp.makeTranslation(u.x, 0.025, u.z);
      this.heroRings.setMatrixAt(h++, this.tmp);
    }
    this.heroRings.count = h;
    this.heroRings.instanceMatrix.needsUpdate = true;
    this.unitRings.instanceMatrix.needsUpdate = true;
    // Flechas em arco.
    const arrows = this.sets.get('flecha')!;
    arrows.begin();
    this.flights = this.flights.filter((f) => {
      f.t += dt;
      if (f.t < f.dur) return true;
      // A flecha chegou: faísca de impacto no alvo.
      fx?.play('faisca', f.x2, 0, f.z2, { flip: flip(f.x2 - f.x1, f.z2 - f.z1), scale: 0.8 });
      return false;
    });
    const arrowLv = Math.min(3, w.forge.flechas);
    const dots = [0, 2, 4, 5][arrowLv]!;
    // Mistura aditiva: cor mais escura = brilho mais fraco.
    (this.trail.material as THREE.MeshBasicMaterial).color.set(['#000000', '#8c887c', '#7fc4ff', '#ffcc55'][arrowLv]!);
    let tn = 0;
    for (const f of this.flights) {
      const k = f.t / f.dur;
      const d = Math.hypot(f.x2 - f.x1, f.z2 - f.z1);
      const arc = d * 0.12;
      const at = (kk: number) => ({ x: f.x1 + (f.x2 - f.x1) * kk, z: f.z1 + (f.z2 - f.z1) * kk, y: f.y1 + (f.y2 - f.y1) * kk + Math.sin(kk * Math.PI) * arc });
      const { x, y, z } = at(k);
      if (dots) {
        // Pontos de luz atrás da cauda da flecha, cada um menor.
        for (let j = 0; j < dots && tn < this.trail.instanceMatrix.count; j++) {
          const kk = k - (0.4 + j * 0.2) / Math.max(1, d);
          if (kk < 0) break;
          const q = at(kk);
          const sc = (1 - j * 0.18) * (arrowLv >= 3 ? 1.25 : 1);
          this.tmp.makeScale(sc, sc, sc).setPosition(q.x, q.y, q.z);
          this.trail.setMatrixAt(tn++, this.tmp);
        }
      }
      const vy = (f.y2 - f.y1) / f.dur + Math.cos(k * Math.PI) * Math.PI * arc / f.dur;
      const vh = d / f.dur;
      this.p.set(x, y, z);
      const look = new THREE.Matrix4().lookAt(this.p, new THREE.Vector3(x + (f.x2 - f.x1) / d, y + vy / vh, z + (f.z2 - f.z1) / d), new THREE.Vector3(0, 1, 0));
      this.q.setFromRotationMatrix(look);
      this.s.setScalar(3);
      this.tmp.compose(this.p, this.q, this.s);
      arrows.push(this.tmp);
    }
    arrows.end();
    this.trail.count = tn;
    this.trail.instanceMatrix.needsUpdate = true;
    // Pedras da catapulta: arco alto e explosão de terra onde caem.
    const rocks = this.sets.get('pedraCerco')!;
    rocks.begin();
    this.rocksInFlight = this.rocksInFlight.filter((f) => {
      f.t += dt;
      if (f.t >= f.dur) {
        fx?.play('explosao', f.x2, 0, f.z2, { scale: 0.45 });
        return false;
      }
      const k = f.t / f.dur;
      const d = Math.hypot(f.x2 - f.x1, f.z2 - f.z1);
      this.q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), f.t * 9);
      this.p.set(f.x1 + (f.x2 - f.x1) * k, f.y1 + (f.y2 - f.y1) * k + Math.sin(k * Math.PI) * (1.5 + d * 0.25), f.z1 + (f.z2 - f.z1) * k);
      this.tmp.compose(this.p, this.q, this.s.setScalar(1.3));
      rocks.push(this.tmp);
      return true;
    });
    rocks.end();
    // Feitiços do mago: esfera que voa e explode em mana no alvo.
    let n2 = 0;
    this.spells = this.spells.filter((f) => {
      f.t += dt;
      if (f.t >= f.dur) {
        fx?.play('mana', f.x2, 0, f.z2, { flip: flip(f.x2 - f.x1, f.z2 - f.z1) });
        return false;
      }
      const k = f.t / f.dur;
      const y = f.y1 + (f.y2 - f.y1) * k + Math.sin(k * Math.PI) * 0.6;
      if (n2 < 64) {
        this.tmp.makeTranslation(f.x1 + (f.x2 - f.x1) * k, y, f.z1 + (f.z2 - f.z1) * k);
        this.orbs.setMatrixAt(n2++, this.tmp);
      }
      return true;
    });
    this.orbs.count = n2;
    this.orbs.instanceMatrix.needsUpdate = true;
    // Barras: obra (dourada), prédio ferido, gente e monstros feridos.
    this.bars.begin();
    for (const b of w.buildings.values()) {
      const p = hexToWorld(b.q, b.r);
      const top = this.topOf(b) + 0.35;
      // Obra em dourado; desmontando para a mudança, em laranja (a barra vai esvaziando).
      if (b.built < 1) this.bars.add(p.x, top, p.z, 1, b.built, b.moveTo ? '#e0803a' : '#e9b949');
      else if (b.hp < b.maxHp) this.bars.add(p.x, top, p.z, 1.2, b.hp / b.maxHp, b.kind === 'castelo' ? '#c8483a' : '#8cc56a');
    }
    for (const u of w.units.values()) {
      if (u.state === 'dead' || u.state === 'shelter' || u.state === 'tower') continue;
      // Herói: barra dourada sempre à vista (a criança acha ele de longe).
      if (isHero(u.kind)) this.bars.add(u.x, 1.05, u.z, 0.75, u.hp / u.maxHp, '#e9b949');
      else if (u.hp < u.maxHp) this.bars.add(u.x, 0.85, u.z, 0.5, u.hp / u.maxHp, '#8cc56a');
    }
    for (const m of w.monsters.values()) {
      if (m.state === 'dead' || m.hp >= m.maxHp) continue;
      const big = !!MONSTERS[m.kind].boss;
      const h = big ? 2.3 : m.kind === 'troll' ? 1.5 : m.kind === 'bruto' ? 1.35 : m.kind === 'vampiro' ? 1.1 : m.kind === 'morcego' ? CONFIG.flyHeight + 0.45 : 0.9;
      this.bars.add(m.x, h, m.z, big ? 1.4 : 0.5, m.hp / m.maxHp, '#e2675a');
    }
    this.bars.end();
    if (this.water) (this.water.material as THREE.ShaderMaterial).uniforms.uTime!.value = this.time;
    // Noite sem lua (modificador de onda): a luz cai devagar e volta no fim da onda.
    const nightGoal = w.waveState !== 'calm' && w.waveMods.includes('noite') ? 1 : 0;
    this.night += (nightGoal - this.night) * Math.min(1, dt * 1.5);
    // Estação (Etapa 16): cores andando devagar para a nova, o tempo caindo e a chuva escurecendo.
    this.look.update(this.season, fxDt);
    SEASON_U.uTime.value = this.time;
    const sky = weatherOf(this.season, w.wave, w.waveState !== 'calm', w.seed);
    this.rain += ((sky === 'chuva' ? 1 : 0) - this.rain) * Math.min(1, fxDt * 0.8);
    this.weather.update(sky, fxDt, this.focus.x, this.focus.z, this.pxPerMeter * this.dpr);
    const dim = (1 - 0.65 * this.night) * (1 - 0.3 * this.rain);
    this.sun.intensity = 1.9 * this.look.sunK * dim;
    this.sun.color.copy(this.look.sun);
    this.hemi.intensity = 1.35 * (1 - 0.45 * this.night) * (1 - 0.15 * this.rain);
    this.hemi.color.setRGB(0.96 - 0.4 * this.night, 0.97 - 0.32 * this.night, 1);
    if (fx) {
      // Fogo nos prédios com menos da metade da vida.
      const alive = new Set<number>();
      for (const b of w.buildings.values()) {
        if (b.kind === 'muralha' || b.kind === 'portao') continue;
        const hot = b.built >= 1 && b.hp < b.maxHp * 0.5;
        const slot = this.burning.get(b.id);
        if (hot) {
          alive.add(b.id);
          const p = hexToWorld(b.q, b.r);
          if (slot === undefined) {
            const i = fx.play('fogo', p.x + 0.1, this.topOf(b) * 0.5, p.z + 0.25, { loop: true, flip: b.id % 2 === 0 });
            if (i >= 0) this.burning.set(b.id, i);
          }
        }
      }
      for (const [id, i] of this.burning) {
        if (alive.has(id)) continue;
        fx.stop('fogo', i);
        this.burning.delete(id);
      }
      // Piche aceso: três chamas no fosso enquanto queima.
      for (const b of w.buildings.values()) {
        if (b.kind !== 'piche') continue;
        const on = this.pitchFire.get(b.id);
        if (b.burn > 0 && !on) {
          const p = hexToWorld(b.q, b.r);
          this.pitchFire.set(b.id, [
            fx.play('fogo', p.x - 0.35, 0.02, p.z + 0.1, { loop: true, scale: 1.1 }),
            fx.play('fogo', p.x + 0.3, 0.02, p.z - 0.15, { loop: true, scale: 0.9, flip: true }),
            fx.play('fogo', p.x, 0.02, p.z + 0.4, { loop: true }),
          ]);
        }
      }
      for (const [id, slots] of this.pitchFire) {
        const b = w.buildings.get(id);
        if (b && b.burn > 0) continue;
        for (const i of slots) fx.stop('fogo', i);
        this.pitchFire.delete(id);
      }
      // Portais nas fendas abertas.
      const openNow = openRifts(Math.max(1, w.wave + (w.waveState === 'calm' ? 1 : 0)), w.mode);
      while (this.portals.length < Math.min(openNow, w.rifts.length)) {
        const t = w.tiles[w.rifts[this.portals.length]!]!;
        const p = hexToWorld(t.q, t.r);
        this.portals.push(fx.play('portal', p.x, 0, p.z, { loop: true }));
      }
      this.stepLife(w, fxDt);
      this.stepElves(w, fxDt);
      fx.update(fxDt, this.pxPerMeter);
    }
    // Fendas: só brilham as abertas.
    const open = openRifts(Math.max(1, w.wave + (w.waveState === 'calm' ? 1 : 0)), w.mode);
    this.rifts.forEach((rim, k) => {
      const mat = rim.material as THREE.MeshBasicMaterial;
      mat.opacity = k < open ? 0.75 + 0.25 * Math.sin(this.time * 3 + k) : 0.25;
    });
  }

  private charFor(id: number, kind: CharKey): CharView {
    let v = this.chars.get(id);
    if (v && v.kind !== kind) {
      this.scene.remove(v.root);
      v.dispose();
      v = undefined;
    }
    if (!v) {
      v = new CharView(this.art, kind);
      this.scene.add(v.root);
      this.chars.set(id, v);
    }
    return v;
  }

  /** Partida nova: para os laços (fogo e portais) e os efeitos em andamento. */
  // ------------------------------------------------------------ festa e mundo vivo (Etapa 16)

  /** Tempo que anda mesmo na espera do relatório: festa e ritmo da gente parada. */
  private realTime = 0;
  private party: { x: number; z: number; t: number; dur: number; boss: boolean; next: number } | null = null;
  /** Cada fogo que estoura (o main toca o som). */
  onFirework: (() => void) | null = null;
  /** Estação de agora (0 primavera, 1 verão, 2 outono, 3 inverno). */
  season = 0;

  get partying(): boolean {
    return !!this.party && this.party.t < this.party.dur;
  }

  /** Onda vencida: fogos e confete sobre o castelo e todo mundo comemora (mais comprido no chefe). */
  private startParty(x: number, z: number, boss: boolean): void {
    this.party = { x, z, t: 0, dur: boss ? 6 : 3.4, boss, next: 0.15 };
    this.fx?.play('confete', x, 3.2, z, { scale: boss ? 1.5 : 1.1 });
  }

  private stepParty(dt: number): void {
    const p = this.party;
    if (!p || p.t >= p.dur) return;
    p.t += dt;
    p.next -= dt;
    if (p.next > 0 || p.t > p.dur - 0.6) return;
    p.next = p.boss ? 0.22 : 0.4;
    const a = Math.random() * Math.PI * 2;
    const r = 1.5 + Math.random() * 3;
    this.fx?.play('fogos', p.x + Math.cos(a) * r, 2.5 + Math.random() * 2.5, p.z + Math.sin(a) * r * 0.6, { scale: 0.7 + Math.random() * 0.6 });
    if (p.boss && Math.random() < 0.3) this.fx?.play('confete', p.x + (Math.random() - 0.5) * 4, 3.5, p.z, { scale: 1.2 });
    this.onFirework?.();
  }

  private butterflies = new Map<number, number>();
  /** Elfos do inverno (2026-11-09): vão de porta em porta entre as ondas e acenam ao chegar. */
  private doors: { x: number; z: number }[] = [];
  private elves: { v: CharView; x: number; z: number; to: number; wait: number }[] = [];

  private stepElves(w: World, dt: number): void {
    const want = this.extras && this.season === 3 && w.waveState === 'calm' && !w.lost && this.doors.length >= 2 ? Math.min(4, 1 + Math.floor(this.doors.length / 2)) : 0;
    while (this.elves.length > want) {
      const e = this.elves.pop()!;
      this.fx?.play('poof', e.x, 0.3, e.z, { scale: 0.6 });
      this.scene.remove(e.v.root);
      e.v.dispose();
    }
    while (this.elves.length < want) {
      const k = this.elves.length;
      const from = this.doors[(k * 3) % this.doors.length]!;
      const v = new CharView(this.art, k % 2 ? 'elfoB' : 'elfoA');
      this.scene.add(v.root);
      this.elves.push({ v, x: from.x, z: from.z, to: (k * 3 + 1) % this.doors.length, wait: 0.5 + k * 0.7 });
    }
    for (const e of this.elves) {
      const d = this.doors[e.to % this.doors.length]!;
      const dist = Math.hypot(d.x - e.x, d.z - e.z);
      let pose: Pose = 'walk';
      if (e.wait > 0) {
        e.wait -= dt;
        pose = 'wave';
        if (e.wait <= 0) e.to = Math.floor(Math.random() * this.doors.length);
      } else if (dist < 0.1) {
        e.wait = 1.5 + Math.random() * 2;
      } else {
        const s = Math.min(dist, 0.9 * dt);
        e.x += ((d.x - e.x) / dist) * s;
        e.z += ((d.z - e.z) / dist) * s;
        e.v.root.rotation.y = Math.atan2(d.x - e.x, d.z - e.z);
      }
      e.v.root.position.set(e.x, 0, e.z);
      e.v.play(pose);
      e.v.update(dt);
    }
  }
  private birds: { slot: number; x: number; z: number; vx: number; vz: number; y: number }[] = [];
  private fishT = 2;
  private waterSpots: { x: number; z: number }[] = [];

  /**
   * Mundo vivo: uma borboleta em cada plantação (fora do inverno), três pássaros cruzando o céu
   * e um peixe pulando num lago de vez em quando. Nada de monstro: eles só vêm pelos portais.
   */
  private stepLife(w: World, dt: number): void {
    const fx = this.fx;
    if (!fx) return;
    if (!this.extras) {
      // Gráficos leves: sem bichinhos.
      for (const i of this.butterflies.values()) fx.stop('borboleta', i);
      for (const b of this.birds) fx.stop('passaro', b.slot);
      this.butterflies.clear();
      this.birds = [];
      return;
    }
    const warm = this.season !== 3;
    const seen = new Set<number>();
    if (warm) {
      for (const b of w.buildings.values()) {
        if (b.kind !== 'fazenda' || b.built < 1 || seen.size >= 24) continue;
        seen.add(b.id);
        const p = hexToWorld(b.q, b.r);
        const t = this.realTime * 0.6 + b.id * 1.7;
        const x = p.x + Math.cos(t) * 0.55 + Math.sin(t * 2.3) * 0.2;
        const z = p.z + Math.sin(t * 0.8) * 0.5;
        const y = 0.5 + Math.sin(t * 3) * 0.1;
        let slot = this.butterflies.get(b.id);
        if (slot === undefined) {
          slot = fx.play('borboleta', x, y, z, { loop: true, flip: b.id % 2 === 0 });
          this.butterflies.set(b.id, slot);
        }
        fx.move('borboleta', slot, x, y, z);
      }
    }
    for (const [id, slot] of this.butterflies) {
      if (seen.has(id)) continue;
      fx.stop('borboleta', slot);
      this.butterflies.delete(id);
    }
    // Pássaros: atravessam o mapa e somem do outro lado; outro aparece num canto qualquer.
    const edge = 2 * w.grid.R + 6;
    while (this.birds.length < 3) {
      const a = Math.random() * Math.PI * 2;
      const turn = (Math.random() - 0.5) * 0.8;
      const vx = -Math.cos(a + turn) * 2.4;
      const vz = -Math.sin(a + turn) * 2.4;
      const bird = { slot: -1, x: Math.cos(a) * edge, z: Math.sin(a) * edge, vx, vz, y: 6 + Math.random() * 2 };
      const left = vx * Math.cos(this.camYaw) - vz * Math.sin(this.camYaw) < 0;
      bird.slot = fx.play('passaro', bird.x, bird.y, bird.z, { loop: true, flip: left });
      this.birds.push(bird);
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i]!;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      fx.move('passaro', b.slot, b.x, b.y, b.z);
      if (Math.hypot(b.x, b.z) > edge + 2) {
        fx.stop('passaro', b.slot);
        this.birds.splice(i, 1);
      }
    }
    // Peixe pulando num lago (no inverno a água está fria demais).
    this.fishT -= dt;
    if (this.fishT <= 0) {
      this.fishT = 3 + Math.random() * 4;
      if (warm && this.waterSpots.length) {
        const s = this.waterSpots[Math.floor(Math.random() * this.waterSpots.length)]!;
        fx.play('respingo', s.x + (Math.random() - 0.5) * 0.8, 0, s.z + (Math.random() - 0.5) * 0.8, { scale: 0.8 });
      }
    }
  }

  // ------------------------------------------------------------ queda do castelo (Etapa 13)

  private fall: { g: THREE.Group; x: number; z: number; t: number; puff: number; boom: number; done: boolean } | null = null;

  /**
   * O castelo cai quando a partida se perde: uma cópia dele treme com poeira, afunda inclinando
   * no chão (os escombros já estão no ladrilho) com explosões de terra, e some num estouro final.
   * Dura uns 3 s; o diálogo de derrota espera (FALL_TIME no Game).
   */
  private startFall(x: number, z: number): void {
    this.endFall();
    const g = new THREE.Group();
    // Cai o castelo do jeito que estava desenhado (tamanho e telhado do nível).
    const { level, scale } = this.castleDrawn;
    const body = new THREE.Group();
    for (const part of this.art.statics[level >= 4 ? 'casteloOuro' : 'castelo'].parts) {
      const m = new THREE.Mesh(part.geometry, part.material);
      m.castShadow = true;
      body.add(m);
    }
    body.scale.setScalar(scale);
    g.add(body);
    const flag = new THREE.Group();
    for (const part of this.art.statics.bandeira.parts) flag.add(new THREE.Mesh(part.geometry, part.material));
    flag.position.y = 4.0 * scale;
    flag.scale.setScalar(CASTLE_FLAG[level - 1]!);
    g.add(flag);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.fall = { g, x, z, t: 0, puff: 0, boom: 0.5, done: false };
  }

  private stepFall(dt: number): void {
    const f = this.fall;
    if (!f || f.done) return;
    f.t += dt;
    const t = f.t;
    const fx = this.fx;
    // Tremor forte no começo, mais leve enquanto afunda.
    const shake = t < 2.6 ? Math.min(1, t / 0.25) * (t < 0.8 ? 0.08 : 0.04) : 0;
    const k = Math.min(1, Math.max(0, (t - 0.6) / 2.0));
    const sink = k * k * (3 - 2 * k);
    f.g.position.set(f.x + Math.sin(t * 47) * shake, -sink * 4.8, f.z + Math.cos(t * 39) * shake);
    f.g.rotation.set(sink * 0.18, 0, sink * 0.3);
    if (fx) {
      f.puff -= dt;
      if (f.puff <= 0 && t < 2.8) {
        f.puff = 0.12;
        const a = Math.random() * Math.PI * 2;
        const r = 0.7 + Math.random() * 0.9;
        fx.play('poof', f.x + Math.cos(a) * r, 0, f.z + Math.sin(a) * r, { scale: 0.8 + Math.random() * 0.6, flip: Math.random() < 0.5 });
      }
      f.boom -= dt;
      if (f.boom <= 0 && t > 0.5 && t < 2.6) {
        f.boom = 0.38;
        fx.play('explosao', f.x + (Math.random() - 0.5) * 1.8, 0, f.z + (Math.random() - 0.5) * 1.8, { scale: 0.7 + Math.random() * 0.5 });
      }
    }
    if (t > 2.7) {
      f.done = true;
      this.scene.remove(f.g);
      fx?.play('explosao', f.x, 0, f.z, { scale: 1.5 });
      fx?.play('poof', f.x, 0, f.z, { scale: 1.8 });
    }
  }

  private endFall(): void {
    if (this.fall) this.scene.remove(this.fall.g);
    this.fall = null;
  }

  resetFx(): void {
    this.endFall();
    if (!this.fx) return;
    for (const i of this.burning.values()) this.fx.stop('fogo', i);
    for (const i of this.portals) this.fx.stop('portal', i);
    for (const i of this.batSlots.values()) if (i >= 0) this.fx.stop('morcego', i);
    this.batSlots.clear();
    this.burning.clear();
    this.portals = [];
    this.party = null;
    for (const i of this.butterflies.values()) this.fx.stop('borboleta', i);
    for (const b of this.birds) this.fx.stop('passaro', b.slot);
    this.butterflies.clear();
    this.birds = [];
  }

  clearChars(): void {
    for (const v of this.chars.values()) {
      this.scene.remove(v.root);
      v.dispose();
    }
    this.chars.clear();
    this.flights = [];
    for (const e of this.elves) {
      this.scene.remove(e.v.root);
      e.v.dispose();
    }
    this.elves = [];
  }
}

export { BUILDINGS };
