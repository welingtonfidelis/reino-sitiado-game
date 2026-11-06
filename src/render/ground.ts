/**
 * Chão contínuo por cima da grade hexagonal (que continua valendo para a lógica). Cada
 * hexágono vira seis triângulos sem fresta, e a cor de cada vértice mistura os terrenos
 * vizinhos com um ruído suave: não se vê divisa de ladrilho. A borda do mapa ganha uma
 * encosta de terra, como uma maquete. As linhas da grade são uma malha à parte, ligada só
 * ao construir ou mover.
 */
import * as THREE from 'three';
import { HEX, hexToWorld, worldToHex } from '../sim/index.ts';
import type { Terrain, World } from '../sim/index.ts';

const COLORS: Record<Terrain, THREE.Color> = {
  grass: new THREE.Color('#86b84c'),
  forest: new THREE.Color('#5a8a38'),
  rock: new THREE.Color('#8f8a78'),
  ore: new THREE.Color('#9c8c68'),
  crystal: new THREE.Color('#8a98a4'),
  rift: new THREE.Color('#4a3f52'),
};
const EARTH_TOP = new THREE.Color('#6a4a2e');
const EARTH_BOTTOM = new THREE.Color('#3a2818');

function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Ruído de valor suave (0 a 1). */
function noise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function terrainAt(w: World, x: number, z: number): Terrain | null {
  const h = worldToHex(x, z);
  if (!w.grid.has(h.q, h.r)) return null;
  return w.tiles[w.grid.idx(h.q, h.r)]!.terrain;
}

/** Cor do chão num ponto: média dos terrenos em volta, com manchas claras e escuras. */
function colorAt(w: World, x: number, z: number, own: Terrain, out: THREE.Color): THREE.Color {
  out.setRGB(0, 0, 0);
  let n = 0;
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const t = terrainAt(w, x + Math.cos(a) * 0.55, z + Math.sin(a) * 0.55) ?? own;
    out.add(COLORS[t]);
    n++;
  }
  out.add(COLORS[own]).multiplyScalar(1 / (n + 1));
  const k = 0.9 + 0.16 * noise(x * 0.35, z * 0.35) + 0.05 * (noise(x * 1.7, z * 1.7) - 0.5);
  return out.multiplyScalar(k);
}

export function buildGround(w: World): { ground: THREE.Mesh; grid: THREE.LineSegments } {
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const grid: number[] = [];
  const c = new THREE.Color();
  const corner = (cx: number, cz: number, k: number) => {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    return { x: cx + Math.cos(a) * HEX, z: cz + Math.sin(a) * HEX };
  };
  const push = (x: number, y: number, z: number, color: THREE.Color, nx = 0, ny = 1, nz = 0) => {
    pos.push(x, y, z);
    col.push(color.r, color.g, color.b);
    nor.push(nx, ny, nz);
  };
  for (const t of w.list) {
    const p = hexToWorld(t.q, t.r);
    const mid = colorAt(w, p.x, p.z, t.terrain, new THREE.Color());
    for (let k = 0; k < 6; k++) {
      const a = corner(p.x, p.z, k);
      const b = corner(p.x, p.z, k + 1);
      // Ordem centro, b, a: a face olha para cima.
      push(p.x, 0, p.z, mid);
      push(b.x, 0, b.z, colorAt(w, b.x, b.z, t.terrain, c));
      push(a.x, 0, a.z, colorAt(w, a.x, a.z, t.terrain, c));
      grid.push(a.x, 0.02, a.z, b.x, 0.02, b.z);
      // Borda do mapa: encosta de terra descendo.
      const ea = Math.PI / 3 + (k * Math.PI) / 3;
      const nx = Math.cos(ea);
      const nz = Math.sin(ea);
      if (terrainAt(w, p.x + nx * 2, p.z + nz * 2) === null) {
        const d = -1.4;
        push(a.x, 0, a.z, EARTH_TOP, nx, 0, nz);
        push(b.x, 0, b.z, EARTH_TOP, nx, 0, nz);
        push(b.x, d, b.z, EARTH_BOTTOM, nx, 0, nz);
        push(a.x, 0, a.z, EARTH_TOP, nx, 0, nz);
        push(b.x, d, b.z, EARTH_BOTTOM, nx, 0, nz);
        push(a.x, d, a.z, EARTH_BOTTOM, nx, 0, nz);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  ground.receiveShadow = true;
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false }));
  lines.visible = false;
  lines.renderOrder = 3;
  return { ground, grid: lines };
}
