/**
 * Grade hexagonal "pontuda" (vértices em ±z), em coordenadas axiais (q, r), igual aos
 * ladrilhos do KayKit Medieval Hexagon Pack: 2 m de lado a lado em x, 2,31 m de ponta a ponta
 * em z. O centro do mapa (0, 0) é o castelo. +z é o sul (perto da câmera), -z o norte.
 */
export const SQRT3 = Math.sqrt(3);
/** Raio do hexágono (centro até um vértice). Lado a lado = SQRT3 * HEX = 2. */
export const HEX = 2 / SQRT3;

/** As seis vizinhas, em ordem: leste, nordeste, noroeste, oeste, sudoeste, sudeste. */
export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export function hexToWorld(q: number, r: number): { x: number; z: number } {
  return { x: 2 * (q + r / 2), z: 1.5 * HEX * r };
}

export function hexDist(q1: number, r1: number, q2: number, r2: number): number {
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Hexágono que contém o ponto (x, z) do chão. */
export function worldToHex(x: number, z: number): { q: number; r: number } {
  const fq = ((SQRT3 / 3) * x - z / 3) / HEX;
  const fr = ((2 / 3) * z) / HEX;
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 };
}

/** Índices de um mapa hexagonal de raio R guardado num quadrado (2R+1)². */
export class HexIndex {
  readonly R: number;
  readonly side: number;
  constructor(R: number) {
    this.R = R;
    this.side = 2 * R + 1;
  }
  has(q: number, r: number): boolean {
    return hexDist(q, r, 0, 0) <= this.R;
  }
  idx(q: number, r: number): number {
    return (q + this.R) * this.side + (r + this.R);
  }
  q(i: number): number {
    return Math.floor(i / this.side) - this.R;
  }
  r(i: number): number {
    return (i % this.side) - this.R;
  }
  get size(): number {
    return this.side * this.side;
  }
}

/** Gerador pseudoaleatório com semente (mulberry32), com o estado à vista para salvar. */
export interface Rand {
  (): number;
  state: { a: number };
}

export function rng(seed: number, a0?: number): Rand {
  const st = { a: a0 ?? seed >>> 0 };
  const f = (() => {
    st.a = (st.a + 0x6d2b79f5) >>> 0;
    let t = st.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rand;
  f.state = st;
  return f;
}
