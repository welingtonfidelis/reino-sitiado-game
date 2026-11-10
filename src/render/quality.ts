/**
 * Qualidade dos gráficos, em três níveis desde 2026-11-10 (eram "normal" e "leve"):
 * - baixo (o antigo leve, para tablet ou celular de entrada): resolução da tela (sem o dobro das
 *   telas finas), sem sombra nem antisserrilhado, pouca coisa caindo do céu, sem bichinhos nem
 *   sombra de nuvem, sem a cor de cinema, pouca grama, 30 quadros por segundo e o mapa menor;
 * - médio: 1,5× a resolução, sombra em mapa menor, mais da metade da grama, o resto como o alto;
 * - alto (o antigo normal): tudo.
 * A simulação não muda: o jogo é o mesmo, só o desenho fica mais barato.
 */
export type Quality = 'baixo' | 'medio' | 'alto';
export const QUALITY_ORDER: Quality[] = ['baixo', 'medio', 'alto'];
export const QUALITY_NAME: Record<Quality, string> = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' };

export interface QualityLook {
  /** Teto da densidade de pixels (1 = um pixel de tela por pixel CSS). */
  dpr: number;
  shadows: boolean;
  /** Só vale ao abrir o jogo (o WebGL não troca isso depois). */
  antialias: boolean;
  /** Fração das partículas de chuva, neve, pétalas etc. */
  weather: number;
  /** Borboletas, pássaros, peixes e sombra das nuvens. */
  extras: boolean;
  /** Quadros por segundo no máximo (0 = o que a tela der). */
  fps: number;
  /** Luz de cinema (2026-11-10): ajuste de tom e acerto de cor no próprio desenho (render/grade.ts). */
  cinema: boolean;
  /** Grama e flores no chão (2026-11-10): fração da densidade cheia. */
  meadow: number;
  /** Lado do mapa de sombra do sol, em pixels. */
  shadowMap: number;
  /** Partida nova no mapa menor (raio 16 em vez de 22). */
  smallMap: boolean;
}

export const QUALITY: Record<Quality, QualityLook> = {
  baixo: { dpr: 1, shadows: false, antialias: false, weather: 0.35, extras: false, fps: 30, cinema: false, meadow: 0.3, shadowMap: 1024, smallMap: true },
  medio: { dpr: 1.5, shadows: true, antialias: true, weather: 0.7, extras: true, fps: 0, cinema: true, meadow: 0.6, shadowMap: 1024, smallMap: false },
  alto: { dpr: 2, shadows: true, antialias: true, weather: 1, extras: true, fps: 0, cinema: true, meadow: 1, shadowMap: 2048, smallMap: false },
};

const KEY = 'reino.graficos';

/**
 * A escolha guardada (o "leve" de antes vira baixo e o "normal", alto); sem escolha, um aparelho
 * de toque com pouca memória (4 GB ou menos, que o Chrome do Android informa) começa no baixo. No
 * iPhone o Safari não informa a memória: alto (o usuário testou e roda bem).
 */
export function readQuality(): Quality {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'baixo' || v === 'medio' || v === 'alto') return v;
    if (v === 'leve') return 'baixo';
    if (v === 'normal') return 'alto';
  } catch {
    // sem armazenamento: adivinha
  }
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return touch && mem !== undefined && mem <= 4 ? 'baixo' : 'alto';
}

export function writeQuality(q: Quality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}
