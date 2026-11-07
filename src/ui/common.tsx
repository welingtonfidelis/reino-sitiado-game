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
};

export function Icon({ name, style }: { name: string; style?: string }) {
  return (
    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true" style={style}>
      <path d={ICONS[name]} />
    </svg>
  );
}

export const RES_LABEL: Record<Res, string> = { comida: 'comida', madeira: 'madeira', pedra: 'pedra', ferro: 'ferro', cristal: 'cristal', ouro: 'ouro' };

export function costText(c: Cost): string {
  const parts = RES_ORDER.filter((r) => (c[r] ?? 0) > 0).map((r) => `${c[r]} de ${RES_LABEL[r]}`);
  return parts.length ? parts.join(' · ') : 'grátis';
}
