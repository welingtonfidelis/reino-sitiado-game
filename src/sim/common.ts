/**
 * Peças usadas por todas as partes da simulação: passo de tempo, avisos, distâncias, andar
 * pelo caminho e procurar monstro por perto.
 */
import { CONFIG, MONSTERS, UNITS, BUILDINGS } from './config.ts';
import type { Res } from './config.ts';
import { hexToWorld, worldToHex } from './hex.ts';
import { allyPath } from './path.ts';
import type { Building, Monster, Unit, World } from './world.ts';

export const DT = 1 / CONFIG.tps;

export type DmgSrc = 'arrow' | 'magic' | 'melee' | 'siege' | 'fire' | 'tiro';

export function toast(w: World, text: string, tone: 'good' | 'bad' | 'warn' | 'gold' | 'info'): void {
  w.events.push({ type: 'toast', text, tone });
}

export function center(b: { q: number; r: number }): { x: number; z: number } {
  return hexToWorld(b.q, b.r);
}

export function tileIndexAt(w: World, x: number, z: number): number {
  const h = worldToHex(x, z);
  if (!w.grid.has(h.q, h.r)) return -1;
  return w.grid.idx(h.q, h.r);
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** Noite sem lua: quem atira de longe alcança menos. */
export function rk(w: World): number {
  return w.waveMods.includes('noite') ? CONFIG.waveMods.nightRange : 1;
}

export function isTrap(b: Building | undefined): boolean {
  return !!b && !!BUILDINGS[b.kind].trap;
}

export function setGoal(w: World, u: Unit, goal: number): boolean {
  if (u.goal === goal && u.path.length > 0) return true;
  const from = tileIndexAt(w, u.x, u.z);
  if (from < 0) return false;
  const p = allyPath(w, from, goal);
  if (!p) return false;
  u.path = p;
  u.goal = goal;
  return true;
}

/** Anda pelo caminho e depois até o ponto final; devolve true ao chegar. */
export function walk(w: World, u: Unit, tx: number, tz: number, speed: number): boolean {
  // Ladrilhos já alcançados saem da fila.
  while (u.path.length > 0) {
    const t = w.tiles[u.path[0]!]!;
    const c = hexToWorld(t.q, t.r);
    const inside = u.path.length === 1 && tileIndexAt(w, u.x, u.z) === u.path[0];
    if (dist(u.x, u.z, c.x, c.z) < 0.35 || inside) u.path.shift();
    else break;
  }
  let px = tx;
  let pz = tz;
  if (u.path.length > 0) {
    const t = w.tiles[u.path[0]!]!;
    const c = hexToWorld(t.q, t.r);
    px = c.x;
    pz = c.z;
  }
  const d = dist(u.x, u.z, px, pz);
  if (d < 0.06) return u.path.length === 0;
  const s = Math.min(d, speed * DT);
  u.x += ((px - u.x) / d) * s;
  u.z += ((pz - u.z) / d) * s;
  u.facing = Math.atan2(px - u.x, pz - u.z);
  return false;
}

/** Lugar do k-ésimo numa roda em volta do ponto (k = 0 é o centro). */
export function formation(x: number, z: number, k: number): { x: number; z: number } {
  if (k === 0) return { x, z };
  const ring = Math.ceil(k / 6);
  const a = k * 2.39996;
  return { x: x + Math.cos(a) * 0.45 * ring, z: z + Math.sin(a) * 0.45 * ring };
}

/** Nome do recurso nos avisos do acumulador. */
export const RES_NAME: Record<Res, string> = { comida: 'comida', madeira: 'madeira', pedra: 'pedra', ferro: 'ferro', cristal: 'cristal', ouro: 'ouro' };

export function nearestMonster(w: World, x: number, z: number, range: number, needReach: boolean, src: DmgSrc = 'melee', skip = -1): Monster | null {
  let best: Monster | null = null;
  let bd = range;
  for (const m of w.monsters.values()) {
    if (m.state === 'dead' || m.id === skip) continue;
    const def = MONSTERS[m.kind];
    // Corpo a corpo não alcança quem voa; ninguém mira em quem não pode ferir.
    if (src === 'melee' && def.flying) continue;
    if ((src === 'arrow' && def.immuneArrows) || (src === 'magic' && def.immuneMagic)) continue;
    const d = dist(x, z, m.x, m.z);
    if (d > bd) continue;
    if (needReach) {
      const ti = tileIndexAt(w, m.x, m.z);
      if (ti < 0 || !w.reach[ti]) continue;
    }
    bd = d;
    best = m;
  }
  return best;
}

export function setGoalFresh(w: World, u: Unit, goal: number): boolean {
  u.goal = -1;
  u.path = [];
  return setGoal(w, u, goal);
}

export function guard(w: World, u: Unit): void {
  const goal = tileIndexAt(w, u.postX, u.postZ);
  if (goal >= 0 && !setGoal(w, u, goal)) {
    u.state = 'idle';
    return;
  }
  u.state = walk(w, u, u.postX, u.postZ, UNITS[u.kind].speed) ? 'idle' : 'walk';
}

/** Monstro vivo mais perto de (x, z), a menos de r metros (voando ou não). */
export function threatNear(w: World, x: number, z: number, r: number): Monster | null {
  let best: Monster | null = null;
  let bd = r;
  for (const m of w.monsters.values()) {
    if (m.state === 'dead') continue;
    const d = dist(x, z, m.x, m.z);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

export function blockedFor(w: World, ti: number): boolean {
  if (ti < 0) return true;
  const t = w.tiles[ti]!;
  return t.terrain === 'rock' || t.terrain === 'water' || (t.b >= 0 && !isTrap(w.buildings.get(t.b)));
}
