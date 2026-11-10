/** Luta: dano em monstro, queda de gente e herói, tiro de flecha e a escolha de alvo de quem luta. */
import { CONFIG, MONSTERS, UNITS, isHero } from './config.ts';
import { epitaph } from './blessings.ts';
import { castle } from './world.ts';
import type { Monster, Unit, World } from './world.ts';
import { DT, RES_NAME, center, dist, nearestMonster, setGoalFresh, tileIndexAt, toast, walk } from './common.ts';
import type { DmgSrc } from './common.ts';

export function killUnit(w: World, u: Unit): void {
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
    w.events.push({ type: 'death', x: m.x, z: m.z, monster: true, kind: m.kind });
    // Acumulador derrubado com a mochila cheia: o roubo volta para o reino.
    if (m.loot && m.loot.n > 0) {
      w.res[m.loot.res] += m.loot.n;
      w.events.push({ type: 'monsterFx', fx: 'moedas', x: m.x, z: m.z });
      w.events.push({ type: 'recovered', res: m.loot.res, n: m.loot.n });
      toast(w, `Recuperou ${m.loot.n} de ${RES_NAME[m.loot.res]} do acumulador!`, 'good');
      m.loot = undefined;
    }
  }
}


/** Flecha (`fire`: de fogo, da torre de nível 3; faz o que a bênção Flechas em brasa faz). */
export function shoot(w: World, x: number, y: number, z: number, m: Monster, dmg: number, fire = false): void {
  w.events.push({ type: 'shot', x1: x, y1: y, z1: z, x2: m.x, y2: MONSTERS[m.kind].flying ? CONFIG.flyHeight : 0.35, z2: m.z, fire: fire || undefined });
  damageMonster(w, m, dmg * w.mods.arrowDmg * (1 + CONFIG.forge.step.flechas * w.forge.flechas), 'arrow');
  if (fire && m.state !== 'dead' && !MONSTERS[m.kind].immuneArrows) m.burnT = 0;
  // Flecha em brasa acende o piche em que o alvo está.
  if (fire || w.blessings.includes('brasa')) {
    const ti = tileIndexAt(w, m.x, m.z);
    const b = ti >= 0 ? w.buildings.get(w.tiles[ti]!.b) : undefined;
    if (b && b.kind === 'piche' && b.built >= 1 && b.burn <= 0) b.burn = CONFIG.pitch.burn;
  }
}

/**
 * Alvo de quem luta a pé: primeiro a área do posto; sem nada ali, quem não tem ordem do jogador
 * sai em socorro (2026-11-09). Também nota quando a muralha deixa a horda fora do alcance.
 */
export function meleeTarget(w: World, u: Unit, engage: number): Monster | undefined {
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
export function helpTarget(w: World, u: Unit, src: DmgSrc): Monster | null {
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
export function chase(w: World, u: Unit, m: Monster): boolean {
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
export function rangedHelp(w: World, u: Unit, src: DmgSrc): boolean {
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
export function wallHint(w: World, u: Unit, engage: number): void {
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

/** Herói não morre: desmaia, some para dentro do castelo e volta depois de downTime. */
export function knockDown(w: World, u: Unit): void {
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
