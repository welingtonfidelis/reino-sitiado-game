/**
 * Caminhos. A horda segue um campo de fluxo até o castelo (Dijkstra a partir dele), em que
 * prédios e muralhas custam mais para atravessar: quando o reino está todo cercado, o
 * caminho mais barato passa por uma muralha, e o monstro para e bate nela. A gente do reino
 * anda por busca em largura: rocha e prédios bloqueiam, portões deixam passar.
 */
import { BUILDINGS } from './config.ts';
import { DIRS } from './hex.ts';
import { castle, tileAt } from './world.ts';
import type { Tile, World } from './world.ts';

function terrainCost(t: Tile): number {
  if (t.terrain === 'rock' || t.terrain === 'water') return Infinity;
  return t.terrain === 'forest' ? 1.5 : 1;
}

/** Custo de a horda entrar no ladrilho (prédio em cima = custo de derrubar). */
export function enterCost(w: World, t: Tile): number {
  const c = terrainCost(t);
  if (t.b < 0) return c;
  const b = w.buildings.get(t.b);
  if (!b || b.kind === 'castelo') return c;
  return c + BUILDINGS[b.kind].breakCost;
}

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.k.length;
  }
  push(key: number, val: number): void {
    const k = this.k;
    const v = this.v;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= k[i]!) break;
      [k[p], k[i]] = [k[i]!, k[p]!];
      [v[p], v[i]] = [v[i]!, v[p]!];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.k;
    const v = this.v;
    const top: [number, number] = [k[0]!, v[0]!];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length > 0) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l]! < k[m]!) m = l;
        if (r < k.length && k[r]! < k[m]!) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i]!, k[m]!];
        [v[m], v[i]] = [v[i]!, v[m]!];
        i = m;
      }
    }
    return top;
  }
}

export function computeFlow(w: World): void {
  const c = castle(w);
  w.flow.fill(-1);
  w.flowDist.fill(Infinity);
  if (!c) return;
  const start = w.grid.idx(c.q, c.r);
  w.flowDist[start] = 0;
  const h = new Heap();
  h.push(0, start);
  while (h.size > 0) {
    const [d, i] = h.pop();
    if (d > w.flowDist[i]!) continue;
    const t = w.tiles[i]!;
    const step = enterCost(w, t);
    for (const [dq, dr] of DIRS) {
      const n = tileAt(w, t.q + dq, t.r + dr);
      if (!n || n.terrain === 'rock' || n.terrain === 'water') continue;
      const nd = d + step;
      if (nd < w.flowDist[n.i]!) {
        w.flowDist[n.i] = nd;
        w.flow[n.i] = i;
        h.push(nd, n.i);
      }
    }
  }
}

/** A gente do reino passa por aqui? (o destino sempre aceita, para chegar ao trabalho) */
export function allyPass(w: World, t: Tile, goal: number): boolean {
  if (t.terrain === 'rock' || t.terrain === 'water') return false;
  if (t.b < 0 || t.i === goal) return true;
  const b = w.buildings.get(t.b);
  if (!b) return true;
  return b.built >= 1 && (b.kind === 'portao' || b.kind === 'fazenda');
}

/** Busca em largura entre dois ladrilhos; devolve os índices depois do primeiro. */
export function allyPath(w: World, from: number, to: number): number[] | null {
  if (from === to) return [];
  const prev = new Int32Array(w.grid.size).fill(-2);
  prev[from] = -1;
  const queue = [from];
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h]!;
    if (i === to) break;
    const t = w.tiles[i]!;
    for (const [dq, dr] of DIRS) {
      const n = tileAt(w, t.q + dq, t.r + dr);
      if (!n || prev[n.i] !== -2) continue;
      if (!allyPass(w, n, to)) continue;
      prev[n.i] = i;
      queue.push(n.i);
    }
  }
  if (prev[to] === -2) return null;
  const out: number[] = [];
  for (let i = to; i !== from; i = prev[i]!) out.push(i);
  return out.reverse();
}

/** Ladrilhos alcançáveis a pé a partir do castelo (onde os soldados podem lutar). */
export function computeReach(w: World): void {
  const c = castle(w);
  w.reach.fill(0);
  if (!c) return;
  const start = w.grid.idx(c.q, c.r);
  w.reach[start] = 1;
  const queue = [start];
  for (let h = 0; h < queue.length; h++) {
    const t = w.tiles[queue[h]!]!;
    for (const [dq, dr] of DIRS) {
      const n = tileAt(w, t.q + dq, t.r + dr);
      if (!n || w.reach[n.i]) continue;
      if (!allyPass(w, n, -1)) continue;
      w.reach[n.i] = 1;
      queue.push(n.i);
    }
  }
}
