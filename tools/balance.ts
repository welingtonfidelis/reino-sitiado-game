/**
 * Robô de equilíbrio (Etapa 7): joga partidas inteiras sem tela e diz em que onda o castelo caiu.
 *
 *   node tools/balance.ts [sementes] [onda máxima]   (RAIO=13 usa o mapa antigo; HEROIS=0, sem heróis)
 *
 * "nada" não faz nada (só o castelo atira); "robô" segue uma ordem simples de construção,
 * recruta, conserta e escolhe a primeira bênção. Serve para comparar números da configuração.
 */
import {
  BUILDINGS,
  CONFIG,
  build,
  canBuild,
  castle,
  castleCap,
  chooseBlessing,
  createWorld,
  forgeUpgrade,
  hexDist,
  housing,
  recruit,
  repairAll,
  step,
  HERO_KINDS,
  buyHero,
  heroOf,
  towerSlots,
  upgradeCastle,
  workers,
} from '../src/sim/index.ts';
import type { BuildingKind, UnitKind, World } from '../src/sim/index.ts';

const SEEDS = Number(process.argv[2] ?? 6);
// HEROIS=0 roda sem heróis, para comparar.
const HEROES = process.env.HEROIS !== '0';
// RAIO=13 roda no mapa antigo, para comparar.
if (process.env.RAIO) (CONFIG as { mapRadius: number }).mapRadius = Number(process.env.RAIO);
const MAX_WAVE = Number(process.argv[3] ?? 40);

function count(w: World, k: BuildingKind): number {
  let n = 0;
  for (const b of w.buildings.values()) if (b.kind === k) n++;
  return n;
}

function units(w: World, k: UnitKind): number {
  let n = 0;
  for (const u of w.units.values()) if (u.kind === k && u.state !== 'dead') n++;
  return n;
}

/** Lugar mais perto do castelo (entre min e max) onde dá para erguer. */
function spot(w: World, k: BuildingKind, min: number, max: number): { q: number; r: number } | null {
  let best: { q: number; r: number } | null = null;
  let bd = Infinity;
  for (const t of w.list) {
    const d = hexDist(t.q, t.r, 0, 0);
    if (d < min || d > max) continue;
    if (canBuild(w, k, t.q, t.r)) continue;
    const score = d + (t.deco % 7) * 0.01;
    if (score < bd) {
      bd = score;
      best = { q: t.q, r: t.r };
    }
  }
  return best;
}

function put(w: World, k: BuildingKind, min = 1, max = 5): boolean {
  const p = spot(w, k, min, max);
  return !!p && build(w, k, p.q, p.r) === null;
}

function trainAt(w: World, k: BuildingKind): void {
  for (const b of w.buildings.values()) if (b.kind === k && b.built >= 1 && b.queue === 0) recruit(w, b.id);
}

function bot(w: World): void {
  if (w.report) chooseBlessing(w, w.report.choices[0] ?? null);
  if (w.waveState === 'calm') repairAll(w);
  const wave = w.wave;
  const wk = workers(w);
  // Economia.
  let pop = 0;
  for (const u of w.units.values()) if (u.state !== 'dead') pop++;
  if (count(w, 'fazenda') < Math.ceil(pop / 16) + 1 && put(w, 'fazenda', 2, 7)) return;
  if (housing(w) - wk <= 1 && housing(w) < castleCap(w) && put(w, 'casa', 1, 5)) return;
  if (count(w, 'serraria') < (wave >= 3 ? 3 : 2) && put(w, 'serraria', 2, 9)) return;
  if (count(w, 'pedreira') < (wave >= 6 ? 2 : 1) && put(w, 'pedreira', 2, 9)) return;
  if (wave >= 2 && count(w, 'mina') < 1 && put(w, 'mina', 2, 9)) return;
  // Defesa.
  if (count(w, 'campo') < 1 && put(w, 'campo', 2, 4)) return;
  if (count(w, 'torre') < Math.min(2 + wave, 12) && put(w, 'torre', 2, 4)) return;
  if (units(w, 'arqueiro') < count(w, 'torre') * towerSlots()) trainAt(w, 'campo');
  if (wave >= 2 && count(w, 'quartel') < 1 && put(w, 'quartel', 2, 4)) return;
  if (units(w, 'soldado') < Math.min(4 + wave / 2, 12)) trainAt(w, 'quartel');
  if (wave >= 4 && count(w, 'oficina') < 1 && put(w, 'oficina', 2, 4)) return;
  if (units(w, 'engenheiro') < 2) trainAt(w, 'oficina');
  const lvl = castle(w)?.level ?? 1;
  if ((wave >= 5 && lvl < 2) || (wave >= 12 && lvl < 3) || (wave >= 20 && lvl < 4)) upgradeCastle(w);
  // Etapa 14: compra heróis assim que der (castelo no nível pedido e ouro sobrando).
  if (HEROES && lvl >= CONFIG.heroes.castleLevel) for (const k of HERO_KINDS) if (!heroOf(w, k) && buyHero(w, k) === null) return;
  if (wave >= 6 && count(w, 'forja') < 1 && put(w, 'forja', 2, 5)) return;
  if (count(w, 'forja') > 0) for (const l of ['armaduras', 'armas', 'flechas'] as const) forgeUpgrade(w, l);
  if (wave >= 8 && count(w, 'catapulta') < Math.min(2 + Math.floor(wave / 10), 4) && put(w, 'catapulta', 2, 4)) return;
  if (wave >= 5 && count(w, 'estacas') < Math.min(wave, 12) && put(w, 'estacas', 5, 6)) return;
  if (wave >= 7 && count(w, 'capela') < 1 && put(w, 'capela', 2, 5)) return;
  if (units(w, 'clerigo') < 2) trainAt(w, 'capela');
  if (wave >= 6 && count(w, 'mina') < 2) {
    // A segunda mina vai num veio de cristal (para os magos).
    const t = w.list
      .filter((x) => x.terrain === 'crystal' && x.b < 0 && hexDist(x.q, x.r, 0, 0) < w.grid.R)
      .sort((a, b) => hexDist(a.q, a.r, 0, 0) - hexDist(b.q, b.r, 0, 0))[0];
    if (t && build(w, 'mina', t.q, t.r) === null) return;
  }
  if (wave >= 8 && count(w, 'torreMago') < 1 && put(w, 'torreMago', 2, 5)) return;
  if (units(w, 'mago') < 4 && w.res.cristal > 8) trainAt(w, 'torreMago');
  if (wave >= 10 && count(w, 'estabulo') < 1 && put(w, 'estabulo', 2, 5)) return;
  if (units(w, 'cavaleiro') < 3) trainAt(w, 'estabulo');
}

const VERBOSE = process.env.VERBOSE === '1';

function play(seed: number, act: boolean): { wave: number; kills: number } {
  const w = createWorld(seed);
  const every = CONFIG.tps * 2;
  let lastWave = 0;
  for (let i = 0; i < CONFIG.tps * 60 * 120 && !w.lost && w.wave < MAX_WAVE; i++) {
    if (act && i % every === 0) bot(w);
    else if (!act && w.report) chooseBlessing(w, w.report.choices[0] ?? null);
    step(w);
    if (VERBOSE && act && w.wave !== lastWave) {
      lastWave = w.wave;
      const kinds: Record<string, number> = {};
      for (const b of w.buildings.values()) kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
      const tr: Record<string, number> = {};
      for (const u of w.units.values()) if (u.state !== 'dead') tr[u.kind] = (tr[u.kind] ?? 0) + 1;
      const r = Object.fromEntries(Object.entries(w.res).map(([k, v]) => [k, Math.floor(v)]));
      console.log(`  onda ${w.wave} t=${Math.round(w.time)}s castelo ${Math.round(castle(w)?.hp ?? 0)} res ${JSON.stringify(r)} prédios ${JSON.stringify(kinds)} gente ${JSON.stringify(tr)}`);
    }
    w.events.length = 0;
  }
  return { wave: w.wave, kills: w.kills };
}

for (const [name, act] of [['nada', false], ['robô', true]] as const) {
  const res: number[] = [];
  const t0 = Date.now();
  for (let s = 1; s <= SEEDS; s++) res.push(play(s * 7919, act).wave);
  const avg = res.reduce((a, b) => a + b, 0) / res.length;
  console.log(`${name}: caiu nas ondas ${res.join(' ')} | média ${avg.toFixed(1)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
void BUILDINGS;
