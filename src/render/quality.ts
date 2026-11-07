/**
 * Qualidade dos gráficos: "normal" ou "leve" (tablet ou celular de entrada). O leve desenha na
 * resolução da tela (sem o dobro das telas finas), tira as sombras e o antisserrilhado, põe menos
 * coisa caindo do céu, tira os bichinhos e a sombra das nuvens e desenha a 30 quadros por segundo.
 * A simulação não muda: o jogo é o mesmo, só o desenho fica mais barato.
 */
export type Quality = 'normal' | 'leve';

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
}

export const QUALITY: Record<Quality, QualityLook> = {
  normal: { dpr: 2, shadows: true, antialias: true, weather: 1, extras: true, fps: 0 },
  leve: { dpr: 1, shadows: false, antialias: false, weather: 0.35, extras: false, fps: 30 },
};

const KEY = 'reino.graficos';

/**
 * A escolha guardada; sem escolha, um aparelho de toque com pouca memória (4 GB ou menos, que o
 * Chrome do Android informa) começa no leve. No iPhone o Safari não informa a memória: normal.
 */
export function readQuality(): Quality {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'leve' || v === 'normal') return v;
  } catch {
    // sem armazenamento: adivinha
  }
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return touch && mem !== undefined && mem <= 4 ? 'leve' : 'normal';
}

export function writeQuality(q: Quality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}
