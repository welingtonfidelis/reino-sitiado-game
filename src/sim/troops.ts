/** Tropas: o passo de cada um (aldeão, arqueiro, soldado, mago, anão, clérigo, engenheiro e herói). */
import { CONFIG, MONSTERS, UNITS, isHero } from './config.ts';
import type { Building, Unit, World } from './world.ts';
import { DT, center, dist, guard, nearestMonster, rk, setGoal, toast, walk } from './common.ts';
import { chase, damageMonster, meleeTarget, rangedHelp, shoot } from './combat.ts';
import { heroStep } from './heroes.ts';
import { workerStep } from './people.ts';

export function unitsStep(w: World): void {
  for (const u of w.units.values()) {
    if (u.state === 'dead') continue;
    u.cd -= DT;
    const def = UNITS[u.kind];
    if (isHero(u.kind)) {
      heroStep(w, u, u.kind);
      continue;
    }
    if (u.kind === 'trabalhador') {
      workerStep(w, u);
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

/** Mago: dano em área no monstro mais perto; cada feitiço gasta cristal. */
export function mageStep(w: World, u: Unit): void {
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
export function gunnerStep(w: World, u: Unit): void {
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
export function clericStep(w: World, u: Unit): void {
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
export function engineerStep(w: World, u: Unit): void {
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
