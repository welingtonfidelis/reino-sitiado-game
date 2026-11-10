/** Heróis (Etapa 14): experiência, golpes especiais e a luta de cada um. */
import { CONFIG, MONSTERS, UNITS } from './config.ts';
import type { HeroKind } from './config.ts';
import { castle, castleDoor } from './world.ts';
import type { Monster, Unit, World } from './world.ts';
import { DT, dist, guard, nearestMonster, rk, toast } from './common.ts';
import type { DmgSrc } from './common.ts';
import { chase, damageMonster, meleeTarget, rangedHelp } from './combat.ts';

/** Vida e dano a mais pelo nível do herói (+20% por nível acima do 1). */
export const heroMul = (u: Unit) => 1 + CONFIG.heroes.perLevel * ((u.level ?? 1) - 1);
const armorMul = (w: World) => 1 + CONFIG.forge.step.armaduras * w.forge.armaduras;

/** Golpe de herói: o dano que de fato saiu do monstro vira experiência. */
export function heroHit(w: World, u: Unit, m: Monster, dmg: number, src: DmgSrc): void {
  if (m.state === 'dead') return;
  const before = m.hp;
  damageMonster(w, m, dmg, src);
  gainXp(w, u, Math.max(0, before - Math.max(0, m.hp)));
}

export function gainXp(w: World, u: Unit, n: number): void {
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


export function heroStep(w: World, u: Unit, k: HeroKind): void {
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
export function heroSpecial(w: World, u: Unit, k: HeroKind, mul: number): boolean {
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
