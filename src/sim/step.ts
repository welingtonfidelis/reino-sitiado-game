/**
 * Um passo da simulação (1/20 s): obras, economia, chegada de trabalhadores, recrutas,
 * ondas, horda, tropas e defesas. Os eventos vão para `w.events`; quem chama esvazia.
 */
import { BUILDINGS, CONFIG, MONSTERS, UNITS } from './config.ts';
import type { MonsterKind, UnitKind } from './config.ts';
import { hexDist, hexToWorld, worldToHex } from './hex.ts';
import { allyPath, computeFlow, computeReach } from './path.ts';
import { BLESSING_EVERY, BLESSING_IDS, emptyStats, epitaph } from './blessings.ts';
import { addUnit, castle, castleCap, castleDoor, housing, population, tileAt, workers } from './world.ts';
import type { Building, Monster, Unit, World } from './world.ts';

const DT = 1 / CONFIG.tps;

function toast(w: World, text: string, tone: 'good' | 'bad' | 'warn' | 'gold' | 'info'): void {
  w.events.push({ type: 'toast', text, tone });
}

function center(b: { q: number; r: number }): { x: number; z: number } {
  return hexToWorld(b.q, b.r);
}

function tileIndexAt(w: World, x: number, z: number): number {
  const h = worldToHex(x, z);
  if (!w.grid.has(h.q, h.r)) return -1;
  return w.grid.idx(h.q, h.r);
}

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

// ---------------------------------------------------------------- prédios

export function releaseFromBuilding(w: World, b: Building): void {
  for (const id of b.workers) {
    const u = w.units.get(id);
    if (u && u.state !== 'dead') {
      u.job = -1;
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

function damageBuilding(w: World, b: Building, dmg: number): void {
  b.hp -= dmg;
  if (b.hp <= 0) destroyBuilding(w, b, true);
}

function construction(w: World): void {
  for (const b of w.buildings.values()) {
    if (b.built >= 1) continue;
    b.built = Math.min(1, b.built + DT / BUILDINGS[b.kind].build);
    if (b.built >= 1) {
      w.dirty = true;
      w.events.push({ type: 'built', id: b.id });
    }
  }
}

// ---------------------------------------------------------------- economia

function economy(w: World): void {
  const pop = population(w);
  w.res.comida -= ((pop * CONFIG.eatPerMin) / 60) * DT;
  if (w.res.comida <= 0) {
    w.res.comida = 0;
    if (!w.hungry) toast(w, 'A comida acabou. Ninguém chega e o trabalho fica mais lento.', 'bad');
    w.hungry = true;
  } else if (w.res.comida > 2) w.hungry = false;
  const k = w.hungry ? CONFIG.hungryWork : 1;
  for (const b of w.buildings.values()) {
    const def = BUILDINGS[b.kind];
    if (b.built < 1 || !def.produces || !def.rate) continue;
    let present = 0;
    for (const id of b.workers) if (w.units.get(id)?.state === 'work') present++;
    // Mina em veio azul: cristal no lugar do ferro (Etapa 5).
    const crystal = b.kind === 'mina' && tileAt(w, b.q, b.r)?.terrain === 'crystal';
    const res = crystal ? 'cristal' : def.produces;
    const rate = crystal ? CONFIG.crystalRate : def.rate;
    const got = (rate / 60) * DT * present * k * w.mods.prod[res];
    w.res[res] += got;
    w.stats.prod[res] += got;
  }
}

function arrivals(w: World): void {
  w.arriveT += DT;
  if (w.arriveT < w.mods.arriveEvery) return;
  const pop = workers(w);
  const cap = castleCap(w);
  const room = housing(w);
  if (pop < room && pop < cap && w.res.comida >= CONFIG.minFoodToArrive) {
    const p = castleDoor(w);
    addUnit(w, 'trabalhador', p.x, p.z);
    w.arriveT = 0;
    w.flags.roof = false;
    w.flags.house = false;
    return;
  }
  w.arriveT = w.mods.arriveEvery;
  if (pop >= cap && room > pop && !w.flags.roof) {
    toast(w, `O reino chegou ao teto do castelo (${cap}). Melhore o castelo para crescer.`, 'warn');
    w.flags.roof = true;
  } else if (pop >= room && pop < cap && !w.flags.house && w.tick > CONFIG.tps * 30) {
    toast(w, 'Sem casa vaga: construa casas para chegarem mais trabalhadores.', 'info');
    w.flags.house = true;
  }
}

// ---------------------------------------------------------------- gente do reino

function slotPoint(b: Building, slot: number): { x: number; z: number } {
  const c = center(b);
  const a = slot * ((Math.PI * 2) / 6) + 0.6;
  const rr = b.kind === 'fazenda' ? 0.5 : 0.85;
  return { x: c.x + Math.cos(a) * rr, z: c.z + Math.sin(a) * rr };
}

function setGoal(w: World, u: Unit, goal: number): boolean {
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
function walk(w: World, u: Unit, tx: number, tz: number, speed: number): boolean {
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

function nearestJob(w: World, u: Unit): Building | null {
  let best: Building | null = null;
  let bd = Infinity;
  const h = worldToHex(u.x, u.z);
  for (const b of w.buildings.values()) {
    const def = BUILDINGS[b.kind];
    if (b.built < 1 || !def.workers || b.workers.length >= def.workers) continue;
    const d = hexDist(h.q, h.r, b.q, b.r);
    if (d < bd && allyPath(w, tileIndexAt(w, u.x, u.z), w.grid.idx(b.q, b.r))) {
      bd = d;
      best = b;
    }
  }
  return best;
}

function assignJobs(w: World): void {
  if (w.tick % 10 !== 0 || w.shelter) return;
  for (const u of w.units.values()) {
    if (u.kind !== 'trabalhador' || u.state === 'dead' || u.job >= 0) continue;
    const b = nearestJob(w, u);
    if (!b) continue;
    u.job = b.id;
    u.slot = b.workers.length;
    b.workers.push(u.id);
    u.state = 'walk';
    u.path = [];
    u.goal = -1;
  }
}

function assignArchers(w: World): void {
  if (w.tick % 10 !== 5) return;
  for (const u of w.units.values()) {
    if (u.kind !== 'arqueiro' || u.state === 'dead' || u.tower >= 0 || u.order > 0) continue;
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of w.buildings.values()) {
      if (b.kind !== 'torre' || b.built < 1 || b.archers.length >= (BUILDINGS.torre.slots ?? 2)) continue;
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

function recruiting(w: World): void {
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
function takeWorker(w: World): Unit | null {
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

function becomeTroop(w: World, u: Unit, kind: UnitKind, b: Building): void {
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

/** Lugar do k-ésimo numa roda em volta do ponto (k = 0 é o centro). */
export function formation(x: number, z: number, k: number): { x: number; z: number } {
  if (k === 0) return { x, z };
  const ring = Math.ceil(k / 6);
  const a = k * 2.39996;
  return { x: x + Math.cos(a) * 0.45 * ring, z: z + Math.sin(a) * 0.45 * ring };
}

function killUnit(w: World, u: Unit): void {
  w.stats.fallen.push(epitaph(u.name, u.kind, u.id));
  u.state = 'dead';
  u.deadT = 0;
  u.path = [];
  if (u.job >= 0) {
    const b = w.buildings.get(u.job);
    if (b) b.workers = b.workers.filter((id) => id !== u.id);
  }
  if (u.tower >= 0) {
    const b = w.buildings.get(u.tower);
    if (b) b.archers = b.archers.filter((id) => id !== u.id);
  }
  if (u.kind !== 'trabalhador') toast(w, `Um ${UNITS[u.kind].name.toLowerCase()} caiu.`, 'bad');
}

export type DmgSrc = 'arrow' | 'magic' | 'melee';

function damageMonster(w: World, m: Monster, dmg: number, src: DmgSrc = 'melee'): void {
  if (m.state === 'dead') return;
  const def = MONSTERS[m.kind];
  if ((src === 'arrow' && def.immuneArrows) || (src === 'magic' && def.immuneMagic)) return;
  // Magia (e flecha em brasa) queima: o troll para de se curar.
  if (src === 'magic' || (src === 'arrow' && w.blessings.includes('brasa'))) m.burnT = 0;
  m.hp -= dmg;
  if (m.hp <= 0) {
    m.state = 'dead';
    m.deadT = 0;
    w.kills++;
    w.stats.kills++;
    w.events.push({ type: 'death', x: m.x, z: m.z, monster: true });
  }
}

function nearestMonster(w: World, x: number, z: number, range: number, needReach: boolean, src: DmgSrc = 'melee'): Monster | null {
  let best: Monster | null = null;
  let bd = range;
  for (const m of w.monsters.values()) {
    if (m.state === 'dead') continue;
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

function shoot(w: World, x: number, y: number, z: number, m: Monster, dmg: number): void {
  w.events.push({ type: 'shot', x1: x, y1: y, z1: z, x2: m.x, y2: MONSTERS[m.kind].flying ? CONFIG.flyHeight : 0.35, z2: m.z });
  damageMonster(w, m, dmg * w.mods.arrowDmg * (1 + CONFIG.forge.step.flechas * w.forge.flechas), 'arrow');
}

function unitsStep(w: World): void {
  for (const u of w.units.values()) {
    if (u.state === 'dead') continue;
    u.cd -= DT;
    const def = UNITS[u.kind];
    if (u.kind === 'trabalhador') {
      if (w.shelter) {
        // Recolhidos: todos vão para dentro do castelo e somem lá.
        if (u.state === 'shelter') continue;
        const c = castle(w);
        if (!c) continue;
        const goal = w.grid.idx(c.q, c.r);
        if (!setGoal(w, u, goal)) continue;
        const p = center(c);
        u.state = walk(w, u, p.x, p.z, def.speed) ? 'shelter' : 'walk';
        continue;
      }
      const b = u.job >= 0 ? w.buildings.get(u.job) : undefined;
      if (!b) {
        u.job = -1;
        idle(w, u);
        continue;
      }
      if (u.state === 'work') continue;
      const goal = w.grid.idx(b.q, b.r);
      if (!setGoal(w, u, goal)) {
        // Ficou sem caminho (muralha nova no meio): larga o emprego.
        b.workers = b.workers.filter((id) => id !== u.id);
        u.job = -1;
        continue;
      }
      const p = slotPoint(b, u.slot);
      u.state = walk(w, u, p.x, p.z, def.speed) ? 'work' : 'walk';
      continue;
    }
    if (u.kind === 'arqueiro') {
      if (u.tower >= 0) {
        const t = w.buildings.get(u.tower);
        if (!t) {
          u.tower = -1;
          continue;
        }
        if (u.state === 'tower') continue;
        const goal = w.grid.idx(t.q, t.r);
        if (!setGoal(w, u, goal)) {
          t.archers = t.archers.filter((id) => id !== u.id);
          u.tower = -1;
          continue;
        }
        const c = center(t);
        if (walk(w, u, c.x, c.z, def.speed)) u.state = 'tower';
        else u.state = 'walk';
        continue;
      }
      const m = nearestMonster(w, u.x, u.z, def.range, false, 'arrow');
      if (m) {
        u.state = 'fight';
        u.facing = Math.atan2(m.x - u.x, m.z - u.z);
        if (u.cd <= 0) {
          shoot(w, u.x, 0.6, u.z, m, def.dmg);
          u.cd = def.cd;
        }
        continue;
      }
      guard(w, u);
      continue;
    }
    // Soldado: procura o monstro mais perto que dá para alcançar a pé.
    u.repath -= DT;
    let m = u.target >= 0 ? w.monsters.get(u.target) : undefined;
    if (u.kind === 'mago') {
      mageStep(w, u);
      continue;
    }
    if (u.kind === 'clerigo') {
      clericStep(w, u);
      continue;
    }
    if (u.kind === 'engenheiro') {
      engineerStep(w, u);
      continue;
    }
    // Soldado e cavaleiro. Com ordem do jogador, segura o ponto: só sai atrás de quem chega perto.
    const engage = u.order === 2 ? CONFIG.holdEngage : u.kind === 'cavaleiro' ? CONFIG.knightEngage : CONFIG.soldierEngage;
    if (!m || m.state === 'dead' || dist(u.postX, u.postZ, m.x, m.z) > engage * 1.3) m = undefined;
    if (!m && u.repath <= 0) {
      m = nearestMonster(w, u.postX, u.postZ, engage, true) ?? undefined;
      u.target = m ? m.id : -1;
    }
    if (!m) {
      u.target = -1;
      guard(w, u);
      continue;
    }
    const d = dist(u.x, u.z, m.x, m.z);
    if (d <= def.range) {
      u.state = 'fight';
      u.path = [];
      u.facing = Math.atan2(m.x - u.x, m.z - u.z);
      if (u.cd <= 0) {
        w.events.push({ type: 'hit', fx: u.kind === 'cavaleiro' ? 'golpe' : 'espada', x: m.x, z: m.z, dx: m.x - u.x, dz: m.z - u.z });
        damageMonster(w, m, def.dmg * (1 + CONFIG.forge.step.armas * w.forge.armas));
        u.cd = def.cd;
      }
      continue;
    }
    if (u.repath <= 0) {
      u.repath = 0.5;
      const goal = tileIndexAt(w, m.x, m.z);
      if (goal < 0 || !setGoalFresh(w, u, goal)) {
        u.target = -1;
        continue;
      }
    }
    u.state = 'walk';
    walk(w, u, m.x, m.z, def.speed);
  }
}

/** Mago: dano em área no monstro mais perto; cada feitiço gasta cristal. */
function mageStep(w: World, u: Unit): void {
  const def = UNITS.mago;
  const m = nearestMonster(w, u.x, u.z, def.range, false, 'magic');
  if (!m) {
    guard(w, u);
    return;
  }
  u.facing = Math.atan2(m.x - u.x, m.z - u.z);
  if (w.res.cristal < CONFIG.mage.crystalPerCast) {
    if (!w.flags.noCrystal) toast(w, 'Sem cristal: os magos não lançam feitiços.', 'warn');
    w.flags.noCrystal = true;
    u.state = 'idle';
    return;
  }
  w.flags.noCrystal = false;
  u.state = 'fight';
  if (u.cd > 0) return;
  w.res.cristal -= CONFIG.mage.crystalPerCast;
  u.cd = def.cd;
  w.events.push({ type: 'spell', x1: u.x, z1: u.z, x2: m.x, z2: m.z });
  for (const o of w.monsters.values()) {
    if (o.state === 'dead' || dist(o.x, o.z, m.x, m.z) > CONFIG.mage.area) continue;
    damageMonster(w, o, def.dmg * (1 + CONFIG.forge.step.armas * w.forge.armas), 'magic');
  }
}

/** Clérigo: cura quem está mais ferido por perto; vai até feridos perto do posto. */
function clericStep(w: World, u: Unit): void {
  const def = UNITS.clerigo;
  let best: Unit | null = null;
  let worst = 0.999;
  for (const o of w.units.values()) {
    if (o.state === 'dead' || o.state === 'tower' || o.state === 'shelter' || o.hp >= o.maxHp) continue;
    const d = dist(u.x, u.z, o.x, o.z);
    if (d > 9 || dist(u.postX, u.postZ, o.x, o.z) > 12) continue;
    const f = o.hp / o.maxHp;
    if (f < worst) {
      worst = f;
      best = o;
    }
  }
  if (!best) {
    guard(w, u);
    return;
  }
  const d = dist(u.x, u.z, best.x, best.z);
  if (d > def.range) {
    u.state = 'walk';
    u.path = [];
    u.goal = -1;
    walk(w, u, best.x, best.z, def.speed);
    return;
  }
  u.state = 'fight';
  u.facing = Math.atan2(best.x - u.x, best.z - u.z);
  if (u.cd > 0) return;
  u.cd = def.cd;
  best.hp = Math.min(best.maxHp, best.hp + CONFIG.cleric.heal);
  w.events.push({ type: 'hit', fx: 'cura', x: best.x, z: best.z, dx: 0, dz: 1 });
}

/** Engenheiro: conserta o que está mais estragado perto do posto, gastando pedra. */
function engineerStep(w: World, u: Unit): void {
  const def = UNITS.engenheiro;
  let b = u.target >= 0 ? w.buildings.get(u.target) : undefined;
  if (b && (b.hp >= b.maxHp || b.built < 1)) b = undefined;
  if (!b && u.repath <= 0) {
    u.repath = 1;
    let best: Building | undefined;
    let score = 0;
    for (const o of w.buildings.values()) {
      if (o.built < 1 || o.hp >= o.maxHp) continue;
      const c = center(o);
      if (dist(u.postX, u.postZ, c.x, c.z) > CONFIG.engineer.reach) continue;
      // Muralha e portão primeiro; depois o que perdeu mais vida.
      const s = (o.maxHp - o.hp) * (o.kind === 'muralha' || o.kind === 'portao' ? 3 : 1);
      if (s > score) {
        score = s;
        best = o;
      }
    }
    b = best;
  }
  u.repath -= DT;
  if (!b) {
    u.target = -1;
    guard(w, u);
    return;
  }
  if (u.target !== b.id) {
    u.target = b.id;
    u.path = [];
    u.goal = -1;
  }
  const c = center(b);
  const dx = u.x - c.x;
  const dz = u.z - c.z;
  const dd = Math.hypot(dx, dz) || 1;
  const px = c.x + (dx / dd) * 0.9;
  const pz = c.z + (dz / dd) * 0.9;
  if (dist(u.x, u.z, c.x, c.z) > 1.3) {
    if (!setGoal(w, u, w.grid.idx(b.q, b.r))) {
      u.target = -1;
      return;
    }
    u.state = 'walk';
    walk(w, u, px, pz, def.speed);
    return;
  }
  u.state = 'work';
  u.facing = Math.atan2(c.x - u.x, c.z - u.z);
  const want = Math.min(b.maxHp - b.hp, CONFIG.engineer.rate * DT);
  const stone = want * CONFIG.engineer.stonePerHp;
  if (w.res.pedra < stone) {
    if (!w.flags.noStone) toast(w, 'Sem pedra: os engenheiros não conseguem consertar.', 'warn');
    w.flags.noStone = true;
    return;
  }
  w.flags.noStone = false;
  w.res.pedra -= stone;
  b.hp += want;
  if (u.cd <= 0) {
    u.cd = 0.7;
    w.events.push({ type: 'hit', fx: 'faisca', x: px, z: pz, dx: c.x - u.x, dz: c.z - u.z });
  }
}

function setGoalFresh(w: World, u: Unit, goal: number): boolean {
  u.goal = -1;
  u.path = [];
  return setGoal(w, u, goal);
}

function guard(w: World, u: Unit): void {
  const goal = tileIndexAt(w, u.postX, u.postZ);
  if (goal >= 0 && !setGoal(w, u, goal)) {
    u.state = 'idle';
    return;
  }
  u.state = walk(w, u, u.postX, u.postZ, UNITS[u.kind].speed) ? 'idle' : 'walk';
}

function idle(w: World, u: Unit): void {
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

// ---------------------------------------------------------------- ondas

export function waveSize(n: number): Record<MonsterKind, number> {
  const W = CONFIG.waves;
  const total = Math.round(W.base + W.perWave * n);
  const at = (k: MonsterKind) => n >= MONSTERS[k].from;
  const bruto = at('bruto') ? Math.floor((n - 4) / 4) : 0;
  const orc = at('orc') ? Math.min(Math.round(total * 0.3), Math.round(total * (0.12 + 0.01 * (n - 4)))) : 0;
  const lobisomem = at('lobisomem') ? Math.round(total * 0.25) : 0;
  const morcego = at('morcego') ? Math.round(total * 0.12) : 0;
  const bruxa = at('bruxa') ? Math.min(4, 1 + Math.floor((n - 9) / 5)) : 0;
  const troll = at('troll') ? Math.floor((n - 8) / 4) : 0;
  const necromante = at('necromante') ? Math.floor((n - 12) / 4) : 0;
  // Chefes: a cada 15 ondas, alternando gelo e ossos.
  const boss = n % CONFIG.bossEvery === 0 ? (n / CONFIG.bossEvery) % 2 === 1 : null;
  const golem = boss === true ? 1 : 0;
  const golemOssos = boss === false ? 1 : 0;
  const esqueleto = Math.max(0, total - bruto - orc - lobisomem - morcego - bruxa - troll - necromante);
  return { esqueleto, lobisomem, orc, bruto, morcego, bruxa, troll, necromante, golem, golemOssos };
}

export function waveInterval(n: number): number {
  const W = CONFIG.waves;
  return Math.max(W.intervalMin, W.interval - W.intervalStep * (n - 1));
}

export function openRifts(n: number): number {
  return CONFIG.waves.riftOpens.filter((k) => n >= k).length;
}

function startWave(w: World): void {
  w.wave++;
  const size = waveSize(w.wave);
  const list: MonsterKind[] = [];
  for (const [k, n] of Object.entries(size) as [MonsterKind, number][]) for (let i = 0; i < n; i++) list.push(k);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(w.rand() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  w.spawnQueue = list;
  w.spawnT = 0;
  w.waveState = 'spawning';
  w.events.push({ type: 'waveStart', wave: w.wave });
  if (CONFIG.waves.riftOpens.includes(w.wave) && w.wave > 1) toast(w, 'Uma nova fenda se abriu na borda norte.', 'bad');
}

function spawnMonster(w: World, kind: MonsterKind): void {
  const n = openRifts(w.wave);
  const rift = w.tiles[w.rifts[Math.floor(w.rand() * n)]!]!;
  const p = hexToWorld(rift.q, rift.r);
  const def = MONSTERS[kind];
  const hp = def.hp * Math.pow(CONFIG.waves.hpGrowth, w.wave - 1);
  const m: Monster = {
    id: w.nextId++,
    kind,
    x: p.x + (w.rand() - 0.5) * 1.2,
    z: p.z + (w.rand() - 0.5) * 1.2,
    hp,
    maxHp: hp,
    speed: def.speed * (0.9 + w.rand() * 0.2),
    dmg: def.dmg,
    cd: w.rand() * def.cd,
    state: 'walk',
    facing: 0,
    deadT: 0,
    burnT: 99,
    healT: 1,
    summonT: 3,
    owner: -1,
  };
  w.monsters.set(m.id, m);
  if (def.boss) toast(w, `${def.name} saiu da fenda! ${def.blurb.replace('Chefe. ', '')}`, 'bad');
}

/** Esqueleto levantado por um necromante, ao lado dele. */
function summonSkeleton(w: World, owner: Monster): void {
  const def = MONSTERS.esqueleto;
  const hp = def.hp * Math.pow(CONFIG.waves.hpGrowth, Math.max(0, w.wave - 1));
  const a = w.rand() * Math.PI * 2;
  const m: Monster = {
    id: w.nextId++,
    kind: 'esqueleto',
    x: owner.x + Math.cos(a) * 0.7,
    z: owner.z + Math.sin(a) * 0.7,
    hp,
    maxHp: hp,
    speed: def.speed,
    dmg: def.dmg,
    cd: def.cd,
    state: 'walk',
    facing: owner.facing,
    deadT: 0,
    burnT: 99,
    healT: 1,
    summonT: 99,
    owner: owner.id,
  };
  w.monsters.set(m.id, m);
  w.events.push({ type: 'monsterFx', fx: 'alma', x: m.x, z: m.z });
}

function waves(w: World): void {
  if (w.waveState === 'calm') {
    // Entre as ondas o castelo se recupera devagar.
    const c = castle(w);
    if (c) c.hp = Math.min(c.maxHp, c.hp + CONFIG.castleRegen * DT);
    w.waveTimer -= DT;
    if (w.waveTimer <= 0) startWave(w);
    return;
  }
  if (w.waveState === 'spawning') {
    w.spawnT -= DT;
    const every = CONFIG.waves.spawnSpread / Math.max(1, w.spawnQueue.length + 1);
    while (w.spawnT <= 0 && w.spawnQueue.length > 0) {
      spawnMonster(w, w.spawnQueue.shift()!);
      w.spawnT += Math.min(0.6, every);
    }
    if (w.spawnQueue.length === 0) w.waveState = 'attack';
    return;
  }
  for (const m of w.monsters.values()) if (m.state !== 'dead') return;
  const gold = Math.round((CONFIG.waves.goldBase + CONFIG.waves.goldPerWave * w.wave) * w.mods.gold);
  w.res.ouro += gold;
  w.stats.prod.ouro += gold;
  // Pedra benta: muralhas e portões se recuperam um pouco.
  if (w.mods.wallRegen > 0)
    for (const b of w.buildings.values())
      if (b.kind === 'muralha' || b.kind === 'portao') b.hp = Math.min(b.maxHp, b.hp + b.maxHp * w.mods.wallRegen);
  w.events.push({ type: 'waveEnd', wave: w.wave, gold });
  w.waveState = 'calm';
  w.waveTimer = waveInterval(w.wave + 1);
  // Relatório: o jogo espera o jogador ler (e escolher a bênção, a cada 4 ondas).
  const free = BLESSING_IDS.filter((id) => !w.blessings.includes(id));
  const choices: typeof free = [];
  if (w.wave % BLESSING_EVERY === 0)
    while (choices.length < 3 && free.length > 0) choices.push(free.splice(Math.floor(w.rand() * free.length), 1)[0]!);
  w.report = { ...w.stats, wave: w.wave, gold, choices };
  w.stats = emptyStats();
  w.events.push({ type: 'report' });
}

// ---------------------------------------------------------------- horda

function blockedFor(w: World, ti: number): boolean {
  if (ti < 0) return true;
  const t = w.tiles[ti]!;
  return t.terrain === 'rock' || t.terrain === 'water' || t.b >= 0;
}

/** Morcego: voa reto até a casa (ou prédio) mais perto, ignorando muralhas. */
function flyStep(w: World, m: Monster, def: (typeof MONSTERS)[MonsterKind]): void {
  // Gente fora das torres e do castelo é presa fácil.
  for (const u of w.units.values()) {
    if (u.state === 'dead' || u.state === 'tower' || u.state === 'shelter') continue;
    if (dist(m.x, m.z, u.x, u.z) > CONFIG.monsterReach) continue;
    m.state = 'attack';
    m.facing = Math.atan2(u.x - m.x, u.z - m.z);
    if (m.cd <= 0) {
      w.events.push({ type: 'hit', fx: 'garra', x: u.x, z: u.z, dx: u.x - m.x, dz: u.z - m.z });
      u.hp -= m.dmg;
      m.cd = def.cd;
      if (u.hp <= 0) killUnit(w, u);
    }
    return;
  }
  let target: Building | null = null;
  let bd = Infinity;
  for (const b of w.buildings.values()) {
    if (b.kind === 'muralha' || b.kind === 'portao') continue;
    const c = center(b);
    // Casas primeiro (contam como mais perto), o castelo por último.
    const d = dist(m.x, m.z, c.x, c.z) * (b.kind === 'casa' ? 0.5 : b.kind === 'castelo' ? 1.5 : 1);
    if (d < bd) {
      bd = d;
      target = b;
    }
  }
  if (!target) return;
  const c = center(target);
  const d = dist(m.x, m.z, c.x, c.z);
  if (d < 0.9) {
    m.state = 'attack';
    if (m.cd <= 0) {
      w.events.push({ type: 'hit', fx: 'garra', x: m.x, z: m.z, dx: c.x - m.x, dz: c.z - m.z });
      damageBuilding(w, target, m.dmg * def.structMul);
      m.cd = def.cd;
    }
    return;
  }
  m.state = 'walk';
  const k = Math.min(d, m.speed * DT) / d;
  m.x += (c.x - m.x) * k;
  m.z += (c.z - m.z) * k;
  m.facing = Math.atan2(c.x - m.x, c.z - m.z);
}

function monstersStep(w: World): void {
  const ms = [...w.monsters.values()].filter((m) => m.state !== 'dead');
  for (const m of ms) {
    m.cd -= DT;
    const def = MONSTERS[m.kind];
    // Etapa 6: troll se cura, bruxa cura a horda, necromante levanta esqueletos.
    m.burnT += DT;
    if (def.regen && m.burnT > 3) m.hp = Math.min(m.maxHp, m.hp + def.regen * m.maxHp * DT);
    if (def.heal && (m.healT -= DT) <= 0) {
      m.healT = def.heal.every;
      let any = false;
      for (const o of ms) {
        if (o === m || o.state === 'dead' || o.hp >= o.maxHp || dist(o.x, o.z, m.x, m.z) > def.heal.radius) continue;
        o.hp = Math.min(o.maxHp, o.hp + def.heal.amount);
        any = true;
      }
      if (any) w.events.push({ type: 'monsterFx', fx: 'bloom', x: m.x, z: m.z });
    }
    if (def.summon && (m.summonT -= DT) <= 0) {
      m.summonT = def.summon.every;
      let mine = 0;
      for (const o of ms) if (o.owner === m.id && o.state !== 'dead') mine++;
      if (mine < def.summon.max) summonSkeleton(w, m);
    }
    let tx = m.x;
    let tz = m.z;
    let moving = false;
    if (def.flying) {
      flyStep(w, m, def);
      continue;
    }
    // 1) Gente do reino perto (fora das torres): ataca ou vai até ela.
    let prey: Unit | null = null;
    let pd = CONFIG.monsterAggro;
    for (const u of w.units.values()) {
      if (u.state === 'dead' || u.state === 'tower' || u.state === 'shelter') continue;
      const d = dist(m.x, m.z, u.x, u.z);
      if (d < pd) {
        pd = d;
        prey = u;
      }
    }
    if (prey) {
      m.facing = Math.atan2(prey.x - m.x, prey.z - m.z);
      if (pd <= CONFIG.monsterReach) {
        m.state = 'attack';
        if (m.cd <= 0) {
          w.events.push({ type: 'hit', fx: 'garra', x: prey.x, z: prey.z, dx: prey.x - m.x, dz: prey.z - m.z });
          prey.hp -= m.dmg;
          m.cd = def.cd;
          if (prey.hp <= 0) killUnit(w, prey);
        }
        continue;
      }
      tx = prey.x;
      tz = prey.z;
      moving = true;
    } else {
      // 2) Segue o campo de fluxo; se o próximo ladrilho tem prédio, bate nele.
      const ti = tileIndexAt(w, m.x, m.z);
      const here = ti >= 0 ? w.tiles[ti]! : null;
      const next = ti >= 0 ? w.flow[ti]! : -1;
      let target: Building | undefined;
      if (here && here.b >= 0) target = w.buildings.get(here.b);
      if (!target && next >= 0) {
        const nt = w.tiles[next]!;
        const c = hexToWorld(nt.q, nt.r);
        if (nt.b >= 0) {
          const b = w.buildings.get(nt.b);
          if (b && dist(m.x, m.z, c.x, c.z) < 1.0 + CONFIG.monsterReach * 0.6) target = b;
        }
        tx = c.x;
        tz = c.z;
        moving = true;
      } else if (!target) {
        const c = castle(w);
        if (c) {
          const p = center(c);
          if (dist(m.x, m.z, p.x, p.z) < 1.0 + CONFIG.monsterReach) target = c;
          else {
            tx = p.x;
            tz = p.z;
            moving = true;
          }
        }
      }
      if (target) {
        const p = center(target);
        m.facing = Math.atan2(p.x - m.x, p.z - m.z);
        m.state = 'attack';
        if (m.cd <= 0) {
          const k = Math.min(0.45, Math.hypot(p.x - m.x, p.z - m.z));
          const fx = Math.sin(m.facing);
          const fz = Math.cos(m.facing);
          w.events.push({ type: 'hit', fx: 'pancada', x: m.x + fx * k, z: m.z + fz * k, dx: fx, dz: fz });
          damageBuilding(w, target, m.dmg * def.structMul);
          m.cd = def.cd;
        }
        continue;
      }
    }
    if (!moving) continue;
    m.state = 'walk';
    let vx = tx - m.x;
    let vz = tz - m.z;
    const d = Math.hypot(vx, vz) || 1;
    vx = (vx / d) * m.speed;
    vz = (vz / d) * m.speed;
    // Separação: não se empilham.
    for (const o of ms) {
      if (o === m) continue;
      const ox = m.x - o.x;
      const oz = m.z - o.z;
      const od = ox * ox + oz * oz;
      if (od < 0.25 && od > 1e-6) {
        const k = (0.5 - Math.sqrt(od)) * 2.5;
        vx += (ox / Math.sqrt(od)) * k;
        vz += (oz / Math.sqrt(od)) * k;
      }
    }
    const nx = m.x + vx * DT;
    const nz = m.z + vz * DT;
    const ti = tileIndexAt(w, nx, nz);
    const cur = tileIndexAt(w, m.x, m.z);
    if (ti !== cur && blockedFor(w, ti)) {
      // Não entra em ladrilho ocupado: escorrega pela borda.
      if (!blockedFor(w, tileIndexAt(w, nx, m.z))) m.x = nx;
      else if (!blockedFor(w, tileIndexAt(w, m.x, nz))) m.z = nz;
    } else {
      m.x = nx;
      m.z = nz;
    }
    m.facing = Math.atan2(vx, vz);
  }
}

// ---------------------------------------------------------------- defesas

function defenses(w: World): void {
  const c = castle(w);
  if (c) {
    c.cd -= DT;
    const p = center(c);
    if (c.cd <= 0) {
      const m = nearestMonster(w, p.x, p.z, CONFIG.castle.range + w.mods.castleRange, false, 'arrow');
      if (m) {
        shoot(w, p.x, 3.4, p.z, m, CONFIG.castle.dmg * w.mods.castleDmg);
        c.cd = CONFIG.castle.cd;
      }
    }
  }
  for (const b of w.buildings.values()) {
    if (b.kind !== 'torre' || b.built < 1) continue;
    const p = center(b);
    for (const id of b.archers) {
      const u = w.units.get(id);
      if (!u || u.state !== 'tower' || u.cd > 0) continue;
      const m = nearestMonster(w, p.x, p.z, CONFIG.tower.range, false, 'arrow');
      if (!m) break;
      u.facing = Math.atan2(m.x - p.x, m.z - p.z);
      shoot(w, p.x, 2.3, p.z, m, UNITS.arqueiro.dmg);
      u.cd = UNITS.arqueiro.cd;
    }
  }
}

/** Capela: quem está ferido por perto se cura devagar. */
function chapels(w: World): void {
  for (const b of w.buildings.values()) {
    if (b.kind !== 'capela' || b.built < 1) continue;
    const c = center(b);
    for (const u of w.units.values()) {
      if (u.state === 'dead' || u.hp >= u.maxHp || dist(u.x, u.z, c.x, c.z) > CONFIG.chapel.radius) continue;
      u.hp = Math.min(u.maxHp, u.hp + CONFIG.chapel.perSec * DT);
    }
  }
}

function cleanup(w: World): void {
  for (const m of w.monsters.values()) {
    if (m.state !== 'dead') continue;
    m.deadT += DT;
    if (m.deadT > 2.5) w.monsters.delete(m.id);
  }
  for (const u of w.units.values()) {
    if (u.state !== 'dead') continue;
    u.deadT += DT;
    if (u.deadT > 2.5) w.units.delete(u.id);
  }
}

/** Refaz caminhos e alcance depois de mudar prédios (também chamado pela tela). */
export function refresh(w: World): void {
  if (!w.dirty) return;
  computeFlow(w);
  computeReach(w);
  w.dirty = false;
  w.ver++;
}

export function step(w: World): void {
  if (w.lost) return;
  w.tick++;
  w.time += DT;
  refresh(w);
  construction(w);
  economy(w);
  arrivals(w);
  assignJobs(w);
  recruiting(w);
  assignArchers(w);
  waves(w);
  monstersStep(w);
  unitsStep(w);
  defenses(w);
  chapels(w);
  cleanup(w);
}
