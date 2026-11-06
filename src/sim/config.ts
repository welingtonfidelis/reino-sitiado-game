/**
 * Todos os números do jogo num lugar só. São valores iniciais para testar (docs §Regras).
 * Tempo em segundos, distância em metros do mundo (um hexágono tem 2 m de lado a lado).
 */
export type Res = 'comida' | 'madeira' | 'pedra' | 'ferro' | 'cristal' | 'ouro';
export const RES_ORDER: Res[] = ['comida', 'madeira', 'pedra', 'ferro', 'cristal', 'ouro'];
export type Cost = Partial<Record<Res, number>>;

export type BuildingKind =
  | 'castelo'
  | 'casa'
  | 'fazenda'
  | 'serraria'
  | 'pedreira'
  | 'mina'
  | 'muralha'
  | 'portao'
  | 'torre'
  | 'quartel'
  | 'campo'
  | 'torreMago'
  | 'capela'
  | 'estabulo'
  | 'forja'
  | 'oficina';

export type Category = 'economia' | 'defesa' | 'militar' | 'moradia';
export type UnitKind = 'trabalhador' | 'soldado' | 'arqueiro' | 'mago' | 'clerigo' | 'cavaleiro' | 'engenheiro';
export type MonsterKind = 'esqueleto' | 'lobisomem' | 'orc' | 'bruto' | 'morcego' | 'bruxa' | 'troll' | 'necromante' | 'golem' | 'golemOssos';
/** Onde o prédio pode ficar: chão livre, vizinho da floresta, vizinho da rocha, em cima do veio, em cima de muralha. */
export type Site = 'grass' | 'nearForest' | 'nearRock' | 'ore' | 'wall';

export interface BuildingDef {
  name: string;
  category: Category | null;
  blurb: string;
  cost: Cost;
  hp: number;
  build: number;
  site: Site;
  /** Vagas de trabalho e o que cada trabalhador produz por minuto. */
  workers?: number;
  produces?: Res;
  rate?: number;
  housing?: number;
  recruits?: UnitKind;
  /** Arqueiros que cabem na torre. */
  slots?: number;
  /** Custo para a horda atravessar (o campo de fluxo prefere o que custa menos). */
  breakCost: number;
  /** Nível do castelo exigido (Etapa 5). */
  needsLevel?: number;
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  castelo: { name: 'Castelo', category: null, blurb: 'O coração do reino. Se cair, a partida acaba.', cost: {}, hp: 1500, build: 0, site: 'grass', housing: 4, breakCost: 1 },
  casa: { name: 'Casa', category: 'moradia', blurb: '+4 vagas. Os trabalhadores chegam sozinhos.', cost: { madeira: 30 }, hp: 150, build: 6, site: 'grass', housing: 4, breakCost: 6 },
  fazenda: { name: 'Fazenda', category: 'economia', blurb: 'Comida. 2 trabalhadores.', cost: { madeira: 20 }, hp: 120, build: 6, site: 'grass', workers: 2, produces: 'comida', rate: 10, breakCost: 3 },
  serraria: { name: 'Serraria', category: 'economia', blurb: 'Madeira. Precisa de floresta ao lado.', cost: { madeira: 25, pedra: 10 }, hp: 200, build: 8, site: 'nearForest', workers: 2, produces: 'madeira', rate: 16, breakCost: 6 },
  pedreira: { name: 'Pedreira', category: 'economia', blurb: 'Pedra. Precisa de rocha ao lado.', cost: { madeira: 40 }, hp: 200, build: 8, site: 'nearRock', workers: 2, produces: 'pedra', rate: 10, breakCost: 6 },
  mina: { name: 'Mina', category: 'economia', blurb: 'Ferro. Só em cima de um veio de minério.', cost: { madeira: 50, pedra: 20 }, hp: 220, build: 10, site: 'ore', workers: 2, produces: 'ferro', rate: 8, breakCost: 6 },
  muralha: { name: 'Muralha', category: 'defesa', blurb: 'Segura e desvia a horda. Orcs derrubam.', cost: { pedra: 5 }, hp: 250, build: 2, site: 'grass', breakCost: 14 },
  portao: { name: 'Portão', category: 'defesa', blurb: 'Vira um trecho de muralha. Sua gente passa, a horda não.', cost: { madeira: 30, ferro: 10 }, hp: 320, build: 4, site: 'wall', breakCost: 14 },
  torre: { name: 'Torre de arqueiros', category: 'defesa', blurb: 'Só atira com arqueiros dentro. Cabem 2.', cost: { madeira: 60, pedra: 20 }, hp: 300, build: 10, site: 'grass', slots: 2, breakCost: 10 },
  quartel: { name: 'Quartel', category: 'militar', blurb: 'Treina soldados.', cost: { madeira: 60, pedra: 30 }, hp: 400, build: 12, site: 'grass', recruits: 'soldado', breakCost: 6 },
  campo: { name: 'Campo de tiro', category: 'militar', blurb: 'Treina arqueiros.', cost: { madeira: 50 }, hp: 300, build: 10, site: 'grass', recruits: 'arqueiro', breakCost: 6 },
  torreMago: { name: 'Torre do mago', category: 'militar', blurb: 'Treina magos. Cada feitiço gasta cristal.', cost: { pedra: 60, cristal: 10 }, hp: 300, build: 12, site: 'grass', recruits: 'mago', breakCost: 6, needsLevel: 2 },
  capela: { name: 'Capela', category: 'militar', blurb: 'Treina clérigos. Feridos por perto se curam sozinhos.', cost: { pedra: 50, ouro: 20 }, hp: 300, build: 10, site: 'grass', recruits: 'clerigo', breakCost: 6 },
  estabulo: { name: 'Estábulo', category: 'militar', blurb: 'Treina cavaleiros: rápidos e fortes.', cost: { madeira: 70, ferro: 20 }, hp: 350, build: 12, site: 'grass', recruits: 'cavaleiro', breakCost: 6, needsLevel: 2 },
  forja: { name: 'Forja', category: 'militar', blurb: 'Melhora armas, armaduras e flechas.', cost: { pedra: 40, ferro: 30 }, hp: 300, build: 10, site: 'grass', breakCost: 6 },
  oficina: { name: 'Oficina', category: 'militar', blurb: 'Treina engenheiros, que consertam até no meio da onda.', cost: { madeira: 40, pedra: 20 }, hp: 250, build: 8, site: 'grass', recruits: 'engenheiro', breakCost: 6 },
};

/** O que aparece no menu Construir, em ordem. O portão vira de uma muralha. */
export const BUILD_MENU: BuildingKind[] = ['casa', 'fazenda', 'serraria', 'pedreira', 'mina', 'muralha', 'portao', 'torre', 'quartel', 'campo', 'oficina', 'capela', 'forja', 'torreMago', 'estabulo'];

export interface UnitDef {
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  cd: number;
  range: number;
  cost: Cost;
  train: number;
}
export const UNITS: Record<UnitKind, UnitDef> = {
  trabalhador: { name: 'Trabalhador', hp: 30, speed: 1.7, dmg: 0, cd: 1, range: 0, cost: {}, train: 0 },
  soldado: { name: 'Soldado', hp: 90, speed: 1.8, dmg: 12, cd: 1.0, range: 0.8, cost: { comida: 20, ferro: 10 }, train: 8 },
  arqueiro: { name: 'Arqueiro', hp: 40, speed: 1.7, dmg: 7, cd: 1.1, range: 7, cost: { comida: 15, madeira: 20 }, train: 8 },
  mago: { name: 'Mago', hp: 30, speed: 1.5, dmg: 14, cd: 1.8, range: 6.5, cost: { comida: 30, cristal: 4 }, train: 10 },
  clerigo: { name: 'Clérigo', hp: 45, speed: 1.5, dmg: 0, cd: 2.0, range: 3.5, cost: { comida: 25, ouro: 10 }, train: 10 },
  cavaleiro: { name: 'Cavaleiro', hp: 130, speed: 3.2, dmg: 20, cd: 1.2, range: 0.9, cost: { comida: 40, ferro: 25, ouro: 10 }, train: 12 },
  engenheiro: { name: 'Engenheiro', hp: 35, speed: 1.8, dmg: 0, cd: 1, range: 1.3, cost: { comida: 15, pedra: 10 }, train: 8 },
};

export interface MonsterDef {
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  cd: number;
  /** Multiplica o dano contra prédios e muralhas. */
  structMul: number;
  from: number;
  /** Etapa 6: voa por cima de muralhas (só flecha, magia e castelo alcançam). */
  flying?: boolean;
  boss?: boolean;
  immuneArrows?: boolean;
  immuneMagic?: boolean;
  /** Fração da vida que recupera por segundo, se não pegou fogo nos últimos 3 s. */
  regen?: number;
  /** Cura os monstros em volta. */
  heal?: { amount: number; radius: number; every: number };
  /** Levanta esqueletos ao lado. */
  summon?: { every: number; max: number };
  blurb: string;
}
export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  esqueleto: { name: 'Esqueleto', hp: 30, speed: 1.1, dmg: 4, cd: 1.0, structMul: 1, from: 1, blurb: 'Vem em bando.' },
  lobisomem: { name: 'Lobisomem', hp: 26, speed: 2.1, dmg: 6, cd: 0.9, structMul: 0.6, from: 2, blurb: 'Rápido, rodeia a muralha atrás de brecha.' },
  orc: { name: 'Orc saqueador', hp: 75, speed: 0.9, dmg: 9, cd: 1.2, structMul: 3, from: 4, blurb: 'Bate três vezes mais forte em muralhas e prédios.' },
  bruto: { name: 'Orc bruto', hp: 260, speed: 0.65, dmg: 22, cd: 1.8, structMul: 2.5, from: 8, blurb: 'Muita vida e golpe pesado.' },
  morcego: { name: 'Morcego gigante', hp: 18, speed: 2.6, dmg: 4, cd: 0.8, structMul: 1, from: 8, flying: true, blurb: 'Voa por cima das muralhas, direto para as casas. Só flecha, magia e castelo alcançam.' },
  bruxa: { name: 'Bruxa', hp: 45, speed: 0.85, dmg: 3, cd: 1.2, structMul: 0.5, from: 9, heal: { amount: 10, radius: 3, every: 2.5 }, blurb: 'Fica atrás e cura a horda em volta. Derrube primeiro.' },
  troll: { name: 'Troll', hp: 180, speed: 0.75, dmg: 16, cd: 1.5, structMul: 2, from: 12, regen: 0.03, blurb: 'Recupera a vida, a não ser que magia ou flecha em brasa o queime.' },
  necromante: { name: 'Necromante', hp: 70, speed: 0.8, dmg: 6, cd: 1.2, structMul: 0.5, from: 16, summon: { every: 6, max: 5 }, blurb: 'Levanta esqueletos ao lado enquanto anda.' },
  golem: { name: 'Golem de gelo', hp: 1800, speed: 0.5, dmg: 50, cd: 2.2, structMul: 3, from: 15, boss: true, immuneArrows: true, blurb: 'Chefe. Flechas não o ferem: magia, soldados e cavaleiros sim.' },
  golemOssos: { name: 'Golem de ossos', hp: 3500, speed: 0.55, dmg: 70, cd: 2.2, structMul: 3.5, from: 30, boss: true, immuneMagic: true, blurb: 'Chefe. Magia não o fere: flechas e espadas sim.' },
};

export const CONFIG = {
  tps: 20,
  mapRadius: 13,
  start: { comida: 150, madeira: 250, pedra: 150, ferro: 30, cristal: 0, ouro: 0 } as Record<Res, number>,
  startWorkers: 4,
  /** Moradia: um trabalhador chega a cada `arriveEvery` s se houver vaga, teto e comida. */
  arriveEvery: 20,
  minFoodToArrive: 5,
  /** Teto do reino por nível do castelo (casas além disso ficam vazias). */
  castleCap: [24, 40, 60, 80],
  castleUpgrade: [
    { pedra: 150, madeira: 100, ouro: 40 },
    { pedra: 300, madeira: 200, ferro: 40, ouro: 120 },
    { pedra: 500, madeira: 300, ferro: 100, ouro: 250 },
  ] as Cost[],
  castleHpPerLevel: 500,
  /** Cada casa nova custa 10% a mais que a anterior. */
  houseGrowth: 1.1,
  /** Comida por morador por minuto (trabalhadores e tropas). */
  eatPerMin: 1,
  hungryWork: 0.5,
  castle: { dmg: 10, cd: 1.0, range: 9 },
  /** Vida que o castelo recupera por segundo entre as ondas. */
  castleRegen: 5,
  tower: { range: 10 },
  recruitQueue: 3,
  refund: 0.5,
  repairShare: 0.5,
  waves: {
    first: 120,
    interval: 90,
    intervalStep: 3,
    intervalMin: 45,
    hpGrowth: 1.08,
    base: 4,
    perWave: 2.5,
    spawnSpread: 10,
    goldBase: 15,
    goldPerWave: 5,
    /** Ondas em que abre mais uma fenda. */
    riftOpens: [1, 10, 20],
  },
  monsterAggro: 1.6,
  /** Altura de voo do morcego. */
  flyHeight: 1.8,
  /** Chefes: um golem a cada 15 ondas (gelo nas ímpares, ossos nas pares). */
  bossEvery: 15,
  monsterReach: 0.75,
  soldierEngage: 11,
  /** Etapa 5. */
  knightEngage: 15,
  mage: { area: 1.3, crystalPerCast: 0.25 },
  cleric: { heal: 12 },
  chapel: { radius: 3, perSec: 2 },
  engineer: { rate: 12, stonePerHp: 0.04, reach: 18 },
  /** Cristal por trabalhador por minuto numa mina em veio azul. */
  crystalRate: 3,
  forge: {
    /** Por nível: +20% de dano corpo a corpo, +20% de vida das tropas, +15% nas flechas. */
    step: { armas: 0.2, armaduras: 0.2, flechas: 0.15 },
    cost: [
      { ferro: 30, ouro: 20 },
      { ferro: 60, ouro: 50 },
      { ferro: 100, ouro: 100 },
    ] as Cost[],
  },
  /** Raio em que a tropa mandada para um ponto ainda sai para lutar. */
  holdEngage: 5,
};
