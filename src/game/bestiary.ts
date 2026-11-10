/**
 * Livro do Sábio (2026-11-10): um bestiário com a figura de cada monstro, o que ele faz e o que
 * funciona contra ele, em ícones grandes para quem ainda não lê. Quem ainda não apareceu em
 * nenhuma partida fica de sombra, com um "?": dá vontade de ver todos. O que já foi visto fica no
 * navegador, de uma partida para a outra, como o álbum.
 */
import { MONSTERS } from '../sim/index.ts';
import type { MonsterKind, World } from '../sim/index.ts';

/** Ordem do livro: pela onda em que cada um aparece; os chefes no fim. */
export const BOOK_ORDER: MonsterKind[] = (Object.keys(MONSTERS) as MonsterKind[]).sort(
  (a, b) => Number(!!MONSTERS[a].boss) - Number(!!MONSTERS[b].boss) || MONSTERS[a].from - MONSTERS[b].from,
);

/** O que funciona contra cada um: ícones (os do jogo) e a frase de apoio. */
export const COUNTERS: Record<MonsterKind, { icons: string[]; text: string }> = {
  esqueleto: { icons: ['arco', 'espadas'], text: 'Qualquer tropa dá conta. Vem em bando: torres com arqueiros seguram.' },
  lobisomem: { icons: ['muralha', 'torre'], text: 'Corre e rodeia a muralha atrás de brecha: feche o anel e ponha torres perto.' },
  orc: { icons: ['catapulta', 'espadas', 'martelo'], text: 'Bate forte em muralha e prédio: derrube antes que chegue. Engenheiros consertam.' },
  esqueletoGuerreiro: { icons: ['espadas', 'lanca', 'estrela', 'polvora'], text: 'O escudo segura flecha. Espada, lança, magia e o tiro do anão passam.' },
  acumulador: { icons: ['arco', 'ferradura'], text: 'Rouba e foge para a fenda. Derrube no caminho de volta e o roubo volta para o reino.' },
  bruto: { icons: ['lanca', 'catapulta'], text: 'Muita vida e golpe pesado. Lança e catapulta pegam forte nos grandes.' },
  morcego: { icons: ['arco', 'estrela', 'castelo'], text: 'Voa por cima da muralha. Só flecha, magia, o tiro do anão e o castelo alcançam.' },
  bruxa: { icons: ['arco', 'estrela'], text: 'Fica atrás e cura a horda. Derrube primeiro, de longe.' },
  troll: { icons: ['fogo', 'estrela'], text: 'Se cura sozinho. Fogo para a cura: magia, piche aceso ou flecha de fogo.' },
  necromante: { icons: ['arco', 'espadas'], text: 'Levanta esqueletos ao lado. Derrube ele e os esqueletos param de vir.' },
  vampiro: { icons: ['lanca', 'arco', 'castelo'], text: 'Chama morcegos e se cura batendo. A lança pega forte; flechas e o castelo derrubam os morcegos.' },
  golem: { icons: ['estrela', 'espadas', 'polvora'], text: 'Flecha não fere. Magia, espada e o tiro do anão sim.' },
  golemOssos: { icons: ['arco', 'espadas', 'catapulta'], text: 'Magia não fere. Flechas, espadas e catapulta sim.' },
  golemMusgo: { icons: ['fogo', 'estrela'], text: 'Se cura e cura a horda em volta. Fogo para tudo: magia, piche aceso ou flecha de fogo.' },
};

/** O que ele faz, em ícones: o que mais chama a atenção nele. */
export const TRAITS: Record<MonsterKind, string[]> = {
  esqueleto: ['caveira', 'bando'],
  lobisomem: ['lobo', 'mover'],
  orc: ['machado', 'muralha'],
  esqueletoGuerreiro: ['escudo', 'flecha'],
  acumulador: ['ouro', 'mover'],
  bruto: ['coracao', 'machado'],
  morcego: ['morcego', 'muralha'],
  bruxa: ['cura', 'caveira'],
  troll: ['coracao', 'cura'],
  necromante: ['caveira', 'bando'],
  vampiro: ['morcego', 'coracao'],
  golem: ['neve', 'escudo'],
  golemOssos: ['caveira', 'escudo'],
  golemMusgo: ['folha', 'cura'],
};

const KEY = 'reino.livro';

/** Monstros já vistos (em qualquer partida), guardados no navegador. */
export class Bestiary {
  seen = new Set<MonsterKind>();
  /** Vistos pela primeira vez desde a última vez que o livro foi aberto. */
  fresh = new Set<MonsterKind>();

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) for (const k of JSON.parse(raw) as string[]) if (k in MONSTERS) this.seen.add(k as MonsterKind);
    } catch {
      this.seen.clear();
    }
  }

  /** Anota quem está no mapa agora; devolve true se apareceu alguém novo. */
  note(w: World): boolean {
    let any = false;
    for (const m of w.monsters.values()) {
      if (this.seen.has(m.kind)) continue;
      this.seen.add(m.kind);
      this.fresh.add(m.kind);
      any = true;
    }
    if (any) {
      try {
        localStorage.setItem(KEY, JSON.stringify([...this.seen]));
      } catch {
        // Sem armazenamento: vale só nesta visita.
      }
    }
    return any;
  }

  read(): void {
    this.fresh.clear();
  }
}
