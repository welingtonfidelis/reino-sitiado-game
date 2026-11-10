/**
 * Estado da partida e geração do mapa. Tudo aqui é dado puro: a simulação (step.ts) muda o
 * estado a 20 passos por segundo e a tela só lê.
 */
import { BUILDINGS, CONFIG, UNITS } from './config.ts';
import { MODES } from './config.ts';
import type { BuildingKind, Cost, Mode, MonsterKind, Res, UnitKind } from './config.ts';
import { DIRS, HexIndex, hexDist, hexToWorld, rng } from './hex.ts';
import type { Rand } from './hex.ts';
import { baseMods, emptyStats, nameFor } from './blessings.ts';
import type { BlessingId, Mods, Report, WaveStats } from './blessings.ts';

export type Terrain = 'grass' | 'forest' | 'rock' | 'ore' | 'crystal' | 'rift' | 'water';
/** Terrenos que se esgotam (Etapa 17). */
export type Deposit = 'forest' | 'rock' | 'ore' | 'crystal';
export const DEPOSITS: readonly Deposit[] = ['forest', 'rock', 'ore', 'crystal'];

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
  /** Etapa 17: quanto recurso ainda tem (floresta, rocha e veio; 0 no resto). */
  stock: number;
  /** O que sobrou de um recurso esgotado (só enfeite): 0 nada, 1 toras, 2 cascalho. */
  left: number;
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
  /**
   * Mudança de lugar: o destino enquanto o prédio é desmontado (o `built` desce até 0 e ele
   * não funciona); null fora disso. O destino fica guardado até a mudança.
   */
  moveTo: { q: number; r: number } | null;
  /** Remontando no lugar novo depois de uma mudança (obra que sobe com o prédio já pronto). */
  moved: boolean;
  /** Etapa 17: serraria, pedreira ou mina sem nada para tirar, ou plantação colhida (parada). */
  dry: boolean;
  /** Etapa 17: comida que a plantação ainda dá (0 = colhida, espera replantar; 0 nos outros). */
  harvest: number;
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
  /** Socorro (2026-11-09): saiu do posto para ajudar; monstro sem caminho que ele deixa de lado por um tempo. */
  helping?: boolean;
  skip?: number;
  skipT?: number;
  /** Fuga sozinho (2026-11-09): prédio onde o aldeão corre para se esconder e há quanto tempo está calmo. */
  hideIn?: number;
  hideT?: number;
  /**
   * Levar o trabalho (2026-11-10): segundos trabalhados desde a última viagem; a viagem em curso
   * ('ida' até o castelo ou o celeiro, 'volta' até o serviço) e o que vai nos braços na ida.
   */
  workT?: number;
  trip?: 'ida' | 'volta';
  carry?: Res;
  /** Ladrilho da entrega: o do castelo ou celeiro, ou um vizinho livre (cercado de prédios, não se chega nele). */
  haulTo?: number;
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
  /**
   * Horda sem fila (2026-11-09): tempo quase parado andando; enquanto `recenterT` corre ele volta
   * ao meio do ladrilho, e enquanto `laneOffT` corre anda pelo meio (sem faixa própria).
   */
  stuckT?: number;
  recenterT?: number;
  laneOffT?: number;
  /** Acumulador (2026-11-09): o que leva na mochila, quanto tempo tem para fugir e a fenda de onde veio. */
  loot?: { res: Res; n: number };
  fleeT?: number;
  homeX?: number;
  homeZ?: number;
}

export type SimEvent =
  | { type: 'toast'; text: string; tone: 'good' | 'bad' | 'warn' | 'gold' | 'info' }
  | { type: 'shot'; x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; fire?: boolean }
  | { type: 'built'; id: number }
  /** O prédio acabou de ser desmontado em (q, r) e vai ser remontado no lugar novo. */
  | { type: 'packed'; id: number; q: number; r: number }
  /** Etapa 17: um hexágono de recurso acabou; um prédio ficou sem recurso; recurso novo brotou. */
  | { type: 'depleted'; i: number; terrain: Deposit }
  | { type: 'dry'; id: number }
  | { type: 'sprout'; tiles: number[]; terrain: Deposit }
  | { type: 'replanted'; id: number }
  | { type: 'destroyed'; id: number; kind: BuildingKind; q: number; r: number }
  | { type: 'hit'; fx: 'espada' | 'garra' | 'pancada' | 'golpe' | 'faisca' | 'cura'; x: number; z: number; dx: number; dz: number }
  | { type: 'spell'; x1: number; z1: number; x2: number; z2: number }
  | { type: 'monsterFx'; fx: 'bloom' | 'alma' | 'poof' | 'moedas'; x: number; z: number }
  /** Tiro da espingarda do anão (2026-11-09): fumaça na boca do cano e faísca no alvo. */
  | { type: 'gun'; x1: number; z1: number; x2: number; z2: number; fly: boolean }
  | { type: 'special'; fx: 'giro' | 'chuva' | 'raizes' | 'pisao'; x: number; z: number; id: number }
  | { type: 'heroLevel'; x: number; z: number; level: number }
  | { type: 'heroBack'; x: number; z: number }
  | { type: 'siege'; x1: number; z1: number; x2: number; z2: number }
  | { type: 'death'; x: number; z: number; monster: boolean; kind?: MonsterKind }
  /** O roubo do acumulador voltou para o reino (2026-11-10, para a figurinha). */
  | { type: 'recovered'; res: Res; n: number }
  | { type: 'upgrade'; level: number }
  /** Torre ou muralha subiu de nível (2026-11-10). */
  | { type: 'buildingUp'; id: number; level: number }
  | { type: 'waveStart'; wave: number }
  /** Um aldeão entregou o que levava (2026-11-10). */
  | { type: 'haul'; res: Res; x: number; z: number }
  /** Um chefe saiu da fenda (2026-11-10): a trompa toca. */
  | { type: 'boss'; kind: MonsterKind; x: number; z: number }
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

/**
 * Ondas com cara própria (2026-11-10): de vez em quando a onda inteira vem de uma família só, com
 * a mesma vida somada de uma onda comum. `icon` é o ícone grande do aviso.
 */
export type WaveTheme = 'matilha' | 'ossos' | 'orcs';
export const WAVE_THEMES: Record<WaveTheme, { name: string; text: string; icon: string }> = {
  matilha: { name: 'Matilha', text: 'Só lobisomens: rápidos e muitos, rodeiam a muralha.', icon: 'lobo' },
  ossos: { name: 'Noite dos ossos', text: 'Só mortos-vivos: esqueletos, os de escudo e necromantes.', icon: 'caveira' },
  orcs: { name: 'Bando de orcs', text: 'Só orcs: poucos, fortes e bons de derrubar muralha.', icon: 'machado' },
};

export interface World {
  seed: number;
  /** Etapa 18: modo da partida (travado do começo ao fim). */
  mode: Mode;
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
  /** Família da onda de agora (2026-11-10), ou null numa onda comum. */
  waveTheme: WaveTheme | null;
  /** Melhorias da forja (Etapa 5), de 0 a 3 cada. */
  forge: { armas: number; armaduras: number; flechas: number };
  /** Etapa 17: hexágonos de cada recurso que acabaram e ainda não foram repostos. */
  regrow: Record<Deposit, number>;
  /** Sobe quando o terreno muda (recurso acabou ou brotou): a tela refaz o chão. */
  land: number;
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

/**
 * Fazenda em teste: a planta de cada plantação. Em volta de cada celeiro, as plantações recebem
 * as plantas na ordem em que foram construídas (pedido do usuário): a 1ª milho, a 2ª tomate, e
 * assim por diante. Só muda o desenho e o nome; a comida é a mesma.
 */
export const CROPS = ['milho', 'tomate', 'trigo', 'alface', 'cenoura', 'abobora'] as const;
export type Crop = (typeof CROPS)[number];
export const CROP_NAME: Record<Crop, string> = { milho: 'milho', tomate: 'tomate', trigo: 'trigo', alface: 'alface', cenoura: 'cenoura', abobora: 'abóbora' };

/** O celeiro ao lado da plantação (o primeiro que achar em volta), se houver. */
export function barnOf(w: World, b: Building): Building | null {
  for (const [dq, dr] of DIRS) {
    const t = tileAt(w, b.q + dq, b.r + dr);
    const n = t && t.b >= 0 ? w.buildings.get(t.b) : undefined;
    if (n?.kind === 'celeiro') return n;
  }
  return null;
}

/** Estoque cheio de um terreno (0 no que não se esgota). */
export function fullStock(t: Terrain): number {
  return (CONFIG.deposits.stock as Partial<Record<Terrain, number>>)[t] ?? 0;
}

/** Prédio que tira recurso do terreno (e por isso pode ficar sem). */
export function isExtractor(kind: BuildingKind): boolean {
  return kind === 'serraria' || kind === 'pedreira' || kind === 'mina';
}

/**
 * De onde o prédio tira agora (Etapa 17): a floresta da serraria e a rocha da pedreira são o
 * primeiro vizinho do tipo certo; a mina, o veio debaixo dela. null = esgotado (ou não extrai).
 */
export function sourceOf(w: World, b: Building): Tile | null {
  if (b.kind === 'mina') {
    const t = tileAt(w, b.q, b.r);
    return t && (t.terrain === 'ore' || t.terrain === 'crystal') && t.stock > 0 ? t : null;
  }
  const want = b.kind === 'serraria' ? 'forest' : b.kind === 'pedreira' ? 'rock' : null;
  if (!want) return null;
  for (const [dq, dr] of DIRS) {
    const t = tileAt(w, b.q + dq, b.r + dr);
    if (t?.terrain === want && t.stock > 0) return t;
  }
  return null;
}

/**
 * De que lado fica o recurso que o prédio explora: a floresta da serraria, a rocha da pedreira
 * (o vizinho de onde ele tira agora). Devolve a direção unitária no chão, ou null.
 */
export function resourceDir(w: World, b: Building): { x: number; z: number } | null {
  if (b.kind !== 'serraria' && b.kind !== 'pedreira') return null;
  const t = sourceOf(w, b);
  if (!t) return null;
  const o = hexToWorld(t.q - b.q, t.r - b.r);
  const d = Math.hypot(o.x, o.z);
  return { x: o.x / d, z: o.z / d };
}

export function cropOf(w: World, b: Building): Crop {
  const barn = barnOf(w, b);
  if (!barn) return CROPS[b.id % CROPS.length]!;
  const mine: number[] = [];
  for (const [dq, dr] of DIRS) {
    const t = tileAt(w, barn.q + dq, barn.r + dr);
    const n = t && t.b >= 0 ? w.buildings.get(t.b) : undefined;
    if (n?.kind === 'fazenda' && barnOf(w, n)?.id === barn.id) mine.push(n.id);
  }
  mine.sort((a, c) => a - c);
  return CROPS[Math.max(0, mine.indexOf(b.id)) % CROPS.length]!;
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

/** Nível da torre de arqueiros (2026-11-10): vida, alcance, fator das flechas e fogo. */
export function towerLevel(b: Building) {
  const L = CONFIG.towerLevels;
  return L[Math.max(1, Math.min(b.level, L.length)) - 1]!;
}

/** Alcance da torre no nível dela (sem a Noite sem lua). */
export function towerRange(b: Building): number {
  return towerLevel(b).range;
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
    moveTo: null,
    moved: false,
    dry: false,
    harvest: kind === 'fazenda' ? CONFIG.farm.harvest : 0,
  };
  w.buildings.set(b.id, b);
  const t = tileAt(w, q, r)!;
  t.b = b.id;
  t.ruin = false;
  t.left = 0;
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

/**
 * Ângulos das fendas até 2026-11-07 (norte, nordeste, noroeste). Hoje cada partida sorteia os
 * seus (`riftAngles`); estes só servem para abrir um salvo antigo, que não guardava as fendas.
 */
export const RIFT_ANGLES = [-Math.PI / 2, -Math.PI / 6, (-5 * Math.PI) / 6];

/** Fendas de um salvo antigo, na ordem em que abriam. */
export function legacyRifts(w: World): number[] {
  return RIFT_ANGLES.map((a) => tileAtAngle(w, a, w.grid.R).i);
}

const angleGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(d, Math.PI * 2 - d);
};

/**
 * Pedido do usuário (2026-11-07): as fendas nascem em qualquer ponto da borda, sorteadas pela
 * semente (uma ao norte e duas ao sul, ou leste, sul e oeste...). Só ficam a `gap` uma da outra,
 * para não saírem coladas. A ordem é a ordem em que abrem.
 */
function riftAngles(w: World): number[] {
  const { count, gap } = CONFIG.rifts;
  const out: number[] = [];
  for (let k = 0; out.length < count && k < 500; k++) {
    const a = w.rand() * Math.PI * 2 - Math.PI;
    if (out.every((b) => angleGap(a, b) >= gap)) out.push(a);
  }
  // Sem lugar (não acontece com 3 fendas a 50°): completa em volta da primeira.
  while (out.length < count) out.push((out[0] ?? 0) + (out.length * Math.PI * 2) / count);
  return out;
}

/** Meio do maior vão entre as fendas (o lado mais calmo do mapa) e a largura desse vão. */
function calmSide(angles: number[]): { at: number; width: number } {
  const s = [...angles].sort((a, b) => a - b);
  let at = 0;
  let width = -1;
  s.forEach((a, k) => {
    const next = k + 1 < s.length ? s[k + 1]! : s[0]! + Math.PI * 2;
    if (next - a > width) {
      width = next - a;
      at = a + width / 2;
    }
  });
  return { at, width };
}

/**
 * Cada fenda precisa chegar ao castelo: se a rocha ou a água fecharem a passagem, abre uma
 * trilha em linha reta da fenda até o miolo (vira grama o que estiver no meio).
 */
function openRiftPaths(w: World): void {
  const blocked = (t: Tile) => t.terrain === 'rock' || t.terrain === 'water';
  const reach = () => {
    const seen = new Uint8Array(w.grid.size);
    const queue = [w.grid.idx(0, 0)];
    seen[queue[0]!] = 1;
    for (let h = 0; h < queue.length; h++) {
      for (const n of neighbors(w, w.tiles[queue[h]!]!)) {
        if (seen[n.i] || blocked(n)) continue;
        seen[n.i] = 1;
        queue.push(n.i);
      }
    }
    return seen;
  };
  let seen = reach();
  for (const i of w.rifts) {
    if (seen[i]) continue;
    let t = w.tiles[i]!;
    while (hexDist(t.q, t.r, 0, 0) > 0 && !seen[t.i]) {
      t = neighbors(w, t).reduce((a, b) => (hexDist(b.q, b.r, 0, 0) < hexDist(a.q, a.r, 0, 0) ? b : a));
      if (blocked(t)) t.terrain = 'grass';
    }
    seen = reach();
  }
}

export function createWorld(seed = 1, R = CONFIG.mapRadius, mode: Mode = 'normal'): World {
  const grid = new HexIndex(R);
  const tiles: (Tile | null)[] = new Array(grid.size).fill(null);
  const list: Tile[] = [];
  for (let q = -R; q <= R; q++)
    for (let r = -R; r <= R; r++) {
      if (!grid.has(q, r)) continue;
      const t: Tile = { i: grid.idx(q, r), q, r, terrain: 'grass', deco: 0, b: -1, ruin: false, stock: 0, left: 0 };
      tiles[t.i] = t;
      list.push(t);
    }
  const M = MODES[mode];
  const w: World = {
    seed,
    mode,
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
    res: { ...M.start },
    housesBuilt: 0,
    arriveT: 0,
    wave: 0,
    waveState: 'calm',
    waveTimer: M.first + M.calm,
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
    waveTheme: null,
    regrow: { forest: 0, rock: 0, ore: 0, crystal: 0 },
    land: 0,
    events: [],
  };
  for (const t of list) t.deco = Math.floor(w.rand() * 1000);

  // Fendas sorteadas na borda; a primeira abre na onda 1, as outras depois.
  const riftAt = riftAngles(w);
  for (const a of riftAt) {
    const t = tileAtAngle(w, a, R);
    t.terrain = 'rift';
    w.rifts.push(t.i);
  }
  // O lado mais calmo do mapa (o maior vão entre as fendas): é lá que nascem a floresta e a
  // rocha garantidas perto do castelo, longe do caminho da horda.
  const calm = calmSide(riftAt);
  const calmAngle = () => calm.at + (w.rand() - 0.5) * Math.min(Math.PI * 0.7, calm.width * 0.5);
  // Florestas, rochas e veios de minério (longe do castelo). A quantidade acompanha a área do
  // mapa, e as distâncias vão até perto da borda; com raio 13 o sorteio é o mesmo de antes.
  const area = (R / 13) ** 2;
  const ang = () => w.rand() * Math.PI * 2;
  for (let k = 0; k < Math.round(7 * area); k++) grow(w, tileAtAngle(w, ang(), 5 + w.rand() * (R - 6)), 6 + Math.floor(w.rand() * 6), 'forest', 4);
  // Uma floresta garantida perto, para a primeira serraria.
  grow(w, tileAtAngle(w, calmAngle(), 4.5), 6, 'forest', 4);
  const rocks: Tile[] = [];
  for (let k = 0; k < Math.round(3 * area); k++) {
    const t = tileAtAngle(w, ang(), 6 + w.rand() * (R - 8));
    rocks.push(t);
    grow(w, t, 3 + Math.floor(w.rand() * 3), 'rock', 5);
  }
  // Rocha e veio garantidos a meia distância, do lado calmo.
  const nearRock = tileAtAngle(w, calmAngle(), 6);
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
  openRiftPaths(w);
  // Etapa 17: cada floresta, rocha e veio começa cheio.
  for (const t of list) t.stock = fullStock(t.terrain);

  // Começo: castelo, duas casas e uma fazenda, quatro trabalhadores.
  const c = addBuilding(w, 'castelo', 0, 0, 1);
  c.maxHp = Math.round(c.maxHp * M.castleHp);
  c.hp = c.maxHp;
  addBuilding(w, 'casa', -1, 2, 1);
  addBuilding(w, 'casa', 1, 1, 1);
  // A fazenda começa com o celeiro e uma plantação encostada nele. O celeiro fica a 3 hexágonos
  // do castelo: assim nenhuma plantação em volta dele encosta no castelo (pedido do usuário).
  for (const [q, r] of [[-3, 1], [-3, 2]] as const) tileAt(w, q, r)!.terrain = 'grass';
  addBuilding(w, 'celeiro', -3, 1, 1);
  addBuilding(w, 'fazenda', -3, 2, 1);
  for (let k = 0; k < CONFIG.startWorkers; k++) {
    const p = castleDoor(w);
    addUnit(w, 'trabalhador', p.x, p.z);
  }
  return w;
}

export { BUILDINGS, CONFIG };
