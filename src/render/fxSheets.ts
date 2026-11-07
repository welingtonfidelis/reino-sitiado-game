// Gerado por tools/bake-fx.ts a partir do pixelfx (commit desconhecido). Não editar à mão.
/**
 * Folhas de quadros dos efeitos (`public/assets/fx/<chave>.png`), pixelfx, MIT (Patch e Hugo
 * Duprez), ver LICENSES.md. Quadros de `cw` x `ch` px em `cols` colunas (com 1 px vazio em volta);
 * `ox`, `oy`: a origem do efeito (o chão onde ele acontece) dentro do quadro, y para baixo.
 */
export const FX_SHEETS = {
  /** Hit spark (pixelfx `impacts/hit-spark`). */
  faisca: { file: 'faisca.png', w: 1624, h: 71, cols: 14, cw: 116, ch: 71, frames: 14, fps: 30, loop: false, ox: 28, oy: 56 },
  /** Blunt hit (pixelfx `impacts/blunt-hit`). */
  pancada: { file: 'pancada.png', w: 2002, h: 154, cols: 22, cw: 91, ch: 77, frames: 26, fps: 30, loop: false, ox: 48, oy: 60 },
  /** Sword slash (pixelfx `melee/sword-slash`). */
  espada: { file: 'espada.png', w: 1935, h: 206, cols: 15, cw: 129, ch: 103, frames: 18, fps: 30, loop: false, ox: 45, oy: 91 },
  /** Claw swipe (pixelfx `melee/claw-swipe`). */
  garra: { file: 'garra.png', w: 1680, h: 61, cols: 24, cw: 70, ch: 61, frames: 24, fps: 30, loop: false, ox: 5, oy: 48 },
  /** Poof (pixelfx `spawn/poof`). */
  poof: { file: 'poof.png', w: 1764, h: 76, cols: 21, cw: 84, ch: 76, frames: 21, fps: 15, loop: false, ox: 38, oy: 63 },
  /** Dirt explosion (pixelfx `explosions/dirt-explosion`). */
  explosao: { file: 'explosao.png', w: 2008, h: 1160, cols: 8, cw: 251, ch: 232, frames: 35, fps: 10, loop: false, ox: 128, oy: 197 },
  /** Burning (pixelfx `status/burning`). */
  fogo: { file: 'fogo.png', w: 774, h: 68, cols: 18, cw: 43, ch: 68, frames: 18, fps: 15, loop: true, ox: 21, oy: 63 },
  /** Portal (pixelfx `arcane/portal`). */
  portal: { file: 'portal.png', w: 2002, h: 354, cols: 13, cw: 154, ch: 118, frames: 36, fps: 15, loop: true, ox: 77, oy: 107 },
  /** Level up (pixelfx `ui/level-up`). */
  nivel: { file: 'nivel.png', w: 2028, h: 560, cols: 13, cw: 156, ch: 140, frames: 49, fps: 15, loop: false, ox: 78, oy: 115 },
  /** Coin collect (pixelfx `ui/coin-collect`). */
  moedas: { file: 'moedas.png', w: 1989, h: 339, cols: 13, cw: 153, ch: 113, frames: 33, fps: 15, loop: false, ox: 39, oy: 98 },
  /** Mana burst (pixelfx `arcane/mana-burst`). */
  mana: { file: 'mana.png', w: 1920, h: 438, cols: 12, cw: 160, ch: 146, frames: 26, fps: 15, loop: false, ox: 84, oy: 119 },
  /** Heal (pixelfx `holy/heal`). */
  cura: { file: 'cura.png', w: 1144, h: 85, cols: 26, cw: 44, ch: 85, frames: 26, fps: 15, loop: false, ox: 22, oy: 72 },
  /** Heavy cleave (pixelfx `melee/heavy-cleave`). */
  golpe: { file: 'golpe.png', w: 1989, h: 306, cols: 13, cw: 153, ch: 102, frames: 28, fps: 15, loop: false, ox: 50, oy: 81 },
  /** Bat (pixelfx `critters/bat`). */
  morcego: { file: 'morcego.png', w: 2000, h: 124, cols: 20, cw: 100, ch: 62, frames: 36, fps: 15, loop: true, ox: 54, oy: 28 },
  /** Soul rise (pixelfx `spawn/soul-rise`). */
  alma: { file: 'alma.png', w: 1976, h: 256, cols: 26, cw: 76, ch: 128, frames: 47, fps: 15, loop: false, ox: 38, oy: 113 },
  /** Healing bloom (pixelfx `nature/healing-bloom`). */
  bloom: { file: 'bloom.png', w: 2014, h: 357, cols: 19, cw: 106, ch: 119, frames: 49, fps: 15, loop: false, ox: 52, oy: 106 },
  /** Spin slash (pixelfx `melee/spin-slash`). */
  giro: { file: 'giro.png', w: 1925, h: 94, cols: 11, cw: 175, ch: 94, frames: 11, fps: 15, loop: false, ox: 75, oy: 73 },
  /** Star fall (pixelfx `arcane/star-fall`). */
  chuva: { file: 'chuva.png', w: 2028, h: 310, cols: 12, cw: 169, ch: 155, frames: 23, fps: 10, loop: false, ox: 95, oy: 132 },
  /** Root snare (pixelfx `nature/root-snare`). */
  raizes: { file: 'raizes.png', w: 2034, h: 162, cols: 18, cw: 113, ch: 54, frames: 40, fps: 15, loop: false, ox: 57, oy: 37 },
  /** Heavy landing (pixelfx `impacts/heavy-landing`). */
  pisao: { file: 'pisao.png', w: 1918, h: 84, cols: 14, cw: 137, ch: 42, frames: 22, fps: 15, loop: false, ox: 70, oy: 28 },
  /** Blessing (pixelfx `holy/blessing`). */
  bencao: { file: 'bencao.png', w: 1410, h: 125, cols: 30, cw: 47, ch: 125, frames: 30, fps: 10, loop: true, ox: 23, oy: 109 },
  /** Firework burst (pixelfx `explosions/firework-burst`). */
  fogos: { file: 'fogos.png', w: 1900, h: 880, cols: 10, cw: 190, ch: 220, frames: 31, fps: 10, loop: false, ox: 98, oy: 82 },
  /** Confetti (pixelfx `ui/confetti`). */
  confete: { file: 'confete.png', w: 1970, h: 384, cols: 10, cw: 197, ch: 96, frames: 33, fps: 10, loop: false, ox: 96, oy: 81 },
  /** Butterfly (pixelfx `critters/butterfly`). */
  borboleta: { file: 'borboleta.png', w: 1976, h: 148, cols: 19, cw: 104, ch: 74, frames: 32, fps: 10, loop: true, ox: 52, oy: 38 },
  /** Bird (pixelfx `critters/bird`). */
  passaro: { file: 'passaro.png', w: 1200, h: 39, cols: 24, cw: 50, ch: 39, frames: 24, fps: 10, loop: true, ox: 35, oy: 18 },
  /** Splash (pixelfx `water/splash`). */
  respingo: { file: 'respingo.png', w: 1935, h: 204, cols: 15, cw: 129, ch: 102, frames: 24, fps: 10, loop: false, ox: 68, oy: 79 },
} as const;

export type FxKey = keyof typeof FX_SHEETS;
