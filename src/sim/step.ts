/**
 * Um passo da simulação (1/20 s): obras, economia, chegada de trabalhadores, recrutas,
 * ondas, horda, tropas e defesas. Os eventos vão para `w.events`; quem chama esvazia.
 */
import { BUILDINGS, CONFIG, MODES, MONSTERS, UNITS, isHero } from './config.ts';
import type { BuildingKind, HeroKind, Mode, MonsterDef, MonsterKind, Res, UnitKind } from './config.ts';
import { hexDist, hexToWorld, worldToHex } from './hex.ts';
import { allyPath, computeFlow, computeReach } from './path.ts';
import { BLESSING_EVERY, BLESSING_IDS, emptyStats, epitaph } from './blessings.ts';
import { addUnit, castle, castleCap, castleDoor, housing, isExtractor, population, resourceDir, sourceOf, tileAt, workers } from './world.ts';
import { deplete, harvest, regrow } from './deposits.ts';
import type { Building, Monster, Unit, WaveMod, World } from './world.ts';
import { WAVE_MODS } from './world.ts';

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

/** Noite sem lua: quem atira de longe alcança menos. */
function rk(w: World): number {
  return w.waveMods.includes('noite') ? CONFIG.waveMods.nightRange : 1;
}

function isTrap(b: Building | undefined): boolean {
  return !!b && !!BUILDINGS[b.kind].trap;
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

/** Segundos para desmontar o prédio numa mudança (no fácil, metade). */
export function packTime(kind: BuildingKind, mode: Mode = 'normal'): number {
  return Math.max(CONFIG.move.packMin, BUILDINGS[kind].build * CONFIG.move.pack) * MODES[mode].move;
}

function construction(w: World): void {
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
function unpack(w: World, b: Building): void {
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

// ---------------------------------------------------------------- economia

function economy(w: World): void {
  const pop = population(w);
  w.res.comida -= ((pop * CONFIG.eatPerMin) / 60) * DT;
  if (w.res.comida <= 0) {
    w.res.comida = 0;
    if (!w.hungry) toast(w, 'A comida acabou. Ninguém chega e o trabalho fica mais lento.', 'bad');
    w.hungry = true;
  } else if (w.res.comida > 2) w.hungry = false;
  const k = w.hungry ? MODES[w.mode].hungryWork : 1;
  // Etapa 18: no fácil, nada se esgota.
  const depletes = MODES[w.mode].depletes;
  for (const b of w.buildings.values()) {
    const def = BUILDINGS[b.kind];
    if (b.built < 1 || !def.produces || !def.rate) continue;
    // Etapa 17: serraria, pedreira e mina tiram do hexágono de recurso; sem ele, param.
    const src = isExtractor(b.kind) ? sourceOf(w, b) : null;
    if (isExtractor(b.kind) && !src) continue;
    // Plantação colhida até o fim: espera replantar.
    if (b.kind === 'fazenda' && b.harvest <= 0) continue;
    let present = 0;
    for (const id of b.workers) if (w.units.get(id)?.state === 'work') present++;
    if (present === 0) continue;
    // Mina em veio azul: cristal no lugar do ferro (Etapa 5).
    const crystal = b.kind === 'mina' && src?.terrain === 'crystal';
    const res = crystal ? 'cristal' : def.produces;
    const rate = crystal ? CONFIG.crystalRate : def.rate;
    const base = (rate / 60) * DT * present * k;
    const got = base * w.mods.prod[res];
    w.res[res] += got;
    w.stats.prod[res] += got;
    // O estoque gasta o tirado sem as bênçãos: elas são ganho, não pressa para acabar.
    if (src && depletes) deplete(w, src, base);
    if (b.kind === 'fazenda' && depletes) harvest(w, b, base);
  }
}

/**
 * Etapa 17: serraria sem floresta, pedreira sem rocha ou mina sem veio para e solta quem
 * trabalha nela (vão para outro serviço); volta sozinha se o recurso aparecer de novo ao lado
 * (depois de uma mudança de lugar). A plantação colhida até o fim também para, até replantar.
 */
function drySites(w: World): void {
  if (w.tick % 10 !== 3) return;
  for (const b of w.buildings.values()) {
    const farm = b.kind === 'fazenda';
    if ((!isExtractor(b.kind) && !farm) || b.built < 1) continue;
    const dry = farm ? b.harvest <= 0 : !sourceOf(w, b);
    if (dry === b.dry) continue;
    b.dry = dry;
    if (!dry) continue;
    releaseFromBuilding(w, b);
    if (farm) toast(w, 'Plantação colhida até o fim: replante pelo menu dela.', 'warn');
    else {
      const what = b.kind === 'serraria' ? 'floresta' : b.kind === 'pedreira' ? 'rocha' : 'veio';
      toast(w, `${BUILDINGS[b.kind].name} sem ${what} por perto: mude de lugar.`, 'warn');
    }
    w.events.push({ type: 'dry', id: b.id });
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
    if (b.built < 1 || b.dry || !def.workers || b.workers.length >= def.workers) continue;
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
function assignArchers(w: World): void {
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
  if (isHero(u.kind)) {
    knockDown(w, u);
    return;
  }
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

export type DmgSrc = 'arrow' | 'magic' | 'melee' | 'siege' | 'fire' | 'tiro';

export function damageMonster(w: World, m: Monster, dmg: number, src: DmgSrc = 'melee'): void {
  if (m.state === 'dead') return;
  const def = MONSTERS[m.kind];
  if ((src === 'arrow' && def.immuneArrows) || (src === 'magic' && def.immuneMagic)) return;
  if (src === 'arrow' && def.arrowResist) dmg *= def.arrowResist;
  // Magia (e flecha em brasa) queima: o troll para de se curar.
  if (src === 'magic' || src === 'fire' || (src === 'arrow' && w.blessings.includes('brasa'))) m.burnT = 0;
  // Blindados (modificador de onda): a horda sente menos dano (o tiro do anão atravessa).
  m.hp -= dmg * (src !== 'tiro' && w.waveMods.includes('blindados') ? CONFIG.waveMods.armor : 1);
  if (m.hp <= 0) {
    m.state = 'dead';
    m.deadT = 0;
    w.kills++;
    w.stats.kills++;
    w.events.push({ type: 'death', x: m.x, z: m.z, monster: true });
    // Acumulador derrubado com a mochila cheia: o roubo volta para o reino.
    if (m.loot && m.loot.n > 0) {
      w.res[m.loot.res] += m.loot.n;
      w.events.push({ type: 'monsterFx', fx: 'moedas', x: m.x, z: m.z });
      toast(w, `Recuperou ${m.loot.n} de ${RES_NAME[m.loot.res]} do acumulador!`, 'good');
      m.loot = undefined;
    }
  }
}

/** Nome do recurso nos avisos do acumulador. */
const RES_NAME: Record<Res, string> = { comida: 'comida', madeira: 'madeira', pedra: 'pedra', ferro: 'ferro', cristal: 'cristal', ouro: 'ouro' };

function nearestMonster(w: World, x: number, z: number, range: number, needReach: boolean, src: DmgSrc = 'melee', skip = -1): Monster | null {
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

function shoot(w: World, x: number, y: number, z: number, m: Monster, dmg: number): void {
  w.events.push({ type: 'shot', x1: x, y1: y, z1: z, x2: m.x, y2: MONSTERS[m.kind].flying ? CONFIG.flyHeight : 0.35, z2: m.z });
  damageMonster(w, m, dmg * w.mods.arrowDmg * (1 + CONFIG.forge.step.flechas * w.forge.flechas), 'arrow');
  // Flecha em brasa acende o piche em que o alvo está.
  if (w.blessings.includes('brasa')) {
    const ti = tileIndexAt(w, m.x, m.z);
    const b = ti >= 0 ? w.buildings.get(w.tiles[ti]!.b) : undefined;
    if (b && b.kind === 'piche' && b.built >= 1 && b.burn <= 0) b.burn = CONFIG.pitch.burn;
  }
}

function unitsStep(w: World): void {
  for (const u of w.units.values()) {
    if (u.state === 'dead') continue;
    u.cd -= DT;
    const def = UNITS[u.kind];
    if (isHero(u.kind)) {
      heroStep(w, u, u.kind);
      continue;
    }
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
      // Fuga sozinho (2026-11-09): monstro perto, o aldeão larga o que faz e corre para se esconder.
      if (u.state === 'shelter') {
        hideStep(w, u);
        continue;
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
          continue;
        }
        // O abrigo caiu ou ficou sem caminho: procura outro na próxima olhada.
        u.hideIn = undefined;
      }
      const b = u.job >= 0 ? w.buildings.get(u.job) : undefined;
      if (!b) {
        u.job = -1;
        idle(w, u);
        continue;
      }
      const spot = workSpot(w, b, u.slot);
      if (u.state === 'work') {
        if (dist(u.x, u.z, spot.x, spot.z) < 0.15) {
          u.facing = spot.face;
          continue;
        }
        // Fora do lugar (salvo de antes desta regra): anda até a beira certa.
        u.state = 'walk';
      }
      const goal = w.grid.idx(b.q, b.r);
      if (!setGoal(w, u, goal)) {
        // Ficou sem caminho (muralha nova no meio): larga o emprego.
        b.workers = b.workers.filter((id) => id !== u.id);
        u.job = -1;
        continue;
      }
      if (walk(w, u, spot.x, spot.z, def.speed)) {
        u.state = 'work';
        u.facing = spot.face;
      } else u.state = 'walk';
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
      const m = nearestMonster(w, u.x, u.z, def.range * rk(w), false, 'arrow');
      if (m) {
        u.state = 'fight';
        u.facing = Math.atan2(m.x - u.x, m.z - u.z);
        if (u.cd <= 0) {
          shoot(w, u.x, 0.6, u.z, m, def.dmg);
          u.cd = def.cd;
        }
        continue;
      }
      u.repath -= DT;
      if (!rangedHelp(w, u, 'arrow')) guard(w, u);
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
    if (u.kind === 'anao') {
      gunnerStep(w, u);
      continue;
    }
    // Soldado, cavaleiro e lanceiro. Com ordem do jogador, segura o ponto: só sai atrás de quem
    // chega perto. Sem ordem, sai em socorro de onde a horda está batendo (2026-11-09).
    const engage = u.order === 2 ? CONFIG.holdEngage : u.kind === 'cavaleiro' ? CONFIG.knightEngage : CONFIG.soldierEngage;
    m = meleeTarget(w, u, engage);
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
        // Lanceiro: a lança pega forte nos grandes.
        const big = u.kind === 'lanceiro' && CONFIG.spear.big.includes(m.kind) ? CONFIG.spear.bigMul : 1;
        damageMonster(w, m, def.dmg * big * (1 + CONFIG.forge.step.armas * w.forge.armas));
        u.cd = def.cd;
      }
      continue;
    }
    if (!chase(w, u, m)) guard(w, u);
  }
}

/**
 * Alvo de quem luta a pé: primeiro a área do posto; sem nada ali, quem não tem ordem do jogador
 * sai em socorro (2026-11-09). Também nota quando a muralha deixa a horda fora do alcance.
 */
function meleeTarget(w: World, u: Unit, engage: number): Monster | undefined {
  if (u.skipT !== undefined && (u.skipT -= DT) <= 0) {
    u.skip = undefined;
    u.skipT = undefined;
  }
  let m = u.target >= 0 ? w.monsters.get(u.target) : undefined;
  if (m && (m.state === 'dead' || (!u.helping && dist(u.postX, u.postZ, m.x, m.z) > engage * 1.3))) m = undefined;
  if (!m && u.repath <= 0) {
    m = nearestMonster(w, u.postX, u.postZ, engage, true, 'melee', u.skip ?? -1) ?? undefined;
    u.helping = false;
    if (!m) {
      wallHint(w, u, engage);
      if (u.order !== 2) {
        m = helpTarget(w, u, 'melee') ?? undefined;
        u.helping = !!m;
      }
    }
    u.target = m ? m.id : -1;
  }
  if (!m) u.helping = false;
  return m;
}

/** Monstro mais perto (até `help.radius`) batendo em algo do reino ou perto do castelo. */
function helpTarget(w: World, u: Unit, src: DmgSrc): Monster | null {
  const c = castle(w);
  if (!c) return null;
  const cp = center(c);
  let best: Monster | null = null;
  let bd = CONFIG.help.radius;
  for (const m of w.monsters.values()) {
    if (m.state === 'dead' || m.id === u.skip) continue;
    const def = MONSTERS[m.kind];
    if (src === 'melee' && def.flying) continue;
    if ((src === 'arrow' && def.immuneArrows) || (src === 'magic' && def.immuneMagic)) continue;
    if (m.state !== 'attack' && dist(m.x, m.z, cp.x, cp.z) > CONFIG.help.kingdom) continue;
    const ti = tileIndexAt(w, m.x, m.z);
    if (!def.flying && (ti < 0 || !w.reach[ti])) continue;
    const d = dist(u.x, u.z, m.x, m.z);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

/** Anda até o monstro; sem caminho, deixa ele de lado por um tempo (não empaca). */
function chase(w: World, u: Unit, m: Monster): boolean {
  if (u.repath <= 0) {
    u.repath = 0.5;
    const goal = tileIndexAt(w, m.x, m.z);
    if (goal < 0 || !setGoalFresh(w, u, goal)) {
      u.target = -1;
      u.helping = false;
      u.skip = m.id;
      u.skipT = CONFIG.help.skip;
      return false;
    }
  }
  u.state = 'walk';
  walk(w, u, m.x, m.z, UNITS[u.kind].speed);
  return true;
}

/** Quem atira de longe (anão, mago, arqueiro no chão, heroínas de longe) também sai em socorro. */
function rangedHelp(w: World, u: Unit, src: DmgSrc): boolean {
  if (u.order === 2) return false;
  let m = u.helping && u.target >= 0 ? w.monsters.get(u.target) : undefined;
  if (m && m.state === 'dead') m = undefined;
  if (!m && u.repath <= 0) {
    m = helpTarget(w, u, src) ?? undefined;
    u.target = m ? m.id : -1;
  }
  u.helping = !!m;
  if (!m) return false;
  return chase(w, u, m);
}

/** A horda está perto do posto mas fora do alcance a pé, e há muralha: o Sábio sugere um portão. */
function wallHint(w: World, u: Unit, engage: number): void {
  if (w.flags.muralhaBloqueia || w.waveState === 'calm') return;
  const m = nearestMonster(w, u.postX, u.postZ, engage, false, 'melee');
  if (!m) return;
  const ti = tileIndexAt(w, m.x, m.z);
  if (ti < 0 || w.reach[ti]) return;
  for (const b of w.buildings.values())
    if (b.kind === 'muralha' && b.built >= 1) {
      w.flags.muralhaBloqueia = true;
      return;
    }
}

/** Mago: dano em área no monstro mais perto; cada feitiço gasta cristal. */
function mageStep(w: World, u: Unit): void {
  const def = UNITS.mago;
  const m = nearestMonster(w, u.x, u.z, def.range * rk(w), false, 'magic');
  if (!m) {
    if (!rangedHelp(w, u, 'magic')) guard(w, u);
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

/**
 * Anão (2026-11-09): espingarda de cano largo. Atira no monstro mais perto (voando ou não), com
 * respingo em quem estiver colado nele; o tiro atravessa escudo, armadura e o gelo do golem.
 */
function gunnerStep(w: World, u: Unit): void {
  const def = UNITS.anao;
  const m = nearestMonster(w, u.x, u.z, def.range * rk(w), false, 'tiro');
  if (!m) {
    if (!rangedHelp(w, u, 'tiro')) guard(w, u);
    return;
  }
  u.facing = Math.atan2(m.x - u.x, m.z - u.z);
  u.state = 'fight';
  if (u.cd > 0) return;
  u.cd = def.cd;
  w.events.push({ type: 'gun', x1: u.x, z1: u.z, x2: m.x, z2: m.z, fly: !!MONSTERS[m.kind].flying });
  const mul = 1 + CONFIG.forge.step.armas * w.forge.armas;
  for (const o of w.monsters.values()) {
    if (o.state === 'dead') continue;
    if (o === m) damageMonster(w, o, def.dmg * mul, 'tiro');
    else if (dist(o.x, o.z, m.x, m.z) <= CONFIG.gun.splash && !!MONSTERS[o.kind].flying === !!MONSTERS[m.kind].flying)
      damageMonster(w, o, def.dmg * mul * CONFIG.gun.splashMul, 'tiro');
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

// ---------------------------------------------------------------- heróis (Etapa 14)

/** Vida e dano a mais pelo nível do herói (+20% por nível acima do 1). */
export const heroMul = (u: Unit) => 1 + CONFIG.heroes.perLevel * ((u.level ?? 1) - 1);
const armorMul = (w: World) => 1 + CONFIG.forge.step.armaduras * w.forge.armaduras;

/** Golpe de herói: o dano que de fato saiu do monstro vira experiência. */
function heroHit(w: World, u: Unit, m: Monster, dmg: number, src: DmgSrc): void {
  if (m.state === 'dead') return;
  const before = m.hp;
  damageMonster(w, m, dmg, src);
  gainXp(w, u, Math.max(0, before - Math.max(0, m.hp)));
}

function gainXp(w: World, u: Unit, n: number): void {
  u.xp = (u.xp ?? 0) + n;
  const lv = u.level ?? 1;
  const need = CONFIG.heroes.xp[lv];
  if (need === undefined || u.xp < need) return;
  u.level = lv + 1;
  const hp = Math.round(UNITS[u.kind].hp * heroMul(u) * armorMul(w));
  u.maxHp = hp;
  u.hp = hp;
  w.events.push({ type: 'heroLevel', x: u.x, z: u.z, level: u.level });
  toast(w, `${UNITS[u.kind].name} subiu para o nível ${u.level}!`, 'gold');
}

/** Herói não morre: desmaia, some para dentro do castelo e volta depois de downTime. */
function knockDown(w: World, u: Unit): void {
  u.hp = 0;
  u.state = 'shelter';
  u.downT = CONFIG.heroes.downTime;
  u.target = -1;
  u.path = [];
  u.goal = -1;
  w.events.push({ type: 'death', x: u.x, z: u.z, monster: false });
  const c = castle(w);
  if (c) {
    const p = center(c);
    u.x = p.x;
    u.z = p.z;
  }
  toast(w, `${UNITS[u.kind].name} desmaiou; volta ao castelo em ${CONFIG.heroes.downTime} s.`, 'warn');
}

function heroStep(w: World, u: Unit, k: HeroKind): void {
  const def = UNITS[k];
  if ((u.downT ?? 0) > 0) {
    u.downT = (u.downT ?? 0) - DT;
    if (u.downT <= 0 && castle(w)) {
      const p = castleDoor(w);
      u.x = p.x;
      u.z = p.z;
      u.postX = p.x;
      u.postZ = p.z;
      u.hp = u.maxHp;
      u.state = 'idle';
      u.downT = 0;
      u.order = 0;
      w.events.push({ type: 'heroBack', x: u.x, z: u.z });
      toast(w, `${def.name} voltou ao castelo.`, 'good');
    }
    return;
  }
  const mul = heroMul(u) * (1 + CONFIG.forge.step.armas * w.forge.armas);
  u.specialT = (u.specialT ?? 0) - DT;
  if (u.specialT <= 0 && heroSpecial(w, u, k, mul)) u.specialT = CONFIG.heroes[k].every;
  if (k === 'atiradora' || k === 'druida') {
    const src: DmgSrc = k === 'atiradora' ? 'arrow' : 'magic';
    const m = nearestMonster(w, u.x, u.z, def.range * rk(w), false, src);
    if (!m) {
      u.repath -= DT;
      if (!rangedHelp(w, u, src)) guard(w, u);
      return;
    }
    u.state = 'fight';
    u.facing = Math.atan2(m.x - u.x, m.z - u.z);
    if (u.cd > 0) return;
    u.cd = def.cd;
    if (k === 'atiradora') w.events.push({ type: 'shot', x1: u.x, y1: 0.7, z1: u.z, x2: m.x, y2: MONSTERS[m.kind].flying ? CONFIG.flyHeight : 0.35, z2: m.z });
    else w.events.push({ type: 'spell', x1: u.x, z1: u.z, x2: m.x, z2: m.z });
    heroHit(w, u, m, def.dmg * mul * (k === 'atiradora' ? w.mods.arrowDmg : 1), src);
    return;
  }
  // Bárbaro e Cavaleiro Negro: corpo a corpo, como o cavaleiro (vão longe atrás da horda).
  u.repath -= DT;
  const engage = u.order === 2 ? CONFIG.holdEngage : CONFIG.knightEngage;
  const m = meleeTarget(w, u, engage);
  if (!m) {
    u.target = -1;
    guard(w, u);
    return;
  }
  const d = dist(u.x, u.z, m.x, m.z);
  if (d <= def.range) {
    u.state = 'fight';
    u.path = [];
    u.facing = Math.atan2(m.x - u.x, m.z - u.z);
    if (u.cd <= 0) {
      w.events.push({ type: 'hit', fx: 'golpe', x: m.x, z: m.z, dx: m.x - u.x, dz: m.z - u.z });
      const boss = k === 'cavaleiroNegro' && MONSTERS[m.kind].boss ? CONFIG.heroes.cavaleiroNegro.bossMult : 1;
      heroHit(w, u, m, def.dmg * mul * boss, 'melee');
      u.cd = def.cd;
    }
    return;
  }
  if (!chase(w, u, m)) guard(w, u);
}

/** Golpe especial automático de cada herói; devolve se saiu (senão tenta de novo no passo seguinte). */
function heroSpecial(w: World, u: Unit, k: HeroKind, mul: number): boolean {
  const H = CONFIG.heroes;
  const alive = [...w.monsters.values()].filter((m) => m.state !== 'dead');
  const ground = (m: Monster) => !MONSTERS[m.kind].flying;
  const near = (m: Monster, r: number) => dist(m.x, m.z, u.x, u.z) <= r;
  if (k === 'barbaro') {
    const s = H.barbaro;
    if (!alive.some((m) => ground(m) && near(m, s.trigger))) return false;
    for (const m of alive) if (ground(m) && near(m, s.radius)) heroHit(w, u, m, UNITS.barbaro.dmg * mul * s.mult, 'melee');
    w.events.push({ type: 'special', fx: 'giro', x: u.x, z: u.z, id: u.id });
    return true;
  }
  if (k === 'atiradora') {
    const s = H.atiradora;
    const range = s.range * rk(w);
    let best: Monster | null = null;
    let bn = 0;
    for (const m of alive) {
      if (!near(m, range) || MONSTERS[m.kind].immuneArrows) continue;
      let n = 0;
      for (const o of alive) if (dist(o.x, o.z, m.x, m.z) <= s.radius) n++;
      if (n > bn) {
        bn = n;
        best = m;
      }
    }
    if (!best) return false;
    const c = best;
    for (const o of alive) if (dist(o.x, o.z, c.x, c.z) <= s.radius) heroHit(w, u, o, s.dmg * mul * w.mods.arrowDmg, 'arrow');
    w.events.push({ type: 'special', fx: 'chuva', x: c.x, z: c.z, id: u.id });
    return true;
  }
  if (k === 'druida') {
    const s = H.druida;
    const caught = alive.filter((m) => ground(m) && near(m, s.radius));
    if (!caught.length) return false;
    caught.forEach((m, i) => {
      m.stunT = Math.max(m.stunT ?? 0, s.root);
      heroHit(w, u, m, s.dmg * mul, 'magic');
      if (i < 6) w.events.push({ type: 'special', fx: 'raizes', x: m.x, z: m.z, id: u.id });
    });
    for (const o of w.units.values()) {
      if (o.state === 'dead' || o.state === 'tower' || o.state === 'shelter' || dist(o.x, o.z, u.x, u.z) > s.radius) continue;
      o.hp = Math.min(o.maxHp, o.hp + s.heal * heroMul(u));
    }
    w.events.push({ type: 'monsterFx', fx: 'bloom', x: u.x, z: u.z });
    return true;
  }
  const s = H.cavaleiroNegro;
  if (!alive.some((m) => ground(m) && near(m, s.trigger))) return false;
  for (const m of alive) {
    if (!ground(m) || !near(m, s.radius)) continue;
    heroHit(w, u, m, s.dmg * mul * (MONSTERS[m.kind].boss ? s.bossMult : 1), 'melee');
    m.stunT = Math.max(m.stunT ?? 0, s.stun);
  }
  w.events.push({ type: 'special', fx: 'pisao', x: u.x, z: u.z, id: u.id });
  return true;
}

function guard(w: World, u: Unit): void {
  const goal = tileIndexAt(w, u.postX, u.postZ);
  if (goal >= 0 && !setGoal(w, u, goal)) {
    u.state = 'idle';
    return;
  }
  u.state = walk(w, u, u.postX, u.postZ, UNITS[u.kind].speed) ? 'idle' : 'walk';
}

/** Monstro vivo mais perto de (x, z), a menos de r metros (voando ou não). */
function threatNear(w: World, x: number, z: number, r: number): Monster | null {
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

/** Escolhe onde se esconder: a casa pronta (ou o castelo) mais perto que não esteja ao lado do monstro. */
function startFlee(w: World, u: Unit, m: Monster): void {
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
function hideStep(w: World, u: Unit): void {
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

export function waveSize(wave: number, mode: Mode = 'normal'): Record<MonsterKind, number> {
  const W = CONFIG.waves;
  const M = MODES[mode];
  // Com teto, a mistura e o tamanho ficam os da onda do teto; o chefe segue a onda de verdade.
  const n = W.capFrom > 0 ? Math.min(wave, W.capFrom) : wave;
  const total = Math.round(M.base + M.perWave * Math.min(n, W.lateFrom) + W.perWaveLate * Math.max(0, n - W.lateFrom));
  const at = (k: MonsterKind) => n >= MONSTERS[k].from;
  const bruto = at('bruto') ? Math.floor((n - 4) / 4) : 0;
  const orc = at('orc') ? Math.min(Math.round(total * 0.3), Math.round(total * (0.12 + 0.01 * (n - 4)))) : 0;
  const lobisomem = at('lobisomem') ? Math.round(total * 0.25) : 0;
  const morcego = at('morcego') ? Math.round(total * 0.12) : 0;
  const bruxa = at('bruxa') ? Math.min(4, 1 + Math.floor((n - 9) / 5)) : 0;
  const troll = at('troll') ? Math.floor((n - 8) / 4) : 0;
  const necromante = at('necromante') ? Math.floor((n - 12) / 4) : 0;
  // Inimigos novos (2026-11-09): esqueleto de escudo no lugar de parte dos esqueletos, o ladrão
  // acumulador (um, e dois da onda 19 em diante) e o vampiro (um, e dois da onda 28 em diante).
  const acumulador = at('acumulador') ? Math.min(2, 1 + Math.floor((n - 7) / 12)) : 0;
  const vampiro = at('vampiro') ? (n >= 28 ? 2 : 1) : 0;
  // Chefes: a cada 15 ondas (20 no fácil), em rodízio: gelo, ossos e musgo.
  const boss = wave % M.bossEvery === 0 ? (wave / M.bossEvery) % 3 : -1;
  const golem = boss === 1 ? 1 : 0;
  const golemOssos = boss === 2 ? 1 : 0;
  const golemMusgo = boss === 0 ? 1 : 0;
  // O que sobra são esqueletos; do meio da onda 6 em diante parte deles vem de elmo e escudo (até metade).
  const ossos = Math.max(0, total - bruto - orc - lobisomem - morcego - bruxa - troll - necromante - acumulador - vampiro);
  const esqueletoGuerreiro = at('esqueletoGuerreiro') ? Math.round(ossos * Math.min(0.35, 0.05 * (n - 5))) : 0;
  const esqueleto = ossos - esqueletoGuerreiro;
  const size = { esqueleto, esqueletoGuerreiro, lobisomem, orc, acumulador, bruto, morcego, bruxa, troll, necromante, vampiro, golem, golemOssos, golemMusgo };
  if (M.monsters === 1) return size;
  // Fácil: menos de cada um (os chefes continuam um só; pelo menos um esqueleto).
  for (const k of Object.keys(size) as MonsterKind[]) if (!MONSTERS[k].boss && k !== 'vampiro') size[k] = Math.round(size[k] * M.monsters);
  size.esqueleto = Math.max(1, size.esqueleto);
  return size;
}

/** Quanto a vida de um monstro da onda n vale sobre a base (chefe à parte, em linha). */
export function monsterHpMul(n: number, mode: Mode = 'normal', boss = false): number {
  const W = CONFIG.waves;
  const k = Math.max(1, W.capFrom > 0 ? Math.min(n, W.capFrom) : n);
  if (boss && W.bossGrowth > 0) return (1 + W.bossGrowth * (k - 1)) * MODES[mode].monsterHp;
  const early = Math.min(k, W.lateFrom) - 1;
  const late = Math.max(0, k - W.lateFrom);
  return Math.pow(W.hpGrowth, early) * Math.pow(W.hpGrowthLate, late) * MODES[mode].monsterHp;
}

export function waveInterval(n: number, mode: Mode = 'normal'): number {
  const W = CONFIG.waves;
  const M = MODES[mode];
  return Math.max(M.calmMin, W.interval + M.calm - W.intervalStep * (n - 1));
}

export function openRifts(n: number, mode: Mode = 'normal'): number {
  return MODES[mode].riftOpens.filter((k) => n >= k).length;
}

/**
 * Modificadores da onda n: um a cada 5 ondas, dois a partir da 30; sorteio fixo pela semente.
 * No fácil, só a partir da onda 20.
 */
export function modsForWave(seed: number, n: number, mode: Mode = 'normal'): WaveMod[] {
  const W = CONFIG.waveMods;
  if (n % W.every !== 0 || n < MODES[mode].modsFrom) return [];
  const all = Object.keys(WAVE_MODS) as WaveMod[];
  let h = (seed ^ (n * 2654435761)) >>> 0;
  const pick = () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return all.splice(h % all.length, 1)[0]!;
  };
  return n >= W.doubleFrom ? [pick(), pick()] : [pick()];
}

/** Tamanho da onda já com os modificadores (Enxame traz mais esqueletos). */
export function waveSizeWithMods(n: number, mods: WaveMod[], mode: Mode = 'normal'): ReturnType<typeof waveSize> {
  const size = waveSize(n, mode);
  if (mods.includes('enxame')) size.esqueleto = Math.round(size.esqueleto * CONFIG.waveMods.swarm) + 3;
  return size;
}

function startWave(w: World): void {
  w.wave++;
  w.waveMods = modsForWave(w.seed, w.wave, w.mode);
  const size = waveSizeWithMods(w.wave, w.waveMods, w.mode);
  if (w.waveMods.length) toast(w, `Onda ${w.wave}: ${w.waveMods.map((k) => `${WAVE_MODS[k].name} (${WAVE_MODS[k].text.charAt(0).toLowerCase()}${WAVE_MODS[k].text.slice(1, -1)})`).join('; ')}.`, 'bad');
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
  if (MODES[w.mode].riftOpens.includes(w.wave) && w.wave > 1) {
    const t = w.tiles[w.rifts[openRifts(w.wave, w.mode) - 1]!];
    toast(w, t ? `Uma nova fenda se abriu ${sideName(t.q, t.r)}.` : 'Uma nova fenda se abriu.', 'bad');
  }
}

const SIDES = ['a leste', 'a nordeste', 'ao norte', 'a noroeste', 'a oeste', 'a sudoeste', 'ao sul', 'a sudeste'];

/** Lado do mapa de um hexágono, visto do castelo ("ao norte", "a sudeste"...). */
export function sideName(q: number, r: number): string {
  const p = hexToWorld(q, r);
  const a = Math.atan2(-p.z, p.x);
  return SIDES[(Math.round(a / (Math.PI / 4)) + 8) % 8]!;
}

function spawnMonster(w: World, kind: MonsterKind): void {
  const n = openRifts(w.wave, w.mode);
  const rift = w.tiles[w.rifts[Math.floor(w.rand() * n)]!]!;
  const p = hexToWorld(rift.q, rift.r);
  const def = MONSTERS[kind];
  const hp = def.hp * monsterHpMul(w.wave, w.mode, !!def.boss);
  const m: Monster = {
    homeX: p.x,
    homeZ: p.z,
    id: w.nextId++,
    kind,
    x: p.x + (w.rand() - 0.5) * 1.2,
    z: p.z + (w.rand() - 0.5) * 1.2,
    hp,
    maxHp: hp,
    speed: def.speed * (0.9 + w.rand() * 0.2) * (w.waveMods.includes('furia') ? CONFIG.waveMods.fury : 1),
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

/** Morcego chamado por um vampiro, ao lado dele (2026-11-09). */
function summonBat(w: World, owner: Monster): void {
  const def = MONSTERS.morcego;
  const hp = def.hp * monsterHpMul(w.wave, w.mode);
  const a = w.rand() * Math.PI * 2;
  const m: Monster = {
    id: w.nextId++,
    kind: 'morcego',
    x: owner.x + Math.cos(a) * 0.8,
    z: owner.z + Math.sin(a) * 0.8,
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
  w.events.push({ type: 'monsterFx', fx: 'poof', x: m.x, z: m.z });
}

/** Recurso que o acumulador leva de cada prédio (o resto é ouro do cofre). */
const LOOT_OF: Partial<Record<BuildingKind, Res>> = { serraria: 'madeira', pedreira: 'pedra', mina: 'ferro', fazenda: 'comida', celeiro: 'comida', casa: 'comida' };

/** O acumulador chegou a um prédio: enche a mochila e começa a fugir. */
function thiefSteals(w: World, m: Monster, b: Building, T: NonNullable<MonsterDef['thief']>): void {
  let res: Res = LOOT_OF[b.kind] ?? 'ouro';
  // Sem nada daquele recurso, leva o que o reino tiver mais.
  if (w.res[res] < 5) res = (['comida', 'madeira', 'pedra', 'ferro', 'ouro'] as Res[]).reduce((a, k) => (w.res[k] > w.res[a] ? k : a), 'comida' as Res);
  const n = Math.max(0, Math.floor(Math.min(w.res[res], T.max, T.base + T.perWave * w.wave)));
  w.res[res] -= n;
  m.loot = { res, n };
  m.fleeT = T.flee;
  m.state = 'walk';
  w.events.push({ type: 'monsterFx', fx: 'moedas', x: m.x, z: m.z });
  if (n > 0) toast(w, `Um acumulador roubou ${n} de ${RES_NAME[res]}! Derrube ele antes que fuja para a fenda.`, 'bad');
}

/** O acumulador chegou à fenda (ou o tempo acabou): some com o que levou. */
function thiefEscapes(w: World, m: Monster): void {
  w.monsters.delete(m.id);
  w.events.push({ type: 'monsterFx', fx: 'poof', x: m.x, z: m.z });
  if (m.loot && m.loot.n > 0) toast(w, `O acumulador fugiu com ${m.loot.n} de ${RES_NAME[m.loot.res]}.`, 'bad');
}

/** Esqueleto levantado por um necromante, ao lado dele. */
function summonSkeleton(w: World, owner: Monster): void {
  const def = MONSTERS.esqueleto;
  const hp = def.hp * monsterHpMul(w.wave, w.mode);
  // Nasce num ladrilho livre ao lado: dentro de rocha ou água ele ficava preso andando contra a
  // pedra e a onda não acabava (2026-11-09). Sem lugar livre em volta, nasce onde o necromante está.
  const a0 = w.rand() * Math.PI * 2;
  let x = owner.x;
  let z = owner.z;
  for (let k = 0; k < 6; k++) {
    const a = a0 + (k * Math.PI) / 3;
    const nx = owner.x + Math.cos(a) * 0.7;
    const nz = owner.z + Math.sin(a) * 0.7;
    if (!blockedFor(w, tileIndexAt(w, nx, nz))) {
      x = nx;
      z = nz;
      break;
    }
  }
  const m: Monster = {
    id: w.nextId++,
    kind: 'esqueleto',
    x,
    z,
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
    if (c) c.hp = Math.min(c.maxHp, c.hp + CONFIG.castleRegen * MODES[w.mode].castleRegen * DT);
    w.waveTimer -= DT;
    if (w.waveTimer <= 0) startWave(w);
    return;
  }
  if (w.waveState === 'spawning') {
    w.spawnT -= DT;
    const every = CONFIG.waves.spawnSpread / Math.max(1, w.spawnQueue.length + 1) + CONFIG.waves.spawnGap;
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
  // Teto da horda (2026-11-09): quem passou da onda do teto sabe que dali em diante ela não cresce.
  if (CONFIG.waves.capFrom > 0 && w.wave === CONFIG.waves.capFrom)
    toast(w, 'A horda chegou à força máxima: daqui em diante as ondas não crescem mais. Quem aguentou até aqui pode lutar para sempre.', 'gold');
  // Etapa 17: o que acabou de floresta, rocha e veio nasce de novo em outro lugar.
  if (MODES[w.mode].depletes) regrow(w);
  w.waveState = 'calm';
  w.waveTimer = waveInterval(w.wave + 1, w.mode);
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
  return t.terrain === 'rock' || t.terrain === 'water' || (t.b >= 0 && !isTrap(w.buildings.get(t.b)));
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
  // Casas primeiro (a mais perto do morcego), depois os outros prédios (o mais perto do
  // castelo, dentro da defesa) e o castelo por último. Muralha, portão e armadilha no chão,
  // nunca. Antes valia o prédio mais perto do morcego: uma mina junto das fendas virava alvo
  // fora do alcance das torres, os engenheiros consertavam e a onda não acabava.
  const home = castle(w);
  const hc = home ? center(home) : { x: 0, z: 0 };
  let target: Building | null = null;
  let bt = Infinity;
  let bd = Infinity;
  for (const b of w.buildings.values()) {
    if (b.kind === 'muralha' || b.kind === 'portao' || BUILDINGS[b.kind].trap) continue;
    const c = center(b);
    const tier = b.kind === 'casa' ? 0 : b.kind === 'castelo' ? 2 : 1;
    const d = tier === 1 ? dist(hc.x, hc.z, c.x, c.z) : dist(m.x, m.z, c.x, c.z);
    if (tier < bt || (tier === bt && d < bd)) {
      bt = tier;
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
    // Etapa 14: preso pelas raízes da druida ou atordoado pelo pisão do Cavaleiro Negro.
    if ((m.stunT ?? 0) > 0) {
      m.stunT = (m.stunT ?? 0) - DT;
      m.state = 'walk';
      continue;
    }
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
    // Vampiro (2026-11-09): chama dois morcegos por vez, até o máximo dele.
    if (def.bats && (m.summonT -= DT) <= 0) {
      m.summonT = def.bats.every;
      let mine = 0;
      for (const o of ms) if (o.owner === m.id && o.state !== 'dead') mine++;
      for (let k = mine; k < Math.min(def.bats.max, mine + 2); k++) summonBat(w, m);
    }
    let tx = m.x;
    let tz = m.z;
    let moving = false;
    if (def.flying) {
      flyStep(w, m, def);
      continue;
    }
    // Acumulador com a mochila cheia: volta reto para a fenda; some nela (ou quando o tempo acaba).
    if (def.thief && m.loot) {
      m.fleeT = (m.fleeT ?? 0) - DT;
      const hx = m.homeX ?? m.x;
      const hz = m.homeZ ?? m.z;
      if (m.fleeT <= 0 || dist(m.x, m.z, hx, hz) < 1.2) {
        thiefEscapes(w, m);
        continue;
      }
      stepToward(w, m, hx, hz, ms, def.thief.carrySpeed / Math.max(0.1, m.speed));
      continue;
    }
    // 1) Gente do reino perto (fora das torres): ataca ou vai até ela.
    let prey: Unit | null = null;
    let pd = CONFIG.monsterAggro;
    const mt = tileIndexAt(w, m.x, m.z);
    // O acumulador não briga com ninguém: só quer chegar a um prédio.
    for (const u of def.thief ? [] : w.units.values()) {
      if (u.state === 'dead' || u.state === 'tower' || u.state === 'shelter') continue;
      const d = dist(m.x, m.z, u.x, u.z);
      if (d >= pd) continue;
      // Quem está num ladrilho onde o monstro não entra (soldado parado na porta do quartel) e fora
      // do alcance do golpe não vira presa: antes o golem empacava na beira, andando sem sair do
      // lugar, e a onda não acabava (2026-11-09).
      if (d > CONFIG.monsterReach) {
        const ut = tileIndexAt(w, u.x, u.z);
        if (ut !== mt && blockedFor(w, ut)) continue;
      }
      pd = d;
      prey = u;
    }
    if (prey) {
      m.facing = Math.atan2(prey.x - m.x, prey.z - m.z);
      if (pd <= CONFIG.monsterReach) {
        m.state = 'attack';
        if (m.cd <= 0) {
          w.events.push({ type: 'hit', fx: 'garra', x: prey.x, z: prey.z, dx: prey.x - m.x, dz: prey.z - m.z });
          prey.hp -= m.dmg;
          if (def.lifesteal) m.hp = Math.min(m.maxHp, m.hp + m.dmg * def.lifesteal);
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
      if (here && here.b >= 0 && !isTrap(w.buildings.get(here.b))) target = w.buildings.get(here.b);
      if (!target && next >= 0) {
        const nt = w.tiles[next]!;
        const c = hexToWorld(nt.q, nt.r);
        if (nt.b >= 0) {
          const b = w.buildings.get(nt.b);
          if (b && !isTrap(b) && dist(m.x, m.z, c.x, c.z) < 1.0 + CONFIG.monsterReach * 0.6) target = b;
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
      if (target && def.thief) {
        thiefSteals(w, m, target, def.thief);
        continue;
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
          if (def.lifesteal) m.hp = Math.min(m.maxHp, m.hp + m.dmg * def.structMul * def.lifesteal);
          m.cd = def.cd;
        }
        continue;
      }
    }
    if (!moving) continue;
    stepToward(w, m, tx, tz, ms);
  }
}

/** Anda um passo na direção de (tx, tz): piche, separação dos vizinhos e escorregar pela borda. */
function stepToward(w: World, m: Monster, tx: number, tz: number, ms: Monster[], speedMul = 1): void {
  {
    m.state = 'walk';
    let vx = tx - m.x;
    let vz = tz - m.z;
    const d = Math.hypot(vx, vz) || 1;
    // Piche: anda pela metade.
    const ht = tileIndexAt(w, m.x, m.z);
    const hb = ht >= 0 ? w.buildings.get(w.tiles[ht]!.b) : undefined;
    const sp = m.speed * speedMul * (hb && hb.kind === 'piche' && hb.built >= 1 ? CONFIG.pitch.slow : 1);
    vx = (vx / d) * sp;
    vz = (vz / d) * sp;
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
      const m = nearestMonster(w, p.x, p.z, (CONFIG.castle.range + w.mods.castleRange) * rk(w), false, 'arrow');
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
      const m = nearestMonster(w, p.x, p.z, CONFIG.tower.range * rk(w), false, 'arrow');
      if (!m) break;
      u.facing = Math.atan2(m.x - p.x, m.z - p.z);
      shoot(w, p.x, 2.0, p.z, m, UNITS.arqueiro.dmg);
      u.cd = UNITS.arqueiro.cd;
    }
  }
}

/** Armadilhas (Etapa 9): estacas ferem quem cruza; piche aceso queima quem está em cima. */
function traps(w: World): void {
  for (const b of [...w.buildings.values()]) {
    if (b.built < 1 || (b.kind !== 'estacas' && b.kind !== 'piche')) continue;
    const ti = w.grid.idx(b.q, b.r);
    if (b.kind === 'piche') {
      if (b.burn <= 0) continue;
      b.burn -= DT;
      for (const m of w.monsters.values()) {
        if (m.state === 'dead' || MONSTERS[m.kind].flying || tileIndexAt(w, m.x, m.z) !== ti) continue;
        damageMonster(w, m, CONFIG.pitch.dps * DT, 'fire');
      }
      continue;
    }
    b.cd -= DT;
    if (b.cd > 0) continue;
    b.cd = CONFIG.spikes.every;
    for (const m of w.monsters.values()) {
      if (m.state === 'dead' || MONSTERS[m.kind].flying || tileIndexAt(w, m.x, m.z) !== ti) continue;
      damageMonster(w, m, CONFIG.spikes.dmg, 'melee');
      w.events.push({ type: 'hit', fx: 'faisca', x: m.x, z: m.z, dx: 0, dz: 1 });
      b.hp -= 1;
      if (b.hp <= 0) {
        destroyBuilding(w, b, false);
        w.events.push({ type: 'toast', text: 'Um trecho de estacas quebrou.', tone: 'info' });
        break;
      }
    }
  }
}

/** Catapulta: pedra no monstro com mais vida ao alcance (não voa), dano em área. */
function catapults(w: World): void {
  const C = CONFIG.catapult;
  for (const b of w.buildings.values()) {
    if (b.kind !== 'catapulta' || b.built < 1) continue;
    b.cd -= DT;
    if (b.cd > 0) continue;
    const p = center(b);
    let best: Monster | null = null;
    for (const m of w.monsters.values()) {
      if (m.state === 'dead' || MONSTERS[m.kind].flying) continue;
      const d = dist(p.x, p.z, m.x, m.z);
      if (d < C.min || d > C.range * rk(w)) continue;
      if (!best || m.hp > best.hp) best = m;
    }
    if (!best) continue;
    b.cd = C.cd;
    w.events.push({ type: 'siege', x1: p.x, z1: p.z, x2: best.x, z2: best.z });
    const tx = best.x;
    const tz = best.z;
    for (const m of w.monsters.values()) {
      if (m.state === 'dead' || MONSTERS[m.kind].flying || dist(m.x, m.z, tx, tz) > C.radius) continue;
      damageMonster(w, m, C.dmg * (1 + CONFIG.forge.step.armas * w.forge.armas), 'siege');
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
  drySites(w);
  arrivals(w);
  assignJobs(w);
  recruiting(w);
  assignArchers(w);
  waves(w);
  monstersStep(w);
  unitsStep(w);
  defenses(w);
  catapults(w);
  traps(w);
  chapels(w);
  cleanup(w);
}
