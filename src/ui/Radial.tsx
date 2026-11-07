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
  CONFIG,
  UNITS,
  castleCap,
  demolishProblem,
  forgeCost,
  forgeProblem,
  hexToWorld,
  housing,
  igniteProblem,
  moveProblem,
  recruitProblem,
  repairCost,
  repairProblem,
  troops,
  upgradeCost,
  upgradeProblem,
  workers,
} from '../sim/index.ts';
import type { Building, ForgeLine } from '../sim/index.ts';
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
  run: () => void;
}

/** Ângulos (graus, 0 = direita, -90 = topo) das casas no anel e no leque (mesma ordem em volta). */
const RING = [-90, -18, 54, 126, 198];
const FAN = [-90, -45, 0, -180, -135];
/** Submenu da forja: três linhas em volta, Voltar no meio. */
const SUB_RING = [-90, 30, 150];
const SUB_FAN = [-90, 0, -180];

const FORGE: [ForgeLine, string, string, string][] = [
  ['armas', 'Armas', 'espadas', '+20% de dano corpo a corpo e dos magos'],
  ['armaduras', 'Armaduras', 'escudo', '+20% de vida das tropas, inclusive as de agora'],
  ['flechas', 'Pontas', 'flecha', '+15% de dano das flechas'],
];

function mainActs(game: Game, b: Building, openForge: () => void): Act[] {
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
      hint: `Mover ${name} para outro lugar.`,
      why: moveProblem(w, b),
      run: () => game.startMove(b.id),
    });
  }
  return acts;
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
      return 'Arqueiros treinados no campo de tiro sobem sozinhos.';
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
function hudBottom(): number {
  let m = 0;
  for (const sel of ['.res-pill', '.top-right', '.boss-bar']) {
    const e = document.querySelector(sel);
    if (e) m = Math.max(m, e.getBoundingClientRect().bottom);
  }
  return m + 8;
}

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

export function RadialMenu({ game, cam, b, touch }: { game: Game; cam: IsoCamera; b: Building; touch: boolean }) {
  // Redesenha a cada quadro enquanto aberto: o anel acompanha o prédio ao arrastar e dar zoom.
  const [, frame] = useReducer((n: number) => n + 1, 0);
  const [sub, setSub] = useState<'forja' | null>(null);
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
  const acts = sub === 'forja' ? forgeActs(game) : mainActs(game, b, () => (setSub('forja'), setFocus(null)));

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

  const angles = sub ? (fan ? SUB_FAN : SUB_RING) : fan ? FAN : RING;
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
  const handlers = (a: Act) => ({
    onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && setFocus(a.id),
    onPointerLeave: (e: PointerEvent) => e.pointerType === 'mouse' && setFocus(null),
    onFocus: () => setFocus(a.id),
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      // Segurar o botão mostra a explicação sem executar.
      const timer = window.setTimeout(() => {
        if (press.current) press.current.long = true;
        setFocus(a.id);
      }, 380);
      press.current = { id: a.id, long: false, timer };
    },
    onPointerUp: () => press.current && clearTimeout(press.current.timer),
    onPointerCancel: () => press.current && clearTimeout(press.current.timer),
    onContextMenu: (e: Event) => e.preventDefault(),
    onClick: () => {
      const long = press.current?.long && press.current.id === a.id;
      press.current = null;
      if (long) return;
      activate(a);
    },
  });

  const trackR = R;
  const scrimR = R + half + 14;
  return (
    <div class="radial" aria-label={`Ações: ${def.name}`}>
      <div class="rscrim" style={{ left: `${cx - scrimR}px`, top: `${cy - scrimR}px`, width: `${scrimR * 2}px`, height: `${fan ? scrimR : scrimR * 2}px`, borderRadius: fan ? `${scrimR}px ${scrimR}px 0 0` : '50%' }} />
      <div class={`rtrack${fan ? ' fan' : ''}`} style={{ left: `${cx - trackR}px`, top: `${cy - trackR}px`, width: `${trackR * 2}px`, height: `${fan ? trackR : trackR * 2}px` }} />
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
        const cls = ['rbtn', a.tone, a.why ? 'off' : '', shownId === a.id && focus ? 'focus' : '', confirm ? 'dim' : ''].filter(Boolean).join(' ');
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
          <strong>{b.kind === 'castelo' ? `Castelo · nível ${b.level}` : def.name}</strong>
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
          {b.kind === 'torre' ? <Bar label="Arqueiros" frac={b.archers.length / (def.slots ?? 2)} color="var(--loyalty)" text={`${b.archers.length} de ${def.slots ?? 2}`} /> : null}
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
