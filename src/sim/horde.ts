/** Horda: o passo de cada monstro (fluxo até o castelo, faixas, voo, ladrão, chamados). */
import { BUILDINGS, CONFIG, MONSTERS } from './config.ts';
import type { BuildingKind, MonsterDef, MonsterKind, Res } from './config.ts';
import { DIRS, hexToWorld } from './hex.ts';
import { castle, tileAt } from './world.ts';
import type { Building, Monster, Unit, World } from './world.ts';
import { DT, RES_NAME, blockedFor, center, dist, isTrap, tileIndexAt, toast } from './common.ts';
import { damageBuilding } from './buildings.ts';
import { killUnit } from './combat.ts';
import { monsterHpMul } from './waves.ts';

/** Morcego chamado por um vampiro, ao lado dele (2026-11-09). */
export function summonBat(w: World, owner: Monster): void {
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
export function thiefSteals(w: World, m: Monster, b: Building, T: NonNullable<MonsterDef['thief']>): void {
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
export function thiefEscapes(w: World, m: Monster): void {
  w.monsters.delete(m.id);
  w.events.push({ type: 'monsterFx', fx: 'poof', x: m.x, z: m.z });
  if (m.loot && m.loot.n > 0) toast(w, `O acumulador fugiu com ${m.loot.n} de ${RES_NAME[m.loot.res]}.`, 'bad');
}

/** Esqueleto levantado por um necromante, ao lado dele. */
export function summonSkeleton(w: World, owner: Monster): void {
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


// ---------------------------------------------------------------- horda


/** Morcego: voa reto até a casa (ou prédio) mais perto, ignorando muralhas. */
export function flyStep(w: World, m: Monster, def: (typeof MONSTERS)[MonsterKind]): void {
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

export function monstersStep(w: World): void {
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
      const next = ti >= 0 ? stepTile(w, m, ti) : -1;
      let target: Building | undefined;
      if (here && here.b >= 0 && !isTrap(w.buildings.get(here.b))) target = w.buildings.get(here.b);
      // Empacado na quina de uma rocha (a faixa própria mirava do outro lado dela): volta ao meio
      // do ladrilho e anda uns segundos pelo meio do caminho.
      if ((m.laneOffT ?? 0) > 0) m.laneOffT = (m.laneOffT ?? 0) - DT;
      if (!target && here && (m.recenterT ?? 0) > 0) {
        m.recenterT = (m.recenterT ?? 0) - DT;
        const c = hexToWorld(here.q, here.r);
        tx = c.x;
        tz = c.z;
        moving = true;
      } else if (!target && next >= 0) {
        const nt = w.tiles[next]!;
        const c = hexToWorld(nt.q, nt.r);
        let wall = false;
        if (nt.b >= 0) {
          const b = w.buildings.get(nt.b);
          wall = !!b && !isTrap(b);
          if (b && !isTrap(b) && dist(m.x, m.z, c.x, c.z) < 1.0 + CONFIG.monsterReach * 0.6) target = b;
        }
        // Chão livre: cada um mira a sua faixa do ladrilho, não o centro (sem fila indiana).
        const [ox, oz] = wall || (m.laneOffT ?? 0) > 0 ? [0, 0] : laneOffset(w, m);
        tx = c.x + ox;
        tz = c.z + oz;
        moving = true;
      } else if (!target) {
        const c = castle(w);
        if (c) {
          const p = center(c);
          if (dist(m.x, m.z, p.x, p.z) < 1.0 + CONFIG.monsterReach) target = c;
          else {
            const [ox, oz] = (m.laneOffT ?? 0) > 0 ? [0, 0] : laneOffset(w, m);
            tx = p.x + ox;
            tz = p.z + oz;
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

/**
 * Próximo ladrilho do monstro (2026-11-09): entre os vizinhos livres que chegam mais perto do
 * castelo, um escolhido pelo id e pelo ladrilho (fica o mesmo enquanto ele está ali). Todo passo
 * desce no campo de fluxo, então ninguém se perde; sem vizinho livre assim, vale o campo de fluxo.
 */
export function stepTile(w: World, m: Monster, ti: number): number {
  const best = w.flow[ti]!;
  if (best < 0) return best;
  const here = w.flowDist[ti]!;
  const t = w.tiles[ti]!;
  const opts: number[] = [];
  for (const [dq, dr] of DIRS) {
    const n = tileAt(w, t.q + dq, t.r + dr);
    if (!n || n.terrain === 'rock' || n.terrain === 'water') continue;
    if (n.b >= 0 && !isTrap(w.buildings.get(n.b))) continue;
    if (w.flowDist[n.i]! < here - 0.5) opts.push(n.i);
  }
  if (opts.length < 2) return opts[0] ?? best;
  const h = Math.sin(m.id * 91.345 + ti * 17.13) * 24634.6345;
  return opts[Math.floor((h - Math.floor(h)) * opts.length)]!;
}

/**
 * Faixa do monstro no caminho (2026-11-09): um desvio fixo pelo id (direção e tamanho sorteados
 * de um jeito que não mexe no sorteio da partida) e um balanço lento de lado, cada um no seu ritmo.
 */
export function laneOffset(w: World, m: Monster): [number, number] {
  const frac = (v: number) => v - Math.floor(v);
  const f1 = frac(Math.sin(m.id * 12.9898) * 43758.5453);
  const f2 = frac(Math.sin(m.id * 78.233) * 12345.6789);
  const a = f1 * Math.PI * 2;
  const r = CONFIG.horde.lane * (0.35 + 0.65 * f2);
  const sway = CONFIG.horde.sway * Math.sin(w.time * 1.1 + m.id * 1.7);
  return [Math.cos(a) * r + Math.sin(a) * sway, Math.sin(a) * r - Math.cos(a) * sway];
}

/** Anda um passo na direção de (tx, tz): piche, separação dos vizinhos e escorregar pela borda. */
export function stepToward(w: World, m: Monster, tx: number, tz: number, ms: Monster[], speedMul = 1): void {
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
      const sep = CONFIG.horde.sep;
      if (od < sep * sep && od > 1e-6) {
        const k = (sep - Math.sqrt(od)) * 2.5;
        vx += (ox / Math.sqrt(od)) * k;
        vz += (oz / Math.sqrt(od)) * k;
      }
    }
    const nx = m.x + vx * DT;
    const nz = m.z + vz * DT;
    const ti = tileIndexAt(w, nx, nz);
    const cur = tileIndexAt(w, m.x, m.z);
    const x0 = m.x;
    const z0 = m.z;
    if (ti !== cur && blockedFor(w, ti)) {
      // Não entra em ladrilho ocupado: escorrega pela borda.
      if (!blockedFor(w, tileIndexAt(w, nx, m.z))) m.x = nx;
      else if (!blockedFor(w, tileIndexAt(w, m.x, nz))) m.z = nz;
    } else {
      m.x = nx;
      m.z = nz;
    }
    m.facing = Math.atan2(vx, vz);
    // Quase parado tentando andar: depois de 0,8 s volta ao meio do ladrilho e anda pelo meio.
    if (Math.hypot(m.x - x0, m.z - z0) < sp * DT * 0.25) m.stuckT = (m.stuckT ?? 0) + DT;
    else if (m.stuckT) m.stuckT = Math.max(0, m.stuckT - DT * 2);
    if ((m.stuckT ?? 0) > 0.8) {
      m.stuckT = 0;
      m.recenterT = 1.2;
      m.laneOffT = 5;
    }
  }
}
