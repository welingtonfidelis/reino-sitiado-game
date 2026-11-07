/**
 * Fim de onda (Etapa 4): o relatório do que aconteceu desde o último, os nomes de quem caiu e,
 * a cada 4 ondas, a escolha de uma bênção entre três. Bênçãos são modificadores permanentes.
 */
import type { Res, UnitKind } from './config.ts';

export interface Mods {
  arrowDmg: number;
  castleDmg: number;
  castleRange: number;
  /** Produção por recurso. */
  prod: Record<Res, number>;
  soldierHp: number;
  wallHp: number;
  /** Fração da vida que muralhas e portões recuperam no fim de cada onda. */
  wallRegen: number;
  arriveEvery: number;
  gold: number;
}

export function baseMods(): Mods {
  return {
    arrowDmg: 1,
    castleDmg: 1,
    castleRange: 0,
    prod: { comida: 1, madeira: 1, pedra: 1, ferro: 1, cristal: 1, ouro: 1 },
    soldierHp: 1,
    wallHp: 1,
    wallRegen: 0,
    arriveEvery: 20,
    gold: 1,
  };
}

export type BlessingId =
  | 'brasa'
  | 'celeiros'
  | 'pedraBenta'
  | 'machados'
  | 'picaretas'
  | 'escudos'
  | 'muralhasGrossas'
  | 'vigia'
  | 'bracos'
  | 'coroa';

export interface Blessing {
  name: string;
  text: string;
  tag: string;
  apply: (m: Mods) => void;
}

export const BLESSINGS: Record<BlessingId, Blessing> = {
  brasa: { name: 'Flechas em brasa', text: 'Toda flecha (torres, castelo e arqueiros) causa 40% a mais de dano.', tag: 'Defesa', apply: (m) => (m.arrowDmg *= 1.4) },
  celeiros: { name: 'Celeiros fundos', text: 'As fazendas produzem 25% a mais de comida.', tag: 'Economia', apply: (m) => (m.prod.comida *= 1.25) },
  pedraBenta: { name: 'Pedra benta', text: 'No fim de cada onda, muralhas e portões recuperam um terço da vida.', tag: 'Muralhas', apply: (m) => (m.wallRegen += 0.33) },
  machados: { name: 'Machados afiados', text: 'As serrarias produzem 30% a mais de madeira.', tag: 'Economia', apply: (m) => (m.prod.madeira *= 1.3) },
  picaretas: { name: 'Picaretas novas', text: 'Pedreiras e minas produzem 30% a mais.', tag: 'Economia', apply: (m) => ((m.prod.pedra *= 1.3), (m.prod.ferro *= 1.3)) },
  escudos: { name: 'Escudos de ferro', text: 'Soldados têm 30% a mais de vida, inclusive os que já existem.', tag: 'Tropas', apply: (m) => (m.soldierHp *= 1.3) },
  muralhasGrossas: { name: 'Muralhas grossas', text: 'Muralhas e portões têm 40% a mais de vida, inclusive os de pé.', tag: 'Muralhas', apply: (m) => (m.wallHp *= 1.4) },
  vigia: { name: 'Castelo vigilante', text: 'O castelo atira com o dobro de dano e alcança 2 m mais longe.', tag: 'Defesa', apply: (m) => ((m.castleDmg *= 2), (m.castleRange += 2)) },
  bracos: { name: 'Estrada aberta', text: 'Trabalhadores chegam a cada 14 s em vez de 20 s.', tag: 'Moradia', apply: (m) => (m.arriveEvery = Math.min(m.arriveEvery, 14)) },
  coroa: { name: 'Ouro da coroa', text: 'O saque de cada onda rende 30% a mais de ouro.', tag: 'Ouro', apply: (m) => (m.gold *= 1.3) },
};
export const BLESSING_IDS = Object.keys(BLESSINGS) as BlessingId[];
/** De quantas em quantas ondas aparece a escolha. */
export const BLESSING_EVERY = 4;

export interface Fallen {
  name: string;
  kind: UnitKind;
  text: string;
}

/** O que aconteceu desde o último relatório. */
export interface WaveStats {
  kills: number;
  fallen: Fallen[];
  wallsLost: number;
  buildingsLost: number;
  prod: Record<Res, number>;
}

export function emptyStats(): WaveStats {
  return { kills: 0, fallen: [], wallsLost: 0, buildingsLost: 0, prod: { comida: 0, madeira: 0, pedra: 0, ferro: 0, cristal: 0, ouro: 0 } };
}

export interface Report extends WaveStats {
  wave: number;
  gold: number;
  choices: BlessingId[];
}

const MALE = ['Bruno', 'Tomé', 'Gaspar', 'Matias', 'Davi', 'Otávio', 'Caio', 'Elias', 'Fábio', 'Igor', 'Nuno', 'Rui', 'Vicente', 'Ulisses', 'Aurélio', 'Bento', 'Estêvão', 'Gil', 'Jonas', 'Mauro'];
const FEMALE = ['Lia', 'Inês', 'Rosa', 'Clara', 'Íris', 'Beatriz', 'Joana', 'Marta', 'Helena', 'Luísa', 'Olga', 'Sara', 'Tereza', 'Vera', 'Cecília', 'Dora', 'Flora', 'Hilda', 'Lúcia', 'Noêmia'];
const NAMES = MALE.flatMap((m, i) => [m, FEMALE[i]!]);
const FEM = new Set(FEMALE);

export function nameFor(id: number, seed: number): string {
  return NAMES[(id * 7 + seed) % NAMES.length]!;
}

const EPITAPHS: Record<UnitKind, string[]> = {
  soldado: ['Segurou a linha até o fim.', 'Caiu de frente para a horda.', 'Não recuou um passo.'],
  arqueiro: ['Atirou até a última flecha.', 'Caiu de arco na mão.', 'Viu a horda de perto demais.'],
  trabalhador: ['Estava no trabalho quando a horda chegou.', 'Não chegou a tempo no castelo.', 'Largou a ferramenta tarde demais.'],
  mago: ['Gastou o último cristal.', 'O feitiço não veio a tempo.'],
  clerigo: ['Cuidou dos outros até o fim.', 'Rezou de pé no meio da horda.'],
  cavaleiro: ['Carregou contra a horda mais uma vez.', 'Caiu longe dos portões.'],
  engenheiro: ['Morreu com o martelo na mão, consertando a muralha.', 'A muralha ficou; ele não.'],
  // Heróis não morrem (desmaiam e voltam); a frase só existe para o tipo fechar.
  barbaro: ['Desmaiou no meio da horda.'],
  atiradora: ['Desmaiou de besta na mão.'],
  druida: ['Desmaiou entre as raízes.'],
  cavaleiroNegro: ['Desmaiou de escudo erguido.'],
};
const ROLE: Record<UnitKind, [string, string]> = {
  soldado: ['soldado', 'soldado'],
  arqueiro: ['arqueiro', 'arqueira'],
  trabalhador: ['trabalhador', 'trabalhadora'],
  mago: ['mago', 'maga'],
  clerigo: ['clérigo', 'clériga'],
  cavaleiro: ['cavaleiro', 'cavaleira'],
  engenheiro: ['engenheiro', 'engenheira'],
  barbaro: ['bárbaro', 'bárbaro'],
  atiradora: ['atiradora', 'atiradora'],
  druida: ['druida', 'druida'],
  cavaleiroNegro: ['cavaleiro negro', 'cavaleiro negro'],
};

export function epitaph(name: string, kind: UnitKind, id: number): Fallen {
  const list = EPITAPHS[kind];
  const role = ROLE[kind][FEM.has(name) ? 1 : 0];
  return { name, kind, text: `${name}, ${role}. ${list[id % list.length]}` };
}
