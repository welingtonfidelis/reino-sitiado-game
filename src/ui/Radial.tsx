/**
 * Menu circular do prédio tocado (pedido do usuário em 2026-11-06; esboço no canvas de design).
 *
 * As ações abrem num anel em volta do prédio, cada uma numa casa fixa: a principal no topo,
 * Destruir embaixo à esquerda (casa vazia quando o prédio não tem a ação). Um cartão acima do
 * anel mostra vida, fila e o que o botão em foco faz e custa, longe do dedo. Perto da borda de
 * baixo o anel vira leque; perto do topo o cartão desce. Um toque executa; Destruir pede dois;
 * segurar o botão (ou passar o mouse) só mostra a explicação. Tocar fora fecha.
 */
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import {
  BLESSINGS,
  BUILDINGS,
  BUILD_MENU,
  RES_ORDER,
  CONFIG,
  UNITS,
  castleCap,
  demolishProblem,
  forgeCost,
  forgeProblem,
  hexToWorld,
  housing,
  igniteProblem,
  CROP_NAME,
  cropOf,
  HERO_INFO,
  HERO_KINDS,
  heroCost,
  heroOf,
  heroProblem,
  callArchersProblem,
  towerSlots,
  levelProblem,
  missing,
  moveProblem,
  recruitProblem,
  replantProblem,
  fullStock,
  MODES,
  sourceOf,
  repairCost,
  repairProblem,
  troops,
  upgradeCost,
  upgradeProblem,
  workers,
} from '../sim/index.ts';
import type { Building, BuildingKind, Category, Cost, ForgeLine, HeroKind } from '../sim/index.ts';
import type { Game } from '../game/game.ts';
import type { IsoCamera } from '../render/camera.ts';
import { Icon, costText } from './common.tsx';

type Tone = '' | 'primary' | 'danger' | 'on';

interface Act {
  id: string;
  /** Casa no anel: 0 topo, 1 direita, 2 baixo-direita, 3 baixo-esquerda, 4 esquerda. */
  slot: number;
  icon: string;
  label: string;
  hint: string;
  why: string | null;
  tone: Tone;
  badge?: string;
  progress?: number;
  /** Botão que pede atenção (pulsa): o Mover do prédio sem recurso (Etapa 17). */
  pulse?: boolean;
  run: () => void;
}

/** Ângulos (graus, 0 = direita, -90 = topo) das casas no anel e no leque (mesma ordem em volta). */
const RING = [-90, -18, 54, 126, 198];
const FAN = [-90, -45, 0, -180, -135];
/** Submenu da forja: três linhas em volta, Voltar no meio. */
const SUB_RING = [-90, 30, 150];
const SUB_FAN = [-90, 0, -180];
/** Submenu dos heróis: quatro em volta (ou em leque perto da borda). */
const HERO_RING = [-90, 0, 90, 180];
const HERO_FAN = [-180, -120, -60, 0];
const HERO_ICON: Record<HeroKind, string> = { barbaro: 'machado', atiradora: 'arco', druida: 'folha', cavaleiroNegro: 'escudo' };

const FORGE: [ForgeLine, string, string, string][] = [
  ['armas', 'Armas', 'espadas', '+20% de dano corpo a corpo e dos magos'],
  ['armaduras', 'Armaduras', 'escudo', '+20% de vida das tropas, inclusive as de agora'],
  ['flechas', 'Pontas', 'flecha', '+15% de dano das flechas'],
];

function mainActs(game: Game, b: Building, openForge: () => void, openHeroes: () => void): Act[] {
  const w = game.world;
  const def = BUILDINGS[b.kind];
  const name = def.name.toLowerCase();
  const acts: Act[] = [];
  const recruits = def.recruits;
  if (recruits) {
    const u = UNITS[recruits];
    acts.push({
      id: 'recrutar',
      slot: 0,
      icon: 'recrutar',
      label: 'Recrutar',
      tone: 'primary',
      hint: `Recrutar ${u.name.toLowerCase()} · ${costText(u.cost)}. Sai 1 trabalhador da vila${b.rally ? ', direto para o ponto de encontro' : ''}.`,
      why: recruitProblem(w, b),
      badge: b.queue > 0 ? String(b.queue) : undefined,
      progress: b.queue > 0 ? b.queueT / u.train : undefined,
      run: () => game.recruit(b.id),
    });
    acts.push({
      id: 'encontro',
      slot: 1,
      icon: 'bandeira',
      label: 'Encontro',
      tone: b.rally ? 'on' : '',
      hint: b.rally ? 'Mudar o ponto de encontro. Quem já saiu fica onde está; só os próximos vão para o ponto novo.' : 'Marcar o ponto onde os próximos recrutas esperam.',
      why: b.built < 1 ? 'Ainda em obra' : null,
      run: () => game.startRally(b.id),
    });
  }
  if (b.kind === 'castelo') {
    const up = upgradeCost(w);
    acts.push({
      id: 'melhorar',
      slot: 0,
      icon: 'melhorar',
      label: 'Melhorar',
      tone: 'primary',
      hint: up
        ? `Melhorar para o nível ${b.level + 1} · ${costText(up)}. +${CONFIG.castleHpPerLevel} de vida, e o teto de moradores sobe para ${CONFIG.castleCap[b.level]}.`
        : 'O castelo já está no nível máximo.',
      why: upgradeProblem(w),
      run: () => game.upgrade(),
    });
    let inside = 0;
    let all = 0;
    for (const u of w.units.values()) {
      if (u.kind !== 'trabalhador' || u.state === 'dead') continue;
      all++;
      if (u.state === 'shelter') inside++;
    }
    acts.push({
      id: 'recolher',
      slot: 1,
      icon: 'recolher',
      label: w.shelter ? 'Liberar' : 'Recolher',
      tone: w.shelter ? 'on' : '',
      hint: w.shelter
        ? `Liberar os trabalhadores (${inside} de ${all} lá dentro). Ninguém trabalha enquanto estiverem recolhidos.`
        : 'Recolher os trabalhadores no castelo: a horda não os alcança, mas a produção para.',
      why: null,
      run: () => game.toggleShelter(),
    });
  }
  if (b.kind === 'forja') {
    acts.push({
      id: 'melhorias',
      slot: 0,
      icon: 'bigorna',
      label: 'Melhorias',
      tone: 'primary',
      hint: 'Armas, armaduras e pontas de ferro, para todas as tropas.',
      why: b.built < 1 ? 'Ainda em obra' : null,
      run: openForge,
    });
  }
  if (b.kind === 'torre') {
    const free = towerSlots() - b.archers.length;
    acts.push({
      id: 'chamar',
      slot: 0,
      icon: 'arco',
      label: 'Chamar',
      tone: 'primary',
      hint: `Chamar os arqueiros no chão mais perto (${free} ${free === 1 ? 'vaga' : 'vagas'}).`,
      why: callArchersProblem(w, b.id),
      run: () => game.callArchers(b.id),
    });
  }
  if (b.kind === 'fazenda' && MODES[w.mode].depletes) {
    // Etapa 17: plantação colhida até o fim se replanta aqui (o botão pulsa quando é a hora).
    // No fácil (Etapa 18) nada acaba, e o botão não aparece.
    const why = replantProblem(w, b);
    acts.push({
      id: 'replantar',
      slot: 0,
      icon: 'broto',
      label: 'Replantar',
      tone: 'primary',
      hint: `Replantar · ${costText(CONFIG.farm.replant)}. A plantação dá ${CONFIG.farm.harvest} de comida e depois precisa de outra semeadura.`,
      why,
      pulse: !why,
      run: () => game.replant(b.id),
    });
  }
  if (b.kind === 'piche') {
    acts.push({
      id: 'acender',
      slot: 0,
      icon: 'fogo',
      label: b.burn > 0 ? 'Aceso' : 'Acender',
      tone: b.burn > 0 ? 'on' : 'primary',
      hint: `Acender o piche · ${costText(CONFIG.pitch.igniteCost)}. Queima por ${CONFIG.pitch.burn} s quem estiver em cima.`,
      why: igniteProblem(w, b),
      run: () => game.ignite(b.id),
    });
  }
  const rep = repairCost(w, b);
  acts.push({
    id: 'consertar',
    slot: 2,
    icon: 'martelo',
    label: 'Consertar',
    tone: '',
    hint: Object.keys(rep).length ? `Consertar ${name} · ${costText(rep)}.` : 'Repõe a vida do prédio.',
    why: repairProblem(w, b),
    run: () => game.repair(b.id),
  });
  if (b.kind === 'castelo') {
    // Etapa 14: o castelo não se derruba, e a casa de baixo à esquerda vira a dos heróis.
    const lvl = CONFIG.heroes.castleLevel;
    acts.push({
      id: 'herois',
      slot: 3,
      icon: 'coroa',
      label: 'Heróis',
      tone: 'primary',
      hint: `Heróis especiais, um de cada, com golpe especial automático. O próximo custa ${costText(heroCost(w))}.`,
      why: b.level < lvl ? `Precisa do castelo nível ${lvl}` : null,
      run: openHeroes,
    });
  }
  // O castelo não se derruba nem sai do lugar: essas casas ficam vazias (ou com outra ação).
  if (!demolishProblem(w, b)) {
    acts.push({
      id: 'destruir',
      slot: 3,
      icon: 'lixo',
      label: 'Destruir',
      tone: 'danger',
      hint: b.built < 1 ? 'Cancelar a obra. Devolve todo o custo.' : `Destruir ${name}. Devolve ${Math.round(CONFIG.refund * 100)}% do custo.`,
      why: null,
      run: () => game.demolish(b.id),
    });
  }
  if (b.kind === 'castelo') {
    acts.push({
      id: 'relatorio',
      slot: 4,
      icon: 'relatorio',
      label: 'Relatório',
      tone: game.autoReport ? 'on' : '',
      hint: game.autoReport
        ? 'Relatório a cada onda vencida: ligado. Toque para desligar (as ondas com bênção ainda abrem o relatório).'
        : 'Relatório a cada onda vencida: desligado. Toque para ligar.',
      why: null,
      run: () => game.setAutoReport(!game.autoReport),
    });
  } else {
    acts.push({
      id: 'mover',
      slot: 4,
      icon: 'mover',
      label: 'Mover',
      tone: '',
      hint: b.dry && b.kind !== 'fazenda' ? `Sem recurso aqui: leve ${name} para perto de outro.` : `Mover ${name} para outro lugar.`,
      why: moveProblem(w, b),
      // Etapa 17: pulsa no prédio sem recurso (a plantação colhida pede Replantar, não mudança).
      pulse: b.dry && b.kind !== 'fazenda' && !moveProblem(w, b),
      run: () => game.startMove(b.id),
    });
  }
  return acts;
}

function heroActs(game: Game): Act[] {
  const w = game.world;
  const cost = heroCost(w);
  return HERO_KINDS.map((k, i) => {
    const h = heroOf(w, k);
    const info = HERO_INFO[k];
    const down = !!h && (h.downT ?? 0) > 0;
    return {
      id: k,
      slot: i,
      icon: HERO_ICON[k],
      label: info.short,
      tone: (h ? 'on' : 'primary') as Tone,
      badge: h ? `${h.level ?? 1}` : undefined,
      hint: h
        ? `${UNITS[k].name}, nível ${h.level ?? 1} de 5. ${info.special}: ${info.text}${down ? '' : ' Toque para escolher e mandar ele para um lugar.'}`
        : `${UNITS[k].name} · ${costText(cost)}. ${info.special}: ${info.text}`,
      why: h ? (down ? `Desmaiado: volta em ${Math.ceil(h.downT ?? 0)} s` : null) : heroProblem(w, k),
      run: () => {
        if (!h) {
          game.buyHero(k);
          return;
        }
        game.selected = -1;
        game.selectUnits([h.id]);
      },
    };
  });
}

function forgeActs(game: Game): Act[] {
  const w = game.world;
  return FORGE.map(([line, name, icon, text], i) => {
    const cost = forgeCost(w, line);
    const lvl = w.forge[line];
    return {
      id: line,
      slot: i,
      icon,
      label: `${name} ${lvl}/3`,
      tone: '' as Tone,
      hint: cost ? `${name} nível ${lvl + 1} · ${costText(cost)}. ${text} por nível.` : `${name} no nível máximo. ${text} por nível.`,
      why: forgeProblem(w, line),
      run: () => game.forge(line),
    };
  });
}

/** Linha de informação do prédio (sem ação em foco). */
function noteFor(game: Game, b: Building): string | null {
  const w = game.world;
  const def = BUILDINGS[b.kind];
  switch (b.kind) {
    case 'castelo': {
      const bl = w.blessings.length ? ` Bênçãos: ${w.blessings.map((id) => BLESSINGS[id].name).join(', ')}.` : '';
      return `Vagas nas casas ${housing(w)} · teto do castelo ${castleCap(w)} · tropas ${troops(w)}, sem teto.${bl}`;
    }
    case 'torre':
      return 'Arqueiros do campo de tiro sobem sozinhos; os que você mandou para um lugar sobem com "Chamar" ou tocando na torre.';
    case 'catapulta':
      return 'Atira sozinha a cada 4 s no monstro com mais vida entre 3 e 12 m. Não acerta quem voa.';
    case 'estacas':
      return `Golpes que ainda aguenta: ${Math.max(0, Math.ceil(b.hp))} de ${def.hp}. A horda passa por cima e se fere.`;
    case 'piche':
      return b.burn > 0
        ? `Queimando: mais ${Math.ceil(b.burn)} s de fogo em quem estiver em cima.`
        : 'Quem passa anda pela metade. Com a bênção Flechas em brasa, a primeira flecha acende sozinha.';
    default:
      return null;
  }
}

/** Etapa 17: quanto ainda tem no hexágono de onde a serraria, a pedreira ou a mina tira. */
function stockBar(game: Game, b: Building) {
  if (b.built < 1 || !MODES[game.world.mode].depletes) return null;
  if (b.kind === 'fazenda') {
    const f = b.harvest / CONFIG.farm.harvest;
    return <Bar label="Colheita" frac={f} color={f > 0 ? 'var(--gold)' : 'var(--hp)'} text={f > 0 ? `${Math.ceil(f * 100)}%` : 'acabou'} />;
  }
  if (b.kind !== 'serraria' && b.kind !== 'pedreira' && b.kind !== 'mina') return null;
  const label = b.kind === 'serraria' ? 'Floresta' : b.kind === 'pedreira' ? 'Rocha' : 'Veio';
  const t = sourceOf(game.world, b);
  if (!t) return <Bar label={label} frac={0} color="var(--hp)" text="acabou" />;
  const full = fullStock(t.terrain);
  return <Bar label={label} frac={t.stock / full} color="var(--gold)" text={`${Math.ceil((t.stock / full) * 100)}%`} />;
}

function Bar({ label, frac, color, text }: { label: string; frac: number; color: string; text: string }) {
  return (
    <>
      <span>{label}</span>
      <div class="rbar">
        <div style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: color }} />
      </div>
      <span class="n">{text}</span>
    </>
  );
}

/** Onde termina o HUD de cima (recursos, onda, velocidade, vida do castelo, chefe). */
export function hudBottom(): number {
  let m = 0;
  for (const sel of ['.hud-stack']) {
    const e = document.querySelector(sel);
    if (e) m = Math.max(m, e.getBoundingClientRect().bottom);
  }
  return m + 8;
}

type Press = { current: { id: string; long: boolean; timer: number } | null };

/**
 * Toques dos botões dos anéis: um toque executa; segurar (ou passar o mouse) só põe o botão em
 * foco, e o cartão mostra o que ele faz.
 */
export function pressProps(id: string, setFocus: (id: string | null) => void, press: Press, activate: () => void) {
  return {
    onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && setFocus(id),
    onPointerLeave: (e: PointerEvent) => e.pointerType === 'mouse' && setFocus(null),
    onFocus: () => setFocus(id),
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const timer = window.setTimeout(() => {
        if (press.current) press.current.long = true;
        setFocus(id);
      }, 380);
      press.current = { id, long: false, timer };
    },
    onPointerUp: () => press.current && clearTimeout(press.current.timer),
    onPointerCancel: () => press.current && clearTimeout(press.current.timer),
    onContextMenu: (e: Event) => e.preventDefault(),
    onClick: () => {
      const long = press.current?.long && press.current.id === id;
      press.current = null;
      if (long) return;
      activate();
    },
  };
}

export const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

export function RadialMenu({ game, cam, b, touch }: { game: Game; cam: IsoCamera; b: Building; touch: boolean }) {
  // Redesenha a cada quadro enquanto aberto: o anel acompanha o prédio ao arrastar e dar zoom.
  const [, frame] = useReducer((n: number) => n + 1, 0);
  const [sub, setSub] = useState<'forja' | 'herois' | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const press = useRef<{ id: string; long: boolean; timer: number } | null>(null);
  const card = useRef<HTMLElement>(null);
  const close = () => {
    game.selected = -1;
    game.emit();
  };
  useEffect(() => {
    let id = requestAnimationFrame(function f() {
      frame(undefined);
      id = requestAnimationFrame(f);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirm) setConfirm(false);
      else if (sub) setSub(null);
      else close();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [confirm, sub]);

  const w = game.world;
  const def = BUILDINGS[b.kind];
  const acts =
    sub === 'forja'
      ? forgeActs(game)
      : sub === 'herois'
        ? heroActs(game)
        : mainActs(
            game,
            b,
            () => (setSub('forja'), setFocus(null)),
            () => (setSub('herois'), setFocus(null)),
          );

  // Onde fica: em volta do prédio, sem sair da tela.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const small = vw < 380;
  const size = small ? 48 : 52;
  const half = size / 2;
  const ringR = small ? 78 : 86;
  const labelH = 22;
  const topLimit = hudBottom();
  const p = hexToWorld(b.q, b.r);
  const s = cam.toScreen(p.x, 0.8, p.z);
  // Prédio fora da tela (arrastou o mapa para longe): o anel some e volta quando ele reaparece.
  if (s.x < -30 || s.x > vw + 30 || s.y < -30 || s.y > vh + 30) return null;
  const fan = s.y + ringR + half + labelH > vh - 8;
  // No leque as cinco casas ficam em meia volta: raio maior, para os rótulos não baterem.
  const R = fan ? ringR + 20 : ringR;
  const edgeX = R + half + 26;
  const cx = clamp(s.x, edgeX, vw - edgeX);
  const cy = fan ? clamp(s.y, topLimit + R + half, vh - half - labelH - 6) : Math.max(s.y, topLimit + R + half + 6);
  const ringTop = cy - R - half - 8;
  const ringBottom = fan ? cy + half + labelH : cy + R + half + labelH;
  const cardW = Math.min(300, vw - 16);
  // O cartão vai acima do anel (longe do dedo); sem espaço ali, desce. Altura medida no quadro anterior.
  const cardH = card.current?.offsetHeight ?? 150;
  const roomAbove = ringTop - 10 - topLimit;
  const roomBelow = vh - 8 - (ringBottom + 8);
  const above = fan || roomAbove >= cardH || (roomBelow < cardH && roomAbove > roomBelow);
  const cardLeft = clamp(cx - cardW / 2, 8, vw - cardW - 8);

  const angles = sub === 'herois' ? (fan ? HERO_FAN : HERO_RING) : sub ? (fan ? SUB_FAN : SUB_RING) : fan ? FAN : RING;
  const shownId = focus ?? (confirm ? 'destruir' : (acts.find((a) => a.slot === 0)?.id ?? null));
  const shown = acts.find((a) => a.id === shownId) ?? null;

  const activate = (a: Act) => {
    if (a.why) {
      setFocus(a.id);
      return;
    }
    if (a.id === 'destruir' && !confirm) {
      setConfirm(true);
      setFocus('destruir');
      return;
    }
    setConfirm(false);
    a.run();
    game.emit();
  };
  const handlers = (a: Act) => pressProps(a.id, setFocus, press, () => activate(a));

  return (
    <div class="radial" aria-label={`Ações: ${def.name}`}>
      {acts.map((a) => {
        const ang = ((angles[a.slot] ?? -90) * Math.PI) / 180;
        const x = cx + R * Math.cos(ang);
        const y = cy + R * Math.sin(ang);
        const isConfirm = confirm && a.id === 'destruir';
        if (isConfirm) {
          // Segundo toque: o botão vira uma pílula vermelha embaixo do anel; os outros apagam.
          const py = fan ? cy - 23 : cy + R * 0.82 - 23;
          return (
            <button key={a.id} class="rbtn danger confirm" style={{ left: `${cx}px`, top: `${py}px` }} aria-label="Confirmar: destruir" {...handlers(a)}>
              <Icon name="lixo" />
              {touch ? 'Toque de novo para destruir' : 'Clique de novo para destruir'}
            </button>
          );
        }
        const cls = ['rbtn', a.tone, a.why ? 'off' : '', a.pulse ? 'pulse' : '', shownId === a.id && focus ? 'focus' : '', confirm ? 'dim' : ''].filter(Boolean).join(' ');
        return (
          <button
            key={a.id}
            class={cls}
            style={{ left: `${x - half}px`, top: `${y - half}px`, width: `${size}px`, height: `${size}px` }}
            aria-label={a.why ? `${a.label}: ${a.why}` : a.label}
            aria-disabled={a.why ? 'true' : undefined}
            {...handlers(a)}
          >
            {a.progress !== undefined ? (
              <svg class="rbtn-ring" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="46" fill="none" stroke="var(--track-line)" stroke-width="5" />
                <circle cx="50" cy="50" r="46" fill="none" stroke="var(--gold)" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray={`${Math.max(1, a.progress * 100)} 100`} />
              </svg>
            ) : null}
            <Icon name={a.icon} />
            {a.badge ? <span class="rbtn-badge">{a.badge}</span> : null}
            <span class="rbtn-label">{a.label}</span>
          </button>
        );
      })}
      {sub ? (
        <button class="rbtn back" style={{ left: `${cx - 22}px`, top: `${cy - 22}px`, width: '44px', height: '44px' }} aria-label="Voltar" onClick={() => (setSub(null), setFocus(null))}>
          <Icon name="voltar" />
        </button>
      ) : null}
      <section
        ref={card}
        class={`rcard${above ? ' above' : ''}`}
        style={{ left: `${cardLeft}px`, top: `${above ? ringTop - 10 : ringBottom + 8}px`, width: `${cardW}px` }}
        aria-live="polite"
      >
        <header>
          <strong>{b.kind === 'castelo' ? `Castelo · nível ${b.level}` : b.kind === 'fazenda' ? `Plantação de ${CROP_NAME[cropOf(w, b)]}` : def.name}</strong>
          <button class="rcard-x" aria-label="Fechar" onClick={close}>
            <Icon name="fechar" />
          </button>
        </header>
        <p class="rcard-sub">{b.kind === 'castelo' ? `${workers(w)} trabalhadores · ${troops(w)} tropas` : def.blurb}</p>
        <div class="rbars">
          {b.built < 1 ? <Bar label="Obra" frac={b.built} color="var(--xp)" text={`${Math.floor(b.built * 100)}%`} /> : null}
          <Bar label="Vida" frac={b.hp / b.maxHp} color="var(--hp)" text={`${Math.ceil(b.hp)}/${b.maxHp}`} />
          {def.workers ? <Bar label="Trabalho" frac={b.workers.length / def.workers} color="var(--loyalty)" text={`${b.workers.length} de ${def.workers}`} /> : null}
          {def.recruits ? (
            <Bar label="Fila" frac={b.queue / CONFIG.recruitQueue} color="var(--xp)" text={`${b.queue} de ${CONFIG.recruitQueue}${b.queue ? ` · ${Math.ceil(UNITS[def.recruits].train - b.queueT)} s` : ''}`} />
          ) : null}
          {b.kind === 'torre' ? <Bar label="Arqueiros" frac={b.archers.length / towerSlots()} color="var(--loyalty)" text={`${b.archers.length} de ${towerSlots()}`} /> : null}
          {stockBar(game, b)}
        </div>
        {shown ? (
          <p class={`rcard-hint${shown.why ? ' bad' : ''}${confirm && shown.id === 'destruir' ? ' danger' : ''}`}>
            {shown.why ? <strong class="why">{shown.label}: {shown.why}. </strong> : null}
            {confirm && shown.id === 'destruir' ? `${shown.hint} ${touch ? 'Toque' : 'Clique'} de novo para confirmar.` : shown.hint}
          </p>
        ) : (
          noteFor(game, b) && <p class="rcard-sub">{noteFor(game, b)}</p>
        )}
        {shown && !focus && noteFor(game, b) ? <p class="rcard-sub">{noteFor(game, b)}</p> : null}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ leque do Construir

const CAT_ORDER: Category[] = ['economia', 'moradia', 'defesa', 'militar'];
const CAT_NAME: Record<Category, string> = { economia: 'Economia', moradia: 'Moradia', defesa: 'Defesa', militar: 'Militar' };
const CAT_ICON: Record<Category, string> = { economia: 'comida', moradia: 'casa', defesa: 'escudo', militar: 'espadas' };
const BUILD_ICON: Record<BuildingKind, string> = {
  castelo: 'castelo',
  casa: 'casa',
  celeiro: 'moinho',
  fazenda: 'comida',
  serraria: 'machado',
  pedreira: 'pedra',
  mina: 'ferro',
  muralha: 'muralha',
  portao: 'portao',
  torre: 'torre',
  catapulta: 'catapulta',
  piche: 'fogo',
  estacas: 'estacas',
  quartel: 'espadas',
  campo: 'arco',
  oficina: 'martelo',
  capela: 'capela',
  forja: 'bigorna',
  torreMago: 'estrela',
  estabulo: 'ferradura',
};
/** Rótulo curto embaixo do botão (o nome inteiro vai no cartão). */
const SHORT: Partial<Record<BuildingKind, string>> = { torre: 'Torre', campo: 'Campo', piche: 'Piche', torreMago: 'Mago', fazenda: 'Plantação' };

interface FanEntry {
  id: string;
  icon: string;
  label: string;
  title: string;
  costs?: Cost;
  text: string;
  why: string | null;
  badge?: string;
  run: () => void;
}

function Costs({ c }: { c: Cost }) {
  return (
    <div class="rcosts">
      {RES_ORDER.filter((r) => (c[r] ?? 0) > 0).map((r) => (
        <span>
          <Icon name={r} />
          {c[r]}
        </span>
      ))}
    </div>
  );
}

/**
 * Construir em leque (etapa 12): o martelo no canto de baixo à direita abre as categorias num
 * quarto de círculo (duas fileiras quando são muitas opções); tocar numa
 * categoria troca o leque pelas opções dela. O martelo vira X (fecha) nas categorias e seta
 * (volta) dentro de uma categoria; quem cuida disso é o botão, no App. Categoria com uma opção
 * só (a moradia, que só tem a casa) já coloca direto.
 */
export function BuildFan({ game, touch, cat, setCat, close }: { game: Game; touch: boolean; cat: Category | null; setCat: (c: Category | null) => void; close: () => void }) {
  const [focus, setFocus] = useState<string | null>(null);
  const press = useRef<{ id: string; long: boolean; timer: number } | null>(null);
  useEffect(() => setFocus(null), [cat]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (cat) setCat(null);
      else close();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [cat]);

  const w = game.world;
  const item = (k: BuildingKind): FanEntry => {
    const def = BUILDINGS[k];
    const cost = game.costOf(k);
    return {
      id: k,
      icon: BUILD_ICON[k],
      label: SHORT[k] ?? def.name,
      title: def.name,
      costs: cost,
      text: def.blurb,
      why: levelProblem(w, k) ?? missing(w, cost),
      run: () => {
        game.startBuild(k);
        close();
      },
    };
  };
  const entries: FanEntry[] = cat
    ? BUILD_MENU.filter((k) => BUILDINGS[k].category === cat).map(item)
    : CAT_ORDER.map((c) => {
        const ks = BUILD_MENU.filter((k) => BUILDINGS[k].category === c);
        if (ks.length === 1) return item(ks[0]!);
        return {
          id: c,
          icon: CAT_ICON[c],
          label: CAT_NAME[c],
          title: CAT_NAME[c],
          text: `${ks.map((k) => BUILDINGS[k].name).join(', ')}.`,
          why: null,
          badge: String(ks.length),
          run: () => setCat(c),
        };
      });

  // Centro: o botão Construir (lido da tela, para valer em pé, deitado e no computador).
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fab = document.querySelector('.fab-build')?.getBoundingClientRect();
  const cx = fab ? fab.left + fab.width / 2 : vw / 2;
  const cy = fab ? fab.top + fab.height / 2 : vh - 46;
  const size = vw < 380 ? 48 : 52;
  const half = size / 2;
  const n = entries.length;
  // Martelo no canto da direita: o leque abre em um quarto de círculo, para a esquerda e para
  // cima; com mais de 4 opções, duas fileiras (para os rótulos não se encostarem). Martelo no
  // meio (se o CSS mudar): meia-lua para cima.
  const corner = cx > vw * 0.66;
  const spread = (k: number, a0: number, a1: number, r: number) =>
    Array.from({ length: k }, (_, i) => ({ ang: a0 + ((a1 - a0) * i) / Math.max(1, k - 1), r }));
  let slots: { ang: number; r: number }[];
  if (corner) {
    if (n <= 4) slots = spread(n, -180, -90, 130);
    else {
      const inner = Math.floor(n / 2);
      slots = [...spread(inner, -180, -90, 112), ...spread(n - inner, -180, -90, 196)];
    }
  } else {
    const R = Math.min(n <= 4 ? 118 : n <= 6 ? 140 : 154, vw / 2 - 40);
    slots = cat ? spread(n, -170, -10, R) : spread(n, -165, -15, R);
  }
  const Rmax = Math.max(...slots.map((p) => p.r));

  const shown = entries.find((e) => e.id === focus) ?? null;
  const cardW = Math.min(300, vw - 16);
  const fanTop = cy - Rmax - half - 8;
  const card = useRef<HTMLElement>(null);
  const cardH = card.current?.offsetHeight ?? 130;
  // O cartão vai acima do leque; se encostaria no HUD (celular deitado), vai para o lado livre.
  const above = fanTop - 10 - cardH >= hudBottom();
  const sideRight = cx - Rmax - half - 18;
  const sideLeft = cx + Rmax + half + 18;
  let cardStyle: Record<string, string>;
  if (above || (corner ? sideRight < 208 : vw - sideLeft < 208)) {
    const left = corner ? clamp(cx + half - cardW, 8, vw - cardW - 8) : clamp(cx - cardW / 2, 8, vw - cardW - 8);
    cardStyle = { left: `${left}px`, bottom: `${vh - fanTop + 10}px`, width: `${cardW}px` };
  } else if (corner) {
    const wd = Math.min(cardW, sideRight - 8);
    cardStyle = { left: `${sideRight - wd}px`, bottom: `${vh - cy + 4}px`, width: `${wd}px` };
  } else {
    cardStyle = { left: `${sideLeft}px`, bottom: `${vh - cy + 4}px`, width: `${Math.min(cardW, vw - sideLeft - 8)}px` };
  }

  const activate = (e: FanEntry) => {
    if (e.why) {
      setFocus(e.id);
      return;
    }
    e.run();
  };
  return (
    <div class="radial" aria-label={cat ? `Construir: ${CAT_NAME[cat]}` : 'Construir'}>
      {entries.map((e, i) => {
        const p = slots[i]!;
        const ang = (p.ang * Math.PI) / 180;
        const x = cx + p.r * Math.cos(ang);
        const y = cy + p.r * Math.sin(ang);
        const cls = ['rbtn', e.why ? 'off' : '', focus === e.id ? 'focus' : ''].filter(Boolean).join(' ');
        return (
          <button
            key={e.id}
            class={cls}
            style={{ left: `${x - half}px`, top: `${y - half}px`, width: `${size}px`, height: `${size}px` }}
            aria-label={e.why ? `${e.title}: ${e.why}` : e.title}
            aria-disabled={e.why ? 'true' : undefined}
            {...pressProps(e.id, setFocus, press, () => activate(e))}
          >
            <Icon name={e.icon} />
            {e.badge ? <span class="rbtn-badge">{e.badge}</span> : null}
            <span class="rbtn-label">{e.label}</span>
          </button>
        );
      })}
      <section ref={card} class="rcard" style={cardStyle} aria-live="polite">
        <header>
          <strong>{shown ? shown.title : cat ? CAT_NAME[cat] : 'Construir'}</strong>
          {shown && cat ? <span class="rcard-crumb">{CAT_NAME[cat]}</span> : null}
        </header>
        {shown?.costs ? <Costs c={shown.costs} /> : null}
        <p class="rcard-sub">{shown ? shown.text : cat ? 'Escolha o que erguer.' : 'Escolha uma categoria.'}</p>
        {shown?.why ? (
          <p class="rcard-hint bad">
            <strong class="why">{shown.why}.</strong>
          </p>
        ) : (
          <p class="rcard-hint">
            {shown
              ? shown.costs
                ? `${touch ? 'Toque' : 'Clique'} para colocar no mapa.`
                : `${touch ? 'Toque' : 'Clique'} para ver as ${shown.badge} opções.`
              : touch
                ? 'Segure um botão para ler sem escolher.'
                : 'Passe o mouse num botão para ler.'}
          </p>
        )}
      </section>
    </div>
  );
}
