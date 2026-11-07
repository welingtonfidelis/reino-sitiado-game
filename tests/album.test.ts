// Etapa 16: álbum de figurinhas e estações (regras puras, sem tela).
import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG, addBuilding, addUnit, createWorld, seasonOf } from '../src/sim/index.ts';
import { Album, STICKERS, stickersFor } from '../src/game/album.ts';

describe('estações do ano', () => {
  it('mudam a cada 5 ondas e, na calmaria, valem pela onda que vem', () => {
    expect(seasonOf(0, true)).toBe(0);
    expect(seasonOf(5, false)).toBe(0);
    expect(seasonOf(5, true)).toBe(1);
    expect(seasonOf(10, true)).toBe(2);
    expect(seasonOf(15, false)).toBe(2);
    expect(seasonOf(16, false)).toBe(3);
    expect(seasonOf(20, true)).toBe(0);
  });
});

describe('álbum de figurinhas', () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  });

  it('um reino novo ainda não tem nenhuma figurinha', () => {
    expect(stickersFor({ w: createWorld(5), events: [] })).toEqual([]);
  });

  it('cada figurinha tem id único, figura e cor', () => {
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
    for (const s of STICKERS) expect(s.icon && s.color.startsWith('#')).toBeTruthy();
  });

  it('torre pronta, 4 casas e onda de chefe vencida dão figurinha', () => {
    const w = createWorld(5);
    addBuilding(w, 'torre', 4, -4, 1);
    for (const [q, r] of [[5, 0], [5, 1], [-5, 0]] as const) addBuilding(w, 'casa', q, r, 1);
    const got = stickersFor({ w, events: [{ type: 'waveEnd', wave: CONFIG.bossEvery, gold: 0 }] });
    expect(got).toContain('torre');
    expect(got).toContain('casas4');
    expect(got).toContain('chefe');
    expect(got).toContain('onda10');
    expect(got).not.toContain('onda20');
  });

  it('a obra pela metade ainda não conta', () => {
    const w = createWorld(5);
    addBuilding(w, 'torre', 4, -4, 0.5);
    expect(stickersFor({ w, events: [] })).not.toContain('torre');
  });

  it('o primeiro herói dá figurinha', () => {
    const w = createWorld(5);
    addUnit(w, 'barbaro', 0, 2);
    expect(stickersFor({ w, events: [] })).toContain('heroi');
  });

  it('a figurinha ganha fica guardada para a próxima partida e não sai de novo', () => {
    const w = createWorld(5);
    addBuilding(w, 'torre', 4, -4, 1);
    const a = new Album();
    expect(a.check({ w, events: [] }).map((s) => s.id)).toEqual(['torre']);
    expect(a.check({ w, events: [] })).toEqual([]);
    const b = new Album();
    expect(b.got.torre).toBeGreaterThan(0);
    expect(b.count).toBe(1);
    expect(b.check({ w, events: [] })).toEqual([]);
  });
});
