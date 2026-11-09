/**
 * Ordens do jogador. Cada uma confere se pode e devolve o motivo quando não pode, em
 * português, para a tela mostrar no próprio botão ("Sem pedra", "Só entre as ondas").
 */
import { BUILDINGS, CONFIG, HERO_KINDS, RES_ORDER, UNITS } from './config.ts';
import type { BuildingKind, Cost, HeroKind, Res } from './config.ts';
import { DIRS, hexDist, hexToWorld } from './hex.ts';
import { addBuilding, addUnit, buildCost, castle, pay, refundTo, tileAt } from './world.ts';
import type { Building, World } from './world.ts';
import { destroyBuilding, formation, releaseFromBuilding, towerSlots } from './step.ts';
import { castleDoor } from './world.ts';
import { BLESSINGS } from './blessings.ts';
import type { BlessingId } from './blessings.ts';
import { allyPath } from './path.ts';
import { worldToHex } from './hex.ts';

const RES_NAME: Record<Res, string> = { comida: 'comida', madeira: 'madeira', pedra: 'pedra', ferro: 'ferro', cristal: 'cristal', ouro: 'ouro' };

/** "Falta pedra" para o primeiro recurso que não dá. */
export function missing(w: World, cost: Cost): string | null {
  for (const r of RES_ORDER) if ((cost[r] ?? 0) > w.res[r]) return `Falta ${RES_NAME[r]}`;
  return null;
}

/** Motivo de não poder construir ali, ou null. `ignore` é o próprio prédio (para mover). */
export function placeProblem(w: World, kind: BuildingKind, q: number, r: number, ignore = -1): string | null {
  const t = tileAt(w, q, r);
  if (!t) return 'Fora do mapa';
  if (hexDist(q, r, 0, 0) >= w.grid.R) return 'Perto demais da borda';
  if (t.terrain === 'rift') return 'Em cima da fenda, não';
  if (t.terrain === 'water') return 'Na água, não';
  const def = BUILDINGS[kind];
  if (def.site === 'wall') {
    const b = t.b >= 0 ? w.buildings.get(t.b) : undefined;
    if (!b || b.kind !== 'muralha' || b.built < 1) return 'O portão vai em cima de uma muralha pronta';
    return null;
  }
  if (t.b >= 0 && t.b !== ignore) return 'Já tem algo aqui';
  for (const o of w.buildings.values()) {
    if (o.id !== ignore && o.moveTo && o.moveTo.q === q && o.moveTo.r === r) return 'Lugar guardado para uma mudança';
  }
  const ns = DIRS.map(([dq, dr]) => tileAt(w, q + dq, r + dr));
  if (def.site === 'ore') return t.terrain === 'ore' || t.terrain === 'crystal' ? null : 'A mina vai em cima de um veio de ferro ou de cristal';
  if (t.terrain !== 'grass') return t.terrain === 'ore' || t.terrain === 'crystal' ? 'Veio de minério: guarde para a mina' : 'Terreno ocupado';
  if (def.site === 'nearForest' && !ns.some((n) => n?.terrain === 'forest')) return 'Precisa de floresta ao lado';
  if (def.site === 'nearRock' && !ns.some((n) => n?.terrain === 'rock')) return 'Precisa de rocha ao lado';
  if (def.site === 'nearBarn' && !ns.some((n) => n && n.b >= 0 && n.b !== ignore && w.buildings.get(n.b)?.kind === 'celeiro')) return 'A plantação vai ao lado de um celeiro';
  return null;
}

/** Prédio que pede o castelo num nível mais alto (Etapa 5). */
export function levelProblem(w: World, kind: BuildingKind): string | null {
  const def = BUILDINGS[kind];
  const need = def.needsLevel ?? 1;
  const lvl = castle(w)?.level ?? 1;
  if (lvl < need) return `Precisa do castelo nível ${need}`;
  if (def.needsBuilding) {
    let ok = false;
    for (const b of w.buildings.values()) if (b.kind === def.needsBuilding && b.built >= 1) ok = true;
    if (!ok) return `Precisa de ${def.needsBuilding === 'forja' ? 'uma forja pronta' : BUILDINGS[def.needsBuilding].name}`;
  }
  return null;
}

export function canBuild(w: World, kind: BuildingKind, q: number, r: number): string | null {
  return placeProblem(w, kind, q, r) ?? levelProblem(w, kind) ?? missing(w, buildCost(w, kind));
}

export function build(w: World, kind: BuildingKind, q: number, r: number): string | null {
  const why = canBuild(w, kind, q, r);
  if (why) return why;
  const cost = buildCost(w, kind);
  pay(w, cost);
  if (kind === 'portao') {
    const t = tileAt(w, q, r)!;
    const old = w.buildings.get(t.b)!;
    w.buildings.delete(old.id);
    t.b = -1;
  }
  addBuilding(w, kind, q, r, 0);
  if (kind === 'casa') w.housesBuilt++;
  return null;
}

/** Quanto volta ao destruir: metade do que custou (a casa, pelo preço da última). */
function paidFor(w: World, b: Building): Cost {
  if (b.kind !== 'casa') return BUILDINGS[b.kind].cost;
  const k = Math.pow(CONFIG.houseGrowth, Math.max(0, w.housesBuilt - 1));
  const out: Cost = {};
  for (const [r, v] of Object.entries(BUILDINGS.casa.cost) as [Res, number][]) out[r] = Math.round(v * k);
  return out;
}

export function demolishProblem(_w: World, b: Building): string | null {
  if (b.kind === 'castelo') return 'O castelo não se derruba';
  return null;
}

export function demolish(w: World, id: number): string | null {
  const b = w.buildings.get(id);
  if (!b) return 'Não existe mais';
  const why = demolishProblem(w, b);
  if (why) return why;
  // Obra nova devolve tudo; prédio pronto (ou de mudança) devolve a metade.
  refundTo(w, paidFor(w, b), b.built >= 1 || b.moveTo || b.moved ? CONFIG.refund : 1);
  if (b.kind === 'casa') w.housesBuilt = Math.max(0, w.housesBuilt - 1);
  destroyBuilding(w, b, false);
  return null;
}

export function repairCost(_w: World, b: Building): Cost {
  const miss = b.maxHp - b.hp;
  if (miss <= 0) return {};
  if (b.kind === 'castelo') return { pedra: Math.ceil(miss / 8), madeira: Math.ceil(miss / 16) };
  const share = (miss / b.maxHp) * CONFIG.repairShare;
  const out: Cost = {};
  for (const [r, v] of Object.entries(BUILDINGS[b.kind].cost) as [Res, number][]) out[r] = Math.max(1, Math.ceil(v * share));
  return out;
}

export function repairProblem(w: World, b: Building): string | null {
  if (b.moveTo || b.moved) return 'De mudança';
  if (b.built < 1) return 'Ainda em obra';
  if (b.hp >= b.maxHp) return 'Sem estrago';
  return missing(w, repairCost(w, b));
}

export function repair(w: World, id: number): string | null {
  const b = w.buildings.get(id);
  if (!b) return 'Não existe mais';
  const why = repairProblem(w, b);
  if (why) return why;
  pay(w, repairCost(w, b));
  b.hp = b.maxHp;
  return null;
}

export function moveProblem(w: World, b: Building): string | null {
  if (b.kind === 'castelo') return 'O castelo não sai do lugar';
  if (b.moveTo || b.moved) return 'Já está de mudança';
  if (b.built < 1) return 'Espere a obra terminar';
  if (w.waveState !== 'calm') return 'Só entre as ondas';
  return null;
}

/**
 * Muda o prédio de lugar, com custo de tempo: ele é desmontado aqui (não funciona enquanto isso)
 * e depois montado lá como obra (`unpack` e `construction` em step.ts). O lugar novo fica guardado.
 */
export function moveBuilding(w: World, id: number, q: number, r: number): string | null {
  const b = w.buildings.get(id);
  if (!b) return 'Não existe mais';
  if (b.q === q && b.r === r) return 'Já está aqui';
  const why = moveProblem(w, b) ?? placeProblem(w, b.kind, q, r, b.id);
  if (why) return why;
  b.moveTo = { q, r };
  w.dirty = true;
  // Torre: os arqueiros descem enquanto ela é desmontada (sobem de novo quando ficar pronta).
  for (const uid of b.archers) {
    const u = w.units.get(uid);
    if (!u || u.state === 'dead') continue;
    const p = hexToWorld(b.q, b.r);
    u.tower = -1;
    u.state = 'idle';
    u.x = p.x + 0.5;
    u.z = p.z + 0.5;
    u.path = [];
    u.goal = -1;
  }
  b.archers = [];
  return null;
}

/** Etapa 17: replantar a plantação colhida até o fim. */
export function replantProblem(w: World, b: Building): string | null {
  if (b.kind !== 'fazenda') return 'Só plantação se replanta';
  if (b.moveTo || b.moved) return 'De mudança';
  if (b.built < 1) return 'Ainda em obra';
  if (b.harvest > 0) return 'Ainda tem o que colher';
  return missing(w, CONFIG.farm.replant);
}

export function replant(w: World, id: number): string | null {
  const b = w.buildings.get(id);
  if (!b) return 'Não existe mais';
  const why = replantProblem(w, b);
  if (why) return why;
  pay(w, CONFIG.farm.replant);
  b.harvest = CONFIG.farm.harvest;
  b.dry = false;
  w.dirty = true;
  w.events.push({ type: 'replanted', id: b.id });
  return null;
}

export function recruitProblem(w: World, b: Building): string | null {
  const kind = BUILDINGS[b.kind].recruits;
  if (!kind) return 'Este prédio não treina ninguém';
  if (b.moveTo || b.moved) return 'De mudança';
  if (b.built < 1) return 'Ainda em obra';
  if (b.queue >= CONFIG.recruitQueue) return 'Fila cheia';
  return missing(w, UNITS[kind].cost);
}

export function recruit(w: World, id: number): string | null {
  const b = w.buildings.get(id);
  if (!b) return 'Não existe mais';
  const why = recruitProblem(w, b);
  if (why) return why;
  pay(w, UNITS[BUILDINGS[b.kind].recruits!].cost);
  b.queue++;
  return null;
}

export function upgradeCost(w: World): Cost | null {
  const c = castle(w);
  if (!c) return null;
  return CONFIG.castleUpgrade[c.level - 1] ?? null;
}

export function upgradeProblem(w: World): string | null {
  const cost = upgradeCost(w);
  if (!cost) return 'Nível máximo';
  return missing(w, cost);
}

export function upgradeCastle(w: World): string | null {
  const why = upgradeProblem(w);
  if (why) return why;
  const c = castle(w)!;
  pay(w, upgradeCost(w)!);
  c.level++;
  c.maxHp += CONFIG.castleHpPerLevel;
  c.hp += CONFIG.castleHpPerLevel;
  w.events.push({ type: 'upgrade', level: c.level });
  w.events.push({ type: 'toast', text: `Castelo no nível ${c.level}. O reino comporta ${CONFIG.castleCap[c.level - 1]} moradores.`, tone: 'gold' });
  return null;
}

/** Chama a próxima onda antes da hora: ouro extra pelo tempo que sobrou. */
export function callWave(w: World): string | null {
  if (w.waveState !== 'calm') return 'A onda já está aqui';
  const bonus = Math.floor(w.waveTimer / 3);
  w.res.ouro += bonus;
  w.waveTimer = 0;
  if (bonus > 0) w.events.push({ type: 'toast', text: `Chamou a onda antes: +${bonus} de ouro.`, tone: 'gold' });
  return null;
}

/** Tira um trabalhador de um prédio e devolve ao castelo (usado ao mover/derrubar). */
export function freeWorkersOf(w: World, b: Building): void {
  releaseFromBuilding(w, b);
}

/** Tile onde dá para mandar gente (dentro do mapa, sem rocha). */
function groundOk(w: World, x: number, z: number): number {
  const h = worldToHex(x, z);
  const t = tileAt(w, h.q, h.r);
  if (!t || t.terrain === 'rock' || t.terrain === 'water') return -1;
  return t.i;
}

export function setRally(w: World, id: number, x: number, z: number): string | null {
  const b = w.buildings.get(id);
  if (!b) return 'Não existe mais';
  if (!BUILDINGS[b.kind].recruits) return 'Este prédio não treina ninguém';
  if (groundOk(w, x, z) < 0) return 'Ninguém consegue ficar ali';
  // Só quem ainda vai ser treinado vai para lá; quem já saiu fica onde está (pedido do usuário).
  b.rally = { x, z };
  return null;
}

/** Manda as tropas escolhidas para um ponto; lá elas guardam e lutam em volta. */
export function orderMove(w: World, ids: number[], x: number, z: number): string | null {
  const goal = groundOk(w, x, z);
  if (goal < 0) return 'Ninguém consegue ir ali';
  let k = 0;
  let reach = 0;
  for (const id of ids) {
    const u = w.units.get(id);
    if (!u || u.state === 'dead' || u.kind === 'trabalhador') continue;
    if (u.tower >= 0) {
      const t = w.buildings.get(u.tower);
      if (t) t.archers = t.archers.filter((a) => a !== u.id);
      const p = t ? { x: u.x, z: u.z } : null;
      u.tower = -1;
      if (p) u.state = 'idle';
    }
    const h = worldToHex(u.x, u.z);
    const from = w.grid.has(h.q, h.r) ? w.grid.idx(h.q, h.r) : -1;
    if (from >= 0 && allyPath(w, from, goal)) reach++;
    const f = formation(x, z, k++);
    u.postX = f.x;
    u.postZ = f.z;
    u.order = 2;
    u.target = -1;
    u.path = [];
    u.goal = -1;
  }
  if (k === 0) return 'Nenhuma tropa escolhida';
  if (reach === 0) return 'Não há caminho a pé até lá (falta um portão?)';
  return null;
}

/**
 * Põe arqueiros dentro de uma torre (até encher). Quem estava em outra torre sai dela; todos
 * perdem a ordem de ficar parado e vão a pé até a torre.
 */
export function garrison(w: World, ids: number[], towerId: number): string | null {
  const t = w.buildings.get(towerId);
  if (!t || t.kind !== 'torre') return 'Não é uma torre';
  if (t.built < 1) return 'A torre ainda está em obra';
  const archers = ids.map((id) => w.units.get(id)).filter((u) => u && u.kind === 'arqueiro' && u.state !== 'dead' && u.tower !== t.id);
  if (!archers.length) return ids.some((id) => w.units.get(id)?.tower === t.id) ? null : 'Só arqueiros sobem na torre';
  const free = towerSlots() - t.archers.length;
  if (free <= 0) return `Torre cheia (${t.archers.length} de ${towerSlots()})`;
  for (const u of archers.slice(0, free)) {
    if (!u) continue;
    if (u.tower >= 0) {
      const old = w.buildings.get(u.tower);
      if (old) old.archers = old.archers.filter((a) => a !== u.id);
    }
    u.tower = t.id;
    t.archers.push(u.id);
    u.order = 0;
    u.target = -1;
    u.state = 'walk';
    u.path = [];
    u.goal = -1;
  }
  if (archers.length > free) return `A torre encheu: ${archers.length - free} ${archers.length - free === 1 ? 'arqueiro ficou' : 'arqueiros ficaram'} no chão`;
  return null;
}

function hexToWorldOf(b: Building): { x: number; z: number } {
  return hexToWorld(b.q, b.r);
}

/** Arqueiros no chão (fora de torre), do mais perto ao mais longe da torre. */
export function groundArchers(w: World, towerId: number): number[] {
  const t = w.buildings.get(towerId);
  if (!t) return [];
  const p = hexToWorldOf(t);
  return [...w.units.values()]
    .filter((u) => u.kind === 'arqueiro' && u.state !== 'dead' && u.tower < 0)
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))
    .map((u) => u.id);
}

export function callArchersProblem(w: World, towerId: number): string | null {
  const t = w.buildings.get(towerId);
  if (!t) return 'Não existe mais';
  if (t.built < 1) return 'Ainda em obra';
  if (t.archers.length >= towerSlots()) return 'Torre cheia';
  if (!groundArchers(w, towerId).length) return 'Nenhum arqueiro no chão; recrute no campo de tiro';
  return null;
}

/** Chama os arqueiros no chão mais perto para encher a torre. */
export function callArchers(w: World, towerId: number): string | null {
  const why = callArchersProblem(w, towerId);
  if (why) return why;
  const t = w.buildings.get(towerId)!;
  garrison(w, groundArchers(w, towerId).slice(0, towerSlots() - t.archers.length), towerId);
  return null;
}

/** Recolhe os trabalhadores para dentro do castelo, ou libera de volta ao trabalho. */
export function toggleShelter(w: World): string | null {
  if (!castle(w)) return 'Sem castelo';
  w.shelter = !w.shelter;
  if (!w.shelter) {
    for (const u of w.units.values()) {
      if (u.kind !== 'trabalhador' || u.state === 'dead') continue;
      if (u.state === 'shelter') {
        // Quem tinha corrido sozinho para uma casa sai dela; os outros, do castelo.
        const h = u.hideIn !== undefined ? w.buildings.get(u.hideIn) : undefined;
        const c = h ? hexToWorld(h.q, h.r) : null;
        const p = c && h!.kind !== 'castelo' ? { x: c.x, z: c.z + 0.9 } : castleDoor(w);
        u.x = p.x;
        u.z = p.z;
      }
      u.hideIn = undefined;
      u.hideT = undefined;
      u.state = 'idle';
      u.path = [];
      u.goal = -1;
    }
  } else {
    for (const u of w.units.values()) {
      if (u.kind !== 'trabalhador' || u.state === 'dead') continue;
      u.path = [];
      u.goal = -1;
      if (u.state === 'work') u.state = 'walk';
      // Quem corria sozinho para uma casa passa a ir para o castelo (quem já está escondido fica).
      if (u.state !== 'shelter') {
        u.hideIn = undefined;
        u.hideT = undefined;
      }
    }
  }
  w.events.push({
    type: 'toast',
    text: w.shelter ? 'Os trabalhadores estão indo para dentro do castelo.' : 'Os trabalhadores voltaram ao trabalho.',
    tone: w.shelter ? 'warn' : 'good',
  });
  return null;
}

/** Escolhe a bênção oferecida no relatório (e fecha o relatório). */
export function chooseBlessing(w: World, id: BlessingId | null): string | null {
  const r = w.report;
  if (!r) return 'Nenhum relatório aberto';
  if (r.choices.length > 0) {
    if (!id || !r.choices.includes(id)) return 'Escolha uma das bênçãos';
    const before = { soldierHp: w.mods.soldierHp, wallHp: w.mods.wallHp };
    BLESSINGS[id].apply(w.mods);
    w.blessings.push(id);
    // Vida a mais vale também para quem já existe.
    const ks = w.mods.soldierHp / before.soldierHp;
    if (ks !== 1)
      for (const u of w.units.values())
        if (u.kind === 'soldado' && u.state !== 'dead') {
          u.maxHp = Math.round(u.maxHp * ks);
          u.hp = Math.round(u.hp * ks);
        }
    const kw = w.mods.wallHp / before.wallHp;
    if (kw !== 1)
      for (const b of w.buildings.values())
        if (b.kind === 'muralha' || b.kind === 'portao') {
          b.maxHp = Math.round(b.maxHp * kw);
          b.hp = Math.round(b.hp * kw);
        }
    w.events.push({ type: 'toast', text: `Bênção: ${BLESSINGS[id].name}.`, tone: 'gold' });
  }
  w.report = null;
  return null;
}

/** Conserta tudo o que está estragado (muralhas, portões e prédios prontos). */
export function repairAllCost(w: World): Cost {
  const out: Cost = {};
  for (const b of w.buildings.values()) {
    if (b.built < 1 || b.hp >= b.maxHp) continue;
    for (const [r, v] of Object.entries(repairCost(w, b)) as [Res, number][]) out[r] = (out[r] ?? 0) + v;
  }
  return out;
}

export function repairAll(w: World): string | null {
  const cost = repairAllCost(w);
  if (Object.keys(cost).length === 0) return 'Nada estragado';
  const why = missing(w, cost);
  if (why) return why;
  pay(w, cost);
  for (const b of w.buildings.values()) if (b.built >= 1) b.hp = b.maxHp;
  return null;
}

export type ForgeLine = 'armas' | 'armaduras' | 'flechas';

export function forgeCost(w: World, line: ForgeLine): Cost | null {
  return CONFIG.forge.cost[w.forge[line]] ?? null;
}

export function forgeProblem(w: World, line: ForgeLine): string | null {
  let ok = false;
  for (const b of w.buildings.values()) if (b.kind === 'forja' && b.built >= 1) ok = true;
  if (!ok) return 'Precisa de uma forja pronta';
  const cost = forgeCost(w, line);
  if (!cost) return 'Nível máximo';
  return missing(w, cost);
}

/** Melhoria da forja: vale para todos, inclusive quem já existe. */
export function forgeUpgrade(w: World, line: ForgeLine): string | null {
  const why = forgeProblem(w, line);
  if (why) return why;
  pay(w, forgeCost(w, line)!);
  const before = 1 + CONFIG.forge.step.armaduras * w.forge.armaduras;
  w.forge[line]++;
  if (line === 'armaduras') {
    const k = (1 + CONFIG.forge.step.armaduras * w.forge.armaduras) / before;
    for (const u of w.units.values())
      if (u.kind !== 'trabalhador' && u.state !== 'dead') {
        u.maxHp = Math.round(u.maxHp * k);
        u.hp = Math.round(u.hp * k);
      }
  }
  const name = { armas: 'Armas', armaduras: 'Armaduras', flechas: 'Flechas' }[line];
  w.events.push({ type: 'toast', text: `${name} melhoradas na forja (nível ${w.forge[line]}).`, tone: 'gold' });
  return null;
}

export function igniteProblem(w: World, b: Building): string | null {
  if (b.kind !== 'piche') return 'Só o fosso de piche acende';
  if (b.built < 1) return 'Ainda em obra';
  if (b.burn > 0) return 'Já está aceso';
  return missing(w, CONFIG.pitch.igniteCost);
}

/** Acende o fosso de piche: queima quem estiver em cima por alguns segundos. */
export function ignitePitch(w: World, id: number): string | null {
  const b = w.buildings.get(id);
  if (!b) return 'Não existe mais';
  const why = igniteProblem(w, b);
  if (why) return why;
  pay(w, CONFIG.pitch.igniteCost);
  b.burn = CONFIG.pitch.burn;
  return null;
}

// ---------------------------------------------------------------- heróis (Etapa 14)

/** O herói desse tipo no reino (de pé ou desmaiado), se houver. */
export function heroOf(w: World, kind: HeroKind) {
  for (const u of w.units.values()) if (u.kind === kind && u.state !== 'dead') return u;
  return undefined;
}

/** Preço do próximo herói: +50% para cada herói que o reino já tem. */
export function heroCost(w: World): Cost {
  const n = HERO_KINDS.filter((k) => heroOf(w, k)).length;
  const f = Math.pow(CONFIG.heroes.growth, n);
  const out: Cost = {};
  for (const r of RES_ORDER) {
    const v = CONFIG.heroes.cost[r];
    if (v) out[r] = Math.round((v * f) / 5) * 5;
  }
  return out;
}

export function heroProblem(w: World, kind: HeroKind): string | null {
  const c = castle(w);
  if (!c) return 'Sem castelo';
  const h = heroOf(w, kind);
  if (h) return (h.downT ?? 0) > 0 ? `Desmaiado: volta em ${Math.ceil(h.downT ?? 0)} s` : 'Já está no reino';
  if (c.level < CONFIG.heroes.castleLevel) return `Precisa do castelo nível ${CONFIG.heroes.castleLevel}`;
  return missing(w, heroCost(w));
}

/** Compra um herói: nasce na porta do castelo, nível 1. */
export function buyHero(w: World, kind: HeroKind): string | null {
  const why = heroProblem(w, kind);
  if (why) return why;
  pay(w, heroCost(w));
  const p = castleDoor(w);
  const u = addUnit(w, kind, p.x, p.z);
  const hp = Math.round(UNITS[kind].hp * (1 + CONFIG.forge.step.armaduras * w.forge.armaduras));
  u.hp = hp;
  u.maxHp = hp;
  u.xp = 0;
  u.level = 1;
  u.downT = 0;
  u.specialT = 2;
  u.name = UNITS[kind].name;
  w.events.push({ type: 'heroBack', x: u.x, z: u.z });
  w.events.push({ type: 'toast', text: `${UNITS[kind].name} chegou ao reino!`, tone: 'gold' });
  return null;
}
