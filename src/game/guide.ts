/**
 * O Sábio (2026-11-09): um velhinho de barba (o Lorekeeper do KayKit) que aparece no canto com
 * uma dica em figuras, para quem ainda não lê, e uma frase curta embaixo para quem lê. Cada dica
 * aparece uma vez por partida (fica em `world.flags`, que vai no salvo) e só quando faz sentido.
 */
import { BUILDINGS, CONFIG, HERO_KINDS, MODES, buildCost, castle, castleCap, heroCost, heroOf, housing, missing, waveSize, workers } from '../sim/index.ts';
import type { MonsterKind, World } from '../sim/index.ts';

export interface Tip {
  id: string;
  /** Figuras da dica, da esquerda para a direita (nomes do <Icon>); 'seta' vira uma seta entre elas. */
  icons: string[];
  text: string;
}

interface TipDef extends Tip {
  when: (w: World) => boolean;
}

const has = (w: World, kind: keyof typeof BUILDINGS) => [...w.buildings.values()].some((b) => b.kind === kind && b.built >= 1);
/** A próxima onda (na calmaria) ou a de agora traz este monstro? */
const coming = (w: World, kind: MonsterKind) => w.waveState === 'calm' && waveSize(w.wave + 1, w.mode)[kind] > 0;

const TIPS: TipDef[] = [
  {
    id: 'ola',
    icons: ['casa', 'seta', 'pessoa', 'seta', 'machado'],
    text: 'Olá! Casas trazem gente, e a gente trabalha nos prédios.',
    when: (w) => w.wave === 0 && w.time > 3,
  },
  {
    id: 'torre',
    icons: ['torre', 'mais', 'arco'],
    text: 'A torre só atira com arqueiros dentro. Faça o campo de tiro e recrute.',
    when: (w) => w.wave === 0 && w.waveTimer < 50 && !has(w, 'torre'),
  },
  {
    id: 'comida',
    icons: ['moinho', 'seta', 'comida'],
    text: 'Pouca comida! Faça plantações em volta do celeiro.',
    when: (w) => w.res.comida < 40 && w.wave >= 1,
  },
  {
    id: 'casas',
    icons: ['casa', 'mais', 'pessoa'],
    text: 'As casas estão cheias: faça mais casas para chegar gente.',
    when: (w) => w.wave >= 1 && housing(w) <= workers(w) && housing(w) < castleCap(w) && !missing(w, buildCost(w, 'casa')),
  },
  {
    id: 'fuga',
    icons: ['caveira', 'seta', 'pessoa', 'casa'],
    text: 'Quando a horda chega perto, a gente corre para casa e volta sozinha depois.',
    when: (w) => [...w.units.values()].some((u) => u.kind === 'trabalhador' && u.state === 'shelter' && u.hideIn !== undefined),
  },
  {
    id: 'seco',
    icons: ['machado', 'seta', 'mover'],
    text: 'Acabou o recurso ali. Toque no prédio e mude ele para perto de outro.',
    when: (w) => [...w.buildings.values()].some((b) => b.dry && b.kind !== 'fazenda' && !b.moveTo),
  },
  {
    id: 'replantar',
    icons: ['broto', 'seta', 'comida'],
    text: 'Plantação colhida! Toque nela e replante.',
    when: (w) => [...w.buildings.values()].some((b) => b.dry && b.kind === 'fazenda'),
  },
  {
    id: 'portao',
    icons: ['muralha', 'seta', 'portao', 'espadas'],
    text: 'Soldados não atravessam muralha. Ponha um portão para eles saírem para a luta.',
    when: (w) => !!w.flags.muralhaBloqueia,
  },
  {
    id: 'ladrao',
    icons: ['ouro', 'seta', 'espadas'],
    text: 'O acumulador rouba recursos e foge para a fenda. Derrube ele que o roubo volta!',
    when: (w) => coming(w, 'acumulador'),
  },
  {
    id: 'forja',
    icons: ['bigorna', 'seta', 'escudo', 'espadas'],
    text: 'A forja deixa as tropas mais fortes: armas, armaduras e pontas de flecha.',
    when: (w) => w.wave >= 6 && !has(w, 'forja') && w.waveState === 'calm',
  },
  {
    id: 'heroi',
    icons: ['castelo', 'seta', 'coroa'],
    text: 'Já dá para chamar um herói! Toque no castelo.',
    when: (w) => (castle(w)?.level ?? 1) >= CONFIG.heroes.castleLevel && !HERO_KINDS.some((k) => heroOf(w, k)) && !missing(w, heroCost(w)),
  },
  {
    id: 'chefe',
    icons: ['caveira', 'seta', 'catapulta', 'espadas'],
    text: 'Vem um chefe na próxima onda! Catapulta e soldados ajudam.',
    when: (w) => w.waveState === 'calm' && (w.wave + 1) % MODES[w.mode].bossEvery === 0,
  },
  {
    id: 'torreNivel',
    icons: ['torre', 'seta', 'melhorar', 'arco'],
    text: 'Toque na torre e melhore: de pedra, ela alcança mais e atira mais forte.',
    when: (w) => w.wave >= 6 && w.waveState === 'calm' && w.res.pedra >= 80 && [...w.buildings.values()].some((b) => b.kind === 'torre' && b.built >= 1 && b.level === 1),
  },
  {
    id: 'mercado',
    icons: ['ouro', 'seta', 'mercado', 'seta', 'ferro'],
    text: 'Ouro sobrando e ferro faltando? O mercado troca um pelo outro.',
    when: (w) => w.wave >= 8 && w.res.ouro >= 200 && w.res.ferro < 30 && !has(w, 'mercado'),
  },
  {
    id: 'vampiro',
    icons: ['caveira', 'seta', 'flecha'],
    text: 'O vampiro chama morcegos. Flechas e o castelo derrubam quem voa.',
    when: (w) => coming(w, 'vampiro'),
  },
];

/** Primeira dica que ainda não apareceu nesta partida e que vale agora. */
export function pickTip(w: World): Tip | null {
  for (const t of TIPS) {
    if (w.flags[`guia:${t.id}`]) continue;
    if (t.when(w)) return { id: t.id, icons: t.icons, text: t.text };
  }
  return null;
}

/** Marca a dica como vista (vai no salvo junto da partida). */
export function markTip(w: World, id: string): void {
  w.flags[`guia:${id}`] = true;
}

export const TIP_IDS = TIPS.map((t) => t.id);
