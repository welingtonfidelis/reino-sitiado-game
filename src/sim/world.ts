/**
 * Estado da partida e geração do mapa. Tudo aqui é dado puro: a simulação (step.ts) muda o
 * estado a 20 passos por segundo e a tela só lê.
 */
import { BUILDINGS, CONFIG, UNITS } from './config.ts';
import type { BuildingKind, Cost, MonsterKind, Res, UnitKind } from './config.ts';
import { DIRS, HexIndex, hexDist, hexToWorld, rng } from './hex.ts';
import type { Rand } from './hex.ts';
import { baseMods, emptyStats, nameFor } from './blessings.ts';
import type { BlessingId, Mods, Report, WaveStats } from './blessings.ts';

export type Terrain = 'grass' | 'forest' | 'rock' | 'ore' | 'crystal' | 'rift' | 'water';

export interface Tile {
  i: number;
  q: number;
  r: number;
  terrain: Terrain;
  /** Variação do enfeite (qual árvore, qual rocha). */
  deco: number;
  /** Prédio em cima (id) ou -1. */
  b: number;
  /** Ruína de um prédio derrubado (só enfeite). */
  ruin: boolean;
}

export interface Building {
  id: number;
  kind: BuildingKind;
  q: number;
  r: number;
  hp: number;
  maxHp: number;
  /** 0 a 1; abaixo de 1 é obra (andaime). */
  built: number;
  workers: number[];
  archers: number[];
  queue: number;
  queueT: number;
  cd: number;
  level: number;
  /** Só um aviso de "sem trabalhador livre" por fila parada. */
  warned: boolean;
  /** Ponto de encontro: onde as tropas treinadas aqui ficam esperando. */
  rally: { x: number; z: number } | null;
  /** Fosso de piche aceso: segundos de fogo que faltam (Etapa 9). */
  burn: number;
}

export type UnitState = 'idle' | 'walk' | 'work' | 'fight' | 'tower' | 'shelter' | 'dead';

export interface Unit {
  id: number;
  kind: UnitKind;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  state: UnitState;
  facing: number;
  job: number;
  tower: number;
  target: number;
  path: number[];
  goal: number;
  repath: number;
  cd: number;
  /** Ponto de guarda quando não há o que fazer. */
  postX: number;
  postZ: number;
  deadT: number;
  /** Vaga dentro do prédio (para não ficarem uns em cima dos outros). */
  slot: number;
  /** Prédio onde a tropa foi treinada (-1 para trabalhador). */
  home: number;
  /** De onde vem o ponto de guarda: 0 padrão, 1 ponto de encontro do prédio, 2 ordem do jogador. */
  order: 0 | 1 | 2;
  /** Nome (aparece no relatório quando cai). */
  name: string;
  /** Heróis (Etapa 14): dano causado, nível (1 a 5), tempo desmaiado e recarga do golpe especial. */
  xp?: number;
  level?: number;
  downT?: number;
  specialT?: number;
}

export interface Monster {
  id: number;
  kind: MonsterKind;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  cd: number;
  state: 'walk' | 'attack' | 'dead';
  facing: number;
  deadT: number;
  /** Etapa 6: tempo desde que pegou fogo (troll), relógios de cura e de invocação, quem o invocou. */
  burnT: number;
  healT: number;
  summonT: number;
  owner: number;
  /** Etapa 14: preso por raízes ou atordoado (s). */
  stunT?: number;
}

export type SimEvent =
  | { type: 'toast'; text: string; tone: 'good' | 'bad' | 'warn' | 'gold' | 'info' }
  | { type: 'shot'; x1: number; y1: number; z1: number; x2: number; y2: number; z2: number }
  | { type: 'built'; id: number }
  | { type: 'destroyed'; id: number; kind: BuildingKind; q: number; r: number }
  | { type: 'hit'; fx: 'espada' | 'garra' | 'pancada' | 'golpe' | 'faisca' | 'cura'; x: number; z: number; dx: number; dz: number }
  | { type: 'spell'; x1: number; z1: number; x2: number; z2: number }
  | { type: 'monsterFx'; fx: 'bloom' | 'alma'; x: number; z: number }
  | { type: 'special'; fx: 'giro' | 'chuva' | 'raizes' | 'pisao'; x: number; z: number; id: number }
  | { type: 'heroLevel'; x: number; z: number; level: number }
  | { type: 'heroBack'; x: number; z: number }
  | { type: 'siege'; x1: number; z1: number; x2: number; z2: number }
  | { type: 'death'; x: number; z: number; monster: boolean }
  | { type: 'upgrade'; level: number }
  | { type: 'waveStart'; wave: number }
  | { type: 'waveEnd'; wave: number; gold: number }
  | { type: 'report' }
  | { type: 'lost'; wave: number };

export type WaveState = 'calm' | 'spawning' | 'attack';

export type WaveMod = 'noite' | 'blindados' | 'enxame' | 'furia';
export const WAVE_MODS: Record<WaveMod, { name: string; text: string }> = {
  noite: { name: 'Noite sem lua', text: 'Torres, castelo, catapultas, arqueiros e magos alcançam 20% menos.' },
  blindados: { name: 'Blindados', text: 'A horda sente 25% menos de todo dano.' },
  enxame: { name: 'Enxame', text: 'Vêm 60% mais esqueletos.' },
  furia: { name: 'Fúria', text: 'A horda anda 30% mais rápido.' },
};

export interface World {
  seed: number;
  rand: Rand;
  tick: number;
  time: number;
  grid: HexIndex;
  tiles: (Tile | null)[];
  /** Ladrilhos que existem (dentro do raio), na ordem do índice. */
  list: Tile[];
  buildings: Map<number, Building>;
  units: Map<number, Unit>;
  monsters: Map<number, Monster>;
  nextId: number;
  res: Record<Res, number>;
  housesBuilt: number;
  arriveT: number;
  wave: number;
  waveState: WaveState;
  waveTimer: number;
  spawnQueue: MonsterKind[];
  spawnT: number;
  rifts: number[];
  /** Campo de fluxo da horda: próximo ladrilho rumo ao castelo (-1 = sem caminho). */
  flow: Int32Array;
  flowDist: Float32Array;
  /** Ladrilhos que a gente do reino alcança a pé a partir do castelo. */
  reach: Uint8Array;
  dirty: boolean;
  /** Sobe a cada mudança em prédios e muralhas (a tela redesenha o que é parado). */
  ver: number;
  hungry: boolean;
  /** Trabalhadores recolhidos no castelo (não trabalham e a horda não alcança). */
  shelter: boolean;
  lost: boolean;
  kills: number;
  /** Avisos que só saem uma vez até a situação mudar. */
  flags: Record<string, boolean>;
  /** Bênçãos escolhidas e o efeito somado delas (Etapa 4). */
  blessings: BlessingId[];
  mods: Mods;
  /** O que aconteceu desde o último relatório, e o relatório aberto (o jogo espera o jogador). */
  stats: WaveStats;
  report: Report | null;
  /** Modificadores da onda em andamento (Etapa 9). */
  waveMods: WaveMod[];
  /** Melhorias da forja (Etapa 5), de 0 a 3 cada. */
  forge: { armas: number; armaduras: number; flechas: number };
  events: SimEvent[];
}

export const CASTLE_ID = 1;

export function tileAt(w: World, q: number, r: number): Tile | null {
  if (!w.grid.has(q, r)) return null;
  return w.tiles[w.grid.idx(q, r)] ?? null;
}

export function neighbors(w: World, t: Tile): Tile[] {
  const out: Tile[] = [];
  for (const [dq, dr] of DIRS) {
    const n = tileAt(w, t.q + dq, t.r + dr);
    if (n) out.push(n);
  }
  return out;
}

export function castle(w: World): Building | undefined {
  return w.buildings.get(CASTLE_ID);
}

/** Moradores vivos: trabalhadores e tropas. */
export function population(w: World): number {
  let n = 0;
  for (const u of w.units.values()) if (u.state !== 'dead') n++;
  return n;
}

/** Trabalhadores vivos: só eles contam no teto (as tropas não têm teto, Etapa 2). */
export function workers(w: World): number {
  let n = 0;
  for (const u of w.units.values()) if (u.state !== 'dead' && u.kind === 'trabalhador') n++;
  return n;
}

export function troops(w: World): number {
  let n = 0;
  for (const u of w.units.values()) if (u.state !== 'dead' && u.kind !== 'trabalhador') n++;
  return n;
}

export function housing(w: World): number {
  let n = 0;
  for (const b of w.buildings.values()) if (b.built >= 1) n += BUILDINGS[b.kind].housing ?? 0;
  return n;
}

export function castleCap(w: World): number {
  const c = castle(w);
  const lvl = c ? c.level : 1;
  return CONFIG.castleCap[Math.min(lvl, CONFIG.castleCap.length) - 1]!;
}

/** Custo de construir (casas encarecem a cada nova). */
export function buildCost(w: World, kind: BuildingKind): Cost {
  const base = BUILDINGS[kind].cost;
  if (kind !== 'casa') return base;
  const k = Math.pow(CONFIG.houseGrowth, w.housesBuilt);
  const out: Cost = {};
  for (const [r, v] of Object.entries(base) as [Res, number][]) out[r] = Math.round(v * k);
  return out;
}

export function canAfford(w: World, cost: Cost): boolean {
  for (const [r, v] of Object.entries(cost) as [Res, number][]) if (w.res[r] < v) return false;
  return true;
}

export function pay(w: World, cost: Cost): void {
  for (const [r, v] of Object.entries(cost) as [Res, number][]) w.res[r] -= v;
}

export function refundTo(w: World, cost: Cost, share: number): void {
  for (const [r, v] of Object.entries(cost) as [Res, number][]) w.res[r] += Math.floor(v * share);
}

export function addBuilding(w: World, kind: BuildingKind, q: number, r: number, built = 0): Building {
  const def = BUILDINGS[kind];
  const hp = kind === 'muralha' || kind === 'portao' ? Math.round(def.hp * w.mods.wallHp) : def.hp;
  const b: Building = {
    id: w.nextId++,
    kind,
    q,
    r,
    hp,
    maxHp: hp,
    built,
    workers: [],
    archers: [],
    queue: 0,
    queueT: 0,
    cd: 0,
    level: 1,
    warned: false,
    rally: null,
    burn: 0,
  };
  w.buildings.set(b.id, b);
  const t = tileAt(w, q, r)!;
  t.b = b.id;
  t.ruin = false;
  w.dirty = true;
  return b;
}

export function addUnit(w: World, kind: UnitKind, x: number, z: number): Unit {
  const def = UNITS[kind];
  const u: Unit = {
    id: w.nextId++,
    kind,
    x,
    z,
    hp: def.hp,
    maxHp: def.hp,
    state: 'idle',
    facing: 0,
    job: -1,
    tower: -1,
    target: -1,
    path: [],
    goal: -1,
    repath: 0,
    cd: 0,
    postX: x,
    postZ: z,
    deadT: 0,
    slot: 0,
    home: -1,
    order: 0,
    name: '',
  };
  u.name = nameFor(u.id, w.seed);
  w.units.set(u.id, u);
  return u;
}

/** Posição de chegada: num lado do castelo, com um pouco de espalhamento. */
export function castleDoor(w: World): { x: number; z: number } {
  const c = castle(w)!;
  const p = hexToWorld(c.q, c.r);
  return { x: p.x + (w.rand() - 0.5) * 1.2, z: p.z + 1.6 + w.rand() * 0.4 };
}

function grow(w: World, start: Tile, size: number, terrain: Terrain, minDist: number): void {
  let t = start;
  for (let k = 0; k < size * 3 && size > 0; k++) {
    if (t.terrain === 'grass' && hexDist(t.q, t.r, 0, 0) >= minDist) {
      t.terrain = terrain;
      t.deco = Math.floor(w.rand() * 1000);
      size--;
    }
    const ns = neighbors(w, t);
    t = ns[Math.floor(w.rand() * ns.length)]!;
  }
}

function tileAtAngle(w: World, angle: number, dist: number): Tile {
  // Ponto do mundo no ângulo pedido (0 = leste, -π/2 = norte) e o hexágono dele.
  const x = Math.cos(angle) * dist * 2;
  const z = Math.sin(angle) * dist * 2;
  const fq = ((Math.sqrt(3) / 3) * x - z / 3) / (2 / Math.sqrt(3));
  const fr = ((2 / 3) * z) / (2 / Math.sqrt(3));
  let best: Tile | null = null;
  let bd = Infinity;
  for (const t of w.list) {
    const d = (t.q - fq) ** 2 + (t.r - fr) ** 2 + (t.q - fq) * (t.r - fr);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best!;
}

/** Ângulos das fendas (norte, nordeste, noroeste): a câmera fica ao sul, livre. */
export const RIFT_ANGLES = [-Math.PI / 2, -Math.PI / 6, (-5 * Math.PI) / 6];

export function createWorld(seed = 1, R = CONFIG.mapRadius): World {
  const grid = new HexIndex(R);
  const tiles: (Tile | null)[] = new Array(grid.size).fill(null);
  const list: Tile[] = [];
  for (let q = -R; q <= R; q++)
    for (let r = -R; r <= R; r++) {
      if (!grid.has(q, r)) continue;
      const t: Tile = { i: grid.idx(q, r), q, r, terrain: 'grass', deco: 0, b: -1, ruin: false };
      tiles[t.i] = t;
      list.push(t);
    }
  const w: World = {
    seed,
    rand: rng(seed),
    tick: 0,
    time: 0,
    grid,
    tiles,
    list,
    buildings: new Map(),
    units: new Map(),
    monsters: new Map(),
    nextId: CASTLE_ID,
    res: { ...CONFIG.start },
    housesBuilt: 0,
    arriveT: 0,
    wave: 0,
    waveState: 'calm',
    waveTimer: CONFIG.waves.first,
    spawnQueue: [],
    spawnT: 0,
    rifts: [],
    flow: new Int32Array(grid.size).fill(-1),
    flowDist: new Float32Array(grid.size).fill(Infinity),
    reach: new Uint8Array(grid.size),
    dirty: true,
    ver: 0,
    hungry: false,
    shelter: false,
    lost: false,
    kills: 0,
    flags: {},
    blessings: [],
    mods: baseMods(),
    stats: emptyStats(),
    report: null,
    forge: { armas: 0, armaduras: 0, flechas: 0 },
    waveMods: [],
    events: [],
  };
  for (const t of list) t.deco = Math.floor(w.rand() * 1000);

  // Fendas na borda norte; a primeira abre na onda 1, as outras depois.
  for (const a of RIFT_ANGLES) {
    const t = tileAtAngle(w, a, R);
    t.terrain = 'rift';
    w.rifts.push(t.i);
  }
  // Florestas, rochas e veios de minério (longe do castelo). A quantidade acompanha a área do
  // mapa, e as distâncias vão até perto da borda; com raio 13 o sorteio é o mesmo de antes.
  const area = (R / 13) ** 2;
  const ang = () => w.rand() * Math.PI * 2;
  for (let k = 0; k < Math.round(7 * area); k++) grow(w, tileAtAngle(w, ang(), 5 + w.rand() * (R - 6)), 6 + Math.floor(w.rand() * 6), 'forest', 4);
  // Uma floresta garantida perto, para a primeira serraria.
  grow(w, tileAtAngle(w, Math.PI * (0.15 + w.rand() * 0.7), 4.5), 6, 'forest', 4);
  const rocks: Tile[] = [];
  for (let k = 0; k < Math.round(3 * area); k++) {
    const t = tileAtAngle(w, ang(), 6 + w.rand() * (R - 8));
    rocks.push(t);
    grow(w, t, 3 + Math.floor(w.rand() * 3), 'rock', 5);
  }
  // Rocha e veio garantidos a meia distância, ao sul (do lado de cá).
  const nearRock = tileAtAngle(w, Math.PI * (0.2 + w.rand() * 0.6), 6);
  grow(w, nearRock, 3, 'rock', 5);
  rocks.push(nearRock);
  // Veios: o primeiro grupo de rocha (perto, ao sul) dá ferro; os outros alternam cristal e ferro.
  const order = [rocks[rocks.length - 1]!, ...rocks.slice(0, -1)];
  order.forEach((t, k) => {
    const ns = neighbors(w, t).filter((n) => n.terrain === 'grass');
    for (const n of ns.slice(0, 2)) n.terrain = k % 2 === 1 ? 'crystal' : 'ore';
  });
  // Etapa 8: um ou dois lagos a meia distância (ninguém atravessa nem constrói na água).
  const lakes = 1 + Math.floor(w.rand() * 2);
  for (let k = 0; k < lakes; k++) {
    const t = tileAtAngle(w, Math.PI * (0.1 + w.rand() * 0.8) + (k ? Math.PI : 0), 6 + w.rand() * (R - 9));
    // Lago cresce em volta do centro (não em linha), para sair redondo.
    const want = 5 + Math.floor(w.rand() * 4);
    const lake = [t];
    t.terrain = 'water';
    for (let i = 0; i < 40 && lake.length < want; i++) {
      const from = lake[Math.floor(w.rand() * lake.length)]!;
      const ns = neighbors(w, from).filter((n) => n.terrain !== 'water' && n.terrain !== 'rift' && hexDist(n.q, n.r, 0, 0) >= 5 && hexDist(n.q, n.r, 0, 0) < R - 1);
      const n = ns[Math.floor(w.rand() * ns.length)];
      if (!n) continue;
      n.terrain = 'water';
      lake.push(n);
    }
  }
  // Ninguém nasce emparedado: as fendas e o miolo ficam livres.
  for (const i of w.rifts) for (const n of neighbors(w, tiles[i]!)) if (n.terrain !== 'grass') n.terrain = 'grass';
  for (const t of list) if (hexDist(t.q, t.r, 0, 0) <= 2) t.terrain = 'grass';

  // Começo: castelo, duas casas e uma fazenda, quatro trabalhadores.
  const c = addBuilding(w, 'castelo', 0, 0, 1);
  c.hp = c.maxHp;
  addBuilding(w, 'casa', -1, 2, 1);
  addBuilding(w, 'casa', 1, 1, 1);
  addBuilding(w, 'fazenda', -2, 1, 1);
  for (let k = 0; k < CONFIG.startWorkers; k++) {
    const p = castleDoor(w);
    addUnit(w, 'trabalhador', p.x, p.z);
  }
  return w;
}

export { BUILDINGS, CONFIG };
