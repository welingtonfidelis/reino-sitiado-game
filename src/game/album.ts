/**
 * Etapa 16: álbum de figurinhas. Conquistas que ficam de uma partida para outra (no navegador):
 * cada uma é uma figura grande com cor própria, para quem ainda não lê; o nome e a dica ficam
 * de apoio para quem lê junto.
 */
import { CONFIG, barnOf, castle, cropOf, isHero, troops } from '../sim/index.ts';
import type { SimEvent, World } from '../sim/index.ts';

export interface Sticker {
  id: string;
  icon: string;
  color: string;
  name: string;
  hint: string;
}

/** O que a regra olha: o mundo agora e os eventos desde a última olhada. */
export interface AlbumCtx {
  w: World;
  events: SimEvent[];
}

interface Rule extends Sticker {
  check: (c: AlbumCtx) => boolean;
}

const built = (w: World, kind: string) => [...w.buildings.values()].filter((b) => b.kind === kind && b.built >= 1).length;
const wonWave = (c: AlbumCtx, n: number) => c.events.some((e) => e.type === 'waveEnd' && e.wave >= n);

const RULES: Rule[] = [
  { id: 'casas4', icon: 'casa', color: '#c98a4b', name: 'Vila', hint: 'Ter 4 casas prontas.', check: ({ w }) => built(w, 'casa') >= 4 },
  { id: 'torre', icon: 'torre', color: '#7a8fa6', name: 'Primeira torre', hint: 'Construir uma torre.', check: ({ w }) => built(w, 'torre') >= 1 },
  {
    id: 'torreCheia',
    icon: 'arco',
    color: '#5f9e5a',
    name: 'Torre lotada',
    hint: 'Pôr 4 arqueiros dentro de uma torre.',
    check: ({ w }) => [...w.buildings.values()].some((b) => b.kind === 'torre' && [...w.units.values()].filter((u) => u.tower === b.id && u.state === 'tower').length >= 4),
  },
  { id: 'muralha10', icon: 'muralha', color: '#9a8f80', name: 'Muralha', hint: 'Ter 10 pedaços de muralha.', check: ({ w }) => built(w, 'muralha') >= 10 },
  {
    id: 'plantacoes6',
    icon: 'comida',
    color: '#e0b23c',
    name: 'Fazendeiro',
    hint: 'Ter 6 plantações em volta de um celeiro.',
    check: ({ w }) => {
      const per = new Map<number, number>();
      for (const b of w.buildings.values()) {
        if (b.kind !== 'fazenda' || b.built < 1) continue;
        const barn = barnOf(w, b);
        if (barn) per.set(barn.id, (per.get(barn.id) ?? 0) + 1);
      }
      return [...per.values()].some((n) => n >= 6);
    },
  },
  {
    id: 'horta',
    icon: 'folha',
    color: '#6cbf4a',
    name: 'Horta colorida',
    hint: 'Plantar os 6 tipos de planta.',
    check: ({ w }) => new Set([...w.buildings.values()].filter((b) => b.kind === 'fazenda' && b.built >= 1).map((b) => cropOf(w, b))).size >= 6,
  },
  { id: 'catapulta', icon: 'catapulta', color: '#a5743f', name: 'Catapulta', hint: 'Construir uma catapulta.', check: ({ w }) => built(w, 'catapulta') >= 1 },
  { id: 'magia', icon: 'estrela', color: '#9a6ad8', name: 'Magia', hint: 'Construir a torre do mago.', check: ({ w }) => built(w, 'torreMago') >= 1 },
  { id: 'cavalos', icon: 'ferradura', color: '#b08a5a', name: 'Cavalaria', hint: 'Construir o estábulo.', check: ({ w }) => built(w, 'estabulo') >= 1 },
  { id: 'forja', icon: 'bigorna', color: '#d06a3a', name: 'Ferreiro', hint: 'Melhorar uma coisa da forja até o fim (3 vezes).', check: ({ w }) => Object.values(w.forge).some((n) => n >= 3) },
  { id: 'castelo4', icon: 'castelo', color: '#4f7fc4', name: 'Castelo grande', hint: 'Levar o castelo ao nível 4.', check: ({ w }) => (castle(w)?.level ?? 1) >= 4 },
  { id: 'exercito', icon: 'espadas', color: '#c0504a', name: 'Exército', hint: 'Ter 20 tropas ao mesmo tempo.', check: ({ w }) => troops(w) >= 20 },
  { id: 'ouro', icon: 'ouro', color: '#e9b949', name: 'Cofre cheio', hint: 'Juntar 1000 de ouro.', check: ({ w }) => w.res.ouro >= 1000 },
  { id: 'heroi', icon: 'coroa', color: '#e2a83a', name: 'Herói', hint: 'Chamar o primeiro herói no castelo.', check: ({ w }) => [...w.units.values()].some((u) => isHero(u.kind)) },
  {
    id: 'herois4',
    icon: 'coroa',
    color: '#c27ad8',
    name: 'Os quatro heróis',
    hint: 'Ter os 4 heróis juntos.',
    check: ({ w }) => new Set([...w.units.values()].filter((u) => isHero(u.kind) && u.state !== 'dead').map((u) => u.kind)).size >= 4,
  },
  { id: 'heroi5', icon: 'estrela', color: '#f0c040', name: 'Herói forte', hint: 'Um herói chegar ao nível 5.', check: ({ events }) => events.some((e) => e.type === 'heroLevel' && e.level >= 5) },
  { id: 'onda5', icon: 'bandeira', color: '#5aa0d8', name: 'Onda 5', hint: 'Vencer a onda 5.', check: (c) => wonWave(c, 5) },
  { id: 'onda10', icon: 'bandeira', color: '#4fb08a', name: 'Onda 10', hint: 'Vencer a onda 10.', check: (c) => wonWave(c, 10) },
  { id: 'onda20', icon: 'bandeira', color: '#d0883a', name: 'Onda 20', hint: 'Vencer a onda 20.', check: (c) => wonWave(c, 20) },
  { id: 'onda30', icon: 'bandeira', color: '#c84a6a', name: 'Onda 30', hint: 'Vencer a onda 30.', check: (c) => wonWave(c, 30) },
  {
    id: 'chefe',
    icon: 'caveira',
    color: '#8a4ad0',
    name: 'Chefe vencido',
    hint: 'Vencer uma onda com chefe.',
    check: ({ events }) => events.some((e) => e.type === 'waveEnd' && e.wave % CONFIG.bossEvery === 0),
  },
  {
    id: 'semPerdas',
    icon: 'coracao',
    color: '#e06a8a',
    name: 'Ninguém caiu',
    hint: 'Vencer uma onda (da 3 em diante) sem perder ninguém.',
    check: ({ w, events }) => events.some((e) => e.type === 'waveEnd' && e.wave >= 3) && !!w.report && w.report.fallen.length === 0,
  },
  { id: 'inverno', icon: 'neve', color: '#8fb8e0', name: 'Primeiro inverno', hint: 'Chegar ao inverno (onda 16).', check: ({ w }) => w.wave >= 16 },
  { id: 'monstros100', icon: 'caveira', color: '#6a7a8a', name: 'Caçador', hint: 'Vencer 100 monstros numa partida.', check: ({ w }) => w.kills >= 100 },
  { id: 'monstros1000', icon: 'caveira', color: '#3a4a5a', name: 'Grande caçador', hint: 'Vencer 1000 monstros numa partida.', check: ({ w }) => w.kills >= 1000 },
];

export const STICKERS: Sticker[] = RULES.map(({ check: _check, ...s }) => s);

const KEY = 'reino.album';

/** Figurinhas ganhas (id → quando), guardadas no navegador. */
export class Album {
  got: Record<string, number> = {};
  /** Ganhas desde a última vez que o álbum foi aberto. */
  fresh = new Set<string>();

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.got = JSON.parse(raw) as Record<string, number>;
    } catch {
      this.got = {};
    }
  }

  get count(): number {
    return STICKERS.filter((s) => this.got[s.id]).length;
  }

  /** Olha as regras que faltam e devolve as figurinhas ganhas agora. */
  check(c: AlbumCtx): Sticker[] {
    const now: Sticker[] = [];
    for (const r of RULES) {
      if (this.got[r.id] || !r.check(c)) continue;
      this.got[r.id] = Date.now();
      this.fresh.add(r.id);
      now.push(STICKERS.find((s) => s.id === r.id)!);
    }
    if (now.length) {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.got));
      } catch {
        // Sem armazenamento (aba anônima): vale só nesta visita.
      }
    }
    return now;
  }

  seen(): void {
    this.fresh.clear();
  }
}

/** Só para os testes: as regras puras. */
export function stickersFor(c: AlbumCtx): string[] {
  return RULES.filter((r) => r.check(c)).map((r) => r.id);
}
