import { describe, expect, it, onTestFinished } from 'vitest';
import {
  BUILDINGS,
  CONFIG,
  addBuilding,
  buildCost,
  castle,
  createWorld,
  hexDist,
  hexToWorld,
  housing,
  placeProblem,
  population,
  orderMove,
  recruit,
  addUnit,
  build,
  chooseBlessing,
  forgeUpgrade,
  ignitePitch,
  loadWorld,
  modsForWave,
  waveSizeWithMods,
  repairAll,
  saveWorld,
  setRally,
  garrison,
  callArchers,
  step,
  toggleShelter,
  troops,
  waveSize,
  monsterHpMul,
  workers,
} from '../src/sim/index.ts';
import { CROPS, DIRS, MONSTERS, UNITS, buyHero, cropOf, heroCost, heroOf, heroProblem } from '../src/sim/index.ts';
import { demolish, moveBuilding, moveProblem, packTime, recruitProblem, tileAt } from '../src/sim/index.ts';
import { allyPath, fullStock, regrow, replant, replantProblem, sourceOf, stage, worldToHex } from '../src/sim/index.ts';
import { MODES, saveInfo, waveInterval } from '../src/sim/index.ts';
import { computeFlow, damageMonster, legacyRifts, openRifts, sideName } from '../src/sim/index.ts';
import { allWallsProblem, themeForWave, towerRange, towerUpgradeProblem, trade, tradeDeal, tradeProblem, upgradeAllWalls, upgradeTower, upgradeWall } from '../src/sim/index.ts';
import type { Tile } from '../src/sim/index.ts';
import { TIP_IDS, pickTip } from '../src/game/guide.ts';
import type { Monster, MonsterKind, World } from '../src/sim/index.ts';

function run(w: World, seconds: number, stop?: (w: World) => boolean): void {
  for (let i = 0; i < seconds * CONFIG.tps; i++) {
    step(w);
    w.events.length = 0;
    if (w.lost || stop?.(w)) return;
  }
}

function calm(w: World): void {
  w.waveTimer = 1e9;
}

function freeGrass(w: World, n: number, minDist = 2, maxDist = 6): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = [];
  for (const t of w.list) {
    if (out.length >= n) break;
    const d = hexDist(t.q, t.r, 0, 0);
    if (d < minDist || d > maxDist || t.terrain !== 'grass' || t.b >= 0) continue;
    out.push({ q: t.q, r: t.r });
  }
  return out;
}

describe('começo da partida', () => {
  it('castelo no centro, quatro trabalhadores e caminho da fenda até o castelo', () => {
    const w = createWorld(3);
    expect(castle(w)?.q).toBe(0);
    expect(castle(w)?.hp).toBe(BUILDINGS.castelo.hp);
    expect(population(w)).toBe(CONFIG.startWorkers);
    expect(housing(w)).toBe(12);
    step(w);
    for (const i of w.rifts) expect(Number.isFinite(w.flowDist[i]!)).toBe(true);
  });

  it('os trabalhadores vão sozinhos para a fazenda e ela produz', () => {
    const w = createWorld(4);
    calm(w);
    w.res.comida = 100;
    run(w, 30);
    const farm = [...w.buildings.values()].find((b) => b.kind === 'fazenda')!;
    expect(farm.workers.length).toBe(2);
    const before = w.res.comida;
    run(w, 60);
    // Produz mais do que a vila come (2 × 9/min contra ~12/min de consumo no máximo).
    expect(w.res.comida).toBeGreaterThan(before - 15);
    for (const u of w.units.values()) {
      expect(Number.isFinite(u.x)).toBe(true);
      expect(Number.isFinite(u.z)).toBe(true);
    }
    expect(farm.workers.every((id) => w.units.get(id)?.state === 'work')).toBe(true);
  });
});

describe('trabalhadores e moradia', () => {
  it('chegam sozinhos até encher as casas e param', () => {
    const w = createWorld(5);
    calm(w);
    w.res.comida = 1000;
    run(w, 400);
    expect(population(w)).toBe(housing(w));
  });

  it('o nível do castelo é o teto, mesmo com casa sobrando', () => {
    const w = createWorld(6);
    calm(w);
    w.res.comida = 5000;
    for (const p of freeGrass(w, 8)) addBuilding(w, 'casa', p.q, p.r, 1);
    expect(housing(w)).toBeGreaterThan(CONFIG.castleCap[0]!);
    run(w, 700);
    expect(population(w)).toBe(CONFIG.castleCap[0]);
  });

  it('sem comida ninguém chega', () => {
    const w = createWorld(7);
    calm(w);
    w.res.comida = 0;
    for (const b of [...w.buildings.values()]) if (b.kind === 'fazenda') w.buildings.delete(b.id);
    run(w, 120);
    expect(population(w)).toBe(CONFIG.startWorkers);
  });

  it('na serraria e na pedreira, trabalham virados para a floresta e a rocha', () => {
    const w = createWorld(5);
    calm(w);
    for (const [kind, terrain] of [['serraria', 'forest'], ['pedreira', 'rock']] as const) {
      const t = w.list.find((t) => t.terrain === 'grass' && t.b < 0 && hexDist(t.q, t.r, 0, 0) < 9 && DIRS.some(([dq, dr]) => w.list.find((n) => n.q === t.q + dq && n.r === t.r + dr)?.terrain === terrain))!;
      addBuilding(w, kind, t.q, t.r, 1);
      for (let i = 0; i < 2; i++) addUnit(w, 'trabalhador', 0, 1);
    }
    run(w, 60);
    let n = 0;
    for (const b of w.buildings.values()) {
      if (b.kind !== 'serraria' && b.kind !== 'pedreira') continue;
      const terrain = b.kind === 'serraria' ? 'forest' : 'rock';
      for (const id of b.workers) {
        const u = w.units.get(id)!;
        // Quem saiu para levar a madeira ou a pedra ao castelo (2026-11-10) não conta aqui.
        if (u.trip) continue;
        expect(u.state).toBe('work');
        // Um passo à frente cai num ladrilho do recurso.
        const ahead = { x: u.x + Math.sin(u.facing) * 1.1, z: u.z + Math.cos(u.facing) * 1.1 };
        const tile = w.list.find((t) => {
          const c = hexToWorld(t.q, t.r);
          return Math.hypot(c.x - ahead.x, c.z - ahead.z) < 1;
        });
        expect(tile?.terrain).toBe(terrain);
        n++;
      }
      const [a, c] = b.workers.map((id) => w.units.get(id)!);
      if (!a!.trip && !c!.trip) expect(Math.hypot(a!.x - c!.x, a!.z - c!.z)).toBeGreaterThan(0.5);
    }
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it('cada casa nova custa 10% a mais', () => {
    const w = createWorld(8);
    const c0 = buildCost(w, 'casa').madeira!;
    const [a, b] = freeGrass(w, 2);
    expect(build(w, 'casa', a!.q, a!.r)).toBeNull();
    const c1 = buildCost(w, 'casa').madeira!;
    expect(build(w, 'casa', b!.q, b!.r)).toBeNull();
    const c2 = buildCost(w, 'casa').madeira!;
    expect(c1).toBe(Math.round(c0 * 1.1));
    expect(c2).toBe(Math.round(c0 * 1.21));
  });
});

describe('recrutas', () => {
  it('recrutar no quartel transforma um trabalhador em soldado', () => {
    const w = createWorld(9);
    calm(w);
    const [p] = freeGrass(w, 1);
    const q = addBuilding(w, 'quartel', p!.q, p!.r, 1);
    w.res.ferro = 100;
    const pop = population(w);
    expect(recruit(w, q.id)).toBeNull();
    run(w, 9);
    const kinds = [...w.units.values()].map((u) => u.kind);
    expect(kinds.filter((k) => k === 'soldado').length).toBe(1);
    expect(population(w)).toBeGreaterThanOrEqual(pop);
  });
});

describe('tropas sem teto, ponto de encontro e ordens (Etapa 2)', () => {
  it('a tropa sai do teto: a vaga do trabalhador volta a ser preenchida', () => {
    const w = createWorld(13);
    calm(w);
    w.res.comida = 2000;
    w.res.ferro = 500;
    run(w, 200);
    expect(workers(w)).toBe(housing(w));
    const [p] = freeGrass(w, 1);
    const q = addBuilding(w, 'quartel', p!.q, p!.r, 1);
    expect(recruit(w, q.id)).toBeNull();
    expect(recruit(w, q.id)).toBeNull();
    run(w, 60);
    expect(troops(w)).toBe(2);
    expect(workers(w)).toBe(housing(w));
    expect(population(w)).toBe(housing(w) + 2);
  });

  it('quem sai do quartel espera no ponto de encontro', () => {
    const w = createWorld(14);
    calm(w);
    w.res.ferro = 100;
    const [p, r] = freeGrass(w, 2, 2, 3);
    const q = addBuilding(w, 'quartel', p!.q, p!.r, 1);
    const target = hexToWorld(r!.q, r!.r);
    expect(setRally(w, q.id, target.x, target.z)).toBeNull();
    recruit(w, q.id);
    run(w, 30);
    const s = [...w.units.values()].find((u) => u.kind === 'soldado')!;
    // Fica no lugar dele na roda em volta do ponto (a roda tem até ~1 m de raio).
    expect(Math.hypot(s.postX - target.x, s.postZ - target.z)).toBeLessThan(1.1);
    expect(Math.hypot(s.x - s.postX, s.z - s.postZ)).toBeLessThan(0.4);
  });

  it('mudar o ponto de encontro não chama quem já saiu', () => {
    const w = createWorld(16);
    calm(w);
    w.res.ferro = 100;
    const [p, r] = freeGrass(w, 2, 2, 4);
    const q = addBuilding(w, 'quartel', p!.q, p!.r, 1);
    recruit(w, q.id);
    run(w, 20);
    const s = [...w.units.values()].find((u) => u.kind === 'soldado')!;
    const before = { x: s.x, z: s.z };
    const target = hexToWorld(r!.q, r!.r);
    expect(setRally(w, q.id, target.x, target.z)).toBeNull();
    run(w, 20);
    expect(Math.hypot(s.x - before.x, s.z - before.z)).toBeLessThan(0.3);
    // O próximo recruta vai para o ponto novo.
    recruit(w, q.id);
    run(w, 30);
    const novo = [...w.units.values()].find((u) => u.kind === 'soldado' && u.id !== s.id)!;
    // Em roda em volta do ponto (até 0,9 m do centro).
    expect(Math.hypot(novo.x - target.x, novo.z - target.z)).toBeLessThan(1);
  });

  it('as tropas escolhidas vão até o ponto marcado', () => {
    const w = createWorld(15);
    calm(w);
    w.res.ferro = 100;
    const [p, r] = freeGrass(w, 2, 2, 4);
    const q = addBuilding(w, 'quartel', p!.q, p!.r, 1);
    recruit(w, q.id);
    recruit(w, q.id);
    run(w, 20);
    const ids = [...w.units.values()].filter((u) => u.kind === 'soldado').map((u) => u.id);
    expect(ids.length).toBe(2);
    const target = hexToWorld(r!.q, r!.r);
    expect(orderMove(w, ids, target.x, target.z)).toBeNull();
    run(w, 30);
    for (const id of ids) {
      const u = w.units.get(id)!;
      expect(Math.hypot(u.x - target.x, u.z - target.z)).toBeLessThan(0.8);
    }
  });
});

describe('recolher no castelo', () => {
  it('os trabalhadores entram no castelo, param de produzir e voltam ao liberar', () => {
    const w = createWorld(17);
    calm(w);
    w.res.comida = 500;
    run(w, 30);
    const farm = [...w.buildings.values()].find((b) => b.kind === 'fazenda')!;
    expect(farm.workers.every((id) => w.units.get(id)?.state === 'work')).toBe(true);
    const antes = [...w.units.values()].filter((u) => u.kind === 'trabalhador').map((u) => u.id);
    expect(toggleShelter(w)).toBeNull();
    run(w, 30);
    // Quem já estava entrou; quem chega durante o recolhimento vai entrando também.
    expect(antes.every((id) => w.units.get(id)?.state === 'shelter')).toBe(true);
    expect([...w.units.values()].some((u) => u.state === 'work')).toBe(false);
    const food = w.res.comida;
    run(w, 30);
    expect(w.res.comida).toBeLessThan(food);
    expect(toggleShelter(w)).toBeNull();
    run(w, 40);
    expect(farm.workers.every((id) => w.units.get(id)?.state === 'work')).toBe(true);
  });
});

describe('fim de onda (Etapa 4)', () => {
  it('cada onda resistida abre um relatório; a cada 4, com três bênçãos', () => {
    const w = createWorld(18);
    w.waveTimer = 0.1;
    run(w, 240, (ww) => ww.report !== null);
    expect(w.report?.wave).toBe(1);
    expect(w.report?.choices.length).toBe(0);
    expect(w.report?.kills).toBeGreaterThan(0);
    expect(chooseBlessing(w, null)).toBeNull();
    expect(w.report).toBeNull();
    w.wave = 3;
    w.waveTimer = 0.1;
    // Sem defesa nenhuma o castelo cai na onda 4; aqui ele aguenta para o teste chegar ao relatório.
    w.mods.castleDmg = 6;
    castle(w)!.maxHp = castle(w)!.hp = 1e6;
    run(w, 240, (ww) => ww.report !== null);
    expect(w.report?.wave).toBe(4);
    expect(w.report?.choices.length).toBe(3);
    expect(chooseBlessing(w, null)).not.toBeNull();
  });

  it('as bênçãos mudam o jogo, inclusive o que já existe', () => {
    const w = createWorld(19);
    const [p] = freeGrass(w, 1);
    const wall = addBuilding(w, 'muralha', p!.q, p!.r, 1);
    w.report = { kills: 0, fallen: [], wallsLost: 0, buildingsLost: 0, prod: { comida: 0, madeira: 0, pedra: 0, ferro: 0, cristal: 0, ouro: 0 }, wave: 4, gold: 0, choices: ['muralhasGrossas', 'brasa', 'coroa'] };
    expect(chooseBlessing(w, 'muralhasGrossas')).toBeNull();
    expect(wall.maxHp).toBe(Math.round(BUILDINGS.muralha.hp * 1.4));
    expect(w.blessings).toEqual(['muralhasGrossas']);
  });

  it('reparar tudo cobra e conserta', () => {
    const w = createWorld(20);
    const c = castle(w)!;
    c.hp = c.maxHp - 80;
    const pedra = w.res.pedra;
    expect(repairAll(w)).toBeNull();
    expect(c.hp).toBe(c.maxHp);
    expect(w.res.pedra).toBeLessThan(pedra);
    expect(repairAll(w)).not.toBeNull();
  });

  it('quem cai entra no relatório com nome', () => {
    const w = createWorld(21);
    // Sem fuga (2026-11-09), para o aldeão longe do castelo cair mesmo.
    const flee = CONFIG.flee.radius;
    CONFIG.flee.radius = 0;
    onTestFinished(() => {
      CONFIG.flee.radius = flee;
    });
    for (const b of [...w.buildings.values()]) if (b.kind === 'fazenda') b.workers = [];
    const u = [...w.units.values()][0]!;
    u.x = 0;
    u.z = -20;
    u.job = -1;
    w.waveTimer = 0.1;
    castle(w)!.cd = 1e9;
    run(w, 200, () => w.stats.fallen.length > 0 || w.report !== null);
    const fallen = w.report ? w.report.fallen : w.stats.fallen;
    expect(fallen.length).toBeGreaterThan(0);
    expect(fallen[0]!.text).toContain(fallen[0]!.name);
  });
});

describe('onde dá para construir', () => {
  it('mina só em veio, serraria só ao lado da floresta', () => {
    const w = createWorld(10);
    const ore = w.list.find((t) => t.terrain === 'ore' && t.b < 0 && hexDist(t.q, t.r, 0, 0) < w.grid.R)!;
    expect(placeProblem(w, 'mina', ore.q, ore.r)).toBeNull();
    const [g] = freeGrass(w, 1, 2, 3);
    expect(placeProblem(w, 'mina', g!.q, g!.r)).not.toBeNull();
    const nearForest = w.list.find(
      (t) => t.terrain === 'grass' && t.b < 0 && hexDist(t.q, t.r, 0, 0) < w.grid.R && placeProblem(w, 'serraria', t.q, t.r) === null,
    );
    expect(nearForest).toBeTruthy();
  });
});

describe('ondas', () => {
  it('crescem até o teto e trazem monstros novos', () => {
    expect(waveSize(1)).toEqual({ esqueleto: 8, esqueletoGuerreiro: 0, lobisomem: 0, orc: 0, acumulador: 0, bruto: 0, morcego: 0, bruxa: 0, troll: 0, necromante: 0, vampiro: 0, golem: 0, golemOssos: 0, golemMusgo: 0 });
    const w8 = waveSize(8);
    expect(w8.bruto).toBe(1);
    expect(w8.orc).toBeGreaterThan(0);
    const total = (n: number) => Object.values(waveSize(n)).reduce((a, b) => a + b, 0);
    expect(total(30)).toBeGreaterThan(total(10));
  });

  it('da onda 20 em diante crescem mais devagar e da 30 em diante param (2026-11-09)', () => {
    const W = CONFIG.waves;
    const total = (n: number) => Object.values(waveSize(n)).reduce((a, b) => a + b, 0);
    // Até a 20, três a mais por onda; depois, um e meio.
    expect(total(19) - total(18)).toBe(3);
    expect(total(26) - total(24)).toBe(3);
    expect(monsterHpMul(21) / monsterHpMul(20)).toBeCloseTo(W.hpGrowthLate, 6);
    // Teto: a 31 e a 44 (sem chefe) são iguais à onda do teto na quantidade e na mistura.
    const cap = waveSize(W.capFrom);
    expect(waveSize(31)).toEqual({ ...cap, golemOssos: 0 });
    expect(waveSize(44)).toEqual(waveSize(31));
    expect(monsterHpMul(80)).toBe(monsterHpMul(W.capFrom));
    // Os chefes continuam vindo depois do teto, em rodízio (gelo, ossos, musgo), com a vida em linha.
    expect(waveSize(45).golemMusgo).toBe(1);
    expect(waveSize(60).golem).toBe(1);
    expect(waveSize(75).golemOssos).toBe(1);
    expect(monsterHpMul(15, 'normal', true)).toBeCloseTo(1 + W.bossGrowth * 14, 6);
    expect(monsterHpMul(60, 'normal', true)).toBe(monsterHpMul(W.capFrom, 'normal', true));
    expect(monsterHpMul(15, 'normal', true)).toBeLessThan(monsterHpMul(15));
  });

  it('ao vencer a onda do teto, avisa que a horda não cresce mais', () => {
    const w = createWorld(12);
    w.wave = CONFIG.waves.capFrom - 1;
    w.waveTimer = 0.01;
    step(w);
    expect(w.wave).toBe(CONFIG.waves.capFrom);
    w.spawnQueue = [];
    w.monsters.clear();
    w.waveState = 'attack';
    w.events.length = 0;
    step(w);
    expect(w.events.some((e) => e.type === 'toast' && e.text.startsWith('A horda chegou à força máxima'))).toBe(true);
  });

  it('o castelo sozinho aguenta a primeira onda', () => {
    const w = createWorld(11);
    w.waveTimer = 0.1;
    run(w, 240, (ww) => ww.wave === 1 && ww.waveState === 'calm');
    expect(w.lost).toBe(false);
    expect(w.wave).toBe(1);
    expect(w.waveState).toBe('calm');
  });

  it('com o castelo cercado, a horda bate na muralha antes de chegar nele', () => {
    const w = createWorld(12);
    for (const t of w.list) {
      if (hexDist(t.q, t.r, 0, 0) !== 3 || t.terrain === 'rock') continue;
      if (t.b >= 0) w.buildings.delete(t.b);
      t.terrain = 'grass';
      t.b = -1;
      addBuilding(w, 'muralha', t.q, t.r, 1);
    }
    step(w);
    for (const i of w.rifts) expect(Number.isFinite(w.flowDist[i]!)).toBe(true);
    const wallHp = () => [...w.buildings.values()].filter((b) => b.kind === 'muralha').reduce((a, b) => a + b.hp, 0);
    const before = wallHp();
    const c = castle(w)!;
    c.cd = 1e9; // o castelo não atira, para a horda chegar
    w.waveTimer = 0.1;
    run(w, 90, () => wallHp() < before);
    expect(wallHp()).toBeLessThan(before);
    expect(castle(w)!.hp).toBe(castle(w)!.maxHp);
    // Sem defesa nenhuma, a muralha cai e o castelo vem depois.
    run(w, 120, (ww) => castle(ww)!.hp < castle(ww)!.maxHp);
    expect(castle(w)!.hp).toBeLessThan(castle(w)!.maxHp);
  });
});

describe('tropas e prédios novos (Etapa 5)', () => {
  function troop(w: World, kind: 'mago' | 'clerigo' | 'cavaleiro' | 'engenheiro' | 'soldado', x: number, z: number) {
    const u = addUnit(w, kind, x, z);
    u.postX = x;
    u.postZ = z;
    return u;
  }
  function monster(w: World, x: number, z: number, hp = 100) {
    const m = { id: w.nextId++, kind: 'esqueleto' as const, x, z, hp, maxHp: hp, speed: 0, dmg: 0, cd: 99, state: 'walk' as const, facing: 0, deadT: 0, burnT: 99, healT: 1, summonT: 99, owner: -1 };
    w.monsters.set(m.id, m);
    return m;
  }

  it('torre do mago e estábulo pedem o castelo nível 2', () => {
    const w = createWorld(30);
    w.res.pedra = 500;
    w.res.cristal = 50;
    const [p] = freeGrass(w, 1);
    expect(build(w, 'torreMago', p!.q, p!.r)).toBe('Precisa do castelo nível 2');
    castle(w)!.level = 2;
    expect(build(w, 'torreMago', p!.q, p!.r)).toBeNull();
  });

  it('mina em veio azul dá cristal', () => {
    const w = createWorld(31);
    calm(w);
    const vein = w.list.find((t) => t.terrain === 'crystal' && hexDist(t.q, t.r, 0, 0) < w.grid.R)!;
    expect(vein).toBeTruthy();
    addBuilding(w, 'mina', vein.q, vein.r, 1);
    w.res.comida = 500;
    run(w, 120);
    expect(w.res.cristal).toBeGreaterThan(0);
  });

  it('o mago acerta em área e gasta cristal', () => {
    const w = createWorld(32);
    calm(w);
    castle(w)!.cd = 1e9;
    w.res.cristal = 10;
    troop(w, 'mago', 6, 6);
    const ms = [monster(w, 10, 6), monster(w, 10.5, 6.3), monster(w, 9.6, 6.4)];
    run(w, 1);
    for (const m of ms) expect(m.hp).toBeLessThan(100);
    expect(w.res.cristal).toBeLessThan(10);
  });

  it('o clérigo cura quem está ferido perto', () => {
    const w = createWorld(33);
    calm(w);
    const s = troop(w, 'soldado', 6, 6);
    s.hp = 20;
    troop(w, 'clerigo', 7, 6);
    run(w, 3);
    expect(s.hp).toBeGreaterThan(20);
  });

  it('o engenheiro conserta a muralha gastando pedra', () => {
    const w = createWorld(34);
    calm(w);
    const [p] = freeGrass(w, 1, 3, 4);
    const wall = addBuilding(w, 'muralha', p!.q, p!.r, 1);
    wall.hp = 50;
    const c = hexToWorld(p!.q, p!.r);
    troop(w, 'engenheiro', c.x + 1.5, c.z);
    const stone = w.res.pedra;
    run(w, 20);
    expect(wall.hp).toBeGreaterThan(150);
    expect(w.res.pedra).toBeLessThan(stone);
  });

  it('a forja melhora quem já existe', () => {
    const w = createWorld(35);
    const [p] = freeGrass(w, 1);
    addBuilding(w, 'forja', p!.q, p!.r, 1);
    w.res.ferro = 500;
    w.res.ouro = 500;
    const s = troop(w, 'soldado', 6, 6);
    const hp = s.maxHp;
    expect(forgeUpgrade(w, 'armaduras')).toBeNull();
    expect(s.maxHp).toBe(Math.round(hp * 1.2));
    expect(w.forge.armaduras).toBe(1);
  });
});

describe('monstros novos e chefes (Etapa 6)', () => {
  function monster(w: World, kind: MonsterKind, x: number, z: number) {
    const def = MONSTERS[kind];
    const m = { id: w.nextId++, kind, x, z, hp: def.hp, maxHp: def.hp, speed: def.speed, dmg: def.dmg, cd: 0, state: 'walk' as const, facing: 0, deadT: 0, burnT: 99, healT: 0, summonT: 0, owner: -1 };
    w.monsters.set(m.id, m);
    return m;
  }

  it('as ondas trazem os monstros novos e um chefe a cada 15', () => {
    expect(waveSize(8).morcego).toBeGreaterThan(0);
    expect(waveSize(9).bruxa).toBe(1);
    expect(waveSize(12).troll).toBe(1);
    expect(waveSize(16).necromante).toBe(1);
    expect(waveSize(15).golem).toBe(1);
    expect(waveSize(30).golemOssos).toBe(1);
    expect(waveSize(14).golem + waveSize(14).golemOssos).toBe(0);
  });

  it('o golem de gelo não sente flecha; o de ossos não sente magia', () => {
    const w = createWorld(40);
    calm(w);
    const g = monster(w, 'golem', 3, 3);
    g.speed = 0;
    const before = g.hp;
    run(w, 3);
    expect(g.hp).toBe(before);
  });

  it('o morcego voa por cima da muralha direto para uma casa', () => {
    const w = createWorld(41);
    calm(w);
    castle(w)!.cd = 1e9;
    for (const t of w.list) {
      if (hexDist(t.q, t.r, 0, 0) !== 4 || t.terrain === 'rock') continue;
      if (t.b >= 0) w.buildings.delete(t.b);
      t.terrain = 'grass';
      t.b = -1;
      addBuilding(w, 'muralha', t.q, t.r, 1);
    }
    const housesHp = () => [...w.buildings.values()].filter((b) => b.kind === 'casa').reduce((a, b) => a + b.hp, 0);
    const hp = housesHp();
    monster(w, 'morcego', 0, -14);
    run(w, 20);
    expect(housesHp()).toBeLessThan(hp);
  });

  it('o morcego passa pela mina junto das fendas e vai para as casas', () => {
    const w = createWorld(43);
    calm(w);
    castle(w)!.cd = 1e9;
    // Uma mina lá no norte, colada no ponto onde o morcego aparece.
    const t = w.list.find((x) => x.b < 0 && x.terrain !== 'rift' && hexDist(x.q, x.r, 0, 0) >= w.grid.R - 2 && x.r < 0)!;
    t.terrain = 'ore';
    const mine = addBuilding(w, 'mina', t.q, t.r, 1);
    const p = hexToWorld(t.q, t.r);
    const bat = monster(w, 'morcego', p.x, p.z + 0.5);
    run(w, 3);
    expect(mine.hp).toBe(mine.maxHp);
    // Voou para longe da mina, rumo ao castelo e às casas.
    expect(Math.hypot(bat.x, bat.z)).toBeLessThan(Math.hypot(p.x, p.z) - 3);
  });

  it('a bruxa cura a horda; o necromante levanta esqueletos', () => {
    const w = createWorld(42);
    calm(w);
    castle(w)!.cd = 1e9;
    const b = monster(w, 'bruxa', 0, -20);
    b.speed = 0;
    const o = monster(w, 'orc', 1, -20);
    o.speed = 0;
    o.hp = 10;
    const n = monster(w, 'necromante', -8, -18);
    n.speed = 0;
    step(w);
    expect(o.hp).toBeGreaterThan(10);
    run(w, 1);
    expect([...w.monsters.values()].some((m) => m.owner === n.id)).toBe(true);
  });
});

describe('salvar e continuar (Etapa 7)', () => {
  it('a partida carregada continua igual à original', () => {
    const w = createWorld(50);
    w.waveTimer = 5;
    run(w, 40);
    const json = saveWorld(w);
    const b = loadWorld(json)!;
    expect(b).not.toBeNull();
    expect(b.wave).toBe(w.wave);
    expect(b.buildings.size).toBe(w.buildings.size);
    expect(b.units.size).toBe(w.units.size);
    expect(b.monsters.size).toBe(w.monsters.size);
    run(w, 20);
    run(b, 20);
    // Mesmo sorteio e mesmos passos: o mesmo resultado.
    expect(b.kills).toBe(w.kills);
    expect(Math.round(b.res.comida)).toBe(Math.round(w.res.comida));
  });

  it('mapa maior: o raio vai no jogo salvo, e o salvo antigo (sem raio) abre com 13', () => {
    const w = createWorld(51);
    expect(w.grid.R).toBe(CONFIG.mapRadius);
    expect(loadWorld(saveWorld(w))!.grid.R).toBe(CONFIG.mapRadius);
    const old = createWorld(51, 13);
    const json = JSON.parse(saveWorld(old)) as Record<string, unknown>;
    delete json.R;
    const b = loadWorld(JSON.stringify(json))!;
    expect(b.grid.R).toBe(13);
    expect(b.list.length).toBe(old.list.length);
  });
});

describe('defesas novas e ondas variadas (Etapa 9)', () => {
  function monster(w: World, kind: MonsterKind, x: number, z: number, speed = 0) {
    const def = MONSTERS[kind];
    const m = { id: w.nextId++, kind, x, z, hp: def.hp, maxHp: def.hp, speed, dmg: def.dmg, cd: 99, state: 'walk' as const, facing: 0, deadT: 0, burnT: 99, healT: 99, summonT: 99, owner: -1 };
    w.monsters.set(m.id, m);
    return m;
  }

  it('a catapulta pede a forja e acerta o golem que a flecha não fere', () => {
    const w = createWorld(60);
    calm(w);
    castle(w)!.cd = 1e9;
    w.res.ferro = 100;
    const [p, f] = freeGrass(w, 2, 2, 3);
    expect(build(w, 'catapulta', p!.q, p!.r)).toBe('Precisa de uma forja pronta');
    addBuilding(w, 'forja', f!.q, f!.r, 1);
    const cat = addBuilding(w, 'catapulta', p!.q, p!.r, 1);
    const c = hexToWorld(cat.q, cat.r);
    const g = monster(w, 'golem', c.x + 6, c.z);
    run(w, 1);
    expect(g.hp).toBeLessThan(MONSTERS.golem.hp);
  });

  it('piche deixa a horda lenta e, aceso, queima', () => {
    const w = createWorld(61);
    calm(w);
    castle(w)!.cd = 1e9;
    const [p] = freeGrass(w, 1, 3, 4);
    const pitch = addBuilding(w, 'piche', p!.q, p!.r, 1);
    const c = hexToWorld(p!.q, p!.r);
    const m = monster(w, 'orc', c.x, c.z);
    expect(ignitePitch(w, pitch.id)).toBeNull();
    run(w, 3);
    expect(m.hp).toBeLessThan(MONSTERS.orc.hp - 30);
  });

  it('estacas ferem quem cruza e quebram com o uso', () => {
    const w = createWorld(62);
    calm(w);
    castle(w)!.cd = 1e9;
    const [p] = freeGrass(w, 1, 3, 4);
    const sp = addBuilding(w, 'estacas', p!.q, p!.r, 1);
    const c = hexToWorld(p!.q, p!.r);
    for (let i = 0; i < 4; i++) monster(w, 'troll', c.x + i * 0.1, c.z);
    run(w, 6);
    expect(w.buildings.has(sp.id)).toBe(false);
  });

  it('armadilhas não bloqueiam o caminho da horda', () => {
    const w = createWorld(63);
    for (const t of w.list) {
      if (hexDist(t.q, t.r, 0, 0) !== 3 || t.terrain === 'rock' || t.terrain === 'water') continue;
      if (t.b >= 0) w.buildings.delete(t.b);
      t.terrain = 'grass';
      t.b = -1;
      addBuilding(w, 'estacas', t.q, t.r, 1);
    }
    step(w);
    const rift = w.rifts[0]!;
    const open = w.flowDist[rift]!;
    // Mesmo cercado de estacas, o caminho custa só o terreno (sem custo de derrubar).
    expect(open).toBeLessThan(40);
  });

  it('um modificador a cada 5 ondas, dois a partir da 30, e cada um muda a onda', () => {
    expect(modsForWave(1, 4)).toEqual([]);
    expect(modsForWave(1, 5).length).toBe(1);
    expect(modsForWave(1, 30).length).toBe(2);
    expect(waveSizeWithMods(10, ['enxame']).esqueleto).toBeGreaterThan(waveSizeWithMods(10, []).esqueleto);
    const w = createWorld(64);
    calm(w);
    castle(w)!.cd = 1e9;
    w.waveMods = ['blindados'];
    const m = monster(w, 'orc', 6, 6);
    const s = addUnit(w, 'soldado', 6.5, 6);
    s.postX = 6.5;
    s.postZ = 6;
    run(w, 0.5);
    expect(m.hp).toBe(MONSTERS.orc.hp - UNITS.soldado.dmg * 0.75);
  });
});

describe('arqueiros e torres', () => {
  /** Arqueiros prontos perto do castelo, com uma ordem (0 livre, 1 ponto de encontro, 2 mandado). */
  function archers(w: World, n: number, order: 0 | 1 | 2) {
    const c = castle(w)!;
    const p = hexToWorld(c.q, c.r);
    return Array.from({ length: n }, (_, i) => {
      const u = addUnit(w, 'arqueiro', p.x + 1 + (i % 3) * 0.4, p.z + 2 + Math.floor(i / 3) * 0.4);
      u.order = order;
      u.postX = u.x;
      u.postZ = u.z;
      return u;
    });
  }

  it('a torre tem 4 lugares e o arqueiro do ponto de encontro sobe sozinho', () => {
    const w = createWorld(61);
    calm(w);
    const [p] = freeGrass(w, 1, 3, 4);
    const t = addBuilding(w, 'torre', p!.q, p!.r, 1);
    const us = archers(w, 5, 1);
    run(w, 25, () => t.archers.length >= 4 && us.filter((u) => u.state === 'tower').length >= 4);
    expect(t.archers.length).toBe(4);
    expect(us.filter((u) => u.state === 'tower').length).toBe(4);
  });

  it('o arqueiro mandado para um lugar fica; tocar na torre faz ele subir', () => {
    const w = createWorld(62);
    calm(w);
    const [p] = freeGrass(w, 1, 3, 4);
    const t = addBuilding(w, 'torre', p!.q, p!.r, 1);
    const us = archers(w, 6, 2);
    run(w, 3);
    expect(t.archers.length).toBe(0);
    const why = garrison(w, us.map((u) => u.id), t.id);
    expect(why).toContain('2 arqueiros ficaram no chão');
    run(w, 25, () => us.filter((u) => u.state === 'tower').length >= 4);
    expect(us.filter((u) => u.state === 'tower').length).toBe(4);
    expect(garrison(w, [us[5]!.id], t.id)).toContain('Torre cheia');
  });

  it('"Chamar arqueiros" puxa os do chão mais perto', () => {
    const w = createWorld(63);
    calm(w);
    const [p] = freeGrass(w, 1, 3, 4);
    const t = addBuilding(w, 'torre', p!.q, p!.r, 1);
    const us = archers(w, 2, 2);
    expect(callArchers(w, t.id)).toBeNull();
    run(w, 25, () => us.every((u) => u.state === 'tower'));
    expect(us.every((u) => u.state === 'tower')).toBe(true);
    expect(callArchers(w, t.id)).toContain('Nenhum arqueiro no chão');
  });
});

describe('aldeões fogem sozinhos (2026-11-09)', () => {
  function monster(w: World, kind: MonsterKind, x: number, z: number) {
    const def = MONSTERS[kind];
    const m: Monster = { id: w.nextId++, kind, x, z, hp: def.hp, maxHp: def.hp, speed: 0, dmg: def.dmg, cd: 0, state: 'walk', facing: 0, deadT: 0, burnT: 99, healT: 0, summonT: 0, owner: -1 };
    w.monsters.set(m.id, m);
    return m;
  }

  it('monstro perto: o aldeão larga o trabalho, se esconde e volta quando passa', () => {
    const w = createWorld(31);
    calm(w);
    castle(w)!.cd = 1e9;
    run(w, 20);
    const u = [...w.units.values()].find((x) => x.kind === 'trabalhador' && x.state === 'work')!;
    expect(u).toBeTruthy();
    const job = u.job;
    // Um esqueleto parado a 3 m dele, do lado de fora (longe do castelo).
    const out = Math.hypot(u.x, u.z) || 1;
    const m = monster(w, 'esqueleto', u.x + (u.x / out) * 3, u.z + (u.z / out) * 3);
    run(w, 20, () => u.state === 'shelter');
    expect(u.state).toBe('shelter');
    expect(u.hp).toBeGreaterThan(0);
    const hide = w.buildings.get(u.hideIn!)!;
    expect(['casa', 'castelo']).toContain(hide.kind);
    // Escondido, o monstro não o enxerga; sem monstro por perto, ele sai e volta ao mesmo trabalho.
    m.state = 'dead';
    w.monsters.delete(m.id);
    run(w, 20, () => u.state === 'work');
    expect(u.state).toBe('work');
    expect(u.job).toBe(job);
    expect(u.hideIn).toBeUndefined();
  });

  it('liberar o recolhimento tira da casa quem tinha corrido para ela', () => {
    const w = createWorld(32);
    calm(w);
    const casa = [...w.buildings.values()].find((b) => b.kind === 'casa' && b.built >= 1);
    const u = [...w.units.values()].find((x) => x.kind === 'trabalhador')!;
    const at = casa ?? castle(w)!;
    u.state = 'shelter';
    u.hideIn = at.id;
    toggleShelter(w);
    toggleShelter(w);
    expect(u.state).toBe('idle');
    expect(u.hideIn).toBeUndefined();
    const c = hexToWorld(at.q, at.r);
    expect(Math.hypot(u.x - c.x, u.z - c.z)).toBeLessThan(2.5);
  });
});

describe('horda não empaca (2026-11-09)', () => {
  it('não persegue quem está dentro de um prédio onde ela não entra', () => {
    const w = createWorld(41);
    calm(w);
    castle(w)!.cd = 1e9;
    // O soldado fica parado na porta do quartel, sem sair para lutar (como quando o monstro está
    // num bolsão fora do alcance dele).
    const engage = CONFIG.soldierEngage;
    const hold = CONFIG.holdEngage;
    CONFIG.soldierEngage = 0;
    CONFIG.holdEngage = 0;
    onTestFinished(() => {
      CONFIG.soldierEngage = engage;
      CONFIG.holdEngage = hold;
    });
    // Um quartel com um hexágono livre do lado de fora (mais longe do castelo).
    let q: ReturnType<typeof addBuilding> | null = null;
    let out: { x: number; z: number } | null = null;
    for (const p of freeGrass(w, 40, 3, 6)) {
      const c = hexToWorld(p.q, p.r);
      const away = DIRS.map(([dq, dr]) => ({ q: p.q + dq, r: p.r + dr })).find((n) => {
        const t = tileAt(w, n.q, n.r);
        const nc = hexToWorld(n.q, n.r);
        return t && t.terrain === 'grass' && t.b < 0 && Math.hypot(nc.x, nc.z) > Math.hypot(c.x, c.z) + 1;
      });
      if (!away) continue;
      q = addBuilding(w, 'quartel', p.q, p.r, 1);
      const nc = hexToWorld(away.q, away.r);
      const d = Math.hypot(nc.x - c.x, nc.z - c.z);
      out = { x: c.x + ((nc.x - c.x) / d) * 1.1, z: c.z + ((nc.z - c.z) / d) * 1.1 };
      break;
    }
    expect(q && out).toBeTruthy();
    computeFlow(w);
    const qc = hexToWorld(q!.q, q!.r);
    const s = addUnit(w, 'soldado', qc.x, qc.z);
    s.postX = qc.x;
    s.postZ = qc.z;
    s.order = 2;
    const def = MONSTERS.esqueleto;
    const m: Monster = { id: w.nextId++, kind: 'esqueleto', x: out!.x, z: out!.z, hp: 1e6, maxHp: 1e6, speed: def.speed, dmg: def.dmg, cd: 0, state: 'walk', facing: 0, deadT: 0, burnT: 99, healT: 0, summonT: 0, owner: -1 };
    w.monsters.set(m.id, m);
    const from = { x: m.x, z: m.z };
    const hp = q!.hp;
    run(w, 4);
    // Ou bateu no quartel, ou seguiu o caminho até o castelo; parado na beira, andando, não.
    const moved = Math.hypot(m.x - from.x, m.z - from.z);
    expect(moved > 1 || q!.hp < hp).toBe(true);
  });
});

describe('inimigos novos (2026-11-09)', () => {
  function monster(w: World, kind: MonsterKind, x: number, z: number, hp?: number) {
    const def = MONSTERS[kind];
    const h = hp ?? def.hp;
    const m: Monster = { id: w.nextId++, kind, x, z, hp: h, maxHp: h, speed: def.speed, dmg: def.dmg, cd: 0, state: 'walk', facing: 0, deadT: 0, burnT: 99, healT: 1, summonT: 3, owner: -1, homeX: x, homeZ: z - 30 };
    w.monsters.set(m.id, m);
    return m;
  }

  it('entram nas ondas: guerreiro da 6, acumulador da 7, vampiro da 18 e golem de musgo na 45', () => {
    expect(waveSize(5).esqueletoGuerreiro).toBe(0);
    expect(waveSize(10).esqueletoGuerreiro).toBeGreaterThan(0);
    expect(waveSize(10).esqueleto).toBeGreaterThan(0);
    expect(waveSize(6).acumulador).toBe(0);
    expect(waveSize(7).acumulador).toBe(1);
    expect(waveSize(17).vampiro).toBe(0);
    expect(waveSize(18).vampiro).toBe(1);
    expect(waveSize(29).vampiro).toBe(2);
    expect(waveSize(19).acumulador).toBe(2);
    expect(waveSize(45).golemMusgo).toBe(1);
  });

  it('o esqueleto guerreiro sente menos a flecha e a espada inteira', () => {
    const w = createWorld(61);
    const a = monster(w, 'esqueletoGuerreiro', 30, 30, 100);
    const b = monster(w, 'esqueletoGuerreiro', 31, 30, 100);
    damageMonster(w, a, 20, 'arrow');
    damageMonster(w, b, 20, 'melee');
    expect(a.hp).toBeCloseTo(100 - 20 * MONSTERS.esqueletoGuerreiro.arrowResist!, 6);
    expect(b.hp).toBe(80);
  });

  it('o acumulador rouba no prédio, foge e, derrubado, devolve tudo', () => {
    const w = createWorld(62);
    calm(w);
    castle(w)!.cd = 1e9;
    w.res.madeira = 500;
    w.res.ouro = 0;
    const c = hexToWorld(castle(w)!.q, castle(w)!.r);
    const m = monster(w, 'acumulador', c.x + 1.3, c.z);
    run(w, 1, () => !!m.loot);
    expect(m.loot).toBeTruthy();
    const n = m.loot!.n;
    expect(n).toBeGreaterThan(0);
    expect(m.loot!.res).toBe('madeira');
    expect(w.res.madeira).toBe(500 - n);
    // Fugindo: anda para longe do castelo.
    const d0 = Math.hypot(m.x - c.x, m.z - c.z);
    run(w, 2);
    expect(Math.hypot(m.x - c.x, m.z - c.z)).toBeGreaterThan(d0);
    damageMonster(w, m, 1e6);
    expect(w.res.madeira).toBe(500);
  });

  it('o acumulador que chega à fenda some com o roubo', () => {
    const w = createWorld(63);
    calm(w);
    const m = monster(w, 'acumulador', 0, 6);
    m.loot = { res: 'pedra', n: 40 };
    m.fleeT = 10;
    m.homeX = 0;
    m.homeZ = 6.5;
    const pedra = w.res.pedra;
    step(w);
    expect(w.monsters.has(m.id)).toBe(false);
    expect(w.res.pedra).toBe(pedra);
  });

  it('o vampiro chama morcegos e se cura com o golpe', () => {
    const w = createWorld(64);
    calm(w);
    castle(w)!.cd = 1e9;
    const v = monster(w, 'vampiro', 20, 20, 600);
    v.summonT = 0.05;
    step(w);
    step(w);
    const bats = [...w.monsters.values()].filter((o) => o.kind === 'morcego' && o.owner === v.id);
    expect(bats.length).toBe(2);
    // Um soldado forte colado nele: cada golpe devolve vida.
    const s = addUnit(w, 'soldado', v.x + 0.4, v.z);
    s.hp = s.maxHp = 1e6;
    // Ele não revida (com o socorro de 2026-11-09 o soldado iria bater no vampiro).
    s.cd = 1e9;
    v.hp = 300;
    v.cd = 0;
    const engage = CONFIG.soldierEngage;
    CONFIG.soldierEngage = 0;
    onTestFinished(() => {
      CONFIG.soldierEngage = engage;
    });
    step(w);
    expect(v.hp).toBeGreaterThan(300);
  });
});

describe('tropas novas: lanceiro e anão (2026-11-09)', () => {
  function monster(w: World, kind: MonsterKind, x: number, z: number, hp = 5000) {
    const m: Monster = { id: w.nextId++, kind, x, z, hp, maxHp: hp, speed: 0, dmg: 0, cd: 99, state: 'walk', facing: 0, deadT: 0, burnT: 99, healT: 99, summonT: 99, owner: -1 };
    w.monsters.set(m.id, m);
    return m;
  }
  /** Tropa parada num ponto, longe do castelo (ordem do jogador). */
  function troop(w: World, kind: 'lanceiro' | 'anao' | 'soldado', x: number, z: number) {
    const u = addUnit(w, kind, x, z);
    u.postX = x;
    u.postZ = z;
    u.order = 2;
    u.cd = 0;
    return u;
  }

  it('acampamento treina lanceiro; torre de pólvora pede castelo nível 2 e treina anão', () => {
    expect(BUILDINGS.acampamento.recruits).toBe('lanceiro');
    expect(BUILDINGS.polvora.recruits).toBe('anao');
    expect(BUILDINGS.polvora.needsLevel).toBe(2);
  });

  it('o lanceiro bate mais forte no orc bruto que no esqueleto', () => {
    const w = createWorld(71);
    calm(w);
    castle(w)!.cd = 1e9;
    const a = monster(w, 'bruto', 20.6, 20);
    troop(w, 'lanceiro', 20, 20);
    step(w);
    const big = 5000 - a.hp;
    const w2 = createWorld(71);
    calm(w2);
    castle(w2)!.cd = 1e9;
    const b = monster(w2, 'esqueleto', 20.6, 20);
    troop(w2, 'lanceiro', 20, 20);
    step(w2);
    const small = 5000 - b.hp;
    expect(small).toBeGreaterThan(0);
    expect(big).toBeCloseTo(small * CONFIG.spear.bigMul, 6);
  });

  it('o anão acerta quem voa, fere o golem de gelo e atravessa o escudo', () => {
    const w = createWorld(72);
    calm(w);
    castle(w)!.cd = 1e9;
    const g = monster(w, 'golem', 24, 20);
    troop(w, 'anao', 20, 20);
    step(w);
    expect(g.hp).toBeCloseTo(5000 - UNITS.anao.dmg, 6);
    const w2 = createWorld(72);
    calm(w2);
    castle(w2)!.cd = 1e9;
    const bat = monster(w2, 'morcego', 24, 20);
    troop(w2, 'anao', 20, 20);
    step(w2);
    expect(bat.hp).toBeLessThan(5000);
    const w3 = createWorld(72);
    calm(w3);
    castle(w3)!.cd = 1e9;
    const sk = monster(w3, 'esqueletoGuerreiro', 24, 20);
    troop(w3, 'anao', 20, 20);
    step(w3);
    expect(sk.hp).toBeCloseTo(5000 - UNITS.anao.dmg, 6);
  });

  it('o tiro respinga em quem está colado no alvo', () => {
    const w = createWorld(73);
    calm(w);
    castle(w)!.cd = 1e9;
    const a = monster(w, 'esqueleto', 24, 20);
    const b = monster(w, 'esqueleto', 24.5, 20);
    const far = monster(w, 'esqueleto', 27, 20);
    troop(w, 'anao', 20, 20);
    step(w);
    expect(a.hp).toBeCloseTo(5000 - UNITS.anao.dmg, 6);
    expect(b.hp).toBeCloseTo(5000 - UNITS.anao.dmg * CONFIG.gun.splashMul, 6);
    expect(far.hp).toBe(5000);
  });
});

describe('socorro das tropas (2026-11-09)', () => {
  function monster(w: World, kind: MonsterKind, x: number, z: number) {
    const def = MONSTERS[kind];
    const m: Monster = { id: w.nextId++, kind, x, z, hp: 1e6, maxHp: 1e6, speed: 0, dmg: def.dmg, cd: 0, state: 'walk', facing: 0, deadT: 0, burnT: 99, healT: 99, summonT: 99, owner: -1 };
    w.monsters.set(m.id, m);
    return m;
  }

  it('soldado sem ordem sai do posto para ajudar onde a horda bate; com ordem, segura o ponto', () => {
    const w = createWorld(81);
    calm(w);
    castle(w)!.cd = 1e9;
    const c = hexToWorld(castle(w)!.q, castle(w)!.r);
    // Monstro batendo no castelo; soldados a uns 20 m, bem fora da área deles.
    const m = monster(w, 'orc', c.x + 1.4, c.z);
    const free = addUnit(w, 'soldado', c.x - 20, c.z);
    free.postX = free.x;
    free.postZ = free.z;
    const held = addUnit(w, 'soldado', c.x - 20, c.z + 1);
    held.postX = held.x;
    held.postZ = held.z;
    held.order = 2;
    run(w, 30, () => free.state === 'fight');
    expect(m.state).not.toBe('dead');
    expect(free.state).toBe('fight');
    expect(Math.hypot(held.x - held.postX, held.z - held.postZ)).toBeLessThan(0.5);
  });

  it('o anão sem ordem também vai até a briga e atira', () => {
    const w = createWorld(82);
    calm(w);
    castle(w)!.cd = 1e9;
    const c = hexToWorld(castle(w)!.q, castle(w)!.r);
    const m = monster(w, 'orc', c.x + 1.4, c.z);
    const a = addUnit(w, 'anao', c.x - 22, c.z);
    a.postX = a.x;
    a.postZ = a.z;
    run(w, 20, () => m.hp < 1e6);
    expect(m.hp).toBeLessThan(1e6);
  });

  it('com a horda fora da muralha e sem caminho, o Sábio sugere um portão', () => {
    const w = createWorld(83);
    calm(w);
    const k = castle(w)!;
    // Um anel inteiro de muralha (num raio sem prédio no caminho), o soldado dentro e o monstro fora.
    const ring = (d: number) => w.list.filter((t) => hexDist(t.q, t.r, k.q, k.r) === d);
    const R0 = [4, 5, 6, 7].find((d) => ring(d).every((t) => t.b < 0))!;
    for (const t of ring(R0)) {
      if (t.terrain === 'rock' || t.terrain === 'water') continue;
      t.terrain = 'grass';
      addBuilding(w, 'muralha', t.q, t.r, 1);
    }
    const out = ring(R0 + 1).find((t) => t.terrain === 'grass' && t.b < 0)!;
    const o = hexToWorld(out.q, out.r);
    const c = hexToWorld(k.q, k.r);
    const toward = (R0 - 1) / (R0 + 1);
    const s = addUnit(w, 'soldado', c.x + (o.x - c.x) * toward, c.z + (o.z - c.z) * toward);
    s.postX = s.x;
    s.postZ = s.z;
    monster(w, 'esqueleto', o.x, o.z);
    w.waveState = 'attack';
    run(w, 2);
    expect(w.flags.muralhaBloqueia).toBe(true);
    for (const id of TIP_IDS) if (id !== 'portao') w.flags[`guia:${id}`] = true;
    expect(pickTip(w)?.id).toBe('portao');
  });
});

describe('heróis (Etapa 14)', () => {
  function monster(w: World, kind: MonsterKind, x: number, z: number, hp?: number) {
    const def = MONSTERS[kind];
    const h = hp ?? def.hp;
    const m: Monster = { id: w.nextId++, kind, x, z, hp: h, maxHp: h, speed: def.speed, dmg: def.dmg, cd: 0, state: 'walk', facing: 0, deadT: 0, burnT: 99, healT: 0, summonT: 0, owner: -1 };
    w.monsters.set(m.id, m);
    return m;
  }
  /** Reino rico e castelo nível 3 (os heróis liberam no 2). */
  function rich(seed: number): World {
    const w = createWorld(seed);
    calm(w);
    castle(w)!.level = 3;
    w.res.ouro = 10000;
    w.res.cristal = 1000;
    return w;
  }

  it('pede castelo nível 2, um de cada, e o preço sobe 50% por herói', () => {
    const w = createWorld(70);
    w.res.ouro = 10000;
    w.res.cristal = 1000;
    expect(heroProblem(w, 'barbaro')).toContain('nível 2');
    castle(w)!.level = 2;
    expect(heroCost(w)).toEqual({ cristal: 30, ouro: 600 });
    expect(buyHero(w, 'barbaro')).toBeNull();
    expect(w.res.ouro).toBe(9400);
    expect(heroProblem(w, 'barbaro')).toBe('Já está no reino');
    expect(heroCost(w)).toEqual({ cristal: 45, ouro: 900 });
    expect(buyHero(w, 'druida')).toBeNull();
    expect(heroCost(w).ouro).toBe(1350);
  });

  it('o herói não morre: desmaia e volta ao castelo com a vida cheia', () => {
    const w = rich(71);
    buyHero(w, 'cavaleiroNegro');
    const h = heroOf(w, 'cavaleiroNegro')!;
    const m = monster(w, 'orc', h.x, h.z + 0.3);
    m.dmg = 100000;
    run(w, 3, () => (h.downT ?? 0) > 0);
    expect(h.state).toBe('shelter');
    expect(h.downT).toBeGreaterThan(0);
    w.monsters.clear();
    run(w, CONFIG.heroes.downTime + 2);
    expect(h.state).not.toBe('dead');
    expect(h.state).not.toBe('shelter');
    expect(h.hp).toBe(h.maxHp);
  });

  it('o giro do bárbaro acerta todos em volta de uma vez', () => {
    const w = rich(72);
    buyHero(w, 'barbaro');
    const h = heroOf(w, 'barbaro')!;
    h.specialT = 0;
    const ms = [0, 1, 2].map((i) => monster(w, 'esqueleto', h.x + Math.cos(i * 2) * 1.2, h.z + Math.sin(i * 2) * 1.2, 500));
    for (const m of ms) m.speed = 0;
    run(w, 0.2);
    for (const m of ms) expect(m.hp).toBeLessThanOrEqual(500 - UNITS.barbaro.dmg * CONFIG.heroes.barbaro.mult + 1);
  });

  it('as raízes da druida prendem a horda em volta', () => {
    const w = rich(73);
    buyHero(w, 'druida');
    const h = heroOf(w, 'druida')!;
    h.specialT = 0;
    const m = monster(w, 'orc', h.x + 2.5, h.z, 5000);
    const x0 = m.x;
    run(w, 0.1);
    expect(m.stunT ?? 0).toBeGreaterThan(2);
    const x1 = m.x;
    run(w, 2);
    expect(Math.abs(m.x - x1)).toBeLessThan(0.01);
    void x0;
  });

  it('o herói sobe de nível pelo dano que causa e ganha vida', () => {
    const w = rich(74);
    buyHero(w, 'atiradora');
    const h = heroOf(w, 'atiradora')!;
    const hp1 = h.maxHp;
    for (let i = 0; i < 12; i++) monster(w, 'orc', h.x + 3 + (i % 4) * 0.3, h.z + Math.floor(i / 4) * 0.3, 200).speed = 0;
    run(w, 40, () => (h.level ?? 1) >= 2);
    expect(h.level).toBeGreaterThanOrEqual(2);
    expect(h.maxHp).toBeGreaterThan(hp1);
  });

  it('o jogo salvo guarda o herói, o nível e o desmaio', () => {
    const w = rich(75);
    buyHero(w, 'barbaro');
    const h = heroOf(w, 'barbaro')!;
    h.level = 3;
    h.xp = 1200;
    h.downT = 10;
    h.state = 'shelter';
    const b = loadWorld(saveWorld(w))!;
    const h2 = heroOf(b, 'barbaro')!;
    expect(h2.level).toBe(3);
    expect(h2.xp).toBe(1200);
    expect(h2.downT).toBe(10);
  });
});

describe('fazenda em teste: celeiro e plantações em volta', () => {
  it('o reino começa com o celeiro e uma plantação encostada nele', () => {
    const w = createWorld(80);
    const barn = [...w.buildings.values()].find((b) => b.kind === 'celeiro')!;
    const farm = [...w.buildings.values()].find((b) => b.kind === 'fazenda')!;
    expect(barn).toBeDefined();
    expect(hexDist(barn.q, barn.r, farm.q, farm.r)).toBe(1);
    // Nenhum hexágono em volta do celeiro inicial encosta no castelo.
    for (const [dq, dr] of DIRS) expect(hexDist(barn.q + dq, barn.r + dr, 0, 0)).toBeGreaterThanOrEqual(2);
  });

  it('a plantação só vai num hexágono ao lado de um celeiro', () => {
    const w = createWorld(81);
    const barn = [...w.buildings.values()].find((b) => b.kind === 'celeiro')!;
    const far = freeGrass(w, 30, 3, 6).find((p) => hexDist(p.q, p.r, barn.q, barn.r) > 1)!;
    expect(placeProblem(w, 'fazenda', far.q, far.r)).toContain('celeiro');
    const near = w.list.find((t) => hexDist(t.q, t.r, barn.q, barn.r) === 1 && t.b < 0 && t.terrain === 'grass')!;
    expect(placeProblem(w, 'fazenda', near.q, near.r)).toBeNull();
  });

  it('cada celeiro dá as plantas em ordem: milho, tomate, trigo...', () => {
    const w = createWorld(82);
    w.res.madeira = 1000;
    const barn = [...w.buildings.values()].find((b) => b.kind === 'celeiro')!;
    for (const [dq, dr] of DIRS) {
      const t = w.list.find((x) => x.q === barn.q + dq && x.r === barn.r + dr);
      if (t && t.b < 0 && t.terrain === 'grass') addBuilding(w, 'fazenda', t.q, t.r, 1);
    }
    const farms = [...w.buildings.values()].filter((b) => b.kind === 'fazenda').sort((a, b) => a.id - b.id);
    expect(farms.length).toBeGreaterThanOrEqual(3);
    expect(farms.map((f) => cropOf(w, f))).toEqual(CROPS.slice(0, farms.length));
  });
});

describe('mudar prédio de lugar custa tempo', () => {
  it('desmonta no lugar, guarda o destino e monta no outro', () => {
    const w = createWorld(41);
    calm(w);
    const [a, d] = freeGrass(w, 2, 3, 6);
    const b = addBuilding(w, 'quartel', a!.q, a!.r, 1);
    expect(moveBuilding(w, b.id, a!.q, a!.r)).toBe('Já está aqui');
    expect(moveBuilding(w, b.id, d!.q, d!.r)).toBeNull();
    // Ainda no lugar, desmontando: não treina e o destino fica guardado.
    expect([b.q, b.r]).toEqual([a!.q, a!.r]);
    expect(placeProblem(w, 'casa', d!.q, d!.r)).toBe('Lugar guardado para uma mudança');
    expect(recruitProblem(w, b)).toBe('De mudança');
    expect(moveProblem(w, b)).toBe('Já está de mudança');
    const pack = packTime('quartel');
    expect(pack).toBeCloseTo(BUILDINGS.quartel.build * CONFIG.move.pack);
    run(w, pack / 2);
    expect(b.built).toBeGreaterThan(0.3);
    expect(b.built).toBeLessThan(0.7);
    expect([b.q, b.r]).toEqual([a!.q, a!.r]);
    // Desmontado: passa para o lugar novo como obra.
    run(w, pack / 2 + 0.2);
    expect([b.q, b.r]).toEqual([d!.q, d!.r]);
    expect(b.moved).toBe(true);
    expect(b.built).toBeLessThan(0.1);
    expect(tileAt(w, a!.q, a!.r)!.b).toBe(-1);
    expect(tileAt(w, d!.q, d!.r)!.b).toBe(b.id);
    expect(recruitProblem(w, b)).toBe('De mudança');
    // Montado: volta a funcionar.
    run(w, BUILDINGS.quartel.build + 0.2);
    expect(b.built).toBe(1);
    expect(b.moved).toBe(false);
    expect(moveProblem(w, b)).toBeNull();
  });

  it('obra não muda de lugar e a casa para de abrigar durante a mudança', () => {
    const w = createWorld(42);
    calm(w);
    const [a, d, e] = freeGrass(w, 3, 3, 6);
    const obra = addBuilding(w, 'casa', a!.q, a!.r, 0.5);
    expect(moveProblem(w, obra)).toBe('Espere a obra terminar');
    const casa = addBuilding(w, 'casa', d!.q, d!.r, 1);
    const before = housing(w);
    expect(moveBuilding(w, casa.id, e!.q, e!.r)).toBeNull();
    run(w, 0.5);
    expect(housing(w)).toBe(before - 4);
  });

  it('torre de mudança: os arqueiros descem', () => {
    const w = createWorld(43);
    calm(w);
    const [a, d] = freeGrass(w, 2, 3, 6);
    const t = addBuilding(w, 'torre', a!.q, a!.r, 1);
    const p = hexToWorld(a!.q, a!.r);
    const u = addUnit(w, 'arqueiro', p.x, p.z);
    u.tower = t.id;
    u.state = 'tower';
    t.archers.push(u.id);
    expect(moveBuilding(w, t.id, d!.q, d!.r)).toBeNull();
    expect(t.archers).toEqual([]);
    expect(u.tower).toBe(-1);
    expect(u.state).not.toBe('tower');
  });

  it('derrubar no meio da mudança devolve só a metade', () => {
    const w = createWorld(44);
    calm(w);
    const [a, d] = freeGrass(w, 2, 3, 6);
    const b = addBuilding(w, 'quartel', a!.q, a!.r, 1);
    expect(moveBuilding(w, b.id, d!.q, d!.r)).toBeNull();
    run(w, 1);
    const wood = w.res.madeira;
    expect(demolish(w, b.id)).toBeNull();
    expect(w.res.madeira - wood).toBe(Math.floor(BUILDINGS.quartel.cost.madeira! * CONFIG.refund));
    // O lugar guardado fica livre de novo.
    expect(placeProblem(w, 'casa', d!.q, d!.r)).toBeNull();
  });

  it('salvo no meio da mudança continua a mudança', () => {
    const w = createWorld(45);
    calm(w);
    const [a, d] = freeGrass(w, 2, 3, 6);
    const b = addBuilding(w, 'quartel', a!.q, a!.r, 1);
    expect(moveBuilding(w, b.id, d!.q, d!.r)).toBeNull();
    run(w, 1);
    const w2 = loadWorld(saveWorld(w))!;
    const b2 = w2.buildings.get(b.id)!;
    expect(b2.moveTo).toEqual({ q: d!.q, r: d!.r });
    run(w2, packTime('quartel') + BUILDINGS.quartel.build + 0.5);
    expect([b2.q, b2.r]).toEqual([d!.q, d!.r]);
    expect(b2.built).toBe(1);
  });
});

describe('recursos que acabam e reaparecem (Etapa 17)', () => {
  /** Grama livre, longe de recurso, para montar uma serraria com uma floresta só do lado. */
  function lonelySpot(w: World): Tile {
    return w.list.find(
      (t) =>
        t.terrain === 'grass' &&
        t.b < 0 &&
        hexDist(t.q, t.r, 0, 0) >= 3 &&
        hexDist(t.q, t.r, 0, 0) <= 6 &&
        DIRS.every(([dq, dr]) => tileAt(w, t.q + dq, t.r + dr)?.terrain === 'grass' && tileAt(w, t.q + dq, t.r + dr)!.b < 0),
    )!;
  }

  function staff(w: World, b: { id: number; q: number; r: number }, n = 2): void {
    const p = hexToWorld(b.q, b.r);
    for (let i = 0; i < n; i++) addUnit(w, 'trabalhador', p.x + 0.4 * i, p.z + 0.6);
    run(w, 8, () => [...w.units.values()].filter((u) => u.job === b.id && u.state === 'work').length >= n);
  }

  it('floresta, rocha e veio começam cheios', () => {
    const w = createWorld(51);
    for (const t of w.list) expect(t.stock).toBe(fullStock(t.terrain));
    expect(w.list.some((t) => t.terrain === 'forest' && t.stock === CONFIG.deposits.stock.forest)).toBe(true);
    expect(w.list.find((t) => t.terrain === 'grass')!.stock).toBe(0);
  });

  it('a serraria gasta a floresta; acabou, vira grama com toras e a serraria para', () => {
    const w = createWorld(52);
    calm(w);
    const g = lonelySpot(w);
    const f = tileAt(w, g.q + 1, g.r)!;
    f.terrain = 'forest';
    f.stock = 6;
    const b = addBuilding(w, 'serraria', g.q, g.r, 1);
    expect(sourceOf(w, b)).toBe(f);
    staff(w, b);
    const wood = w.res.madeira;
    const events: string[] = [];
    for (let i = 0; i < 20 * CONFIG.tps && f.terrain === 'forest'; i++) {
      step(w);
      for (const e of w.events) events.push(e.type);
      w.events.length = 0;
    }
    expect(f.terrain).toBe('grass');
    expect(f.left).toBe(1);
    expect(w.res.madeira - wood).toBeGreaterThan(5);
    expect(w.regrow.forest).toBe(1);
    expect(events).toContain('depleted');
    run(w, 1);
    expect(b.dry).toBe(true);
    expect(b.workers).toEqual([]);
    // Parada: não produz mais.
    const after = w.res.madeira;
    run(w, 5);
    expect(w.res.madeira).toBe(after);
  });

  it('a floresta rareia em três degraus', () => {
    const w = createWorld(53);
    const f = w.list.find((t) => t.terrain === 'forest')!;
    expect(stage(f)).toBe(2);
    f.stock = fullStock('forest') * 0.5;
    expect(stage(f)).toBe(1);
    f.stock = fullStock('forest') * 0.1;
    expect(stage(f)).toBe(0);
  });

  it('a mina esgota o veio e fica parada; mudada para outro veio, volta a trabalhar', () => {
    const w = createWorld(54);
    calm(w);
    w.res.madeira = 500;
    w.res.pedra = 500;
    const g = lonelySpot(w);
    g.terrain = 'ore';
    g.stock = 4;
    const b = addBuilding(w, 'mina', g.q, g.r, 1);
    staff(w, b);
    run(w, 30, () => b.dry);
    expect(g.terrain).toBe('grass');
    expect(b.dry).toBe(true);
    expect(w.regrow.ore).toBe(1);
    // Outro veio, longe: a mina muda para lá e volta a ter gente.
    const v = w.list.find((t) => t.terrain === 'ore' && t.b < 0 && hexDist(t.q, t.r, 0, 0) < w.grid.R - 1)!;
    expect(moveBuilding(w, b.id, v.q, v.r)).toBeNull();
    run(w, packTime('mina') + BUILDINGS.mina.build + 1);
    expect(b.dry).toBe(false);
    run(w, 30, () => b.workers.length > 0);
    expect(b.workers.length).toBeGreaterThan(0);
  });

  /** Confere as regras do lugar em cada ladrilho que brotou. */
  function checkSpot(w: World, tiles: number[]): void {
    const D = CONFIG.deposits;
    const c = castle(w)!;
    const people = new Set<number>();
    for (const u of w.units.values()) {
      const h = worldToHex(u.x, u.z);
      if (w.grid.has(h.q, h.r)) people.add(w.grid.idx(h.q, h.r));
    }
    for (const i of tiles) {
      const t = w.tiles[i]!;
      expect(hexDist(t.q, t.r, c.q, c.r)).toBeGreaterThanOrEqual(D.castleMin);
      for (const r of w.rifts) expect(hexDist(t.q, t.r, w.tiles[r]!.q, w.tiles[r]!.r)).toBeGreaterThanOrEqual(D.riftMin);
      expect(hexDist(t.q, t.r, 0, 0)).toBeLessThanOrEqual(w.grid.R - D.edge);
      expect(t.b).toBe(-1);
      for (const [dq, dr] of DIRS) expect(tileAt(w, t.q + dq, t.r + dr)?.b ?? -1).toBe(-1);
      expect(people.has(i)).toBe(false);
      expect(t.stock).toBe(fullStock(t.terrain));
    }
  }

  it('no fim da onda, a floresta que acabou nasce noutro lugar seguindo as regras', () => {
    for (const seed of [61, 62, 63, 64, 65]) {
      const w = createWorld(seed);
      const forest = w.list.filter((t) => t.terrain === 'forest').length;
      w.regrow.forest = 3;
      regrow(w);
      const sprout = w.events.find((e) => e.type === 'sprout');
      expect(sprout).toBeTruthy();
      if (sprout?.type !== 'sprout') continue;
      expect(sprout.terrain).toBe('forest');
      expect(sprout.tiles.length).toBeGreaterThanOrEqual(CONFIG.deposits.size.forest[0]!);
      expect(w.list.filter((t) => t.terrain === 'forest').length).toBe(forest + sprout.tiles.length);
      expect(w.regrow.forest).toBe(0);
      checkSpot(w, sprout.tiles);
    }
  });

  it('pouca falta não brota nada (espera juntar)', () => {
    const w = createWorld(66);
    w.regrow.forest = 1;
    regrow(w);
    expect(w.events.some((e) => e.type === 'sprout')).toBe(false);
    expect(w.regrow.forest).toBe(1);
  });

  it('veio que acabou volta encostado numa rocha nova, sem fechar caminho', () => {
    for (const seed of [71, 72, 73, 74]) {
      const w = createWorld(seed);
      w.regrow.crystal = 1;
      regrow(w);
      const sprout = w.events.find((e) => e.type === 'sprout');
      expect(sprout?.type).toBe('sprout');
      if (sprout?.type !== 'sprout') continue;
      const tiles = sprout.tiles.map((i) => w.tiles[i]!);
      const crystal = tiles.filter((t) => t.terrain === 'crystal');
      expect(crystal.length).toBe(1);
      expect(DIRS.some(([dq, dr]) => tileAt(w, crystal[0]!.q + dq, crystal[0]!.r + dr)?.terrain === 'rock')).toBe(true);
      expect(w.regrow.crystal).toBe(0);
      checkSpot(w, sprout.tiles);
      // A gente ainda chega a todo prédio, e o castelo ainda alcança cada portal.
      const c = castle(w)!;
      for (const b of w.buildings.values()) {
        if (b.kind === 'castelo') continue;
        expect(allyPath(w, w.grid.idx(c.q, c.r), w.grid.idx(b.q, b.r))).not.toBeNull();
      }
    }
  });

  it('não nasce em cima de gente', () => {
    const w = createWorld(67);
    // Gente espalhada por quase todo o mapa: o broto tem de fugir dela.
    for (const t of w.list) {
      if (t.terrain !== 'grass' || (t.q + 2 * t.r) % 3 === 0) continue;
      const p = hexToWorld(t.q, t.r);
      addUnit(w, 'soldado', p.x, p.z);
    }
    w.regrow.forest = 3;
    regrow(w);
    const sprout = w.events.find((e) => e.type === 'sprout');
    if (sprout?.type === 'sprout') checkSpot(w, sprout.tiles);
  });

  it('o salvo guarda o estoque, as sobras e a conta do que falta', () => {
    const w = createWorld(68);
    const f = w.list.find((t) => t.terrain === 'forest')!;
    f.stock = 123;
    const g = w.list.find((t) => t.terrain === 'grass' && t.b < 0)!;
    g.left = 2;
    w.regrow.rock = 1;
    const w2 = loadWorld(saveWorld(w))!;
    expect(w2.tiles[f.i]!.stock).toBe(123);
    expect(w2.tiles[g.i]!.left).toBe(2);
    expect(w2.regrow.rock).toBe(1);
    // Salvo antigo (sem estoque): recurso cheio.
    const old = JSON.parse(saveWorld(w));
    old.tiles = old.tiles.map((t: number[]) => t.slice(0, 4));
    delete old.regrow;
    const w3 = loadWorld(JSON.stringify(old))!;
    expect(w3.tiles[f.i]!.stock).toBe(fullStock('forest'));
    expect(w3.regrow.forest).toBe(0);
  });
});

describe('plantação que acaba e se replanta (Etapa 17)', () => {
  it('colhe até o fim, para, solta a gente e volta depois de replantar', () => {
    const w = createWorld(81);
    calm(w);
    const farm = [...w.buildings.values()].find((b) => b.kind === 'fazenda')!;
    expect(farm.harvest).toBe(CONFIG.farm.harvest);
    expect(replantProblem(w, farm)).toBe('Ainda tem o que colher');
    farm.harvest = 3;
    run(w, 40, () => farm.dry);
    expect(farm.harvest).toBe(0);
    expect(farm.dry).toBe(true);
    expect(farm.workers).toEqual([]);
    // Colhida: não dá mais comida por ela (as outras plantações não existem neste mapa).
    w.res.comida = 100;
    w.res.madeira = 50;
    // Replantar custa madeira e enche a colheita.
    const wood = w.res.madeira;
    expect(replant(w, farm.id)).toBeNull();
    expect(w.res.madeira).toBe(wood - CONFIG.farm.replant.madeira!);
    expect(farm.harvest).toBe(CONFIG.farm.harvest);
    expect(farm.dry).toBe(false);
    run(w, 20, () => farm.workers.length > 0);
    expect(farm.workers.length).toBeGreaterThan(0);
  });

  it('sem madeira não replanta', () => {
    const w = createWorld(82);
    const farm = [...w.buildings.values()].find((b) => b.kind === 'fazenda')!;
    farm.harvest = 0;
    w.res.madeira = 0;
    expect(replantProblem(w, farm)).toBe('Falta madeira');
  });

  it('o salvo guarda a colheita; salvo antigo vem com a plantação cheia', () => {
    const w = createWorld(83);
    const farm = [...w.buildings.values()].find((b) => b.kind === 'fazenda')!;
    farm.harvest = 77;
    const w2 = loadWorld(saveWorld(w))!;
    expect(w2.buildings.get(farm.id)!.harvest).toBe(77);
    const old = JSON.parse(saveWorld(w));
    for (const b of old.buildings) delete b.harvest;
    const w3 = loadWorld(JSON.stringify(old))!;
    expect(w3.buildings.get(farm.id)!.harvest).toBe(CONFIG.farm.harvest);
  });
});

describe('modo fácil (Etapa 18)', () => {
  it('começa com mais recurso, castelo mais forte e mais calma antes da primeira onda', () => {
    const n = createWorld(91);
    const f = createWorld(91, undefined, 'facil');
    expect(f.mode).toBe('facil');
    // Rebalanceamento de 2026-11-09: o fácil guarda o começo de antes; o normal ficou mais curto.
    expect(f.res).toEqual(MODES.facil.start);
    expect(n.res).toEqual(MODES.normal.start);
    expect(f.res.madeira).toBeGreaterThan(n.res.madeira);
    expect(castle(f)!.maxHp).toBe(Math.round(castle(n)!.maxHp * MODES.facil.castleHp));
    expect(castle(f)!.hp).toBe(castle(f)!.maxHp);
    expect(f.waveTimer).toBe(MODES.facil.first + MODES.facil.calm);
    expect(f.waveTimer).toBeGreaterThan(n.waveTimer);
    // O mapa é o mesmo (a semente manda).
    expect(f.list.map((t) => t.terrain)).toEqual(n.list.map((t) => t.terrain));
  });

  it('nada se esgota: floresta e plantação ficam como estão', () => {
    const w = createWorld(92, undefined, 'facil');
    calm(w);
    const farm = [...w.buildings.values()].find((b) => b.kind === 'fazenda')!;
    const food = w.res.comida;
    run(w, 60);
    expect(farm.harvest).toBe(CONFIG.farm.harvest);
    expect(farm.dry).toBe(false);
    // A plantação produziu (há comida a mais que o consumo levaria embora).
    expect(w.res.comida).toBeGreaterThan(food - 5);
    for (const t of w.list) expect(t.stock).toBe(fullStock(t.terrain));
  });

  it('ondas mais leves: menos monstros, chefe a cada 20, modificadores só da 20 em diante', () => {
    const total = (n: number, m: 'normal' | 'facil') => Object.values(waveSize(n, m)).reduce((a, b) => a + b, 0);
    expect(total(10, 'facil')).toBeLessThan(total(10, 'normal'));
    expect(total(10, 'facil')).toBeCloseTo((MODES.facil.base + MODES.facil.perWave * 10) * MODES.facil.monsters, -1);
    expect(waveSize(15, 'facil').golem).toBe(0);
    expect(waveSize(20, 'facil').golem).toBe(1);
    expect(waveSize(15, 'normal').golem).toBe(1);
    expect(modsForWave(5, 5, 'facil')).toEqual([]);
    expect(modsForWave(5, 15, 'facil')).toEqual([]);
    expect(modsForWave(5, 20, 'facil').length).toBeGreaterThan(0);
    expect(waveInterval(1, 'facil')).toBe(waveInterval(1) + MODES.facil.calm);
    expect(waveInterval(40, 'facil')).toBe(MODES.facil.calmMin);
  });

  it('monstros com menos vida e mudança na metade do tempo', () => {
    const w = createWorld(93, undefined, 'facil');
    w.waveTimer = 0;
    run(w, 3, () => w.monsters.size > 0);
    const m = [...w.monsters.values()][0]!;
    expect(m.maxHp).toBeCloseTo(MONSTERS[m.kind].hp * MODES.facil.monsterHp);
    expect(packTime('quartel', 'facil')).toBeCloseTo(packTime('quartel') * MODES.facil.move);
  });

  it('o salvo guarda o modo; salvo antigo é normal', () => {
    const w = createWorld(94, undefined, 'facil');
    const json = saveWorld(w);
    expect(loadWorld(json)!.mode).toBe('facil');
    expect(saveInfo(json)!.mode).toBe('facil');
    const old = JSON.parse(json);
    delete old.mode;
    expect(loadWorld(JSON.stringify(old))!.mode).toBe('normal');
    expect(saveInfo(JSON.stringify(old))!.mode).toBe('normal');
  });
});

describe('fendas sorteadas (2026-11-07)', () => {
  const angle = (w: World, i: number) => {
    const p = hexToWorld(w.tiles[i]!.q, w.tiles[i]!.r);
    return Math.atan2(p.z, p.x);
  };
  const gap = (a: number, b: number) => {
    const d = Math.abs(a - b) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
  };

  it('cada semente põe as fendas (duas desde 2026-11-09) num lugar da borda, separadas, e não só ao norte', () => {
    const sides = new Set<string>();
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const w = createWorld(seed);
      expect(new Set(w.rifts).size).toBe(CONFIG.rifts.count);
      for (const i of w.rifts) {
        const t = w.tiles[i]!;
        expect(t.terrain).toBe('rift');
        expect(hexDist(t.q, t.r, 0, 0)).toBe(w.grid.R);
        sides.add(sideName(t.q, t.r));
      }
      for (let a = 0; a < w.rifts.length; a++) for (let b = a + 1; b < w.rifts.length; b++) expect(gap(angle(w, w.rifts[a]!), angle(w, w.rifts[b]!))).toBeGreaterThanOrEqual(CONFIG.rifts.gap - 0.15);
      layouts.add(w.rifts.join(','));
    }
    expect(sides.has('ao sul')).toBe(true);
    expect(sides.has('a leste')).toBe(true);
    expect(sides.has('a oeste')).toBe(true);
    expect(layouts.size).toBeGreaterThan(30);
    // A mesma semente dá o mesmo mapa.
    expect(createWorld(7).rifts).toEqual(createWorld(7).rifts);
  });

  it('toda fenda chega ao castelo, mesmo com rocha e lago no caminho', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const w = createWorld(seed);
      step(w);
      for (const i of w.rifts) expect(Number.isFinite(w.flowDist[i]!)).toBe(true);
    }
  });

  it('a fenda nova avisa de que lado abriu', () => {
    const w = createWorld(11);
    w.wave = MODES.normal.riftOpens[1]! - 1;
    w.waveTimer = 0.01;
    step(w);
    expect(openRifts(w.wave)).toBe(2);
    const t = w.tiles[w.rifts[1]!]!;
    expect(w.events.some((e) => e.type === 'toast' && e.text === `Uma nova fenda se abriu ${sideName(t.q, t.r)}.`)).toBe(true);
  });

  it('mapa: raio 22 por padrão e 16 nos gráficos leves; o salvo guarda o raio (2026-11-09)', () => {
    expect(createWorld(5).grid.R).toBe(22);
    const small = createWorld(5, CONFIG.mapRadiusLight);
    expect(small.grid.R).toBe(16);
    expect(loadWorld(saveWorld(small))!.grid.R).toBe(16);
    // Mais área, mais floresta.
    const forest = (w: ReturnType<typeof createWorld>) => w.list.filter((t) => t.terrain === 'forest').length;
    expect(forest(createWorld(5))).toBeGreaterThan(forest(small) * 1.4);
  });

  it('o salvo guarda as fendas; o salvo antigo (sem elas) fica com as duas primeiras do norte', () => {
    const w = createWorld(52);
    expect(loadWorld(saveWorld(w))!.rifts).toEqual(w.rifts);
    const json = JSON.parse(saveWorld(w)) as Record<string, unknown>;
    delete json.rifts;
    const old = loadWorld(JSON.stringify(json))!;
    expect(old.rifts).toEqual(legacyRifts(old).slice(0, 2));
    expect(old.rifts.map((i) => sideName(old.tiles[i]!.q, old.tiles[i]!.r))).toEqual(['ao norte', 'a nordeste']);
    // A terceira fenda de antes vira grama.
    expect(old.tiles[legacyRifts(old)[2]!]!.terrain).toBe('grass');
  });
});


describe('torre e muralha com níveis, mercado (2026-11-10)', () => {
  it('a torre sobe ao nível 2 e ao 3 (este pede o castelo nível 2): mais vida, alcance e flecha de fogo', () => {
    const w = createWorld(61);
    calm(w);
    const [p] = freeGrass(w, 1);
    const t = addBuilding(w, 'torre', p!.q, p!.r, 1);
    for (const k of Object.keys(w.res) as (keyof typeof w.res)[]) w.res[k] = 5000;
    expect(towerRange(t)).toBe(CONFIG.towerLevels[0]!.range);
    expect(upgradeTower(w, t.id)).toBeNull();
    expect(t.level).toBe(2);
    expect(t.maxHp).toBe(CONFIG.towerLevels[1]!.hp);
    expect(towerRange(t)).toBeGreaterThan(CONFIG.towerLevels[0]!.range);
    expect(towerUpgradeProblem(w, t)).toBe('Precisa do castelo nível 2');
    castle(w)!.level = 2;
    expect(upgradeTower(w, t.id)).toBeNull();
    expect(t.level).toBe(3);
    expect(towerUpgradeProblem(w, t)).toBe('Nível máximo');
    // Flecha de fogo: o troll atingido para de se curar.
    const a = addUnit(w, 'arqueiro', 0, 0);
    a.tower = t.id;
    a.state = 'tower';
    t.archers.push(a.id);
    const c = hexToWorld(t.q, t.r);
    const m: Monster = { id: w.nextId++, kind: 'troll', x: c.x + 3, z: c.z, hp: 5000, maxHp: 5000, speed: 0, dmg: 0, cd: 99, state: 'walk', facing: 0, deadT: 0, burnT: 99, healT: 1, summonT: 99, owner: -1 };
    w.monsters.set(m.id, m);
    w.waveState = 'attack';
    for (let i = 0; i < 10; i++) step(w);
    expect(m.hp).toBeLessThan(5000);
    expect(m.burnT).toBeLessThan(3);
  });

  it('a muralha sai paliçada de madeira e vira pedra (uma ou todas, até onde der a pedra)', () => {
    const w = createWorld(62);
    calm(w);
    const spots = freeGrass(w, 4, 3, 8);
    w.res.madeira = 1000;
    for (const s of spots) expect(build(w, 'muralha', s.q, s.r)).toBeNull();
    expect(w.res.madeira).toBe(1000 - 4 * BUILDINGS.muralha.cost.madeira!);
    const walls = [...w.buildings.values()].filter((b) => b.kind === 'muralha');
    for (const b of walls) b.built = 1;
    expect(walls[0]!.maxHp).toBe(CONFIG.wallLevels[0]!.hp);
    w.res.pedra = 6;
    expect(upgradeWall(w, walls[0]!.id)).toBeNull();
    expect(walls[0]!.level).toBe(2);
    expect(walls[0]!.maxHp).toBe(CONFIG.wallLevels[1]!.hp);
    expect(w.res.pedra).toBe(0);
    // Pedra para dois dos três que faltam: viram dois.
    w.res.pedra = 12;
    expect(upgradeAllWalls(w, walls[0]!.id)).toBe(2);
    expect(walls.filter((b) => b.level === 2).length).toBe(3);
    expect(allWallsProblem(w)).toBe('Falta pedra');
  });

  it('o salvo de antes da paliçada fica com a muralha de pedra', () => {
    const w = createWorld(63);
    const [s] = freeGrass(w, 1);
    addBuilding(w, 'muralha', s!.q, s!.r, 1);
    const json = JSON.parse(saveWorld(w)) as Record<string, unknown>;
    delete json.fmt;
    const old = loadWorld(JSON.stringify(json))!;
    expect([...old.buildings.values()].find((b) => b.kind === 'muralha')!.level).toBe(2);
    expect([...loadWorld(saveWorld(w))!.buildings.values()].find((b) => b.kind === 'muralha')!.level).toBe(1);
  });

  it('o mercado compra com ouro e vende por ouro; um só no reino', () => {
    const w = createWorld(64);
    calm(w);
    expect(tradeProblem(w, 'ferro', 'comprar')).toBe('Precisa de um mercado pronto');
    const [a, b] = freeGrass(w, 2);
    addBuilding(w, 'mercado', a!.q, a!.r, 1);
    expect(placeProblem(w, 'mercado', b!.q, b!.r)).toBe('Já tem mercado no reino');
    w.res.ouro = 100;
    const ferro = w.res.ferro;
    const d = tradeDeal('ferro', 'comprar');
    expect(trade(w, 'ferro', 'comprar')).toBeNull();
    expect(w.res.ouro).toBe(100 - d.ouro);
    expect(w.res.ferro).toBe(ferro + d.n);
    const v = tradeDeal('madeira', 'vender');
    w.res.madeira = v.n;
    expect(trade(w, 'madeira', 'vender')).toBeNull();
    expect(w.res.madeira).toBe(0);
    expect(trade(w, 'madeira', 'vender')).toBe('Falta madeira');
    expect(v.ouro).toBeLessThan(tradeDeal('madeira', 'comprar').ouro);
  });
});

describe('ondas com cara própria e aviso do chefe (2026-11-10)', () => {
  it('da onda 8 em diante, uma a cada cinco vem de uma família só, com a vida somada parecida', () => {
    const themed = [8, 13, 18, 23, 28, 33].map((n) => themeForWave(7, n));
    expect(themed.every((t) => t !== null)).toBe(true);
    for (const n of [3, 7, 9, 10, 15, 20]) expect(themeForWave(7, n)).toBeNull();
    expect(themeForWave(7, 8, 'facil')).toBeNull();
    const hp = (s: Record<MonsterKind, number>) => (Object.keys(s) as MonsterKind[]).reduce((a, k) => a + (MONSTERS[k].boss ? 0 : s[k] * MONSTERS[k].hp), 0);
    for (const theme of ['matilha', 'ossos', 'orcs'] as const) {
      const s = waveSizeWithMods(18, [], 'normal', theme);
      const fam = theme === 'matilha' ? ['lobisomem', 'morcego'] : theme === 'orcs' ? ['orc', 'bruto', 'troll'] : ['esqueleto', 'esqueletoGuerreiro', 'necromante', 'vampiro'];
      for (const k of Object.keys(s) as MonsterKind[]) if (s[k] > 0) expect(fam).toContain(k);
      const base = hp(waveSize(18));
      // A Matilha tem teto de quantidade; as outras ficam perto da vida da onda comum.
      if (theme !== 'matilha') expect(Math.abs(hp(s) - base) / base).toBeLessThan(0.15);
      else expect(hp(s)).toBeLessThanOrEqual(base * 1.05);
    }
  });

  it('a onda da família avisa na saída; o chefe avisa e toca a trompa quando sai da fenda', () => {
    const w = createWorld(65);
    let n = 1;
    while (!themeForWave(w.seed, n)) n++;
    w.wave = n - 1;
    w.waveTimer = 0.01;
    step(w);
    expect(w.waveTheme).not.toBeNull();
    expect(w.events.some((e) => e.type === 'toast' && e.text.startsWith(`Onda ${n}:`))).toBe(true);
    const b = createWorld(66);
    b.wave = CONFIG.bossEvery - 1;
    b.waveTimer = 0.01;
    const seen: string[] = [];
    let horn = false;
    for (let i = 0; i < 20 * 60 && !horn; i++) {
      step(b);
      for (const e of b.events) {
        if (e.type === 'toast') seen.push(e.text);
        if (e.type === 'boss') horn = true;
      }
      b.events.length = 0;
    }
    expect(seen.some((t) => t.startsWith('Chefe nesta onda'))).toBe(true);
    expect(horn).toBe(true);
  });
});

describe('aldeões levam o trabalho (2026-11-10)', () => {
  it('um da serraria leva a madeira até o castelo e volta; a produção não muda', () => {
    const w = createWorld(5);
    calm(w);
    const t = w.list.find((t) => t.terrain === 'grass' && t.b < 0 && hexDist(t.q, t.r, 0, 0) <= 5 && hexDist(t.q, t.r, 0, 0) >= 3 && DIRS.some(([dq, dr]) => tileAt(w, t.q + dq, t.r + dr)?.terrain === 'forest'))!;
    const b = addBuilding(w, 'serraria', t.q, t.r, 1);
    for (let i = 0; i < 2; i++) addUnit(w, 'trabalhador', 0, 1);
    let delivered = 0;
    let carried = false;
    for (let i = 0; i < 20 * 90; i++) {
      step(w);
      for (const e of w.events) if (e.type === 'haul' && e.res === 'madeira') delivered++;
      w.events.length = 0;
      if (b.workers.some((id) => w.units.get(id)?.carry === 'madeira')) carried = true;
    }
    expect(carried).toBe(true);
    expect(delivered).toBeGreaterThan(0);
    // Nunca os dois de uma vez.
    expect(b.workers.filter((id) => w.units.get(id)?.trip).length).toBeLessThanOrEqual(1);
  });

  it('recolher funciona mesmo com o castelo cercado de casas', () => {
    const w = createWorld(67);
    calm(w);
    const c = castle(w)!;
    for (const [dq, dr] of DIRS) {
      const n = tileAt(w, c.q + dq, c.r + dr);
      if (n && n.b < 0 && n.terrain === 'grass') addBuilding(w, 'casa', n.q, n.r, 1);
    }
    const far = freeGrass(w, 1, 5, 8)[0]!;
    const p = hexToWorld(far.q, far.r);
    const u = addUnit(w, 'trabalhador', p.x, p.z);
    run(w, 1);
    toggleShelter(w);
    run(w, 40);
    expect(u.state).toBe('shelter');
  });
});
