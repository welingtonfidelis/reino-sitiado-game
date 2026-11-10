/** Defesas: tiro do castelo e das torres, armadilhas, catapultas e capelas. */
import { CONFIG, MONSTERS, UNITS } from './config.ts';
import { castle, towerLevel } from './world.ts';
import type { Monster, World } from './world.ts';
import { DT, center, dist, nearestMonster, rk, tileIndexAt } from './common.ts';
import { damageMonster, shoot } from './combat.ts';
import { destroyBuilding } from './buildings.ts';

// ---------------------------------------------------------------- defesas

export function defenses(w: World): void {
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
    // Nível da torre (2026-11-10): alcance, dano das flechas e, no 3, flecha de fogo.
    const lv = towerLevel(b);
    for (const id of b.archers) {
      const u = w.units.get(id);
      if (!u || u.state !== 'tower' || u.cd > 0) continue;
      const m = nearestMonster(w, p.x, p.z, lv.range * rk(w), false, 'arrow');
      if (!m) break;
      u.facing = Math.atan2(m.x - p.x, m.z - p.z);
      shoot(w, p.x, 2.0, p.z, m, UNITS.arqueiro.dmg * lv.dmg, lv.fire);
      u.cd = UNITS.arqueiro.cd;
    }
  }
}

/** Armadilhas (Etapa 9): estacas ferem quem cruza; piche aceso queima quem está em cima. */
export function traps(w: World): void {
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
export function catapults(w: World): void {
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
export function chapels(w: World): void {
  for (const b of w.buildings.values()) {
    if (b.kind !== 'capela' || b.built < 1) continue;
    const c = center(b);
    for (const u of w.units.values()) {
      if (u.state === 'dead' || u.hp >= u.maxHp || dist(u.x, u.z, c.x, c.z) > CONFIG.chapel.radius) continue;
      u.hp = Math.min(u.maxHp, u.hp + CONFIG.chapel.perSec * DT);
    }
  }
}
