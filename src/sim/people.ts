/** Gente do reino: empregos, recrutas, arqueiros nas torres e a fuga dos aldeões. */
import { BUILDINGS, CONFIG, UNITS } from './config.ts';
import type { Res, UnitKind } from './config.ts';
import { DIRS, hexDist, hexToWorld, worldToHex } from './hex.ts';
import { allyPath } from './path.ts';
import { castle, castleDoor, isExtractor, resourceDir, sourceOf, tileAt } from './world.ts';
import type { Building, Monster, Unit, World } from './world.ts';
import { DT, center, dist, formation, guard, setGoal, threatNear, tileIndexAt, toast, walk } from './common.ts';

// ---------------------------------------------------------------- gente do reino

export function slotPoint(b: Building, slot: number): { x: number; z: number } {
  const c = center(b);
  const a = slot * ((Math.PI * 2) / 6) + 0.6;
  const rr = b.kind === 'fazenda' ? 0.5 : 0.85;
  return { x: c.x + Math.cos(a) * rr, z: c.z + Math.sin(a) * rr };
}

/**
 * Onde o trabalhador fica no serviço e para onde olha. Na serraria e na pedreira, lado a lado na
 * beira que dá para a floresta ou a rocha, virados para ela (o machado bate na árvore, não no ar);
 * na mina e na fazenda, em volta e virados para o meio.
 */
export function workSpot(w: World, b: Building, slot: number): { x: number; z: number; face: number } {
  const c = center(b);
  const d = resourceDir(w, b);
  if (d) {
    const side = slot % 2 ? -0.36 : 0.36;
    const x = c.x + d.x * 0.82 - d.z * side;
    const z = c.z + d.z * 0.82 + d.x * side;
    return { x, z, face: Math.atan2(c.x + d.x * 2 - x, c.z + d.z * 2 - z) };
  }
  const p = slotPoint(b, slot);
  return { x: p.x, z: p.z, face: Math.atan2(c.x - p.x, c.z - p.z) };
}

export function nearestJob(w: World, u: Unit): Building | null {
  let best: Building | null = null;
  let bd = Infinity;
  const h = worldToHex(u.x, u.z);
  for (const b of w.buildings.values()) {
    const def = BUILDINGS[b.kind];
    if (b.built < 1 || b.dry || !def.workers || b.workers.length >= def.workers) continue;
    const d = hexDist(h.q, h.r, b.q, b.r);
    if (d < bd && allyPath(w, tileIndexAt(w, u.x, u.z), w.grid.idx(b.q, b.r))) {
      bd = d;
      best = b;
    }
  }
  return best;
}

export function assignJobs(w: World): void {
  if (w.tick % 10 !== 0 || w.shelter) return;
  for (const u of w.units.values()) {
    if (u.kind !== 'trabalhador' || u.state === 'dead' || u.job >= 0) continue;
    const b = nearestJob(w, u);
    if (!b) continue;
    u.job = b.id;
    // A primeira vaga livre: quem sai abre o lugar dele (antes dois podiam cair no mesmo).
    const used = new Set(b.workers.map((id) => w.units.get(id)?.slot));
    u.slot = 0;
    while (used.has(u.slot)) u.slot++;
    b.workers.push(u.id);
    u.state = 'walk';
    u.path = [];
    u.goal = -1;
  }
}

/**
 * Arqueiro sem torre sobe sozinho na mais perto com vaga. Quem espera no ponto de encontro também
 * sobe (antes não subia, e a torre nova ficava vazia); só fica no chão quem o jogador mandou para
 * um lugar (ordem 2), e esse sobe quando o jogador toca na torre ou usa "Chamar arqueiros".
 */
export function assignArchers(w: World): void {
  if (w.tick % 10 !== 5) return;
  for (const u of w.units.values()) {
    if (u.kind !== 'arqueiro' || u.state === 'dead' || u.tower >= 0 || u.order === 2) continue;
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of w.buildings.values()) {
      if (b.kind !== 'torre' || b.built < 1 || b.archers.length >= towerSlots()) continue;
      const d = dist(u.x, u.z, center(b).x, center(b).z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (!best) continue;
    u.tower = best.id;
    best.archers.push(u.id);
    u.state = 'walk';
    u.path = [];
    u.goal = -1;
  }
}

/** Lugares de arqueiro numa torre. */
export function towerSlots(): number {
  return BUILDINGS.torre.slots ?? 4;
}

export function recruiting(w: World): void {
  for (const b of w.buildings.values()) {
    const kind = BUILDINGS[b.kind].recruits;
    if (!kind || b.queue <= 0 || b.built < 1) continue;
    b.queueT += DT;
    if (b.queueT < UNITS[kind].train) continue;
    const u = takeWorker(w);
    if (!u) {
      b.queueT = UNITS[kind].train;
      if (!b.warned) {
        toast(w, `Sem trabalhador livre para virar ${UNITS[kind].name.toLowerCase()}. Construa casas.`, 'warn');
        b.warned = true;
      }
      continue;
    }
    becomeTroop(w, u, kind, b);
    b.queue--;
    b.queueT = 0;
    b.warned = false;
    toast(w, `${UNITS[kind].name} pronto no ${BUILDINGS[b.kind].name.toLowerCase()}.`, 'good');
  }
}

/** Um trabalhador para virar tropa: primeiro um sem emprego, senão o de algum prédio. */
export function takeWorker(w: World): Unit | null {
  let any: Unit | null = null;
  for (const u of w.units.values()) {
    if (u.kind !== 'trabalhador' || u.state === 'dead') continue;
    if (u.job < 0) return u;
    any ??= u;
  }
  if (any) {
    const b = w.buildings.get(any.job);
    if (b) b.workers = b.workers.filter((id) => id !== any!.id);
    any.job = -1;
  }
  return any;
}

export function becomeTroop(w: World, u: Unit, kind: UnitKind, b: Building): void {
  const def = UNITS[kind];
  const p = slotPoint(b, (u.id % 5) + 1);
  const armor = 1 + CONFIG.forge.step.armaduras * w.forge.armaduras;
  const hp = Math.round(def.hp * armor * (kind === 'soldado' ? w.mods.soldierHp : 1));
  u.kind = kind;
  u.hp = hp;
  u.maxHp = hp;
  u.x = p.x;
  u.z = p.z;
  u.state = 'idle';
  u.path = [];
  u.goal = -1;
  u.job = -1;
  u.tower = -1;
  u.postX = p.x;
  u.postZ = p.z;
  u.home = b.id;
  u.order = 0;
  if (b.rally) {
    const f = formation(b.rally.x, b.rally.z, (u.id * 7) % 12);
    u.postX = f.x;
    u.postZ = f.z;
    u.order = 1;
  } else if (kind === 'arqueiro') {
    // Sem torre, o arqueiro guarda o castelo.
    const c = center(castle(w)!);
    const a = (u.id * 2.39996) % (Math.PI * 2);
    u.postX = c.x + Math.cos(a) * 1.5;
    u.postZ = c.z + Math.sin(a) * 1.5;
  }
}

/** Escolhe onde se esconder: a casa pronta (ou o castelo) mais perto que não esteja ao lado do monstro. */
export function startFlee(w: World, u: Unit, m: Monster): void {
  let best: Building | undefined;
  let bd = Infinity;
  for (const b of w.buildings.values()) {
    if ((b.kind !== 'casa' && b.kind !== 'castelo') || b.built < 1 || b.moveTo) continue;
    const c = center(b);
    if (dist(c.x, c.z, m.x, m.z) < CONFIG.flee.avoid) continue;
    const d = dist(c.x, c.z, u.x, u.z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  best ??= castle(w);
  if (!best) return;
  u.hideIn = best.id;
  u.hideT = 0;
  u.path = [];
  u.goal = -1;
  if (u.state === 'work') u.state = 'walk';
}

/** Escondido: conta o tempo sem monstro por perto e sai pela porta quando passa o perigo. */
export function hideStep(w: World, u: Unit): void {
  const h = u.hideIn !== undefined ? w.buildings.get(u.hideIn) : undefined;
  if (h) {
    if ((w.tick + u.id) % 10 === 0) {
      const c = center(h);
      u.hideT = threatNear(w, c.x, c.z, CONFIG.flee.calm) ? 0 : (u.hideT ?? 0) + 10 * DT;
    }
    if ((u.hideT ?? 0) < CONFIG.flee.wait) return;
    const p = h.kind === 'castelo' ? castleDoor(w) : { x: center(h).x, z: center(h).z + 0.9 };
    u.x = p.x;
    u.z = p.z;
  }
  // Sem abrigo (a casa caiu): sai de onde estava.
  u.hideIn = undefined;
  u.hideT = undefined;
  u.state = 'idle';
  u.path = [];
  u.goal = -1;
}

export function idle(w: World, u: Unit): void {
  // Sem emprego: espera perto do castelo.
  const c = castle(w);
  if (!c) return;
  if (u.postX === u.x && u.postZ === u.z) {
    const a = (u.id * 2.39996) % (Math.PI * 2);
    u.postX = center(c).x + Math.cos(a) * 1.8;
    u.postZ = center(c).z + Math.sin(a) * 1.8;
  }
  guard(w, u);
}

/** O passo do aldeão: recolher no castelo, fugir da horda, ir ao emprego e trabalhar. */
export function workerStep(w: World, u: Unit): void {
  const def = UNITS.trabalhador;
  if (w.shelter) {
    // Recolhidos: todos vão para dentro do castelo e somem lá. Castelo cercado de casas: entram
    // pela casa encostada nele (antes ficavam parados onde estavam).
    if (u.state === 'shelter') return;
    const c = castle(w);
    if (!c) return;
    const goal = u.goal >= 0 && u.path.length > 0 ? u.goal : nearGoal(w, u, c);
    if (goal < 0 || !setGoal(w, u, goal)) return;
    const t = w.tiles[goal]!;
    const p = t.b === c.id ? center(c) : hexToWorld(t.q, t.r);
    u.state = walk(w, u, p.x, p.z, def.speed) ? 'shelter' : 'walk';
    return;
  }
  // Fuga sozinho (2026-11-09): monstro perto, o aldeão larga o que faz e corre para se esconder.
  if (u.state === 'shelter') {
    hideStep(w, u);
    return;
  }
  if (u.hideIn === undefined && (w.tick + u.id) % 5 === 0) {
    const m = threatNear(w, u.x, u.z, CONFIG.flee.radius);
    if (m) startFlee(w, u, m);
  }
  if (u.hideIn !== undefined) {
    const h = w.buildings.get(u.hideIn);
    if (h && setGoal(w, u, w.grid.idx(h.q, h.r))) {
      const p = center(h);
      if (walk(w, u, p.x, p.z, def.speed * CONFIG.flee.run)) {
        u.state = 'shelter';
        u.hideT = 0;
      } else u.state = 'walk';
      return;
    }
    // O abrigo caiu ou ficou sem caminho: procura outro na próxima olhada.
    u.hideIn = undefined;
  }
  const b = u.job >= 0 ? w.buildings.get(u.job) : undefined;
  if (!b) {
    u.job = -1;
    u.trip = undefined;
    u.carry = undefined;
    idle(w, u);
    return;
  }
  if (u.trip === 'ida' && haulStep(w, u, b)) return;
  const spot = workSpot(w, b, u.slot);
  if (u.state === 'work') {
    if (dist(u.x, u.z, spot.x, spot.z) < 0.15) {
      u.facing = spot.face;
      u.trip = undefined;
      startHaul(w, u, b);
      return;
    }
    // Fora do lugar (salvo de antes desta regra): anda até a beira certa.
    u.state = 'walk';
  }
  const goal = w.grid.idx(b.q, b.r);
  if (!setGoal(w, u, goal)) {
    // Ficou sem caminho (muralha nova no meio): larga o emprego.
    b.workers = b.workers.filter((id) => id !== u.id);
    u.job = -1;
    return;
  }
  if (walk(w, u, spot.x, spot.z, def.speed)) {
    u.state = 'work';
    u.facing = spot.face;
    u.trip = undefined;
  } else u.state = 'walk';
}

/** O que sai do prédio (a mina em veio azul dá cristal). */
function yieldOf(w: World, b: Building): Res | null {
  const p = BUILDINGS[b.kind].produces;
  if (!p || (!isExtractor(b.kind) && b.kind !== 'fazenda')) return null;
  if (b.kind === 'mina' && sourceOf(w, b)?.terrain === 'crystal') return 'cristal';
  return p;
}

/** Para onde levar: a comida vai ao celeiro mais perto; o resto, ao castelo. Longe demais, nada. */
function haulDepot(w: World, b: Building, res: Res): Building | null {
  let best: Building | null = null;
  let bd = Infinity;
  for (const o of w.buildings.values()) {
    const ok = o.kind === 'castelo' || (res === 'comida' && o.kind === 'celeiro');
    if (!ok || o.built < 1 || o.moveTo) continue;
    // O castelo é a última opção da comida: celeiro perto vale mais.
    const d = hexDist(b.q, b.r, o.q, o.r) + (res === 'comida' && o.kind === 'castelo' ? 3 : 0);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best && hexDist(b.q, b.r, best.q, best.r) <= CONFIG.haul.maxHex ? best : null;
}

/** No serviço: conta o tempo e, chegada a hora, sai para levar o que tirou (um por prédio de cada vez). */
function startHaul(w: World, u: Unit, b: Building): void {
  u.workT = (u.workT ?? 0) + DT;
  if (u.workT < CONFIG.haul.every + (u.id % 7) || b.dry || b.moveTo || b.moved || w.waveState !== 'calm' && threatNear(w, u.x, u.z, CONFIG.flee.radius * 2)) return;
  const res = yieldOf(w, b);
  if (!res) return;
  for (const id of b.workers) if (id !== u.id && w.units.get(id)?.trip) return;
  const d = haulDepot(w, b, res);
  const to = d ? haulGoal(w, u, d) : -1;
  u.workT = 0;
  if (to < 0) return;
  u.trip = 'ida';
  u.carry = res;
  u.haulTo = to;
  u.state = 'walk';
  u.path = [];
  u.goal = -1;
}

/** Porta do castelo para quem entrega (sem sorteio: cada um no seu lugar, pelo id). */
function frontDoor(c: Building, u: Unit): { x: number; z: number } {
  const p = center(c);
  return { x: p.x + ((u.id % 5) - 2) * 0.22, z: p.z + 1.6 };
}

/**
 * Ladrilho da entrega: a porta do castelo, o próprio destino ou um vizinho dele (livre primeiro,
 * o mais perto de quem leva), o primeiro com caminho a pé; -1 se nenhum.
 */
function haulGoal(w: World, u: Unit, d: Building): number {
  const door = d.kind === 'castelo' ? frontDoor(d, u) : null;
  return nearGoal(w, u, d, door ? [tileIndexAt(w, door.x, door.z)] : []);
}

/**
 * Ladrilho com caminho a pé até o prédio `d`: os de `first`, o dele, e os vizinhos (livres antes,
 * depois os de prédio). O castelo cercado de casas não tem caminho até o hexágono dele: aí quem
 * leva ou se recolhe vai até a casa encostada nele (2026-11-10).
 */
export function nearGoal(w: World, u: Unit, d: Building, first: number[] = []): number {
  const from = tileIndexAt(w, u.x, u.z);
  if (from < 0) return -1;
  const ns: number[] = [];
  for (const [dq, dr] of DIRS) {
    const n = tileAt(w, d.q + dq, d.r + dr);
    if (n && n.terrain !== 'rock' && n.terrain !== 'water' && n.terrain !== 'rift') ns.push(n.i);
  }
  const key = (i: number) => {
    const t = w.tiles[i]!;
    const p = hexToWorld(t.q, t.r);
    return (t.b >= 0 ? 100 : 0) + dist(p.x, p.z, u.x, u.z);
  };
  ns.sort((a, z) => key(a) - key(z));
  for (const i of [...first, w.grid.idx(d.q, d.r), ...ns]) if (i >= 0 && allyPath(w, from, i)) return i;
  return -1;
}

/** Na ida: anda até a entrega e deixa o que leva. Devolve true enquanto vai. */
function haulStep(w: World, u: Unit, b: Building): boolean {
  const d = u.carry ? haulDepot(w, b, u.carry) : null;
  if (!d || u.haulTo === undefined || !setGoal(w, u, u.haulTo)) {
    u.trip = 'volta';
    u.carry = undefined;
    return false;
  }
  const c = center(d);
  const t = w.tiles[u.haulTo]!;
  const door = d.kind === 'castelo' ? frontDoor(d, u) : null;
  const doorTile = door ? tileIndexAt(w, door.x, door.z) : -1;
  // Na porta do castelo; no celeiro, na beira dele; num vizinho livre, perto do lado do destino.
  const tc = hexToWorld(t.q, t.r);
  const at = door && u.haulTo === doorTile ? door : t.b === d.id ? { x: c.x + Math.sign(u.x - c.x) * 0.55, z: c.z + Math.sign(u.z - c.z) * 0.4 } : { x: tc.x + (c.x - tc.x) * 0.3, z: tc.z + (c.z - tc.z) * 0.3 };
  const tx = at.x;
  const tz = at.z;
  u.state = 'walk';
  if (walk(w, u, tx, tz, UNITS.trabalhador.speed) || (u.path.length === 0 && dist(u.x, u.z, tx, tz) < 0.3)) {
    u.facing = Math.atan2(c.x - u.x, c.z - u.z);
    w.events.push({ type: 'haul', res: u.carry!, x: c.x, z: c.z });
    u.trip = 'volta';
    u.carry = undefined;
    u.path = [];
    u.goal = -1;
  }
  return true;
}
