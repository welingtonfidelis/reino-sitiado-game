/**
 * Salvar e carregar a partida (Etapa 7). O mapa sai da semente; o que mudou (terreno de
 * cada ladrilho, prédios, gente, monstros, recursos, ondas, bênçãos, forja e o sorteio) vai
 * num JSON. Caminhos e alcance são refeitos ao carregar.
 */
import { CONFIG } from './config.ts';
import type { Mode } from './config.ts';
import { rng } from './hex.ts';
import { createWorld, fullStock, legacyRifts } from './world.ts';
import type { Building, Monster, Terrain, Unit, World } from './world.ts';

const VERSION = 1;
/** Formato dentro da versão: 2 desde a muralha em dois níveis (2026-11-10). */
const FORMAT = 2;
const TERRAINS: Terrain[] = ['grass', 'forest', 'rock', 'ore', 'crystal', 'rift', 'water'];

/** Campos simples copiados como estão. */
const PLAIN = [
  'tick', 'time', 'nextId', 'res', 'housesBuilt', 'arriveT', 'wave', 'waveState', 'waveTimer', 'spawnQueue', 'spawnT',
  'hungry', 'shelter', 'lost', 'kills', 'flags', 'blessings', 'mods', 'stats', 'report', 'forge', 'waveMods',
  'regrow',
  'mode',
  'waveTheme',
] as const;

export interface SaveInfo {
  wave: number;
  seed: number;
  mode: Mode;
}

export function saveWorld(w: World): string {
  const plain: Record<string, unknown> = {};
  for (const k of PLAIN) plain[k] = w[k];
  return JSON.stringify({
    v: VERSION,
    fmt: FORMAT,
    seed: w.seed,
    R: w.grid.R,
    rng: w.rand.state.a,
    tiles: w.list.map((t) => [TERRAINS.indexOf(t.terrain), t.deco, t.b, t.ruin ? 1 : 0, Math.round(t.stock), t.left]),
    rifts: w.rifts,
    buildings: [...w.buildings.values()],
    units: [...w.units.values()],
    monsters: [...w.monsters.values()],
    ...plain,
  });
}

export function saveInfo(json: string): SaveInfo | null {
  try {
    const d = JSON.parse(json);
    if (d.v !== VERSION || typeof d.seed !== 'number') return null;
    return { wave: d.wave, seed: d.seed, mode: d.mode === 'facil' ? 'facil' : 'normal' };
  } catch {
    return null;
  }
}

export function loadWorld(json: string): World | null {
  let d: Record<string, unknown> & { tiles: number[][]; buildings: Building[]; units: Unit[]; monsters: Monster[]; seed: number; rng: number };
  try {
    d = JSON.parse(json);
  } catch {
    return null;
  }
  if ((d as { v?: number }).v !== VERSION) return null;
  // Jogos salvos sem R são do mapa de raio 13 (até a etapa 9).
  const w = createWorld(d.seed, typeof d.R === 'number' ? d.R : 13);
  w.rand = rng(d.seed, d.rng);
  if (d.tiles.length !== w.list.length) return null;
  w.list.forEach((t, i) => {
    const [ter, deco, b, ruin, stock, left] = d.tiles[i]!;
    t.terrain = TERRAINS[ter!] ?? 'grass';
    t.deco = deco!;
    t.b = b!;
    t.ruin = ruin === 1;
    // Salvo de antes da Etapa 17: recurso cheio.
    t.stock = stock ?? fullStock(t.terrain);
    t.left = left ?? 0;
  });
  // Salvo de antes da mudança em duas etapas: prédio sem mudança.
  for (const b of d.buildings) {
    b.moveTo ??= null;
    b.moved ??= false;
    b.dry ??= false;
    b.harvest ??= b.kind === 'fazenda' ? CONFIG.farm.harvest : 0;
    // Salvo de antes da paliçada (2026-11-10): a muralha que já estava de pé era de pedra.
    if (((d as { fmt?: number }).fmt ?? 1) < 2 && b.kind === 'muralha') b.level = 2;
  }
  w.buildings = new Map(d.buildings.map((b) => [b.id, b]));
  w.units = new Map(d.units.map((u) => [u.id, u]));
  w.monsters = new Map(d.monsters.map((m) => [m.id, m]));
  const target = w as unknown as Record<string, unknown>;
  for (const k of PLAIN) if (k in d) target[k] = d[k];
  // As fendas são sorteadas desde 2026-11-07; um salvo de antes ficou com as três do norte.
  // Desde 2026-11-09 são duas: a terceira de um salvo antigo vira grama.
  const rifts = Array.isArray(d.rifts) ? (d.rifts as number[]) : legacyRifts(w);
  w.rifts = rifts.slice(0, CONFIG.rifts.count);
  for (const i of rifts.slice(CONFIG.rifts.count)) {
    const t = w.tiles[i];
    if (t && t.terrain === 'rift') t.terrain = 'grass';
  }
  w.events = [];
  w.dirty = true;
  return w;
}
