/** Economia: comida, produção dos prédios, recurso que acaba e chegada de gente. */
import { BUILDINGS, CONFIG, MODES } from './config.ts';
import { addUnit, castleCap, castleDoor, housing, isExtractor, population, sourceOf, workers } from './world.ts';
import type { World } from './world.ts';
import { deplete, harvest } from './deposits.ts';
import { DT, toast } from './common.ts';
import { releaseFromBuilding } from './buildings.ts';

// ---------------------------------------------------------------- economia

export function economy(w: World): void {
  const pop = population(w);
  w.res.comida -= ((pop * CONFIG.eatPerMin) / 60) * DT;
  if (w.res.comida <= 0) {
    w.res.comida = 0;
    if (!w.hungry) toast(w, 'A comida acabou. Ninguém chega e o trabalho fica mais lento.', 'bad');
    w.hungry = true;
  } else if (w.res.comida > 2) w.hungry = false;
  const k = w.hungry ? MODES[w.mode].hungryWork : 1;
  // Etapa 18: no fácil, nada se esgota.
  const depletes = MODES[w.mode].depletes;
  for (const b of w.buildings.values()) {
    const def = BUILDINGS[b.kind];
    if (b.built < 1 || !def.produces || !def.rate) continue;
    // Etapa 17: serraria, pedreira e mina tiram do hexágono de recurso; sem ele, param.
    const src = isExtractor(b.kind) ? sourceOf(w, b) : null;
    if (isExtractor(b.kind) && !src) continue;
    // Plantação colhida até o fim: espera replantar.
    if (b.kind === 'fazenda' && b.harvest <= 0) continue;
    let present = 0;
    // Quem foi levar o trabalho ao castelo conta como no serviço (2026-11-10), menos se fugiu.
    for (const id of b.workers) {
      const u = w.units.get(id);
      if (u && (u.state === 'work' || (u.trip && u.hideIn === undefined && u.state === 'walk'))) present++;
    }
    if (present === 0) continue;
    // Mina em veio azul: cristal no lugar do ferro (Etapa 5).
    const crystal = b.kind === 'mina' && src?.terrain === 'crystal';
    const res = crystal ? 'cristal' : def.produces;
    const rate = crystal ? CONFIG.crystalRate : def.rate;
    const base = (rate / 60) * DT * present * k;
    const got = base * w.mods.prod[res];
    w.res[res] += got;
    w.stats.prod[res] += got;
    // O estoque gasta o tirado sem as bênçãos: elas são ganho, não pressa para acabar.
    if (src && depletes) deplete(w, src, base);
    if (b.kind === 'fazenda' && depletes) harvest(w, b, base);
  }
}

/**
 * Etapa 17: serraria sem floresta, pedreira sem rocha ou mina sem veio para e solta quem
 * trabalha nela (vão para outro serviço); volta sozinha se o recurso aparecer de novo ao lado
 * (depois de uma mudança de lugar). A plantação colhida até o fim também para, até replantar.
 */
export function drySites(w: World): void {
  if (w.tick % 10 !== 3) return;
  for (const b of w.buildings.values()) {
    const farm = b.kind === 'fazenda';
    if ((!isExtractor(b.kind) && !farm) || b.built < 1) continue;
    const dry = farm ? b.harvest <= 0 : !sourceOf(w, b);
    if (dry === b.dry) continue;
    b.dry = dry;
    if (!dry) continue;
    releaseFromBuilding(w, b);
    if (farm) toast(w, 'Plantação colhida até o fim: replante pelo menu dela.', 'warn');
    else {
      const what = b.kind === 'serraria' ? 'floresta' : b.kind === 'pedreira' ? 'rocha' : 'veio';
      toast(w, `${BUILDINGS[b.kind].name} sem ${what} por perto: mude de lugar.`, 'warn');
    }
    w.events.push({ type: 'dry', id: b.id });
  }
}

export function arrivals(w: World): void {
  w.arriveT += DT;
  if (w.arriveT < w.mods.arriveEvery) return;
  const pop = workers(w);
  const cap = castleCap(w);
  const room = housing(w);
  if (pop < room && pop < cap && w.res.comida >= CONFIG.minFoodToArrive) {
    const p = castleDoor(w);
    addUnit(w, 'trabalhador', p.x, p.z);
    w.arriveT = 0;
    w.flags.roof = false;
    w.flags.house = false;
    return;
  }
  w.arriveT = w.mods.arriveEvery;
  if (pop >= cap && room > pop && !w.flags.roof) {
    toast(w, `O reino chegou ao teto do castelo (${cap}). Melhore o castelo para crescer.`, 'warn');
    w.flags.roof = true;
  } else if (pop >= room && pop < cap && !w.flags.house && w.tick > CONFIG.tps * 30) {
    toast(w, 'Sem casa vaga: construa casas para chegarem mais trabalhadores.', 'info');
    w.flags.house = true;
  }
}
