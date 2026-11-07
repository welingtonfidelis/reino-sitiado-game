/**
 * Peças da interface usadas em mais de um lugar: ícones de traço e o texto de custo.
 */
import { RES_ORDER } from '../sim/index.ts';
import type { Cost, Res } from '../sim/index.ts';

export const ICONS: Record<string, string> = {
  comida: 'M12 21V8M12 12c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zM12 12c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4zM12 16.5c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zM12 16.5c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4z',
  madeira: 'M17 7a3 5 0 1 0 0.01 0zM17 7H7c-1.7 0-3 2.2-3 5s1.3 5 3 5h10',
  pedra: 'M4 17l2.5-7L11 6l6 1.5 3 5.5-2 5H6zM11 6l1 5 6 2M12 11l-5.5-1',
  ferro: 'M3 17l3-7h12l3 7zM6 10l1.5-3h9L18 10',
  cristal: 'M12 3l6 6-6 12-6-12zM6 9h12M12 3v18',
  ouro: 'M5 8a7 3 0 1 0 14 0a7 3 0 1 0-14 0M5 8v4c0 1.7 3.1 3 7 3s7-1.3 7-3V8M5 12v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4',
  casa: 'M3.5 11.5L12 5l8.5 6.5M6 10.5V20h12v-9.5M10 20v-5h4v5',
  caveira: 'M12 3c-4.4 0-8 3.1-8 7.5 0 2.6 1.2 4.3 3 5.3V19h10v-3.2c1.8-1 3-2.7 3-5.3C20 6.1 16.4 3 12 3zM9 11h.01M15 11h.01',
  pausa: 'M9 6v12M15 6v12',
  martelo: 'M14 6l4 4M11.5 8.5l-7 7a1.4 1.4 0 0 0 2 2l7-7M12 5l3-2 6 6-2 3z',
  mover: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  melhorar: 'M12 19V6M6 11l6-6 6 6',
  lixo: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  espadas: 'M4 4l11 11M15 15l2 2M14 18l4-4M20 4L9 15M9 15l-2 2M10 18l-4-4',
  bandeira: 'M5 21V4M5 4h11l-2 4 2 4H5',
  som: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mudo: 'M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6',
  caixa: 'M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4',
  // HUD da etapa 12 e ícones das construções no leque do Construir.
  castelo: 'M4 21V9h3V6h3v3h4V6h3v3h3v12zM10 21v-4h4v4',
  play: 'M8 5l11 7-11 7z',
  mais: 'M5 12h.01M12 12h.01M19 12h.01',
  muralha: 'M3 20V9h3V6h3v3h2V6h2v3h2V6h3v3h3v11zM3 14.5h18M9 9v5.5M15 9v5.5M12 14.5V20',
  portao: 'M4 21V9a8 8 0 0 1 16 0v12M12 3v18M4 13h16',
  torre: 'M7 21V9L5 5h14l-2 4v12zM10 21v-4h4v4M10 12h.01M14 12h.01',
  catapulta: 'M3 19h18M6 19l4-8 9-6M18.5 3a1.8 1.8 0 1 0 .01 0M10 11l3 8',
  estacas: 'M4 20l3-13 3 13M10 20l3-13 3 13M16 20l2-9 2 9',
  machado: 'M14 4l6 6-3 3-6-6zM12 9L4 20M15.5 5.5c-2 0-4 1.5-4.5 3.5',
  arco: 'M6 3c7 3 7 15 0 18M6 3v18M6 12h14M17 9l3 3-3 3',
  capela: 'M12 2v5M10 4h4M5 21V11l7-4 7 4v10zM10 21v-5h4v5',
  ferradura: 'M7 4v8a5 5 0 0 0 10 0V4M5 4h4M15 4h4M8 9h.01M16 9h.01M8 13h.01M16 13h.01',
  estrela: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  // Relatório de vitória (bênçãos com figura) e Nova partida.
  coracao: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  relogio: 'M12 3a9 9 0 1 0 .01 0M12 7v5l3 2',
  coroa: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5zM5 19h14',
  pessoa: 'M12 4a3 3 0 1 0 .01 0M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6',
  novo: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  check: 'M5 12l5 5 9-10',
  folha: 'M5 19c0-8 6-14 15-14-1 9-7 15-15 14zM5 19l8-8',
  moinho: 'M12 21V12M9 21h6M12 12L8 4M12 12l8-3M12 12l4 8M12 12l-8 3',
  // Menu circular do prédio.
  recrutar: 'M9 4.5a3 3 0 1 0 0.01 0M3.5 20c0-3.3 2.4-5.5 5.5-5.5s5.5 2.2 5.5 5.5M18.5 8v6M15.5 11h6',
  recolher: 'M4 21V9l8-5 8 5v12M10 21v-5h4v5',
  relatorio: 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4',
  bigorna: 'M3 8h13c0 3-2 4-5 4v3h4v3H6v-3h4v-3C6 12 3 11 3 8zM16 8h5',
  escudo: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  flecha: 'M4 20L20 4M14 4h6v6M4 20l2-5M4 20l5-2',
  voltar: 'M10 6l-6 6 6 6M4 12h16',
  fogo: 'M12 3c1 3 4.5 4.5 4.5 9a4.5 4.5 0 0 1-9 0c0-2.2 1-3.6 2.2-4.6 0 2 .8 3.1 2 3.1 0-3-1.6-4.6.3-7.5z',
  fechar: 'M6 6l12 12M18 6L6 18',
  musica: 'M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0M14 16a3 3 0 1 0 6 0a3 3 0 1 0-6 0M9 18V5l11-2v13',
  semMusica: 'M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0M14 16a3 3 0 1 0 6 0a3 3 0 1 0-6 0M9 18V5l11-2v13M3 3l18 18',
  album: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6v5H9z',
  // Etapa 16: estações (a folha já existia) e o álbum de figurinhas.
  flor: 'M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M9 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0M9 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M15 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  sol: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  neve: 'M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5M4 9.6l3.4 1-1-3.4M20 14.4l-3.4-1 1 3.4M4 14.4l3.4-1-1 3.4M20 9.6l-3.4 1 1-3.4',
};

export function Icon({ name, style }: { name: string; style?: string }) {
  return (
    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true" style={style}>
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Número curto para a faixa de recursos: 719, 1,2k, 12k. */
export function short(n: number): string {
  const v = Math.floor(n);
  if (v < 1000) return String(v);
  if (v < 10000) return `${(v / 1000).toFixed(1).replace('.0', '').replace('.', ',')}k`;
  return `${Math.floor(v / 1000)}k`;
}

export const RES_LABEL: Record<Res, string> = { comida: 'comida', madeira: 'madeira', pedra: 'pedra', ferro: 'ferro', cristal: 'cristal', ouro: 'ouro' };

export function costText(c: Cost): string {
  const parts = RES_ORDER.filter((r) => (c[r] ?? 0) > 0).map((r) => `${c[r]} de ${RES_LABEL[r]}`);
  return parts.length ? parts.join(' · ') : 'grátis';
}
