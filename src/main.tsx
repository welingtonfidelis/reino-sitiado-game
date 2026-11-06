import './ui/vigilia-tokens.css';
import './ui/vigilia.css';
import './ui/style.css';
import * as THREE from 'three';
import { render } from 'preact';
import { CONFIG, hexToWorld, worldToHex } from './sim/index.ts';
import { Game } from './game/game.ts';
import { loadArt } from './render/assets.ts';
import { IsoCamera } from './render/camera.ts';
import { World3D } from './render/world3d.ts';
import { FxLayer } from './render/fx.ts';
import { App } from './ui/App.tsx';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
const touch = matchMedia('(pointer: coarse)').matches;

render(
  <div class="loading">
    Reino Sitiado
    <div class="bar">
      <div class="fill" id="load-fill" style="width: 0%; background: var(--gold)" />
    </div>
  </div>,
  ui,
);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('snap') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = !params.has('semsombra');
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1d1914');

const cam = new IsoCamera(canvas);
const resize = () => {
  renderer.setSize(innerWidth, innerHeight, false);
  cam.resize(innerWidth, innerHeight);
};
addEventListener('resize', resize);
resize();

const art = await loadArt(import.meta.env.BASE_URL + 'assets/kaykit/', (k) => {
  const el = document.getElementById('load-fill');
  if (el) el.style.width = `${Math.round(k * 100)}%`;
});

const seed = Number(params.get('semente')) || Math.floor(Math.random() * 1e9);
const game = new Game(seed);
const view = new World3D(scene, art);
view.fx = await FxLayer.load(scene, import.meta.env.BASE_URL + 'assets/fx/');
view.buildTerrain(game.world);

// Atalhos de teste: ?onda=N começa perto da onda N com recursos; ?rapido encurta a espera.
const startWave = Number(params.get('onda'));
if (startWave > 1) {
  game.world.wave = startWave - 1;
  for (const k of Object.keys(game.world.res) as (keyof typeof game.world.res)[]) game.world.res[k] += 600;
}
if (params.has('rapido')) game.world.waveTimer = 8;
if (params.has('jogar')) game.started = true;

/** Tropa sob o dedo (perto na tela, para funcionar em qualquer zoom). */
function troopAt(x: number, y: number): number {
  let best = -1;
  let bd = 24;
  for (const u of game.world.units.values()) {
    if (u.state === 'dead' || u.state === 'tower' || u.kind === 'trabalhador') continue;
    const s = cam.toScreen(u.x, 0.3, u.z);
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bd) {
      bd = d;
      best = u.id;
    }
  }
  return best;
}

cam.onTap = (x, y) => {
  const free = game.mode.kind === 'none';
  const unit = free ? troopAt(x, y) : -1;
  const id = free && unit < 0 && game.units.length === 0 ? view.pickBuilding(cam.raycaster(x, y)) : -1;
  const g = cam.groundAt(x, y);
  const hex = g ? worldToHex(g.x, g.z) : null;
  game.tap(hex && game.world.grid.has(hex.q, hex.r) ? hex : null, id, touch, g ? { x: g.x, z: g.z } : null, unit);
};

// Caixa de seleção: arrastar no modo Selecionar (ou Shift + arrastar no mouse).
const boxEl = document.createElement('div');
boxEl.className = 'select-box';
document.body.appendChild(boxEl);
cam.onBox = (phase, x0, y0, x1, y1) => {
  const l = Math.min(x0, x1);
  const t = Math.min(y0, y1);
  const r = Math.max(x0, x1);
  const b = Math.max(y0, y1);
  if (phase === 'move') {
    Object.assign(boxEl.style, { display: 'block', left: `${l}px`, top: `${t}px`, width: `${r - l}px`, height: `${b - t}px` });
    return;
  }
  boxEl.style.display = 'none';
  const ids: number[] = [];
  for (const u of game.world.units.values()) {
    if (u.state === 'dead' || u.kind === 'trabalhador') continue;
    const s = cam.toScreen(u.x, 0.3, u.z);
    if (s.x >= l && s.x <= r && s.y >= t && s.y <= b) ids.push(u.id);
  }
  game.selectUnits(ids);
};
cam.onHover = (x, y) => {
  if (game.mode.kind === 'none') return;
  const g = cam.groundAt(x, y);
  if (!g) return;
  const h = worldToHex(g.x, g.z);
  if (game.world.grid.has(h.q, h.r)) game.hover(h.q, h.r);
};

render(<App game={game} cam={cam} touch={touch} />, ui);

let seenWorld = game.world;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
  const w = game.world;
  if (w !== seenWorld) {
    seenWorld = w;
    view.clearChars();
    view.resetFx();
    view.buildTerrain(w);
  }
  cam.boxMode = game.boxMode;
  view.pxPerMeter = innerHeight / cam.view;
  view.camYaw = cam.yaw;
  view.selectedUnits = game.units;
  view.syncStatic(w);
  view.syncDynamic(w, game.frame, game.started && game.speed > 0 && !w.lost ? dt * game.speed : 0);
  // Fantasma ao construir/mover, contorno no prédio selecionado.
  const m = game.mode;
  view.showGrid(m.kind === 'build' || m.kind === 'move');
  if (m.kind !== 'none' && m.kind !== 'rally' && game.pending) {
    const kind = m.kind === 'build' ? m.b : (w.buildings.get(m.id)?.kind ?? null);
    view.setGhost(kind, game.pending.q, game.pending.r, !game.pendingProblem());
  } else {
    view.setGhost(null, 0, 0, true);
    const b = game.selected >= 0 ? w.buildings.get(game.selected) : undefined;
    const rb = m.kind === 'rally' ? w.buildings.get(m.id) : b;
    view.showRally(rb?.rally ?? null);
    if (b) view.showRing(b.q, b.r, '#e9b949', b.kind === 'torre' ? CONFIG.tower.range : b.kind === 'castelo' ? CONFIG.castle.range : 0);
    else view.hideRing();
  }
  renderer.render(scene, cam.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Para testar pelo console e pelo navegador do Claude.
Object.assign(window, {
  game,
  renderer,
  view,
  cam,
  hexToWorld,
  snap: async (name: string) => {
    renderer.render(scene, cam.camera);
    await fetch(`/__snap?name=${encodeURIComponent(name)}`, { method: 'POST', body: canvas.toDataURL('image/png') });
  },
});
