/**
 * Etapa 17: recursos que acabam e reaparecem.
 *
 * Cada hexágono de floresta, rocha e veio tem estoque. A serraria, a pedreira e a mina tiram dele
 * (`deplete`); quando acaba, a floresta vira grama com toras, a rocha vira cascalho e o veio vira
 * chão comum, e o hexágono entra na conta do tipo (`w.regrow`). No fim de cada onda (`regrow`),
 * quando a conta de um tipo chega ao `due`, nasce uma mancha nova desse tipo num lugar que:
 *
 * 1. é grama, sem prédio, obra, ruína ou lugar guardado de mudança;
 * 2. fica a 1 hexágono ou mais de qualquer prédio (e de lugar guardado);
 * 3. fica a `castleMin` hexágonos ou mais do castelo;
 * 4. fica a `riftMin` hexágonos ou mais de cada portal, aberto ou fechado;
 * 5. fica longe da borda (`edge`) e fora de água e fenda;
 * 6. não tem gente nem monstro em cima;
 * 7. fica a `spread` hexágonos ou mais de outra mancha do mesmo tipo (regra que cai se não houver
 *    lugar nenhum).
 *
 * Rocha nova não pode fechar caminho: cada portal ainda chega ao castelo e a gente ainda chega a
 * todo prédio que alcançava. Se fechar, a mancha é desfeita e o sorteio tenta outro lugar.
 */
import { CONFIG } from './config.ts';
import { DIRS, hexDist, worldToHex } from './hex.ts';
import { allyPass } from './path.ts';
import { castle, fullStock, tileAt } from './world.ts';
import type { Building, Deposit, Tile, World } from './world.ts';

/** Quanto do estoque ainda tem, em três degraus (2 cheio, 1 pela metade, 0 no fim). */
export function stage(t: Tile): number {
  const full = fullStock(t.terrain);
  if (full <= 0) return 0;
  const f = t.stock / full;
  return f > 2 / 3 ? 2 : f > 1 / 3 ? 1 : 0;
}

/** Quanto a plantação ainda dá, nos mesmos três degraus (e -1 quando já foi colhida). */
export function farmStage(b: Building): number {
  if (b.harvest <= 0) return -1;
  const f = b.harvest / CONFIG.farm.harvest;
  return f > 2 / 3 ? 2 : f > 1 / 3 ? 1 : 0;
}

/** Colhe `amount` da plantação; o degrau novo ou o fim pedem redesenho. */
export function harvest(w: World, b: Building, amount: number): void {
  const before = farmStage(b);
  b.harvest = Math.max(0, b.harvest - amount);
  if (farmStage(b) !== before) w.dirty = true;
}

/** Tira `amount` do hexágono; o degrau novo ou o fim pedem redesenho. */
export function deplete(w: World, t: Tile, amount: number): void {
  const before = stage(t);
  t.stock -= amount;
  if (t.stock <= 0) {
    exhaust(w, t);
    return;
  }
  if (stage(t) !== before) w.dirty = true;
}

function exhaust(w: World, t: Tile): void {
  const kind = t.terrain as Deposit;
  w.regrow[kind]++;
  t.left = kind === 'forest' ? 1 : 2;
  t.terrain = 'grass';
  t.stock = 0;
  w.dirty = true;
  w.land++;
  w.events.push({ type: 'depleted', i: t.i, terrain: kind });
}

// ---------------------------------------------------------------- onde nasce

interface Ctx {
  w: World;
  /** Ladrilhos com prédio ou lugar guardado de mudança. */
  taken: Uint8Array;
  /** Ladrilhos com gente ou monstro de pé. */
  crowded: Uint8Array;
  cq: number;
  cr: number;
  rifts: Tile[];
}

function context(w: World): Ctx {
  const taken = new Uint8Array(w.grid.size);
  for (const b of w.buildings.values()) {
    taken[w.grid.idx(b.q, b.r)] = 1;
    if (b.moveTo) taken[w.grid.idx(b.moveTo.q, b.moveTo.r)] = 1;
  }
  const crowded = new Uint8Array(w.grid.size);
  const mark = (x: number, z: number) => {
    const h = worldToHex(x, z);
    if (w.grid.has(h.q, h.r)) crowded[w.grid.idx(h.q, h.r)] = 1;
  };
  for (const u of w.units.values()) if (u.state !== 'dead') mark(u.x, u.z);
  for (const m of w.monsters.values()) if (m.state !== 'dead') mark(m.x, m.z);
  const c = castle(w);
  return { w, taken, crowded, cq: c?.q ?? 0, cr: c?.r ?? 0, rifts: w.rifts.map((i) => w.tiles[i]!) };
}

/** Regras 1 a 6 (e a 7 quando `spread`): o hexágono pode receber recurso do tipo `kind`? */
function canHost(x: Ctx, t: Tile, kind: Deposit, spread: boolean): boolean {
  const { w } = x;
  const D = CONFIG.deposits;
  if (t.terrain !== 'grass' || t.ruin || x.taken[t.i] || x.crowded[t.i]) return false;
  if (hexDist(t.q, t.r, 0, 0) > w.grid.R - D.edge) return false;
  if (hexDist(t.q, t.r, x.cq, x.cr) < D.castleMin) return false;
  for (const r of x.rifts) if (hexDist(t.q, t.r, r.q, r.r) < D.riftMin) return false;
  for (const [dq, dr] of DIRS) {
    const n = tileAt(w, t.q + dq, t.r + dr);
    if (n && x.taken[n.i]) return false;
  }
  if (spread) {
    const near = D.spread - 1;
    for (let dq = -near; dq <= near; dq++)
      for (let dr = Math.max(-near, -dq - near); dr <= Math.min(near, -dq + near); dr++) {
        const n = tileAt(w, t.q + dq, t.r + dr);
        if (n && n.terrain === kind) return false;
      }
  }
  return true;
}

/** Ladrilhos que a gente alcança a pé a partir do castelo (como `computeReach`). */
function allyReach(w: World): Uint8Array {
  const seen = new Uint8Array(w.grid.size);
  const c = castle(w);
  if (!c) return seen;
  const queue = [w.grid.idx(c.q, c.r)];
  seen[queue[0]!] = 1;
  for (let h = 0; h < queue.length; h++) {
    const t = w.tiles[queue[h]!]!;
    for (const [dq, dr] of DIRS) {
      const n = tileAt(w, t.q + dq, t.r + dr);
      if (!n || seen[n.i] || !allyPass(w, n, -1)) continue;
      seen[n.i] = 1;
      queue.push(n.i);
    }
  }
  return seen;
}

/** Prédios a que a gente chega (o próprio ladrilho ou um vizinho alcançado). */
function reachable(w: World): Set<number> {
  const seen = allyReach(w);
  const out = new Set<number>();
  for (const b of w.buildings.values()) {
    const t = tileAt(w, b.q, b.r)!;
    if (seen[t.i] || DIRS.some(([dq, dr]) => {
      const n = tileAt(w, b.q + dq, b.r + dr);
      return !!n && seen[n.i] === 1;
    }))
      out.add(b.id);
  }
  return out;
}

/** A horda sai de cada portal e chega ao castelo? (rocha e água não se atravessam). */
function riftsReach(w: World): boolean {
  const c = castle(w);
  if (!c) return true;
  const seen = new Uint8Array(w.grid.size);
  const queue = [w.grid.idx(c.q, c.r)];
  seen[queue[0]!] = 1;
  for (let h = 0; h < queue.length; h++) {
    const t = w.tiles[queue[h]!]!;
    for (const [dq, dr] of DIRS) {
      const n = tileAt(w, t.q + dq, t.r + dr);
      if (!n || seen[n.i] || n.terrain === 'rock' || n.terrain === 'water') continue;
      seen[n.i] = 1;
      queue.push(n.i);
    }
  }
  return w.rifts.every((i) => seen[i] === 1);
}

function pick<T>(w: World, list: T[]): T | undefined {
  return list.length ? list[Math.floor(w.rand() * list.length)] : undefined;
}

/**
 * Tenta pôr uma mancha de `kind` com `size` hexágonos (e, na rocha, `veins` veios encostados).
 * Devolve os ladrilhos que viraram recurso, ou null se não achou lugar.
 */
function place(w: World, kind: 'forest' | 'rock', size: number, min: number, veins: Deposit[]): Tile[] | null {
  const x = context(w);
  const before = kind === 'rock' ? reachable(w) : null;
  for (const spread of [true, false]) {
    const seeds = w.list.filter((t) => canHost(x, t, kind, spread));
    for (let tries = 0; tries < CONFIG.deposits.tries && seeds.length; tries++) {
      const seed = seeds.splice(Math.floor(w.rand() * seeds.length), 1)[0]!;
      const patch = [seed];
      const inPatch = new Set([seed.i]);
      while (patch.length < size) {
        const options: Tile[] = [];
        for (const p of patch)
          for (const [dq, dr] of DIRS) {
            const n = tileAt(w, p.q + dq, p.r + dr);
            if (n && !inPatch.has(n.i) && canHost(x, n, kind, false)) options.push(n);
          }
        const n = pick(w, options);
        if (!n) break;
        patch.push(n);
        inPatch.add(n.i);
      }
      if (patch.length < min) continue;
      // Veios encostados na rocha nova.
      const veinTiles: Tile[] = [];
      for (const v of veins) {
        const options: Tile[] = [];
        for (const p of patch)
          for (const [dq, dr] of DIRS) {
            const n = tileAt(w, p.q + dq, p.r + dr);
            if (n && !inPatch.has(n.i) && !veinTiles.includes(n) && canHost(x, n, v, false)) options.push(n);
          }
        const n = pick(w, options);
        if (n) veinTiles.push(n);
      }
      const all = [...patch, ...veinTiles];
      const old = all.map((t) => [t.terrain, t.stock, t.left] as const);
      patch.forEach((t) => (t.terrain = kind));
      veinTiles.forEach((t, k) => (t.terrain = veins[k]!));
      // Rocha não pode fechar caminho de ninguém.
      if (before) {
        const after = reachable(w);
        if (!riftsReach(w) || [...before].some((id) => !after.has(id))) {
          all.forEach((t, k) => ([t.terrain, t.stock, t.left] = old[k]!));
          continue;
        }
      }
      for (const t of all) {
        t.stock = fullStock(t.terrain);
        t.left = 0;
        t.deco = Math.floor(w.rand() * 1000);
      }
      return all;
    }
  }
  return null;
}

/** Quantos hexágonos a mancha nova tem: o que falta, entre o mínimo e o máximo do tipo. */
function sizeFor(w: World, owed: number, [lo, hi]: readonly number[]): number {
  const want = Math.max(lo!, Math.min(hi!, owed));
  return want + (want < hi! && w.rand() < 0.5 ? 1 : 0);
}

/** Fim da onda: repõe o que acabou, onde as regras deixam. */
export function regrow(w: World): void {
  const D = CONFIG.deposits;
  const owe = w.regrow;
  if (owe.forest >= D.due.forest) {
    const got = place(w, 'forest', sizeFor(w, owe.forest, D.size.forest), D.size.forest[0]!, []);
    if (got) {
      owe.forest = Math.max(0, owe.forest - got.length);
      sprout(w, got, 'forest', 'Uma floresta nova brotou.');
    }
  }
  const veinOwed = owe.ore + owe.crystal;
  if (owe.rock >= D.due.rock || veinOwed >= D.due.vein) {
    // Veios: cristal primeiro se faltar cristal, depois ferro; no máximo `veins[1]`.
    const veins: Deposit[] = [];
    let c = owe.crystal;
    let o = owe.ore;
    while (veins.length < D.size.veins[1]! && c + o > 0) {
      if (c > 0 && (veins.length % 2 === 0 || o === 0)) {
        veins.push('crystal');
        c--;
      } else {
        veins.push('ore');
        o--;
      }
    }
    const size = owe.rock >= D.due.rock ? sizeFor(w, owe.rock, D.size.rock) : D.size.rock[0]!;
    const got = place(w, 'rock', size, D.size.rock[0]!, veins);
    if (got) {
      const rocks = got.filter((t) => t.terrain === 'rock').length;
      owe.rock = Math.max(0, owe.rock - rocks);
      owe.crystal = Math.max(0, owe.crystal - got.filter((t) => t.terrain === 'crystal').length);
      owe.ore = Math.max(0, owe.ore - got.filter((t) => t.terrain === 'ore').length);
      const vein = got.some((t) => t.terrain === 'crystal') ? ' com cristal' : got.some((t) => t.terrain === 'ore') ? ' com ferro' : '';
      sprout(w, got, 'rock', `Uma rocha nova apareceu${vein}.`);
    }
  }
}

function sprout(w: World, tiles: Tile[], terrain: Deposit, text: string): void {
  w.dirty = true;
  w.land++;
  w.events.push({ type: 'sprout', tiles: tiles.map((t) => t.i), terrain });
  w.events.push({ type: 'toast', text, tone: 'good' });
}
