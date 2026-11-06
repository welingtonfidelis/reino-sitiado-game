/**
 * A partida em andamento: roda a simulação no ritmo escolhido, guarda o que o jogador está
 * fazendo (construir, mover, prédio selecionado) e transforma eventos em avisos.
 */
import {
  BUILDINGS,
  CONFIG,
  build,
  buildCost,
  callWave,
  canBuild,
  createWorld,
  demolish,
  moveBuilding,
  orderMove,
  placeProblem,
  recruit,
  refresh,
  chooseBlessing,
  forgeUpgrade,
  ignitePitch,
  loadWorld,
  saveInfo,
  saveWorld,
  repair,
  repairAll,
  setRally,
  toggleShelter,
  step,
  tileAt,
  upgradeCastle,
} from '../sim/index.ts';
import type { BlessingId, BuildingKind, ForgeLine, SimEvent, World } from '../sim/index.ts';

export type Mode = { kind: 'none' } | { kind: 'build'; b: BuildingKind } | { kind: 'move'; id: number } | { kind: 'rally'; id: number };
export type Tone = 'good' | 'bad' | 'warn' | 'gold' | 'info';
export interface Toast {
  id: number;
  text: string;
  tone: Tone;
  age: number;
}

export class Game {
  world: World;
  speed = 1;
  started = false;
  mode: Mode = { kind: 'none' };
  selected = -1;
  /** Tropas escolhidas pelo jogador (toque ou caixa). */
  units: number[] = [];
  /** Próximo arrasto de um dedo desenha a caixa de seleção (no mouse, Shift + arrastar). */
  boxMode = false;
  /** Hexágono escolhido para construir/mover (no toque, o segundo toque confirma). */
  pending: { q: number; r: number } | null = null;
  toasts: Toast[] = [];
  /** Eventos do último quadro (a tela usa para flechas). */
  frame: SimEvent[] = [];
  /** Abre o relatório a cada onda? Desligado, só abre quando há bênção para escolher. */
  autoReport = readPref('reino.relatorio', true);
  /** Som ligado? (preferência do navegador) */
  sound = readPref('reino.som', true);
  /** Velocidade de antes do relatório (o jogo para enquanto ele está aberto). */
  private before = 1;
  private acc = 0;
  /** Tempo desde o último salvamento automático. */
  private saveT = 0;
  private toastId = 0;
  private listeners = new Set<() => void>();

  constructor(seed: number) {
    this.world = createWorld(seed);
    refresh(this.world);
  }

  restart(seed: number): void {
    clearSave();
    this.world = createWorld(seed);
    refresh(this.world);
    this.mode = { kind: 'none' };
    this.selected = -1;
    this.units = [];
    this.boxMode = false;
    this.pending = null;
    this.toasts = [];
    this.speed = 1;
    this.started = true;
    this.emit();
  }

  subscribe(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  emit(): void {
    for (const f of this.listeners) f();
  }

  toast(text: string, tone: Tone): void {
    this.toasts = [...this.toasts.slice(-3), { id: ++this.toastId, text, tone, age: 0 }];
    this.emit();
  }

  update(dt: number): void {
    this.frame = [];
    for (const t of this.toasts) t.age += dt;
    if (this.toasts.some((t) => t.age > 6)) {
      this.toasts = this.toasts.filter((t) => t.age <= 6);
      this.emit();
    }
    if (!this.started || this.speed === 0 || this.world.lost) return;
    this.acc += Math.min(dt, 0.1) * this.speed;
    const h = 1 / CONFIG.tps;
    let n = 0;
    while (this.acc >= h && n < 12) {
      step(this.world);
      this.frame.push(...this.world.events);
      this.world.events.length = 0;
      this.acc -= h;
      n++;
    }
    // Quem morreu sai da escolha.
    const alive = (id: number) => this.world.units.get(id)?.state !== 'dead' && this.world.units.has(id);
    if (!this.units.every(alive)) {
      this.units = this.units.filter(alive);
      this.emit();
    }
    for (const e of this.frame) {
      if (e.type === 'toast') this.toast(e.text, e.tone);
      else if (e.type === 'waveStart') this.toast(`Onda ${e.wave}: a horda saiu da fenda.`, 'bad');
      else if (e.type === 'lost') this.emit();
      else if (e.type === 'report') {
        const r = this.world.report;
        if (r && !this.autoReport && r.choices.length === 0) {
          // Relatório desligado: só um aviso, e o jogo segue.
          const fallen = r.fallen.length ? `, ${r.fallen.length} ${r.fallen.length === 1 ? 'caído' : 'caídos'}` : '';
          chooseBlessing(this.world, null);
          this.toast(`Onda ${r.wave} resistida: +${r.gold} de ouro${fallen}.`, 'gold');
          continue;
        }
        if (this.speed > 0) this.before = this.speed;
        this.speed = 0;
        this.mode = { kind: 'none' };
        this.selected = -1;
        this.emit();
      }
      else if (e.type === 'destroyed' && e.id === this.selected) this.selected = -1;
      if (e.type === 'waveEnd') this.save();
      if (e.type === 'lost') clearSave();
    }
    // Salva sozinho a cada 30 s de jogo, além do fim de cada onda.
    this.saveT += dt;
    if (this.saveT > 30) this.save();
  }

  save(): void {
    this.saveT = 0;
    if (!this.started || this.world.lost) return;
    try {
      localStorage.setItem(SAVE_KEY, saveWorld(this.world));
    } catch {
      // sem armazenamento (aba privada): segue sem salvar
    }
  }

  /** Partida salva neste navegador, se houver. */
  static saved(): { wave: number } | null {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      return s ? saveInfo(s) : null;
    } catch {
      return null;
    }
  }

  continueSaved(): boolean {
    let w = null;
    try {
      const s = localStorage.getItem(SAVE_KEY);
      w = s ? loadWorld(s) : null;
    } catch {
      w = null;
    }
    if (!w) return false;
    this.world = w;
    refresh(w);
    this.mode = { kind: 'none' };
    this.selected = -1;
    this.units = [];
    this.started = true;
    this.speed = w.report ? 0 : 1;
    this.emit();
    return true;
  }

  /** Resposta de uma ordem: null deu certo; senão vira aviso. */
  private result(why: string | null): boolean {
    refresh(this.world);
    if (why) this.toast(why, 'warn');
    this.emit();
    return !why;
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.emit();
  }

  startBuild(b: BuildingKind): void {
    this.mode = { kind: 'build', b };
    this.selected = -1;
    this.pending = null;
    this.emit();
  }

  startMove(id: number): void {
    this.mode = { kind: 'move', id };
    this.pending = null;
    this.emit();
  }

  cancel(): void {
    this.mode = { kind: 'none' };
    this.pending = null;
    this.emit();
  }

  /** Problema do lugar escolhido (para pintar o fantasma de vermelho). */
  pendingProblem(): string | null {
    const p = this.pending;
    if (!p) return null;
    if (this.mode.kind === 'build') return canBuild(this.world, this.mode.b, p.q, p.r);
    if (this.mode.kind === 'move') {
      const b = this.world.buildings.get(this.mode.id);
      return b ? placeProblem(this.world, b.kind, p.q, p.r, b.id) : 'Não existe mais';
    }
    return null;
  }

  hover(q: number, r: number): void {
    if (this.mode.kind === 'none') return;
    if (this.pending?.q === q && this.pending?.r === r) return;
    this.pending = { q, r };
    this.emit();
  }

  /** Toque/clique no mapa. `touch`: o primeiro toque só mostra, o segundo confirma. */
  tap(hex: { q: number; r: number } | null, buildingId: number, touch: boolean, point: { x: number; z: number } | null = null, unitId = -1): void {
    const w = this.world;
    if (this.mode.kind === 'rally') {
      if (!point) return;
      const id = this.mode.id;
      if (this.result(setRally(w, id, point.x, point.z))) {
        this.mode = { kind: 'none' };
        this.selected = id;
        this.emit();
      }
      return;
    }
    if (this.mode.kind !== 'none') {
      if (!hex) return;
      const same = this.pending?.q === hex.q && this.pending?.r === hex.r;
      this.pending = hex;
      if (touch && !same) {
        this.emit();
        return;
      }
      this.confirm();
      return;
    }
    if (this.units.length > 0) {
      // Com tropas escolhidas: tocar numa tropa põe/tira da escolha; tocar no mapa manda ir.
      if (unitId >= 0) {
        this.units = this.units.includes(unitId) ? this.units.filter((id) => id !== unitId) : [...this.units, unitId];
        this.emit();
        return;
      }
      if (point) this.result(orderMove(w, this.units, point.x, point.z));
      return;
    }
    if (unitId >= 0) {
      this.units = [unitId];
      this.selected = -1;
      this.emit();
      return;
    }
    let id = buildingId;
    if (id < 0 && hex) id = tileAt(w, hex.q, hex.r)?.b ?? -1;
    this.selected = id;
    this.emit();
  }

  selectUnits(ids: number[]): void {
    this.units = ids;
    this.boxMode = false;
    if (ids.length) this.selected = -1;
    this.emit();
  }

  clearUnits(): void {
    this.units = [];
    this.emit();
  }

  setBoxMode(on: boolean): void {
    this.boxMode = on;
    this.emit();
  }

  startRally(id: number): void {
    this.mode = { kind: 'rally', id };
    this.pending = null;
    this.emit();
  }

  confirm(): void {
    const p = this.pending;
    if (!p) return;
    if (this.mode.kind === 'build') {
      const kind = this.mode.b;
      if (this.result(build(this.world, kind, p.q, p.r))) {
        // Muralha: continua no modo para ir traçando; o resto volta ao normal.
        if (kind !== 'muralha') this.mode = { kind: 'none' };
        this.pending = null;
        this.emit();
      }
      return;
    }
    if (this.mode.kind === 'move') {
      if (this.result(moveBuilding(this.world, this.mode.id, p.q, p.r))) {
        this.mode = { kind: 'none' };
        this.pending = null;
        this.emit();
      }
    }
  }

  recruit(id: number): void {
    this.result(recruit(this.world, id));
  }
  repair(id: number): void {
    this.result(repair(this.world, id));
  }
  demolish(id: number): void {
    if (this.result(demolish(this.world, id))) this.selected = -1;
    this.emit();
  }
  upgrade(): void {
    this.result(upgradeCastle(this.world));
  }
  toggleShelter(): void {
    this.result(toggleShelter(this.world));
  }
  setSound(on: boolean): void {
    this.sound = on;
    writePref('reino.som', on);
    this.emit();
  }

  setAutoReport(on: boolean): void {
    this.autoReport = on;
    writePref('reino.relatorio', on);
    this.emit();
  }

  /** Fecha o relatório (com a bênção escolhida, quando há escolha) e volta a andar. */
  closeReport(id: BlessingId | null, thenCall = false): void {
    if (!this.result(chooseBlessing(this.world, id))) return;
    this.speed = this.before || 1;
    if (thenCall) this.callWave();
    this.emit();
  }
  ignite(id: number): void {
    this.result(ignitePitch(this.world, id));
  }
  forge(line: ForgeLine): void {
    this.result(forgeUpgrade(this.world, line));
  }
  repairAll(): void {
    this.result(repairAll(this.world));
  }
  callWave(): void {
    this.result(callWave(this.world));
  }
  costOf(b: BuildingKind) {
    return buildCost(this.world, b);
  }
  nameOf(b: BuildingKind): string {
    return BUILDINGS[b].name;
  }
}

/** Preferências do jogador (só neste navegador; se o armazenamento falhar, vale o padrão). */
function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writePref(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
}

const SAVE_KEY = 'reino.partida';

function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // nada a limpar
  }
}
