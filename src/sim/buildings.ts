/** Prédios: obra, mudança de lugar, dano e destruição. */
import { BUILDINGS, CONFIG, MODES } from './config.ts';
import type { BuildingKind, Mode } from './config.ts';
import { tileAt } from './world.ts';
import type { Building, World } from './world.ts';
import { DT, center, toast } from './common.ts';

export function releaseFromBuilding(w: World, b: Building): void {
  for (const id of b.workers) {
    const u = w.units.get(id);
    if (u && u.state !== 'dead') {
      u.job = -1;
      u.trip = undefined;
      u.carry = undefined;
      u.state = 'idle';
      u.path = [];
      u.goal = -1;
    }
  }
  for (const id of b.archers) {
    const u = w.units.get(id);
    if (u && u.state !== 'dead') {
      const p = center(b);
      u.tower = -1;
      u.state = 'idle';
      u.x = p.x + 0.5;
      u.z = p.z + 0.5;
      u.path = [];
      u.goal = -1;
    }
  }
  b.workers = [];
  b.archers = [];
}

/** Tira o prédio do mapa. `ruin`: deixa escombros (destruído pela horda). */
export function destroyBuilding(w: World, b: Building, ruin = true): void {
  releaseFromBuilding(w, b);
  const t = tileAt(w, b.q, b.r);
  if (t && t.b === b.id) {
    t.b = -1;
    t.ruin = ruin && b.kind !== 'muralha' && b.kind !== 'portao';
  }
  w.buildings.delete(b.id);
  w.dirty = true;
  if (ruin) {
    w.events.push({ type: 'destroyed', id: b.id, kind: b.kind, q: b.q, r: b.r });
    if (b.kind === 'muralha' || b.kind === 'portao') w.stats.wallsLost++;
    else w.stats.buildingsLost++;
  }
  if (b.kind === 'castelo') {
    w.lost = true;
    w.events.push({ type: 'lost', wave: w.wave });
  } else if (ruin && b.kind !== 'muralha') {
    toast(w, `${BUILDINGS[b.kind].name} destruída pela horda.`, 'bad');
  }
}

export function damageBuilding(w: World, b: Building, dmg: number): void {
  b.hp -= dmg;
  if (b.hp <= 0) destroyBuilding(w, b, true);
}

/** Segundos para desmontar o prédio numa mudança (no fácil, metade). */
export function packTime(kind: BuildingKind, mode: Mode = 'normal'): number {
  return Math.max(CONFIG.move.packMin, BUILDINGS[kind].build * CONFIG.move.pack) * MODES[mode].move;
}

export function construction(w: World): void {
  for (const b of w.buildings.values()) {
    if (b.moveTo) {
      unpack(w, b);
      continue;
    }
    if (b.built >= 1) continue;
    // Remontar depois de uma mudança segue o fator do modo (no fácil, metade do tempo).
    b.built = Math.min(1, b.built + DT / (BUILDINGS[b.kind].build * (b.moved ? MODES[w.mode].move : 1)));
    if (b.built >= 1) {
      b.moved = false;
      w.dirty = true;
      w.events.push({ type: 'built', id: b.id });
    }
  }
}

/**
 * Mudança, primeira parte: desmonta no lugar. Quando acaba, o prédio passa para o lugar novo
 * como obra (`moved`), que a construção monta de novo. Se o lugar novo não serve mais (abriu
 * uma fenda ali), remonta no mesmo lugar.
 */
export function unpack(w: World, b: Building): void {
  b.built = Math.max(0, b.built - DT / packTime(b.kind, w.mode));
  if (b.built > 0) return;
  const to = b.moveTo!;
  b.moveTo = null;
  b.moved = true;
  w.dirty = true;
  w.events.push({ type: 'packed', id: b.id, q: b.q, r: b.r });
  const dest = tileAt(w, to.q, to.r);
  if (!dest || dest.terrain === 'rift' || (dest.b >= 0 && dest.b !== b.id)) {
    toast(w, `${BUILDINGS[b.kind].name}: o lugar novo ficou ruim, remontando aqui mesmo.`, 'warn');
    return;
  }
  tileAt(w, b.q, b.r)!.b = -1;
  b.q = to.q;
  b.r = to.r;
  dest.b = b.id;
  dest.ruin = false;
  // Quem trabalha ali vai a pé para o lugar novo.
  for (const id of b.workers) {
    const u = w.units.get(id);
    if (!u || u.state === 'dead') continue;
    u.path = [];
    u.goal = -1;
    if (u.state === 'work') u.state = 'walk';
  }
}
