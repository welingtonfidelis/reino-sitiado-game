/**
 * Salvar e carregar a partida (Etapa 7). O mapa sai da semente; o que mudou (terreno de
 * cada ladrilho, prédios, gente, monstros, recursos, ondas, bênçãos, forja e o sorteio) vai
 * num JSON. Caminhos e alcance são refeitos ao carregar.
 */
import { rng } from './hex.ts';
import { createWorld } from './world.ts';
import type { Building, Monster, Terrain, Unit, World } from './world.ts';

const VERSION = 1;
const TERRAINS: Terrain[] = ['grass', 'forest', 'rock', 'ore', 'crystal', 'rift', 'water'];

/** Campos simples copiados como estão. */
const PLAIN = [
  'tick', 'time', 'nextId', 'res', 'housesBuilt', 'arriveT', 'wave', 'waveState', 'waveTimer', 'spawnQueue', 'spawnT',
  'hungry', 'shelter', 'lost', 'kills', 'flags', 'blessings', 'mods', 'stats', 'report', 'forge', 'waveMods',
] as const;

export interface SaveInfo {
  wave: number;
  seed: number;
}

export function saveWorld(w: World): string {
  const plain: Record<string, unknown> = {};
  for (const k of PLAIN) plain[k] = w[k];
  return JSON.stringify({
    v: VERSION,
    seed: w.seed,
    rng: w.rand.state.a,
    tiles: w.list.map((t) => [TERRAINS.indexOf(t.terrain), t.deco, t.b, t.ruin ? 1 : 0]),
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
    return { wave: d.wave, seed: d.seed };
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
  const w = createWorld(d.seed);
  w.rand = rng(d.seed, d.rng);
  if (d.tiles.length !== w.list.length) return null;
  w.list.forEach((t, i) => {
    const [ter, deco, b, ruin] = d.tiles[i]!;
    t.terrain = TERRAINS[ter!] ?? 'grass';
    t.deco = deco!;
    t.b = b!;
    t.ruin = ruin === 1;
  });
  w.buildings = new Map(d.buildings.map((b) => [b.id, b]));
  w.units = new Map(d.units.map((u) => [u.id, u]));
  w.monsters = new Map(d.monsters.map((m) => [m.id, m]));
  const target = w as unknown as Record<string, unknown>;
  for (const k of PLAIN) if (k in d) target[k] = d[k];
  w.events = [];
  w.dirty = true;
  return w;
}
