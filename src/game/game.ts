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
  replant,
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
  garrison,
  callArchers,
  hexToWorld,
  buyHero,
  seasonOf,
} from '../sim/index.ts';
import type { BlessingId, BuildingKind, ForgeLine, HeroKind, Mode as GameMode, SaveInfo, SimEvent, World } from '../sim/index.ts';
import { Album } from './album.ts';
import type { Sticker } from './album.ts';
import { readQuality, writeQuality } from '../render/quality.ts';
import { markTip, pickTip } from './guide.ts';
import type { Tip } from './guide.ts';
import type { Quality } from '../render/quality.ts';

export type Mode = { kind: 'none' } | { kind: 'build'; b: BuildingKind } | { kind: 'move'; id: number } | { kind: 'rally'; id: number };
export type Tone = 'good' | 'bad' | 'warn' | 'gold' | 'info';
export interface Toast {
  id: number;
  text: string;
  tone: Tone;
  age: number;
}

/** Quanto dura a queda do castelo antes do diálogo de derrota (s). */
export const FALL_TIME = 3.4;
/** Quanto dura a festa da vitória antes do relatório (s). */
export const PARTY_TIME = 3.2;
/** Etapa 16: quanto tempo o cartão da estação nova fica na tela. */
export const SEASON_CARD = 3.6;
/** Quanto tempo a figurinha nova fica na tela. */
export const STICKER_TIME = 3.4;

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
  /** Diário de avisos (o mais novo primeiro). No celular os avisos só aparecem aqui. */
  log: { id: number; text: string; tone: Tone; wave: number }[] = [];
  /** Avisos que chegaram desde a última vez que o diário foi aberto. */
  unread = 0;
  /** Velocidade para onde a pausa volta (o botão de ritmo alterna 1×, 2× e 3×). */
  resumeSpeed = 1;
  /** Segundos desde que o castelo caiu (-1: de pé). O diálogo de derrota espera a queda acabar. */
  fallT = -1;
  /** Onde o castelo estava quando caiu (a câmera vai até lá). */
  fallAt: { x: number; z: number } | null = null;
  /** Etapa 16: o relatório espera a festa da vitória (s até abrir; -1 sem relatório na fila). */
  reportT = -1;
  /** O relatório está aberto (e o jogo, parado). */
  reportOpen = false;
  /** Etapa 16: estação mostrada (troca depois da festa e do relatório). */
  season = 0;
  /** Segundos que faltam do cartão grande da estação nova (0: escondido). */
  seasonCard = 0;
  /** Etapa 16: álbum de figurinhas (fica entre partidas) e a figurinha nova na tela. */
  album = new Album();
  sticker: Sticker | null = null;
  stickerT = 0;
  /** Chamado a cada figurinha nova (o main toca o som). */
  onSticker: (() => void) | null = null;
  private stickerQueue: Sticker[] = [];
  private albumEvents: SimEvent[] = [];
  private albumT = 0;
  /** Eventos do último quadro (a tela usa para flechas). */
  frame: SimEvent[] = [];
  /** Abre o relatório a cada onda? Desligado, só abre quando há bênção para escolher. */
  autoReport = readPref('reino.relatorio', true);
  /** Som ligado? (preferência do navegador) */
  sound = readPref('reino.som', true);
  /** Música ambiente ligada? (Etapa 16; só toca com o som ligado) */
  music = readPref('reino.musica', true);
  /** Gráficos normais ou leves (tablet de entrada); guardado no navegador. */
  quality: Quality = readQuality();
  /** O Sábio (2026-11-09): dicas em figuras; ligado ou não (preferência do navegador). */
  guide = readPref('reino.guia', true);
  tip: Tip | null = null;
  private tipT = 0;
  private guideAcc = 0;
  /** Velocidade de antes do relatório (o jogo para enquanto ele está aberto). */
  private before = 1;
  private acc = 0;
  /** Tempo desde o último salvamento automático. */
  private saveT = 0;
  private toastId = 0;
  private listeners = new Set<() => void>();

  constructor(seed: number, mode: GameMode = readGameMode()) {
    this.world = createWorld(seed, mapRadius(this.quality), mode);
    refresh(this.world);
  }

  /**
   * Etapa 18: começa a partida no modo escolhido (sem partida salva, a primeira tela chama
   * isto). Se o modo for outro, o mapa é refeito com a mesma semente.
   */
  begin(mode: GameMode): void {
    writeGameMode(mode);
    if (mode !== this.world.mode) {
      this.world = createWorld(this.world.seed, mapRadius(this.quality), mode);
      refresh(this.world);
    }
    this.started = true;
    this.emit();
  }

  /** Partida nova; o modo fica o da partida de agora, a não ser que venha outro. */
  restart(seed: number, mode: GameMode = this.world.mode): void {
    clearSave();
    writeGameMode(mode);
    this.world = createWorld(seed, mapRadius(this.quality), mode);
    refresh(this.world);
    this.mode = { kind: 'none' };
    this.selected = -1;
    this.units = [];
    this.boxMode = false;
    this.pending = null;
    this.toasts = [];
    this.log = [];
    this.unread = 0;
    this.speed = 1;
    this.resumeSpeed = 1;
    this.fallT = -1;
    this.fallAt = null;
    this.reportT = -1;
    this.reportOpen = false;
    this.season = 0;
    this.seasonCard = 0;
    this.tip = null;
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
    const id = ++this.toastId;
    this.toasts = [...this.toasts.slice(-3), { id, text, tone, age: 0 }];
    this.log = [{ id, text, tone, wave: this.world.wave }, ...this.log].slice(0, 40);
    this.unread++;
    this.emit();
  }

  /** Abriu o diário: nada mais por ler. */
  markRead(): void {
    if (!this.unread) return;
    this.unread = 0;
    this.emit();
  }

  update(dt: number): void {
    this.frame = [];
    for (const t of this.toasts) t.age += dt;
    if (this.toasts.some((t) => t.age > 6)) {
      this.toasts = this.toasts.filter((t) => t.age <= 6);
      this.emit();
    }
    if (this.fallT >= 0) {
      const before = this.fallT;
      this.fallT += Math.min(dt, 0.1);
      if (before < FALL_TIME && this.fallT >= FALL_TIME) this.emit();
    }
    if (this.reportT >= 0) {
      this.reportT -= Math.min(dt, 0.1);
      if (this.reportT < 0) this.openReport();
    }
    // Estação nova: entra depois da festa e do relatório, com o cartão grande no meio da tela.
    const s = seasonOf(this.world.wave, this.world.waveState === 'calm');
    if (s !== this.season && this.reportT < 0 && !this.reportOpen && !this.world.lost) {
      this.season = s;
      this.seasonCard = SEASON_CARD;
      this.emit();
    }
    this.stepSticker(dt);
    this.stepGuide(dt);
    if (this.seasonCard > 0) {
      this.seasonCard -= Math.min(dt, 0.1);
      if (this.seasonCard <= 0) {
        this.seasonCard = 0;
        this.emit();
      }
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
    this.checkAlbum(dt);
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
        // Etapa 16: primeiro a festa (fogos, confete, gente comemorando), depois o relatório.
        this.reportT = PARTY_TIME;
      }
      else if (e.type === 'destroyed' && e.id === this.selected) this.selected = -1;
      if (e.type === 'destroyed' && e.kind === 'castelo') {
        // Começa a queda do castelo (Etapa 13): o diálogo de derrota espera FALL_TIME.
        this.fallT = 0;
        this.fallAt = hexToWorld(e.q, e.r);
        // A simulação para na derrota: atualiza já, para o castelo sair do desenho e os escombros entrarem.
        refresh(this.world);
        this.selected = -1;
        this.mode = { kind: 'none' };
        this.units = [];
        this.boxMode = false;
      }
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
  static saved(): SaveInfo | null {
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
    this.reportOpen = !!w.report;
    this.reportT = -1;
    this.season = seasonOf(w.wave, w.waveState === 'calm');
    this.seasonCard = 0;
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
    if (s > 0) this.resumeSpeed = s;
    this.emit();
  }

  /** Pausa ou volta na velocidade de antes. */
  togglePause(): void {
    this.setSpeed(this.speed > 0 ? 0 : this.resumeSpeed);
  }

  /** Alterna 1×, 2× e 3× (e tira da pausa). */
  cycleSpeed(): void {
    const base = this.speed || this.resumeSpeed;
    this.setSpeed((base % 3) + 1);
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
      // Tocar numa torre: os arqueiros escolhidos sobem nela; o resto das tropas vai até perto.
      const tower = (buildingId >= 0 ? w.buildings.get(buildingId) : hex ? w.buildings.get(tileAt(w, hex.q, hex.r)?.b ?? -1) : undefined) ?? null;
      if (tower?.kind === 'torre') {
        const archers = this.units.filter((id) => w.units.get(id)?.kind === 'arqueiro');
        const others = this.units.filter((id) => !archers.includes(id));
        if (archers.length) {
          const why = garrison(w, archers, tower.id);
          if (why) this.toast(why, 'warn');
          // Quem subiu sai da escolha (fica escondido dentro da torre).
          this.units = this.units.filter((id) => w.units.get(id)?.tower !== tower.id);
        }
        if (others.length && point) this.result(orderMove(w, others, point.x, point.z));
        refresh(w);
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
  /** O Sábio mostra a próxima dica que vale agora (uma por vez, uma vez por partida). */
  private stepGuide(dt: number): void {
    if (this.tip) {
      this.tipT -= Math.min(dt, 0.1);
      if (this.tipT <= 0) this.dismissTip();
      return;
    }
    if (!this.guide || !this.started || this.world.lost || this.reportOpen || this.reportT >= 0) return;
    this.guideAcc += dt;
    if (this.guideAcc < 1) return;
    this.guideAcc = 0;
    const t = pickTip(this.world);
    if (!t) return;
    markTip(this.world, t.id);
    this.tip = t;
    this.tipT = 14;
    this.emit();
  }

  dismissTip(): void {
    this.tip = null;
    this.emit();
  }

  setGuide(on: boolean): void {
    this.guide = on;
    writePref('reino.guia', on);
    if (!on) this.tip = null;
    this.emit();
  }

  setMusic(on: boolean): void {
    this.music = on;
    writePref('reino.musica', on);
    this.emit();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    writeQuality(q);
    this.emit();
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
  /** Abre o relatório da onda e para o jogo até escolher. */
  /**
   * Figurinhas: olha as regras a cada meio segundo, e já no quadro do fim da onda (o relatório
   * ainda tem os caídos dela). As novas aparecem uma de cada vez, fora do relatório.
   */
  private checkAlbum(dt: number): void {
    for (const e of this.frame) if (e.type === 'waveEnd' || e.type === 'heroLevel') this.albumEvents.push(e);
    this.albumT += dt;
    const now = this.frame.some((e) => e.type === 'waveEnd');
    if (now || this.albumT >= 0.5) {
      this.albumT = 0;
      this.stickerQueue.push(...this.album.check({ w: this.world, events: this.albumEvents }));
      this.albumEvents = [];
    }
  }

  private stepSticker(dt: number): void {
    if (this.sticker) {
      this.stickerT -= Math.min(dt, 0.1);
      if (this.stickerT > 0) return;
      this.sticker = null;
      this.emit();
    }
    if (this.reportOpen || !this.stickerQueue.length) return;
    this.sticker = this.stickerQueue.shift()!;
    this.stickerT = STICKER_TIME;
    this.onSticker?.();
    this.emit();
  }

  /** O álbum foi aberto: as novas deixam de ser novas. */
  albumSeen(): void {
    this.album.seen();
    this.emit();
  }

  private openReport(): void {
    this.reportT = -1;
    if (!this.world.report || this.world.lost) return;
    if (this.speed > 0) this.before = this.speed;
    this.speed = 0;
    this.reportOpen = true;
    this.mode = { kind: 'none' };
    this.selected = -1;
    this.emit();
  }

  closeReport(id: BlessingId | null, thenCall = false): void {
    if (!this.result(chooseBlessing(this.world, id))) return;
    this.reportOpen = false;
    this.speed = this.before || 1;
    if (thenCall) this.callWave();
    this.emit();
  }
  buyHero(kind: HeroKind): void {
    this.result(buyHero(this.world, kind));
  }
  callArchers(id: number): void {
    this.result(callArchers(this.world, id));
  }
  ignite(id: number): void {
    this.result(ignitePitch(this.world, id));
  }
  /** Etapa 17: replantar a plantação colhida até o fim. */
  replant(id: number): void {
    this.result(replant(this.world, id));
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

/** Raio do mapa da partida nova: o grande no normal, o de antes nos gráficos leves (2026-11-09). */
function mapRadius(q: Quality): number {
  return q === 'leve' ? CONFIG.mapRadiusLight : CONFIG.mapRadius;
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
const MODE_KEY = 'reino.modo';

/**
 * Etapa 18: o último modo escolhido, para vir marcado na próxima partida. Num aparelho novo, o
 * fácil (quem mais joga é uma criança de 4 anos).
 */
export function readGameMode(): GameMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'normal' || v === 'facil') return v;
  } catch {
    // sem armazenamento
  }
  return 'facil';
}

function writeGameMode(m: GameMode): void {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // nada a limpar
  }
}
