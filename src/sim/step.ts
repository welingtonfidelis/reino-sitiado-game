/**
 * Um passo da simulação (1/20 s): obras, economia, chegada de trabalhadores, recrutas,
 * ondas, horda, tropas e defesas. Os eventos vão para `w.events`; quem chama esvazia.
 *
 * Cada parte mora no seu arquivo (2026-11-10): prédios em buildings.ts, economia em economy.ts,
 * gente do reino em people.ts, tropas em troops.ts, heróis em heroes.ts, luta em combat.ts,
 * ondas em waves.ts, horda em horde.ts e defesas em defenses.ts; o que é de todos, em common.ts.
 */
import { computeFlow, computeReach } from './path.ts';
import type { World } from './world.ts';
import { DT } from './common.ts';
import { construction } from './buildings.ts';
import { arrivals, drySites, economy } from './economy.ts';
import { assignArchers, assignJobs, recruiting } from './people.ts';
import { unitsStep } from './troops.ts';
import { waves } from './waves.ts';
import { monstersStep } from './horde.ts';
import { catapults, chapels, defenses, traps } from './defenses.ts';

export type { DmgSrc } from './common.ts';
export { formation } from './common.ts';
export { destroyBuilding, packTime, releaseFromBuilding } from './buildings.ts';
export { towerSlots, workSpot } from './people.ts';
export { damageMonster } from './combat.ts';
export { heroMul } from './heroes.ts';
export { modsForWave, monsterHpMul, openRifts, sideName, themeForWave, waveInterval, waveSize, waveSizeWithMods } from './waves.ts';

function cleanup(w: World): void {
  for (const m of w.monsters.values()) {
    if (m.state !== 'dead') continue;
    m.deadT += DT;
    if (m.deadT > 2.5) w.monsters.delete(m.id);
  }
  for (const u of w.units.values()) {
    if (u.state !== 'dead') continue;
    u.deadT += DT;
    if (u.deadT > 2.5) w.units.delete(u.id);
  }
}

/** Refaz caminhos e alcance depois de mudar prédios (também chamado pela tela). */
export function refresh(w: World): void {
  if (!w.dirty) return;
  computeFlow(w);
  computeReach(w);
  w.dirty = false;
  w.ver++;
}

export function step(w: World): void {
  if (w.lost) return;
  w.tick++;
  w.time += DT;
  refresh(w);
  construction(w);
  economy(w);
  drySites(w);
  arrivals(w);
  assignJobs(w);
  recruiting(w);
  assignArchers(w);
  waves(w);
  monstersStep(w);
  unitsStep(w);
  defenses(w);
  catapults(w);
  traps(w);
  chapels(w);
  cleanup(w);
}
