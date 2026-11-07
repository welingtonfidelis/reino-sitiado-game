/**
 * O reino em 3D. O que é parado (chão, natureza, prédios, muralhas) é desenhado instanciado e
 * só é refeito quando `world.ver` muda. Gente e monstros são personagens com esqueleto;
 * flechas e barras de vida são instanciadas a cada quadro.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILDINGS, CONFIG, DIRS, HEX, hexToWorld, openRifts, tileAt } from '../sim/index.ts';
import type { Building, BuildingKind, SimEvent, World } from '../sim/index.ts';
import type { Art, CharKey, StaticKey, StaticModel } from './assets.ts';
import { CharView } from './chars.ts';
import { buildGround } from './ground.ts';
import type { FxLayer } from './fx.ts';
import type { Pose } from './chars.ts';

class Instanced {
  readonly meshes: THREE.InstancedMesh[] = [];
  count = 0;
  ids: number[] = [];
  private cap: number;
  constructor(scene: THREE.Scene, model: StaticModel, cap: number, cast: boolean, receive: boolean) {
    this.cap = cap;
    for (const p of model.parts) {
      const m = new THREE.InstancedMesh(p.geometry, p.material, cap);
      m.castShadow = cast;
      m.receiveShadow = receive;
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
      this.meshes.push(m);
    }
  }
  begin(): void {
    this.count = 0;
    this.ids = [];
  }
  push(m: THREE.Matrix4, id = -1): void {
    if (this.count >= this.cap) return;
    for (const mesh of this.meshes) mesh.setMatrixAt(this.count, m);
    this.ids.push(id);
    this.count++;
  }
  end(): void {
    for (const mesh of this.meshes) {
      mesh.count = this.count;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
}

const BAR_VERT = /* glsl */ `
varying vec3 vColor;
void main() {
  vec3 c = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float sx = length(instanceMatrix[0].xyz);
  float sy = length(instanceMatrix[1].xyz);
  float anchor = length(instanceMatrix[2].xyz);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  mv.x += position.x * sx - anchor * 0.5;
  mv.y += position.y * sy;
  vColor = instanceColor;
  gl_Position = projectionMatrix * mv;
}`;
const BAR_FRAG = /* glsl */ `
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }`;

/** Barras de vida sempre de frente para a câmera. */
class Bars {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  constructor(scene: THREE.Scene) {
    const g = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    const mat = new THREE.ShaderMaterial({ vertexShader: BAR_VERT, fragmentShader: BAR_FRAG, depthTest: false, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(g, mat, 1200);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1200 * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
  }
  begin(): void {
    this.n = 0;
  }
  /** Barra centrada em (x, y, z), largura w metros, fração f. */
  add(x: number, y: number, z: number, w: number, f: number, color: string): void {
    if (this.n + 2 > 1200) return;
    const h = 0.07;
    // A escala em z é a largura de referência: o shader alinha a barra pela borda esquerda.
    this.m.makeScale(w + 0.04, h + 0.04, w + 0.04).setPosition(x, y, z);
    this.put(this.m, '#120e0a');
    this.m.makeScale(Math.max(0.001, w * f), h, w).setPosition(x, y, z);
    this.put(this.m, color);
  }
  private put(m: THREE.Matrix4, color: string): void {
    this.mesh.setMatrixAt(this.n, m);
    this.mesh.setColorAt(this.n, this.c.set(color));
    this.n++;
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

interface Flight {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  t: number;
  dur: number;
}

const HOME: Record<BuildingKind, StaticKey> = {
  castelo: 'castelo',
  casa: 'casaA',
  fazenda: 'fazenda',
  serraria: 'serraria',
  pedreira: 'pedreira',
  mina: 'mina',
  muralha: 'muro',
  portao: 'portao',
  torre: 'torre',
  quartel: 'quartel',
  campo: 'campo',
  torreMago: 'torreMago',
  capela: 'capela',
  estabulo: 'estabulo',
  forja: 'forja',
  oficina: 'oficina',
  catapulta: 'catapulta',
  piche: 'obra',
  estacas: 'obra',
};

/** Altura do topo de cada prédio (para barras e para o arqueiro na torre). */
const TOP: Partial<Record<BuildingKind, number>> = { catapulta: 1.6, piche: 0.3, estacas: 0.6, castelo: 4.1, torre: 2.2, quartel: 1.7, campo: 1.8, muralha: 1.2, portao: 1.4, torreMago: 2.4, capela: 1.9, estabulo: 1.3, forja: 1.4, oficina: 1.3 };

/** Fosso de piche (Etapa 9): mancha escura e lustrosa no chão. */
function pitchModel(): StaticModel {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.62, 0.68, 0.04, 20).translate(0, 0.02, 0)];
  for (const [x, z, r] of [[0.3, 0.2, 0.09], [-0.25, -0.3, 0.07], [-0.4, 0.25, 0.06]] as const) parts.push(new THREE.SphereGeometry(r, 8, 6).scale(1, 0.5, 1).translate(x, 0.04, z));
  const geometry = mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
  return { parts: [{ geometry, material: new THREE.MeshPhongMaterial({ color: '#2a2018', specular: '#8a7a60', shininess: 60 }) }], box: new THREE.Box3(new THREE.Vector3(-0.86, 0, -0.86), new THREE.Vector3(0.86, 0.1, 0.86)) };
}

/** Estacas (Etapa 9): uma roda de pontas de madeira inclinadas para fora. */
function spikesModel(): StaticModel {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const r = k % 2 ? 0.55 : 0.3;
    const g = new THREE.ConeGeometry(0.06, 0.6, 5).translate(0, 0.3, 0);
    g.rotateZ(0.45).rotateY(-a).translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    parts.push(g.toNonIndexed());
  }
  const geometry = mergeGeometries(parts)!;
  return { parts: [{ geometry, material: new THREE.MeshLambertMaterial({ color: '#8a6238', flatShading: true }) }], box: new THREE.Box3(new THREE.Vector3(-0.7, 0, -0.7), new THREE.Vector3(0.7, 0.6, 0.7)) };
}

/** Plantação sem base hexagonal (Etapa 8): canteiro de terra com fileiras de trigo. */
function farmModel(): StaticModel {
  const plot = new THREE.BoxGeometry(1.5, 0.06, 1.2).translate(0, 0.03, 0);
  const rows: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) rows.push(new THREE.BoxGeometry(1.3, 0.16, 0.13).translate(0, 0.12, -0.44 + k * 0.22));
  const crop = mergeGeometries(rows)!;
  return {
    parts: [
      { geometry: plot, material: new THREE.MeshLambertMaterial({ color: '#7a5a3a' }) },
      { geometry: crop, material: new THREE.MeshLambertMaterial({ color: '#c9a646' }) },
    ],
    box: new THREE.Box3(new THREE.Vector3(-0.75, 0, -0.6), new THREE.Vector3(0.75, 0.2, 0.6)),
  };
}

/** Cristais de um veio azul (não há modelo de cristal no KayKit local): prismas de seis faces. */
function crystalModel(): StaticModel {
  const parts: THREE.BufferGeometry[] = [];
  const spots: [number, number, number, number, number][] = [
    [0, 0, 0.62, 0, 0],
    [0.18, 0.08, 0.42, 0.35, 0.4],
    [-0.16, 0.1, 0.46, -0.3, 1.2],
    [0.05, -0.17, 0.36, 0.25, 2.3],
    [-0.12, -0.12, 0.3, -0.4, 3.4],
  ];
  for (const [x, z, h, tilt, turn] of spots) {
    const g = new THREE.CylinderGeometry(0, 0.075 * (h / 0.4), h, 6, 1).translate(0, h / 2, 0);
    g.rotateZ(tilt).rotateY(turn).translate(x, 0, z);
    parts.push(g);
  }
  const geometry = mergeGeometries(parts)!;
  const material = new THREE.MeshLambertMaterial({ color: '#7fd8ff', emissive: '#1f5f9a', emissiveIntensity: 0.6, flatShading: true });
  return { parts: [{ geometry, material }], box: new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute) };
}

export class World3D {
  readonly scene: THREE.Scene;
  private art: Art;
  private sets = new Map<StaticKey, Instanced>();
  private ver = -1;
  private chars = new Map<number, CharView>();
  private flights: Flight[] = [];
  private bars: Bars;
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private rifts: THREE.Mesh[] = [];
  private ghost = new THREE.Group();
  private ghostMat = new THREE.MeshBasicMaterial({ color: '#8cc56a', transparent: true, opacity: 0.5, depthWrite: false });
  private ghostKey: string | null = null;
  private ring: THREE.LineLoop;
  private range: THREE.LineLoop;
  readonly sun: THREE.DirectionalLight;
  private time = 0;
  /** Tropas escolhidas pelo jogador (anel dourado no chão). */
  selectedUnits: number[] = [];
  private unitRings: THREE.InstancedMesh;
  private rallyFlag = new THREE.Group();
  private crystals!: Instanced;
  private orbs!: THREE.InstancedMesh;
  private spells: Flight[] = [];
  private batSlots = new Map<number, number>();
  /** Efeitos do pixelfx (carregados à parte, Etapa 3). */
  fx: FxLayer | null = null;
  /** Pixels de tela por metro (para o tamanho mínimo dos efeitos) e o giro da câmera. */
  pxPerMeter = 30;
  camYaw = Math.PI / 6;
  private burning = new Map<number, number>();
  private portals: number[] = [];
  private ground: THREE.Mesh | null = null;
  private grid: THREE.LineSegments | null = null;
  private water: THREE.Mesh | null = null;
  private farms!: Instanced;
  private pitch!: Instanced;
  private spikes!: Instanced;
  private rocksInFlight: Flight[] = [];
  private pitchFire = new Map<number, number[]>();
  private hemi!: THREE.HemisphereLight;
  private night = 0;

  constructor(scene: THREE.Scene, art: Art) {
    this.scene = scene;
    this.art = art;
    const big = (k: StaticKey, cap: number, cast = true, receive = false) => this.sets.set(k, new Instanced(scene, art.statics[k], cap, cast, receive));
    for (const k of ['arvoreA', 'arvoreB', 'arvoreC', 'arvoreD', 'montanhaA', 'montanhaB', 'montanhaC', 'morro', 'minerio', 'pedraA', 'pedraC', 'ruina'] as StaticKey[]) big(k, 400);
    for (const k of ['castelo', 'casaA', 'casaB', 'fazenda', 'moinho', 'serraria', 'pedreira', 'mina', 'torre', 'quartel', 'campo', 'obra', 'portao', 'bandeira', 'torreMago', 'capela', 'estabulo', 'forja', 'oficina'] as StaticKey[]) big(k, 200);
    this.crystals = new Instanced(scene, crystalModel(), 200, true, false);
    this.farms = new Instanced(scene, farmModel(), 120, true, true);
    this.pitch = new Instanced(scene, pitchModel(), 120, false, true);
    this.spikes = new Instanced(scene, spikesModel(), 160, true, false);
    big('catapulta', 100);
    big('pedraCerco', 40, false);
    for (const k of ['rochaA', 'rochaB', 'rochaC', 'rochaD'] as StaticKey[]) big(k, 300);
    const orbGeo = new THREE.SphereGeometry(0.11, 10, 8);
    this.orbs = new THREE.InstancedMesh(orbGeo, new THREE.MeshBasicMaterial({ color: '#b48cff' }), 64);
    this.orbs.count = 0;
    this.orbs.frustumCulled = false;
    scene.add(this.orbs);
    big('muro', 1400);
    big('poste', 700);
    big('flecha', 400, false);
    this.bars = new Bars(scene);

    const hemi = new THREE.HemisphereLight('#f4f6ff', '#6a5a44', 1.35);
    scene.add(hemi);
    this.hemi = hemi;
    const sun = new THREE.DirectionalLight('#fff4e4', 1.9);
    sun.position.set(-18, 34, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    // A sombra cobre o mapa inteiro (o canto do mapa fica a uns 2R metros do castelo).
    const reach = 2 * CONFIG.mapRadius + 5;
    sc.left = -reach;
    sc.right = reach;
    sc.top = reach;
    sc.bottom = -reach;
    sc.near = 1;
    sc.far = 90;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    // Contorno do hexágono selecionado e o alcance de quem atira.
    const hexPts: THREE.Vector3[] = [];
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      hexPts.push(new THREE.Vector3(Math.cos(a) * HEX * 0.96, 0.03, Math.sin(a) * HEX * 0.96));
    }
    this.ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(hexPts), new THREE.LineBasicMaterial({ color: '#e9b949' }));
    this.ring.visible = false;
    this.ring.renderOrder = 5;
    scene.add(this.ring);
    const circ: THREE.Vector3[] = [];
    for (let k = 0; k < 64; k++) circ.push(new THREE.Vector3(Math.cos((k / 64) * Math.PI * 2), 0.04, Math.sin((k / 64) * Math.PI * 2)));
    this.range = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circ), new THREE.LineDashedMaterial({ color: '#e9b949', dashSize: 0.4, gapSize: 0.3, transparent: true, opacity: 0.7 }));
    this.range.computeLineDistances();
    this.range.visible = false;
    scene.add(this.range);
    this.ghost.visible = false;
    scene.add(this.ghost);
    const gold = new THREE.MeshBasicMaterial({ color: '#e9b949', transparent: true, opacity: 0.9, depthWrite: false });
    this.unitRings = new THREE.InstancedMesh(new THREE.RingGeometry(0.2, 0.28, 24).rotateX(-Math.PI / 2), gold, 300);
    this.unitRings.count = 0;
    this.unitRings.frustumCulled = false;
    this.unitRings.renderOrder = 4;
    scene.add(this.unitRings);
    for (const part of art.statics.bandeira.parts) {
      const m = new THREE.Mesh(part.geometry, part.material);
      m.scale.setScalar(1.3);
      this.rallyFlag.add(m);
    }
    const base = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.34, 24).rotateX(-Math.PI / 2), gold);
    base.position.y = 0.03;
    this.rallyFlag.add(base);
    this.rallyFlag.visible = false;
    scene.add(this.rallyFlag);
  }

  /** Linhas da grade: só ao construir ou mover. */
  showGrid(on: boolean): void {
    if (this.grid) this.grid.visible = on;
  }

  /** Bandeira do ponto de encontro do prédio selecionado. */
  showRally(p: { x: number; z: number } | null): void {
    this.rallyFlag.visible = !!p;
    if (p) this.rallyFlag.position.set(p.x, 0, p.z);
  }

  /** Chão, fendas: só uma vez por partida. */
  buildTerrain(w: World): void {
    // Chão contínuo: a grade hexagonal fica só na lógica (e aparece ao construir).
    for (const o of [this.ground, this.grid, this.water]) {
      if (!o) continue;
      this.scene.remove(o);
      o.geometry.dispose();
    }
    const { ground, grid, water } = buildGround(w);
    this.ground = ground;
    this.grid = grid;
    this.water = water;
    this.scene.add(ground, grid);
    if (water) this.scene.add(water);
    for (const m of this.rifts) this.scene.remove(m);
    this.rifts = [];
    w.rifts.forEach((i) => {
      const t = w.tiles[i]!;
      const p = hexToWorld(t.q, t.r);
      const g = new THREE.Group();
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.82, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#07060a' }));
      hole.position.y = 0.02;
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.98, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9a4ad0', transparent: true }));
      rim.position.y = 0.03;
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(1.9, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#9a4ad0', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      glow.position.y = 0.04;
      g.add(hole, rim, glow);
      g.position.set(p.x, 0, p.z);
      this.scene.add(g);
      this.rifts.push(rim);
    });
    this.ver = -1;
  }

  private place(set: StaticKey, x: number, y: number, z: number, rot: number, scale = 1, id = -1, sx = scale): void {
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    this.s.set(sx, scale, scale);
    this.p.set(x, y, z);
    this.tmp.compose(this.p, this.q, this.s);
    this.sets.get(set)!.push(this.tmp, id);
  }

  private isWall(w: World, q: number, r: number): boolean {
    const t = tileAt(w, q, r);
    if (!t || t.b < 0) return false;
    const b = w.buildings.get(t.b);
    return !!b && (b.kind === 'muralha' || b.kind === 'portao');
  }

  /** Prédios, muralhas e natureza: refeito quando o mundo muda. */
  syncStatic(w: World): void {
    if (w.ver === this.ver) return;
    this.ver = w.ver;
    const keys: StaticKey[] = ['rochaA', 'rochaB', 'rochaC', 'rochaD', 'arvoreA', 'arvoreB', 'arvoreC', 'arvoreD', 'montanhaA', 'montanhaB', 'montanhaC', 'morro', 'minerio', 'pedraA', 'pedraC', 'ruina', 'castelo', 'casaA', 'casaB', 'fazenda', 'moinho', 'serraria', 'pedreira', 'mina', 'torre', 'quartel', 'campo', 'obra', 'portao', 'bandeira', 'muro', 'poste', 'torreMago', 'capela', 'estabulo', 'forja', 'oficina', 'catapulta'];
    for (const k of keys) this.sets.get(k)!.begin();
    this.crystals.begin();
    this.pitch.begin();
    this.spikes.begin();
    this.farms.begin();
    const sixth = Math.PI / 3;
    for (const t of w.list) {
      const p = hexToWorld(t.q, t.r);
      const rot = (t.deco % 6) * sixth;
      if (t.b >= 0) continue;
      if (t.ruin) this.place('ruina', p.x, 0, p.z, rot, 0.9);
      if (t.terrain === 'forest') this.place((['arvoreA', 'arvoreB', 'arvoreC', 'arvoreD'] as StaticKey[])[t.deco % 4]!, p.x, 0, p.z, rot);
      else if (t.terrain === 'rock') {
        // Rochedo de pedras soltas (Forest Nature Pack): sem a base sextavada das montanhas.
        const big = (['rochaC', 'rochaA'] as StaticKey[])[t.deco % 2]!;
        this.place(big, p.x + ((t.deco % 5) - 2) * 0.08, 0, p.z + ((t.deco % 3) - 1) * 0.1, (t.deco % 13) * 0.5, 1.9 + (t.deco % 4) * 0.15);
        this.place((['rochaB', 'rochaD'] as StaticKey[])[t.deco % 2]!, p.x + 0.55, 0, p.z - 0.35, t.deco * 0.7, 1.3);
        this.place('rochaA', p.x - 0.5, 0, p.z + 0.45, t.deco * 1.3, 0.9 + (t.deco % 3) * 0.2);
      }
      else if (t.terrain === 'crystal') {
        this.place('pedraA', p.x - 0.4, 0, p.z + 0.25, rot, 2.4);
        this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        this.tmp.compose(this.p.set(p.x + 0.1, 0, p.z - 0.05), this.q, this.s.setScalar(1.2));
        this.crystals.push(this.tmp);
      } else if (t.terrain === 'ore') {
        this.place('pedraA', p.x - 0.35, 0, p.z + 0.2, rot, 2.6);
        this.place('pedraC', p.x + 0.4, 0, p.z - 0.25, rot, 2.4);
        this.place('minerio', p.x, 0, p.z, rot, 1.4);
      } else if (t.terrain === 'grass' && !t.ruin && t.deco % 23 === 0 && Math.hypot(p.x, p.z) > 5) {
        this.place(t.deco % 2 ? 'pedraA' : 'pedraC', p.x + ((t.deco % 7) - 3) * 0.15, 0, p.z + ((t.deco % 5) - 2) * 0.15, rot, 1.4);
      }
    }
    for (const b of w.buildings.values()) {
      const p = hexToWorld(b.q, b.r);
      if (b.kind === 'muralha' || b.kind === 'portao') {
        this.wallPiece(w, b, p.x, p.z);
        continue;
      }
      if (b.built < 1) {
        this.place('obra', p.x, 0, p.z, 0, 0.85, b.id);
        continue;
      }
      let key = HOME[b.kind];
      if (b.kind === 'casa' && b.id % 2) key = 'casaB';
      const rot = b.kind === 'castelo' ? 0 : ((b.id * 7) % 6) * sixth;
      if (b.kind === 'piche' || b.kind === 'estacas') {
        this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.id * 0.7);
        this.tmp.compose(this.p.set(p.x, 0, p.z), this.q, this.s.setScalar(1));
        (b.kind === 'piche' ? this.pitch : this.spikes).push(this.tmp, b.id);
        continue;
      }
      if (b.kind === 'fazenda') {
        // Plantação própria, girada livre (Etapa 8), com o moinho num canto.
        const r2 = (b.id * 0.9) % Math.PI;
        this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r2);
        this.tmp.compose(this.p.set(p.x, 0, p.z), this.q, this.s.setScalar(1));
        this.farms.push(this.tmp, b.id);
        this.place('moinho', p.x + Math.cos(r2) * 0.8, 0, p.z - Math.sin(r2) * 0.8, r2, 0.8, b.id);
        continue;
      }
      this.place(key, p.x, 0, p.z, rot, 1, b.id);
      if (b.kind === 'castelo') this.place('bandeira', p.x, 4.0, p.z, 0, 1.2, b.id);
      if (b.kind === 'mina') this.place('minerio', p.x + 0.6, 0, p.z + 0.5, 0, 0.35, b.id);
    }
    for (const k of keys) this.sets.get(k)!.end();
    // Mina em veio azul mostra os cristais ao lado.
    for (const b of w.buildings.values()) {
      if (b.kind !== 'mina' || tileAt(w, b.q, b.r)?.terrain !== 'crystal') continue;
      const p = hexToWorld(b.q, b.r);
      this.tmp.compose(this.p.set(p.x + 0.6, 0, p.z + 0.5), this.q.identity(), this.s.setScalar(0.8));
      this.crystals.push(this.tmp);
    }
    this.crystals.end();
    this.farms.end();
    this.pitch.end();
    this.spikes.end();
  }

  private wallPiece(w: World, b: Building, x: number, z: number): void {
    const dirs: number[] = [];
    DIRS.forEach(([dq, dr], k) => {
      if (this.isWall(w, b.q + dq, b.r + dr)) dirs.push(k);
    });
    const ang = (k: number) => {
      const [dq, dr] = DIRS[k]!;
      const o = hexToWorld(dq, dr);
      return Math.atan2(o.z, o.x);
    };
    const grow = b.built < 1 ? Math.max(0.2, b.built) : 1;
    if (b.kind === 'portao') {
      // O portão segue a linha da muralha (dois vizinhos opostos), senão o primeiro vizinho.
      let a = dirs.length ? ang(dirs[0]!) : 0;
      for (const k of dirs) if (dirs.includes((k + 3) % 6)) a = ang(k);
      this.place(b.built < 1 ? 'obra' : 'portao', x, 0, z, -a, b.built < 1 ? 0.6 : 1, b.id);
      return;
    }
    for (const k of dirs) {
      const a = ang(k);
      // Meio muro do centro até a borda: dois meios formam um muro inteiro.
      this.place('muro', x + Math.cos(a) * 0.5, 0, z + Math.sin(a) * 0.5, -a, grow, b.id, 0.5);
    }
    const straight = dirs.length === 2 && (dirs[0]! + 3) % 6 === dirs[1];
    if (!straight) this.place('poste', x, 0, z, 0, 0.85 * grow, b.id);
  }

  /** Fantasma do que vai ser construído (verde pode, vermelho não). */
  setGhost(kind: BuildingKind | null, q: number, r: number, ok: boolean): void {
    if (!kind) {
      this.ghost.visible = false;
      return;
    }
    const key: StaticKey = kind === 'muralha' ? 'poste' : HOME[kind];
    if (this.ghostKey !== key) {
      this.ghost.clear();
      for (const part of this.art.statics[key].parts) this.ghost.add(new THREE.Mesh(part.geometry, this.ghostMat));
      this.ghostKey = key;
    }
    const p = hexToWorld(q, r);
    this.ghost.position.set(p.x, 0.01, p.z);
    this.ghostMat.color.set(ok ? '#8cc56a' : '#e2675a');
    this.ghost.visible = true;
    this.showRing(q, r, ok ? '#8cc56a' : '#e2675a', kind === 'torre' ? CONFIG.tower.range : 0);
  }

  showRing(q: number, r: number, color: string, range: number): void {
    const p = hexToWorld(q, r);
    this.ring.position.set(p.x, 0, p.z);
    (this.ring.material as THREE.LineBasicMaterial).color.set(color);
    this.ring.visible = true;
    this.range.visible = range > 0;
    if (range > 0) {
      this.range.position.set(p.x, 0, p.z);
      this.range.scale.setScalar(range);
    }
  }

  hideRing(): void {
    this.ring.visible = false;
    this.range.visible = false;
  }

  /** Prédio sob o raio (id) ou -1. */
  pickBuilding(ray: THREE.Raycaster): number {
    let best = -1;
    let bd = Infinity;
    for (const set of [this.farms, this.pitch, this.spikes])
    for (const m of set.meshes)
      for (const h of ray.intersectObject(m, false)) {
        const id = h.instanceId !== undefined ? (set.ids[h.instanceId] ?? -1) : -1;
        if (id >= 0 && h.distance < bd) {
          bd = h.distance;
          best = id;
        }
      }
    for (const [k, set] of this.sets) {
      if (k === 'flecha') continue;
      for (const m of set.meshes) {
        const hits = ray.intersectObject(m, false);
        for (const h of hits) {
          const id = h.instanceId !== undefined ? (set.ids[h.instanceId] ?? -1) : -1;
          if (id >= 0 && h.distance < bd) {
            bd = h.distance;
            best = id;
          }
        }
      }
    }
    return best;
  }

  topOf(b: Building): number {
    return TOP[b.kind] ?? 1.2;
  }

  /** Gente, monstros, flechas e barras: a cada quadro. */
  syncDynamic(w: World, events: SimEvent[], dt: number): void {
    this.time += dt;
    const fx = this.fx;
    const flip = (dx: number, dz: number) => dx * Math.cos(this.camYaw) - dz * Math.sin(this.camYaw) < 0;
    const castleAt = () => {
      for (const b of w.buildings.values()) if (b.kind === 'castelo') return hexToWorld(b.q, b.r);
      return null;
    };
    for (const e of events) {
      if (e.type === 'shot') {
        const d = Math.hypot(e.x2 - e.x1, e.z2 - e.z1);
        this.flights.push({ ...e, t: 0, dur: 0.12 + d / 22 });
      } else if (e.type === 'siege') {
        const d = Math.hypot(e.x2 - e.x1, e.z2 - e.z1);
        this.rocksInFlight.push({ x1: e.x1, y1: 1.5, z1: e.z1, x2: e.x2, y2: 0.2, z2: e.z2, t: 0, dur: 0.5 + d / 14 });
      } else if (e.type === 'spell') {
        const d = Math.hypot(e.x2 - e.x1, e.z2 - e.z1);
        this.spells.push({ x1: e.x1, y1: 0.7, z1: e.z1, x2: e.x2, y2: 0.3, z2: e.z2, t: 0, dur: 0.15 + d / 12 });
      } else if (!fx) continue;
      else if (e.type === 'hit') fx.play(e.fx, e.x, 0, e.z, { flip: flip(e.dx, e.dz), scale: e.fx === 'faisca' ? 0.6 : 1 });
      else if (e.type === 'death' && e.monster) fx.play('poof', e.x, 0, e.z, { flip: Math.random() < 0.5 });
      else if (e.type === 'monsterFx') fx.play(e.fx, e.x, 0, e.z);
      else if (e.type === 'destroyed') {
        const p = hexToWorld(e.q, e.r);
        fx.play('explosao', p.x, 0, p.z, { scale: e.kind === 'muralha' || e.kind === 'portao' ? 0.6 : 1 });
      } else if (e.type === 'waveEnd') {
        const p = castleAt();
        if (p) fx.play('moedas', p.x, 4.3, p.z);
      } else if (e.type === 'upgrade') {
        const p = castleAt();
        if (p) fx.play('nivel', p.x, 0, p.z + 0.9);
      }
    }
    // Personagens.
    const seen = new Set<number>();
    for (const u of w.units.values()) {
      seen.add(u.id);
      const kind: CharKey = u.kind === 'trabalhador' && u.id % 2 ? 'trabalhadorB' : u.kind;
      const v = this.charFor(u.id, kind);
      const y = 0;
      let pose: Pose = 'idle';
      if (u.state === 'dead') pose = 'death';
      else if (u.state === 'walk') pose = u.kind === 'cavaleiro' ? 'run' : 'walk';
      else if (u.state === 'fight') pose = u.kind === 'arqueiro' ? 'shoot' : u.kind === 'mago' ? 'cast' : u.kind === 'clerigo' ? 'heal' : 'attack';
      else if (u.state === 'tower' || u.state === 'shelter') {
        // Dentro da torre (as flechas saem das janelas) ou recolhido no castelo: não aparece.
        v.root.visible = false;
        v.update(dt);
        continue;
      } else if (u.state === 'work' && u.kind === 'engenheiro') {
        pose = 'repair';
      } else if (u.state === 'work') {
        const b = w.buildings.get(u.job);
        pose = b?.kind === 'fazenda' ? 'dig' : b?.kind === 'serraria' ? 'chop' : b ? 'pick' : 'idle';
      }
      if (u.kind === 'trabalhador' && u.state !== 'dead') {
        // A ferramenta do trabalho vai na mão desde que ele sai para o serviço.
        const jk = w.buildings.get(u.job)?.kind;
        v.setTool(jk === 'fazenda' ? 'pa' : jk === 'serraria' ? 'machadoLenha' : jk === 'pedreira' || jk === 'mina' ? 'picareta' : null);
      }
      v.root.visible = true;
      v.root.position.set(u.x, y, u.z);
      v.root.rotation.y = u.facing;
      v.play(pose);
      v.update(dt);
    }
    const bats = new Set<number>();
    for (const m of w.monsters.values()) {
      if (m.kind === 'morcego') {
        // Morcego: sprite do pixelfx voando, batendo asas em laço (Etapa 6).
        if (!fx) continue;
        bats.add(m.id);
        const y = CONFIG.flyHeight + Math.sin(this.time * 4 + m.id) * 0.12;
        let slot = this.batSlots.get(m.id);
        if (m.state === 'dead') {
          if (slot !== undefined) {
            fx.stop('morcego', slot);
            fx.play('poof', m.x, y - 0.4, m.z, { scale: 0.7 });
            this.batSlots.set(m.id, -1);
          }
          continue;
        }
        if (slot === undefined) {
          slot = fx.play('morcego', m.x, y, m.z, { loop: true, flip: flip(Math.sin(m.facing), Math.cos(m.facing)) });
          this.batSlots.set(m.id, slot);
        }
        if (slot >= 0) fx.move('morcego', slot, m.x, y, m.z);
        continue;
      }
      seen.add(m.id);
      const v = this.charFor(m.id, m.kind);
      v.root.position.set(m.x, 0, m.z);
      v.root.rotation.y = m.facing;
      v.play(m.state === 'dead' ? 'death' : m.state === 'attack' ? 'attack' : 'walk', m.kind === 'lobisomem' ? 1.5 : 1);
      v.update(dt);
    }
    for (const [id, slot] of this.batSlots) {
      if (bats.has(id)) continue;
      if (slot >= 0) fx?.stop('morcego', slot);
      this.batSlots.delete(id);
    }
    for (const [id, v] of this.chars) {
      if (seen.has(id)) continue;
      this.scene.remove(v.root);
      v.dispose();
      this.chars.delete(id);
    }
    // Anéis das tropas escolhidas.
    let n = 0;
    for (const id of this.selectedUnits) {
      const u = w.units.get(id);
      if (!u || u.state === 'dead' || n >= 300) continue;
      this.tmp.makeTranslation(u.x, 0.03, u.z);
      this.unitRings.setMatrixAt(n++, this.tmp);
    }
    this.unitRings.count = n;
    this.unitRings.instanceMatrix.needsUpdate = true;
    // Flechas em arco.
    const arrows = this.sets.get('flecha')!;
    arrows.begin();
    this.flights = this.flights.filter((f) => {
      f.t += dt;
      if (f.t < f.dur) return true;
      // A flecha chegou: faísca de impacto no alvo.
      fx?.play('faisca', f.x2, 0, f.z2, { flip: flip(f.x2 - f.x1, f.z2 - f.z1), scale: 0.8 });
      return false;
    });
    for (const f of this.flights) {
      const k = f.t / f.dur;
      const d = Math.hypot(f.x2 - f.x1, f.z2 - f.z1);
      const arc = d * 0.12;
      const x = f.x1 + (f.x2 - f.x1) * k;
      const z = f.z1 + (f.z2 - f.z1) * k;
      const y = f.y1 + (f.y2 - f.y1) * k + Math.sin(k * Math.PI) * arc;
      const vy = (f.y2 - f.y1) / f.dur + Math.cos(k * Math.PI) * Math.PI * arc / f.dur;
      const vh = d / f.dur;
      this.p.set(x, y, z);
      const look = new THREE.Matrix4().lookAt(this.p, new THREE.Vector3(x + (f.x2 - f.x1) / d, y + vy / vh, z + (f.z2 - f.z1) / d), new THREE.Vector3(0, 1, 0));
      this.q.setFromRotationMatrix(look);
      this.s.setScalar(3);
      this.tmp.compose(this.p, this.q, this.s);
      arrows.push(this.tmp);
    }
    arrows.end();
    // Pedras da catapulta: arco alto e explosão de terra onde caem.
    const rocks = this.sets.get('pedraCerco')!;
    rocks.begin();
    this.rocksInFlight = this.rocksInFlight.filter((f) => {
      f.t += dt;
      if (f.t >= f.dur) {
        fx?.play('explosao', f.x2, 0, f.z2, { scale: 0.45 });
        return false;
      }
      const k = f.t / f.dur;
      const d = Math.hypot(f.x2 - f.x1, f.z2 - f.z1);
      this.q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), f.t * 9);
      this.p.set(f.x1 + (f.x2 - f.x1) * k, f.y1 + (f.y2 - f.y1) * k + Math.sin(k * Math.PI) * (1.5 + d * 0.25), f.z1 + (f.z2 - f.z1) * k);
      this.tmp.compose(this.p, this.q, this.s.setScalar(1.3));
      rocks.push(this.tmp);
      return true;
    });
    rocks.end();
    // Feitiços do mago: esfera que voa e explode em mana no alvo.
    let n2 = 0;
    this.spells = this.spells.filter((f) => {
      f.t += dt;
      if (f.t >= f.dur) {
        fx?.play('mana', f.x2, 0, f.z2, { flip: flip(f.x2 - f.x1, f.z2 - f.z1) });
        return false;
      }
      const k = f.t / f.dur;
      const y = f.y1 + (f.y2 - f.y1) * k + Math.sin(k * Math.PI) * 0.6;
      if (n2 < 64) {
        this.tmp.makeTranslation(f.x1 + (f.x2 - f.x1) * k, y, f.z1 + (f.z2 - f.z1) * k);
        this.orbs.setMatrixAt(n2++, this.tmp);
      }
      return true;
    });
    this.orbs.count = n2;
    this.orbs.instanceMatrix.needsUpdate = true;
    // Barras: obra (dourada), prédio ferido, gente e monstros feridos.
    this.bars.begin();
    for (const b of w.buildings.values()) {
      const p = hexToWorld(b.q, b.r);
      const top = this.topOf(b) + 0.35;
      if (b.built < 1) this.bars.add(p.x, top, p.z, 1, b.built, '#e9b949');
      else if (b.hp < b.maxHp) this.bars.add(p.x, top, p.z, 1.2, b.hp / b.maxHp, b.kind === 'castelo' ? '#c8483a' : '#8cc56a');
    }
    for (const u of w.units.values()) {
      if (u.state === 'dead' || u.hp >= u.maxHp) continue;
      this.bars.add(u.x, 0.85, u.z, 0.5, u.hp / u.maxHp, '#8cc56a');
    }
    for (const m of w.monsters.values()) {
      if (m.state === 'dead' || m.hp >= m.maxHp) continue;
      const big = m.kind === 'golem' || m.kind === 'golemOssos';
      const h = big ? 2.3 : m.kind === 'troll' ? 1.5 : m.kind === 'bruto' ? 1.35 : m.kind === 'morcego' ? CONFIG.flyHeight + 0.45 : 0.9;
      this.bars.add(m.x, h, m.z, big ? 1.4 : 0.5, m.hp / m.maxHp, '#e2675a');
    }
    this.bars.end();
    if (this.water) (this.water.material as THREE.ShaderMaterial).uniforms.uTime!.value = this.time;
    // Noite sem lua (modificador de onda): a luz cai devagar e volta no fim da onda.
    const nightGoal = w.waveState !== 'calm' && w.waveMods.includes('noite') ? 1 : 0;
    this.night += (nightGoal - this.night) * Math.min(1, dt * 1.5);
    this.sun.intensity = 1.9 * (1 - 0.65 * this.night);
    this.hemi.intensity = 1.35 * (1 - 0.45 * this.night);
    this.hemi.color.setRGB(0.96 - 0.4 * this.night, 0.97 - 0.32 * this.night, 1);
    if (fx) {
      // Fogo nos prédios com menos da metade da vida.
      const alive = new Set<number>();
      for (const b of w.buildings.values()) {
        if (b.kind === 'muralha' || b.kind === 'portao') continue;
        const hot = b.built >= 1 && b.hp < b.maxHp * 0.5;
        const slot = this.burning.get(b.id);
        if (hot) {
          alive.add(b.id);
          const p = hexToWorld(b.q, b.r);
          if (slot === undefined) {
            const i = fx.play('fogo', p.x + 0.1, this.topOf(b) * 0.5, p.z + 0.25, { loop: true, flip: b.id % 2 === 0 });
            if (i >= 0) this.burning.set(b.id, i);
          }
        }
      }
      for (const [id, i] of this.burning) {
        if (alive.has(id)) continue;
        fx.stop('fogo', i);
        this.burning.delete(id);
      }
      // Piche aceso: três chamas no fosso enquanto queima.
      for (const b of w.buildings.values()) {
        if (b.kind !== 'piche') continue;
        const on = this.pitchFire.get(b.id);
        if (b.burn > 0 && !on) {
          const p = hexToWorld(b.q, b.r);
          this.pitchFire.set(b.id, [
            fx.play('fogo', p.x - 0.35, 0.02, p.z + 0.1, { loop: true, scale: 1.1 }),
            fx.play('fogo', p.x + 0.3, 0.02, p.z - 0.15, { loop: true, scale: 0.9, flip: true }),
            fx.play('fogo', p.x, 0.02, p.z + 0.4, { loop: true }),
          ]);
        }
      }
      for (const [id, slots] of this.pitchFire) {
        const b = w.buildings.get(id);
        if (b && b.burn > 0) continue;
        for (const i of slots) fx.stop('fogo', i);
        this.pitchFire.delete(id);
      }
      // Portais nas fendas abertas.
      const openNow = openRifts(Math.max(1, w.wave + (w.waveState === 'calm' ? 1 : 0)));
      while (this.portals.length < Math.min(openNow, w.rifts.length)) {
        const t = w.tiles[w.rifts[this.portals.length]!]!;
        const p = hexToWorld(t.q, t.r);
        this.portals.push(fx.play('portal', p.x, 0, p.z, { loop: true }));
      }
      fx.update(dt, this.pxPerMeter);
    }
    // Fendas: só brilham as abertas.
    const open = openRifts(Math.max(1, w.wave + (w.waveState === 'calm' ? 1 : 0)));
    this.rifts.forEach((rim, k) => {
      const mat = rim.material as THREE.MeshBasicMaterial;
      mat.opacity = k < open ? 0.75 + 0.25 * Math.sin(this.time * 3 + k) : 0.25;
    });
  }

  private charFor(id: number, kind: CharKey): CharView {
    let v = this.chars.get(id);
    if (v && v.kind !== kind) {
      this.scene.remove(v.root);
      v.dispose();
      v = undefined;
    }
    if (!v) {
      v = new CharView(this.art, kind);
      this.scene.add(v.root);
      this.chars.set(id, v);
    }
    return v;
  }

  /** Partida nova: para os laços (fogo e portais) e os efeitos em andamento. */
  resetFx(): void {
    if (!this.fx) return;
    for (const i of this.burning.values()) this.fx.stop('fogo', i);
    for (const i of this.portals) this.fx.stop('portal', i);
    for (const i of this.batSlots.values()) if (i >= 0) this.fx.stop('morcego', i);
    this.batSlots.clear();
    this.burning.clear();
    this.portals = [];
  }

  clearChars(): void {
    for (const v of this.chars.values()) {
      this.scene.remove(v.root);
      v.dispose();
    }
    this.chars.clear();
    this.flights = [];
  }
}

export { BUILDINGS };
