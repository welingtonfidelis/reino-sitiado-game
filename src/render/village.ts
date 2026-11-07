/**
 * Vila: as casas deixam de ser casinhas soltas no meio da grama.
 *
 * - Cada casa ganha um quintal de terra batida, que se junta com o da casa vizinha, e uma trilha
 *   de terra da porta até a rua mais próxima (ou até o castelo): da casa mais perto do castelo
 *   para a mais longe, cada trilha acaba onde encontra uma trilha já feita, então elas se juntam
 *   como ruas. Casa encostada noutra não abre trilha: o quintal já liga as duas.
 * - A porta dá para a trilha; a casa é um pouco maior e o quintal tem barril, caixa, feno ou
 *   carrinho dos lados da porta; o quintal fica aberto, sem cerca.
 * - Três casas encostadas fazem uma pracinha com poço no canto em comum. Um bairro de 5 casas
 *   ganha uma taverna e um de 8, um mercado (a casa do meio troca de modelo; as vagas são as
 *   mesmas). Tudo é só desenho: a simulação não muda.
 */
import { BUILDINGS, DIRS, castle, hexToWorld, tileAt } from '../sim/index.ts';
import type { Building, Tile, World } from '../sim/index.ts';
import type { StaticKey } from './assets.ts';

export interface Home {
  model: 'casaA' | 'casaB' | 'taverna' | 'mercado';
  x: number;
  z: number;
  /** Rotação em Y: a porta (o +Z do modelo) fica virada para a trilha. */
  rot: number;
  scale: number;
}

export interface Piece {
  key: StaticKey;
  x: number;
  z: number;
  rot: number;
  scale: number;
  id: number;
}

export interface VillagePlan {
  homes: Map<number, Home>;
  pieces: Piece[];
  /** Centros dos quintais e as trilhas (pontos no mundo), para pintar o chão. */
  yards: { x: number; z: number }[];
  trails: { x: number; z: number }[][];
}

export const HOUSE_SCALE = 1.15;
/** Bairro com tantas casas ganha taverna e mercado. */
export const TAVERN_AT = 5;
export const MARKET_AT = 8;

/** Vetor unitário do centro do hexágono para a borda que dá no vizinho k. */
function edge(k: number): { x: number; z: number } {
  const [dq, dr] = DIRS[k]!;
  const o = hexToWorld(dq, dr);
  const d = Math.hypot(o.x, o.z);
  return { x: o.x / d, z: o.z / d };
}

/** Rotação que leva a frente do modelo (+Z) para a direção (x, z). */
function facing(x: number, z: number): number {
  return Math.atan2(x, z);
}

function isHome(w: World, t: Tile | null): Building | null {
  if (!t || t.b < 0) return null;
  const b = w.buildings.get(t.b);
  return b && b.kind === 'casa' && b.built >= 1 ? b : null;
}

/** Custo de a trilha passar pelo ladrilho (Infinity = não passa). */
function trailCost(w: World, t: Tile): number {
  if (t.terrain === 'rock' || t.terrain === 'water' || t.terrain === 'rift') return Infinity;
  let c = t.terrain === 'forest' ? 2.5 : 1;
  if (t.b >= 0) {
    const b = w.buildings.get(t.b);
    if (!b) return c;
    if (b.kind === 'castelo' || b.kind === 'portao') return c;
    if (b.kind === 'casa') return c + 2;
    if (BUILDINGS[b.kind].trap) return c + 1;
    return Infinity;
  }
  return c;
}

/**
 * Caminho mais barato de cada ladrilho até a rede de ruas (castelo, trilhas e casas já ligadas):
 * `next` é o vizinho seguinte (-1 = já é rede ou não chega) e `dist`, o custo até lá. A rede só
 * cresce, então cada pedaço novo só corrige o que ficou mais perto (sem refazer a busca toda).
 */
class Streets {
  readonly next: Int32Array;
  readonly dist: Float32Array;
  readonly net: Uint8Array;
  private cost: Float32Array;
  private nb: Int32Array;
  private hk: number[] = [];
  private hv: number[] = [];

  constructor(w: World) {
    const n = w.grid.size;
    this.next = new Int32Array(n).fill(-1);
    this.dist = new Float32Array(n).fill(Infinity);
    this.net = new Uint8Array(n);
    this.cost = new Float32Array(n).fill(Infinity);
    this.nb = new Int32Array(n * 6).fill(-1);
    for (const t of w.list) {
      this.cost[t.i] = trailCost(w, t);
      DIRS.forEach(([dq, dr], k) => {
        const o = tileAt(w, t.q + dq, t.r + dr);
        if (o) this.nb[t.i * 6 + k] = o.i;
      });
    }
  }

  /** Põe o ladrilho na rede (vale depois do próximo `relax`). */
  add(i: number): void {
    this.net[i] = 1;
    if (this.dist[i] === 0) return;
    this.dist[i] = 0;
    this.next[i] = -1;
    this.push(0, i);
  }

  relax(): void {
    const { dist, next, cost, nb } = this;
    while (this.hk.length) {
      const [d, i] = this.pop();
      if (d > dist[i]!) continue;
      // A busca anda da rede para fora: chegar em i vindo do vizinho custa entrar em i.
      const nd = d + cost[i]!;
      for (let k = 0; k < 6; k++) {
        const n = nb[i * 6 + k]!;
        if (n < 0 || cost[n] === Infinity || nd >= dist[n]!) continue;
        dist[n] = nd;
        next[n] = i;
        this.push(nd, n);
      }
    }
  }

  private push(key: number, val: number): void {
    const { hk, hv } = this;
    hk.push(key);
    hv.push(val);
    for (let i = hk.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (hk[p]! <= hk[i]!) break;
      [hk[p], hk[i]] = [hk[i]!, hk[p]!];
      [hv[p], hv[i]] = [hv[i]!, hv[p]!];
      i = p;
    }
  }

  private pop(): [number, number] {
    const { hk, hv } = this;
    const top: [number, number] = [hk[0]!, hv[0]!];
    const lk = hk.pop()!;
    const lv = hv.pop()!;
    if (hk.length) {
      hk[0] = lk;
      hv[0] = lv;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < hk.length && hk[l]! < hk[m]!) m = l;
        if (r < hk.length && hk[r]! < hk[m]!) m = r;
        if (m === i) break;
        [hk[m], hk[i]] = [hk[i]!, hk[m]!];
        [hv[m], hv[i]] = [hv[i]!, hv[m]!];
        i = m;
      }
    }
    return top;
  }
}

export function planVillage(w: World): VillagePlan {
  const homes = new Map<number, Home>();
  const pieces: Piece[] = [];
  const yards: { x: number; z: number }[] = [];
  const trails: { x: number; z: number }[][] = [];
  const houses = [...w.buildings.values()].filter((b) => b.kind === 'casa' && b.built >= 1);
  if (!houses.length) return { homes, pieces, yards, trails };
  const c = castle(w);
  const cp = c ? hexToWorld(c.q, c.r) : { x: 0, z: 0 };

  // Bairros: casas encostadas, ligadas umas às outras.
  const homeAt = (q: number, r: number) => isHome(w, tileAt(w, q, r));
  const neighborsOf = (b: Building) => DIRS.map(([dq, dr]) => homeAt(b.q + dq, b.r + dr));
  const special = new Map<number, Home['model']>();
  const seen = new Set<number>();
  for (const h of houses) {
    if (seen.has(h.id)) continue;
    const group: Building[] = [];
    const queue = [h];
    seen.add(h.id);
    while (queue.length) {
      const b = queue.pop()!;
      group.push(b);
      for (const n of neighborsOf(b)) {
        if (n && !seen.has(n.id)) {
          seen.add(n.id);
          queue.push(n);
        }
      }
    }
    if (group.length < TAVERN_AT) continue;
    // A casa mais cercada de casas vira a taverna; a seguinte, o mercado.
    const ranked = group
      .map((b) => ({ b, n: neighborsOf(b).filter(Boolean).length }))
      .sort((a, z) => z.n - a.n || a.b.id - z.b.id);
    special.set(ranked[0]!.b.id, 'taverna');
    if (group.length >= MARKET_AT && ranked[1]) special.set(ranked[1].b.id, 'mercado');
  }

  // Pracinhas: o canto em comum de três casas encostadas ganha um poço (um a cada 3,5 m).
  const wells: { x: number; z: number }[] = [];
  for (const b of houses) {
    const ns = neighborsOf(b);
    for (let k = 0; k < 6; k++) {
      const a = ns[k];
      const d = ns[(k + 1) % 6];
      if (!a || !d || a.id < b.id || d.id < b.id) continue;
      const pa = hexToWorld(a.q, a.r);
      const pd = hexToWorld(d.q, d.r);
      const pb = hexToWorld(b.q, b.r);
      const x = (pa.x + pd.x + pb.x) / 3;
      const z = (pa.z + pd.z + pb.z) / 3;
      if (wells.some((o) => Math.hypot(o.x - x, o.z - z) < 3.5)) continue;
      wells.push({ x, z });
      pieces.push({ key: 'poco', x, z, rot: facing(cp.x - x, cp.z - z), scale: 0.75, id: -1 });
    }
  }

  // Ruas: da casa mais perto do castelo para a mais longe, cada uma liga a sua porta à rede (o
  // castelo, as trilhas já feitas e as casas já ligadas, cujo quintal emenda no da vizinha).
  const streets = new Streets(w);
  const { net, next } = streets;
  const first = new Map<number, number>();
  if (c) {
    streets.add(w.grid.idx(c.q, c.r));
    streets.relax();
    const far = Float32Array.from(streets.dist);
    const order = [...houses].sort((a, z) => far[w.grid.idx(a.q, a.r)]! - far[w.grid.idx(z.q, z.r)]! || a.id - z.id);
    for (const b of order) {
      const ti = w.grid.idx(b.q, b.r);
      const n = next[ti]!;
      const p = hexToWorld(b.q, b.r);
      const path: { x: number; z: number }[] = [];
      const tiles = [ti];
      if (n >= 0 && !isHome(w, w.tiles[n]!)) {
        // Da porta, de ladrilho em ladrilho, até encostar na rede.
        const e = hexToWorld(w.tiles[n]!.q - b.q, w.tiles[n]!.r - b.r);
        path.push({ x: p.x + e.x * 0.35, z: p.z + e.z * 0.35 });
        for (let i = n, guard = 0; i >= 0 && guard < 200; guard++) {
          const tt = w.tiles[i]!;
          path.push(hexToWorld(tt.q, tt.r));
          if (net[i]) break;
          tiles.push(i);
          i = next[i]!;
        }
      }
      // Encostada numa casa já ligada: o quintal faz a ligação, sem trilha.
      if (n >= 0) first.set(b.id, n);
      for (const i of tiles) streets.add(i);
      streets.relax();
      if (path.length) trails.push(path);
    }
  }

  for (const b of houses) {
    const p = hexToWorld(b.q, b.r);
    yards.push(p);
    // Porta: para o primeiro passo da trilha, se ele não cair noutra casa; senão, para o lado do castelo.
    let front = -1;
    const n = first.get(b.id) ?? -1;
    if (n >= 0) {
      const nt = w.tiles[n]!;
      if (!isHome(w, nt)) front = DIRS.findIndex(([dq, dr]) => b.q + dq === nt.q && b.r + dr === nt.r);
    }
    if (front < 0) {
      let best = -Infinity;
      for (let k = 0; k < 6; k++) {
        const e = edge(k);
        const dot = e.x * (cp.x - p.x) + e.z * (cp.z - p.z);
        if (dot > best && !homeAt(b.q + DIRS[k]![0], b.r + DIRS[k]![1])) {
          best = dot;
          front = k;
        }
      }
      if (front < 0) front = 0;
    }
    const f = edge(front);
    const s = { x: f.z, z: -f.x };
    const model = special.get(b.id) ?? (b.id % 2 ? 'casaB' : 'casaA');
    const scale = model === 'mercado' ? 0.85 : model === 'taverna' ? 1 : HOUSE_SCALE;
    const back = model === 'mercado' ? 0 : 0.12;
    let ox = -f.x * back;
    let oz = -f.z * back;
    // A casa se afasta do poço do canto, para abrir a pracinha.
    for (const o of wells) {
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.3) continue;
      ox += (dx / d) * 0.3;
      oz += (dz / d) * 0.3;
    }
    homes.set(b.id, { model, x: p.x + ox, z: p.z + oz, rot: facing(f.x, f.z), scale });
    // Enfeites dos dois lados da porta (fora da taverna e do mercado, que já vêm cheios).
    if (model === 'casaA' || model === 'casaB') {
      const put = (key: StaticKey, u: number, v: number, turn: number, sc: number) => {
        const x = p.x + f.x * u + s.x * v;
        const z = p.z + f.z * u + s.z * v;
        if (wells.some((o) => Math.hypot(o.x - x, o.z - z) < 0.45)) return;
        pieces.push({ key, x, z, rot: facing(f.x, f.z) + turn, scale: sc, id: b.id });
      };
      const side = b.id % 4 < 2 ? 1 : -1;
      switch (b.id % 3) {
        case 0:
          put('barril', 0.42, 0.66 * side, 0, 1.4);
          put('balde', 0.62, 0.5 * side, 0.6, 1.4);
          put('caixa', 0.4, -0.68 * side, 0.3, 1.6);
          break;
        case 1:
          put('feno', 0.4, -0.66 * side, 1.2, 1);
          put('saco', 0.6, -0.48 * side, 0.4, 1);
          put('barril', 0.45, 0.66 * side, 0, 1.4);
          break;
        default:
          put('carrinho', 0.45, 0.68 * side, 0.5, 0.9);
          put('caixa', 0.38, -0.66 * side, 0.2, 1.6);
          put('caixa', 0.58, -0.56 * side, 0.9, 1.4);
      }
    }
  }
  return { homes, pieces, yards, trails };
}
