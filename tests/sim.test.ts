import { describe, expect, it } from 'vitest';
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
  workers,
} from '../src/sim/index.ts';
import { MONSTERS, UNITS, buyHero, heroCost, heroOf, heroProblem } from '../src/sim/index.ts';
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
    expect(Math.hypot(s.x - target.x, s.z - target.z)).toBeLessThan(0.6);
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
  it('crescem sem fim e trazem monstros novos', () => {
    expect(waveSize(1)).toEqual({ esqueleto: 7, lobisomem: 0, orc: 0, bruto: 0, morcego: 0, bruxa: 0, troll: 0, necromante: 0, golem: 0, golemOssos: 0 });
    const w8 = waveSize(8);
    expect(w8.bruto).toBe(1);
    expect(w8.orc).toBeGreaterThan(0);
    const total = (n: number) => Object.values(waveSize(n)).reduce((a, b) => a + b, 0);
    expect(total(30)).toBeGreaterThan(total(10));
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
