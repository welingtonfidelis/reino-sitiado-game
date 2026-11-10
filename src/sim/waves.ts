/** Ondas: tamanho, vida da horda, modificadores, saída pelas fendas e fim da onda. */
import { CONFIG, MODES, MONSTERS } from './config.ts';
import type { Mode, MonsterKind } from './config.ts';
import { hexToWorld } from './hex.ts';
import { BLESSING_EVERY, BLESSING_IDS, emptyStats } from './blessings.ts';
import { castle } from './world.ts';
import type { Monster, WaveMod, WaveTheme, World } from './world.ts';
import { WAVE_MODS, WAVE_THEMES } from './world.ts';
import { regrow } from './deposits.ts';
import { DT, toast } from './common.ts';

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

/** Tamanho da onda já com os modificadores (Enxame traz mais esqueletos) e a família da onda. */
export function waveSizeWithMods(n: number, mods: WaveMod[], mode: Mode = 'normal', theme: WaveTheme | null = null): ReturnType<typeof waveSize> {
  const size = waveSize(n, mode);
  if (mods.includes('enxame')) size.esqueleto = Math.round(size.esqueleto * CONFIG.waveMods.swarm) + 3;
  return theme ? themed(size, theme, n) : size;
}

/**
 * Família da onda n (2026-11-10): das ondas 8, 13, 18... (no fácil, da 13 em diante), uma a cada
 * cinco, nunca na do chefe nem na dos modificadores; sorteio fixo pela semente entre as famílias
 * que já apareceram.
 */
export function themeForWave(seed: number, n: number, mode: Mode = 'normal'): WaveTheme | null {
  const T = CONFIG.waveThemes;
  if (n < (mode === 'facil' ? T.fromEasy : T.from) || n % T.every !== T.at % T.every) return null;
  if (n % MODES[mode].bossEvery === 0) return null;
  const all = (Object.keys(WAVE_THEMES) as WaveTheme[]).filter((k) => n >= MONSTERS[THEME_LEAD[k]].from);
  const h = (Math.imul((seed ^ (n * 374761393)) >>> 0, 668265263) + 0x27d4eb2d) >>> 0;
  return all[(h >>> 7) % all.length] ?? null;
}

/** O monstro que dá cara a cada família. */
const THEME_LEAD: Record<WaveTheme, MonsterKind> = { matilha: 'lobisomem', ossos: 'esqueleto', orcs: 'orc' };

/**
 * A onda vira uma família só, com a mesma vida somada (sem contar chefes, que ficam). A Matilha
 * pode vir com até `maxMul` vezes mais monstros que a onda comum (os lobos têm pouca vida).
 */
function themed(size: Record<MonsterKind, number>, theme: WaveTheme, n: number): Record<MonsterKind, number> {
  const at = (k: MonsterKind) => n >= MONSTERS[k].from;
  let budget = 0;
  let total = 0;
  const out = { ...size };
  for (const k of Object.keys(size) as MonsterKind[]) {
    if (MONSTERS[k].boss) continue;
    budget += size[k] * MONSTERS[k].hp;
    total += size[k];
    out[k] = 0;
  }
  const mix: [MonsterKind, number][] =
    theme === 'matilha'
      ? [['lobisomem', 1], ...(at('morcego') ? ([['morcego', 0.15]] as [MonsterKind, number][]) : [])]
      : theme === 'orcs'
        ? [['orc', 0.72], ...(at('bruto') ? ([['bruto', 0.18]] as [MonsterKind, number][]) : []), ...(at('troll') ? ([['troll', 0.1]] as [MonsterKind, number][]) : [])]
        : [['esqueleto', 0.62], ...(at('esqueletoGuerreiro') ? ([['esqueletoGuerreiro', 0.32]] as [MonsterKind, number][]) : []), ...(at('necromante') ? ([['necromante', 0.06]] as [MonsterKind, number][]) : [])];
  // Na Noite dos ossos o vampiro (meio-chefe morto-vivo) continua.
  if (theme === 'ossos' && size.vampiro) {
    out.vampiro = size.vampiro;
    budget -= size.vampiro * MONSTERS.vampiro.hp;
  }
  const wsum = mix.reduce((a, [, x]) => a + x, 0);
  const avg = mix.reduce((a, [k, x]) => a + (x / wsum) * MONSTERS[k].hp, 0);
  const count = Math.max(1, Math.min(Math.round(total * CONFIG.waveThemes.maxMul), Math.round(Math.max(0, budget) / avg)));
  for (const [k, x] of mix) out[k] = Math.round((count * x) / wsum);
  out[mix[0]![0]] = Math.max(1, out[mix[0]![0]]);
  return out;
}

export function startWave(w: World): void {
  w.wave++;
  w.waveMods = modsForWave(w.seed, w.wave, w.mode);
  w.waveTheme = themeForWave(w.seed, w.wave, w.mode);
  const size = waveSizeWithMods(w.wave, w.waveMods, w.mode, w.waveTheme);
  if (w.waveTheme) toast(w, `Onda ${w.wave}: ${WAVE_THEMES[w.waveTheme].name}! ${WAVE_THEMES[w.waveTheme].text}`, 'bad');
  // Aviso do chefe (2026-11-10): na saída da onda e, quando ele aparece, a trompa.
  const boss = (Object.keys(size) as MonsterKind[]).find((k) => MONSTERS[k].boss && size[k] > 0);
  if (boss) toast(w, `Chefe nesta onda: ${MONSTERS[boss].name}!`, 'bad');
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

export function spawnMonster(w: World, kind: MonsterKind, pack = -1): void {
  const n = openRifts(w.wave, w.mode);
  // O bando inteiro sai da mesma fenda; os bandos se revezam entre as fendas abertas.
  const pick = Math.floor(w.rand() * n);
  const rift = w.tiles[w.rifts[pack >= 0 ? (pack + w.wave) % n : pick]!]!;
  const p = hexToWorld(rift.q, rift.r);
  const def = MONSTERS[kind];
  const hp = def.hp * monsterHpMul(w.wave, w.mode, !!def.boss);
  const m: Monster = {
    homeX: p.x,
    homeZ: p.z,
    id: w.nextId++,
    kind,
    x: p.x + (w.rand() - 0.5) * CONFIG.horde.spawnJitter,
    z: p.z + (w.rand() - 0.5) * CONFIG.horde.spawnJitter,
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
  if (def.boss) {
    toast(w, `${def.name} saiu da fenda! ${def.blurb.replace('Chefe. ', '')}`, 'bad');
    w.events.push({ type: 'boss', kind, x: m.x, z: m.z });
  }
}


export function waves(w: World): void {
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
    // Em bandos (2026-11-09): o tamanho do bando muda a cada onda; os do mesmo bando saem quase
    // juntos e da mesma fenda, e o intervalo entre bandos guarda o ritmo médio de antes.
    const H = CONFIG.horde;
    const G = H.packMin + (w.wave % (H.packMax - H.packMin + 1));
    while (w.spawnT <= 0 && w.spawnQueue.length > 0) {
      const left = w.spawnQueue.length;
      spawnMonster(w, w.spawnQueue.shift()!, Math.floor(left / G));
      const gap = Math.min(0.6, every);
      w.spawnT += (left - 1) % G === 0 ? Math.max(gap, gap * G - H.packGap * (G - 1)) : H.packGap;
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
