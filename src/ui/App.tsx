/**
 * A interface por cima do mapa, no visual do Vigília: recursos e onda nos cantos, um botão
 * Construir, o menu do prédio tocado (recrutar, melhorar, mover, consertar, destruir),
 * avisos e as telas de começo e fim.
 */
import { useEffect, useReducer, useState } from 'preact/hooks';
import { BUILDINGS, BUILD_MENU, CONFIG, RES_ORDER, UNITS, castle, castleCap, housing, hexToWorld, troops, workers, recruitProblem, repairCost, repairProblem, missing, moveProblem, demolishProblem, upgradeCost, upgradeProblem, waveSize, MONSTERS, BLESSINGS, repairAllCost, levelProblem, forgeCost, forgeProblem, igniteProblem, modsForWave, waveSizeWithMods, WAVE_MODS } from '../sim/index.ts';
import type { BlessingId, Building, Category, Cost, ForgeLine, MonsterKind, Res, UnitKind } from '../sim/index.ts';
import { Game } from '../game/game.ts';
import type { IsoCamera } from '../render/camera.ts';

const ICONS: Record<string, string> = {
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
};

function Icon({ name, style }: { name: string; style?: string }) {
  return (
    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true" style={style}>
      <path d={ICONS[name]} />
    </svg>
  );
}

const RES_LABEL: Record<Res, string> = { comida: 'comida', madeira: 'madeira', pedra: 'pedra', ferro: 'ferro', cristal: 'cristal', ouro: 'ouro' };

export function costText(c: Cost): string {
  const parts = RES_ORDER.filter((r) => (c[r] ?? 0) > 0).map((r) => `${c[r]} de ${RES_LABEL[r]}`);
  return parts.length ? parts.join(' · ') : 'grátis';
}

function clock(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

const CATS: [Category, string][] = [
  ['economia', 'Economia'],
  ['moradia', 'Moradia'],
  ['defesa', 'Defesa'],
  ['militar', 'Militar'],
];

function useGame(game: Game): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const force = () => bump(undefined);
    const off = game.subscribe(force);
    const id = setInterval(force, 200);
    return () => {
      off();
      clearInterval(id);
    };
  }, [game]);
}

function Hud({ game }: { game: Game }) {
  const w = game.world;
  const pop = workers(w);
  const room = Math.min(housing(w), castleCap(w));
  const army = troops(w);
  const c = castle(w);
  const calm = w.waveState === 'calm';
  const left = calm ? 0 : [...w.monsters.values()].filter((m) => m.state !== 'dead').length + w.spawnQueue.length;
  return (
    <>
      <div class="res-pill hud-bar">
        {RES_ORDER.map((r) => (
          <span class={`hud-item${r === 'ouro' ? ' gold' : ''}${r === 'comida' && w.hungry ? ' low' : ''}`} title={RES_LABEL[r]}>
            <Icon name={r} /> {Math.floor(w.res[r])}
          </span>
        ))}
        <span class="hud-item" title={`Trabalhadores ${pop} · vagas nas casas ${housing(w)} · teto do castelo ${castleCap(w)}`}>
          <Icon name="casa" /> {pop}/{room}
        </span>
        {army > 0 ? (
          <span class="hud-item" title="Tropas (sem teto)">
            <Icon name="espadas" /> {army}
          </span>
        ) : null}
      </div>
      {(() => {
        const boss = [...w.monsters.values()].find((m) => m.state !== 'dead' && MONSTERS[m.kind].boss);
        if (!boss) return null;
        return (
          <div class="boss-bar">
            <span>{MONSTERS[boss.kind].name}</span>
            <div class="bar bar-enemy">
              <div class="fill" style={{ width: `${(100 * boss.hp) / boss.maxHp}%` }} />
              <span class="bar-text">{MONSTERS[boss.kind].immuneArrows ? 'Flechas não ferem' : 'Magia não fere'}</span>
            </div>
          </div>
        );
      })()}
      <div class="top-right">
        <div class="row">
          {calm ? (
            <button class="prompt wave-pill" title="Chamar a onda agora rende ouro pelo tempo que sobrou" onClick={() => game.callWave()}>
              <Icon name="caveira" style="color: var(--bad)" /> Onda {w.wave + 1}
              {modsForWave(w.seed, w.wave + 1).length ? <span style="color: var(--warn)"> ({modsForWave(w.seed, w.wave + 1).map((k) => WAVE_MODS[k].name).join(', ')})</span> : null} em{' '}
              <span style="color: var(--warn); font-variant-numeric: tabular-nums">{clock(w.waveTimer)}</span>
            </button>
          ) : (
            <span class="prompt wave-pill attack">
              <Icon name="caveira" style="color: var(--bad)" /> Onda {w.wave}
              {w.waveMods.length ? <span style="color: var(--warn)"> · {w.waveMods.map((k) => WAVE_MODS[k].name).join(' · ')}</span> : null} · {left} monstros
            </span>
          )}
          <button class="hud-mute" aria-label={game.sound ? 'Desligar o som' : 'Ligar o som'} style="margin-left: 0" onClick={() => game.setSound(!game.sound)}>
            <Icon name={game.sound ? 'som' : 'mudo'} />
          </button>
          <span class="speed">
            <button class={`spd${game.speed === 0 ? ' active' : ''}`} aria-label="Pausar" onClick={() => game.setSpeed(0)}>
              <Icon name="pausa" />
            </button>
            {[1, 2, 3].map((s) => (
              <button class={`spd${game.speed === s ? ' active' : ''}`} onClick={() => game.setSpeed(s)}>
                {s}×
              </button>
            ))}
          </span>
        </div>
        {c && (
          <div class="castle-hp">
            Castelo{' '}
            <div class="bar slim bar-hp">
              <div class="fill" style={{ width: `${(100 * c.hp) / c.maxHp}%` }} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Tray({ game, onClose }: { game: Game; onClose: () => void }) {
  const [cat, setCat] = useState<Category>('economia');
  const w = game.world;
  return (
    <section class="tray" aria-label="Construir">
      <div style="display: flex; align-items: center; gap: 8px">
        <nav class="tabs" style="flex: 1; border: 0; padding: 0">
          {CATS.map(([k, label]) => (
            <button class={`tab${cat === k ? ' active' : ''}`} onClick={() => setCat(k)}>
              {label}
            </button>
          ))}
        </nav>
        <button class="icon-btn" aria-label="Fechar" onClick={onClose}>
          ×
        </button>
      </div>
      <div class="choices">
        {BUILD_MENU.filter((k) => BUILDINGS[k].category === cat).map((k) => {
          const cost = game.costOf(k);
          const why = levelProblem(w, k) ?? missing(w, cost);
          return (
            <button
              class="choice"
              disabled={!!why}
              title={BUILDINGS[k].blurb}
              onClick={() => {
                game.startBuild(k);
                onClose();
              }}
            >
              {BUILDINGS[k].name}
              <span>{costText(cost)}</span>
              {why ? <small>{why}</small> : <span>{BUILDINGS[k].blurb}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PlaceBar({ game, touch }: { game: Game; touch: boolean }) {
  const m = game.mode;
  if (m.kind === 'none') return null;
  if (m.kind === 'rally') {
    const b = game.world.buildings.get(m.id);
    const who = b?.kind === 'campo' ? 'os arqueiros do campo de tiro' : 'os soldados do quartel';
    return (
      <div class="placebar">
        <span>{touch ? 'Toque' : 'Clique'} onde {who} vão esperar.</span>
        <button class="btn ghost small" onClick={() => game.cancel()}>
          Cancelar
        </button>
      </div>
    );
  }
  const name = m.kind === 'build' ? BUILDINGS[m.b].name : BUILDINGS[game.world.buildings.get(m.id)?.kind ?? 'casa'].name;
  const why = game.pendingProblem();
  const text =
    m.kind === 'build'
      ? `${touch ? 'Toque' : 'Clique'} onde erguer: ${name.toLowerCase()} (${costText(game.costOf(m.b))})${m.b === 'muralha' ? '. Continue tocando para traçar.' : ''}`
      : `${touch ? 'Toque' : 'Clique'} no novo lugar do ${name.toLowerCase()}.`;
  return (
    <div class="placebar">
      <span>
        {text}
        {game.pending && why ? <span class="bad"> {why}.</span> : null}
      </span>
      {touch && game.pending && !why ? (
        <button class="btn primary small" onClick={() => game.confirm()}>
          {m.kind === 'build' ? 'Construir aqui' : 'Mover para cá'}
        </button>
      ) : null}
      <button class="btn ghost small" onClick={() => game.cancel()}>
        {m.kind === 'build' && m.b === 'muralha' ? 'Pronto' : 'Cancelar'}
      </button>
    </div>
  );
}

function ActionBtn({ icon, label, why, danger, onClick }: { icon: string; label: string; why: string | null; danger?: boolean; onClick: () => void }) {
  return (
    <button class={`btn small${danger ? ' danger' : ''}`} disabled={!!why} title={why ?? label} onClick={onClick}>
      <Icon name={icon} />
      {label}
      {why ? <span class="why">{why}</span> : null}
    </button>
  );
}

function BuildingMenu({ game, cam, b }: { game: Game; cam: IsoCamera; b: Building }) {
  const [confirmKill, setConfirmKill] = useState(false);
  const w = game.world;
  const def = BUILDINGS[b.kind];
  const p = hexToWorld(b.q, b.r);
  const s = cam.toScreen(p.x, 1, p.z);
  const left = Math.min(window.innerWidth - 350, Math.max(10, s.x + 40));
  // Nunca sai da tela: o menu do castelo é alto, e a janela pode ser baixa.
  const top = Math.max(10, Math.min(window.innerHeight - 500, Math.max(60, s.y - 160)));
  const recruits = def.recruits;
  const rep = repairCost(w, b);
  const isCastle = b.kind === 'castelo';
  const up = isCastle ? upgradeCost(w) : null;
  return (
    <section class="panel bmenu" style={{ left: `${left}px`, top: `${top}px` }} aria-label={def.name}>
      <header class="panel-head">
        <div class="panel-title">
          <h2>{def.name}</h2>
          <p class="sub">{isCastle ? `Nível ${b.level} · ${def.blurb}` : def.blurb}</p>
        </div>
        <button class="icon-btn" aria-label="Fechar" onClick={() => ((game.selected = -1), game.emit())}>
          ×
        </button>
      </header>
      <div class="panel-body">
        <div class="bars">
          {b.built < 1 ? (
            <>
              <label>Obra</label>
              <div class="bar bar-xp">
                <div class="fill" style={{ width: `${b.built * 100}%` }} />
                <span class="bar-text">{Math.floor(b.built * 100)}%</span>
              </div>
            </>
          ) : null}
          <label>Vida</label>
          <div class="bar bar-hp">
            <div class="fill" style={{ width: `${(100 * b.hp) / b.maxHp}%` }} />
            <span class="bar-text">
              {Math.ceil(b.hp)}/{b.maxHp}
            </span>
          </div>
          {def.workers ? (
            <>
              <label>Trabalho</label>
              <div class="bar bar-loyalty">
                <div class="fill" style={{ width: `${(100 * b.workers.length) / def.workers}%` }} />
                <span class="bar-text">
                  {b.workers.length} de {def.workers} trabalhadores
                </span>
              </div>
            </>
          ) : null}
          {recruits ? (
            <>
              <label>Fila</label>
              <div class="bar bar-xp">
                <div class="fill" style={{ width: `${b.queue ? (100 * b.queueT) / UNITS[recruits].train : 0}%` }} />
                <span class="bar-text">
                  {b.queue} de {CONFIG.recruitQueue}
                </span>
              </div>
            </>
          ) : null}
          {b.kind === 'torre' ? (
            <>
              <label>Guarnição</label>
              <div class="bar bar-loyalty">
                <div class="fill" style={{ width: `${(100 * b.archers.length) / (def.slots ?? 2)}%` }} />
                <span class="bar-text">
                  {b.archers.length} de {def.slots} arqueiros
                </span>
              </div>
            </>
          ) : null}
        </div>
        {isCastle ? (
          <p class="sub" style="margin-top: 0.5rem">
            Trabalhadores {workers(w)} · vagas nas casas {housing(w)} · teto do castelo {castleCap(w)} · tropas {troops(w)}, sem teto.
          </p>
        ) : null}
        {b.kind === 'torre' ? <p class="sub">Arqueiros treinados no campo de tiro sobem sozinhos.</p> : null}
        {b.kind === 'forja' && b.built >= 1 ? <ForgePanel game={game} /> : null}
        {b.kind === 'catapulta' ? <p class="sub">Atira sozinha a cada 4 s no monstro com mais vida entre 3 e 12 m. Não acerta quem voa.</p> : null}
        {b.kind === 'estacas' ? <p class="sub">Golpes que ainda aguenta: {Math.max(0, Math.ceil(b.hp))} de {def.hp}. Ninguém para aqui: a horda passa por cima e se fere.</p> : null}
        {b.kind === 'piche' ? (
          <>
            <p class="sub">
              {b.burn > 0
                ? `Queimando: mais ${Math.ceil(b.burn)} s de fogo em quem estiver em cima.`
                : 'Quem passa anda pela metade. Com a bênção Flechas em brasa, a primeira flecha acende sozinha.'}
            </p>
            <button class="btn primary big" style="margin-top: 0.4rem" disabled={!!igniteProblem(w, b)} onClick={() => game.ignite(b.id)}>
              Acender o piche ({costText(CONFIG.pitch.igniteCost)}){igniteProblem(w, b) ? <small> · {igniteProblem(w, b)}</small> : null}
            </button>
          </>
        ) : null}
        {recruits ? (
          <>
            <p class="sub" style="margin-top: 0.5rem">
              Cada recruta é um trabalhador que sai da vila (a vaga dele volta a ser preenchida).
              {b.rally ? ' Saem para o ponto de encontro.' : ''}
            </p>
            <button class="btn primary big" style="margin-top: 0.4rem" disabled={!!recruitProblem(w, b)} onClick={() => game.recruit(b.id)}>
              Recrutar {UNITS[recruits].name.toLowerCase()} ({costText(UNITS[recruits].cost)})
              {recruitProblem(w, b) ? <small> · {recruitProblem(w, b)}</small> : null}
            </button>
          </>
        ) : null}
        {isCastle && w.blessings.length ? (
          <p class="sub">Bênçãos: {w.blessings.map((id) => BLESSINGS[id].name).join(', ')}.</p>
        ) : null}
        {isCastle ? (
          <ShelterButton game={game} />
        ) : null}
        {isCastle ? (
          <label class="report-pref">
            <input type="checkbox" checked={game.autoReport} onChange={(e) => game.setAutoReport((e.target as HTMLInputElement).checked)} />
            Relatório a cada onda vencida
          </label>
        ) : null}
        {isCastle ? (
          <button class="btn primary big" style="margin-top: 0.4rem" disabled={!!upgradeProblem(w)} onClick={() => game.upgrade()}>
            {up ? `Melhorar castelo (${costText(up)})` : 'Castelo no nível máximo'}
            {up && upgradeProblem(w) ? <small> · {upgradeProblem(w)}</small> : null}
          </button>
        ) : null}
        <div class="actions" style={recruits ? 'grid-template-columns: repeat(4, minmax(0, 1fr))' : undefined}>
          {recruits ? <ActionBtn icon="bandeira" label="Encontro" why={b.built < 1 ? 'Ainda em obra' : null} onClick={() => game.startRally(b.id)} /> : null}
          <ActionBtn icon="mover" label="Mover" why={moveProblem(w, b)} onClick={() => game.startMove(b.id)} />
          <ActionBtn icon="martelo" label={Object.keys(rep).length ? `Consertar` : 'Consertar'} why={repairProblem(w, b)} onClick={() => game.repair(b.id)} />
          <ActionBtn
            icon="lixo"
            label={confirmKill ? 'Confirmar' : 'Destruir'}
            why={demolishProblem(w, b)}
            danger
            onClick={() => {
              if (!confirmKill) setConfirmKill(true);
              else game.demolish(b.id);
            }}
          />
        </div>
        {Object.keys(rep).length && !repairProblem(w, b) ? <p class="sub">Consertar custa {costText(rep)}.</p> : null}
      </div>
    </section>
  );
}

const FORGE: [ForgeLine, string, string][] = [
  ['armas', 'Armas', '+20% de dano corpo a corpo e dos magos por nível'],
  ['armaduras', 'Armaduras', '+20% de vida das tropas por nível, inclusive as de agora'],
  ['flechas', 'Pontas de ferro', '+15% de dano das flechas por nível'],
];

function ForgePanel({ game }: { game: Game }) {
  const w = game.world;
  return (
    <div class="choices" style="margin-top: 0.5rem">
      {FORGE.map(([line, name, text]) => {
        const cost = forgeCost(w, line);
        const why = forgeProblem(w, line);
        return (
          <button class="choice" disabled={!!why} onClick={() => game.forge(line)}>
            {name} · nível {w.forge[line]} de 3
            <span>{text}</span>
            <span>{cost ? costText(cost) : 'Nível máximo'}{why && cost ? ` · ${why}` : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

function ShelterButton({ game }: { game: Game }) {
  const w = game.world;
  let inside = 0;
  let all = 0;
  for (const u of w.units.values()) {
    if (u.kind !== 'trabalhador' || u.state === 'dead') continue;
    all++;
    if (u.state === 'shelter') inside++;
  }
  return (
    <>
      <button class={`btn big${w.shelter ? '' : ' danger'}`} style="margin-top: 0.5rem" onClick={() => game.toggleShelter()}>
        {w.shelter ? 'Liberar os trabalhadores' : 'Recolher os trabalhadores no castelo'}
      </button>
      <p class="sub">
        {w.shelter
          ? `${inside} de ${all} já estão lá dentro. Ninguém trabalha enquanto estiverem recolhidos.`
          : 'Dentro do castelo a horda não os alcança, mas a produção para.'}
      </p>
    </>
  );
}

function SelectionBar({ game, touch }: { game: Game; touch: boolean }) {
  const w = game.world;
  const NAMES: Partial<Record<UnitKind, [string, string]>> = {
    soldado: ['soldado', 'soldados'],
    arqueiro: ['arqueiro', 'arqueiros'],
    mago: ['mago', 'magos'],
    clerigo: ['clérigo', 'clérigos'],
    cavaleiro: ['cavaleiro', 'cavaleiros'],
    engenheiro: ['engenheiro', 'engenheiros'],
  };
  const tally = new Map<UnitKind, number>();
  for (const id of game.units) {
    const u = w.units.get(id);
    if (u && u.kind !== 'trabalhador') tally.set(u.kind, (tally.get(u.kind) ?? 0) + 1);
  }
  const list = [...tally].map(([k, n]) => `${n} ${NAMES[k]![n === 1 ? 0 : 1]}`);
  const parts = list.length > 1 ? [list.slice(0, -1).join(', '), list[list.length - 1]!] : list;
  return (
    <div class="placebar">
      <span>
        {parts.join(' e ')} {game.units.length === 1 ? 'escolhido' : 'escolhidos'}. {touch ? 'Toque' : 'Clique'} no mapa para mandar; numa tropa para pôr ou tirar.
      </span>
      <button class="btn ghost small" onClick={() => game.clearUnits()}>
        Limpar
      </button>
    </div>
  );
}

const PLURAL: Record<MonsterKind, [string, string]> = {
  esqueleto: ['esqueleto', 'esqueletos'],
  lobisomem: ['lobisomem', 'lobisomens'],
  orc: ['orc saqueador', 'orcs saqueadores'],
  bruto: ['orc bruto', 'orcs brutos'],
  morcego: ['morcego gigante', 'morcegos gigantes'],
  bruxa: ['bruxa', 'bruxas'],
  troll: ['troll', 'trolls'],
  necromante: ['necromante', 'necromantes'],
  golem: ['Golem de gelo', 'Golens de gelo'],
  golemOssos: ['Golem de ossos', 'Golens de ossos'],
};
const NEWS: Partial<Record<MonsterKind, string>> = {
  morcego: 'Morcegos gigantes chegam nesta onda: voam por cima das muralhas, direto para as casas. Só flecha, magia e castelo os alcançam.',
  bruxa: 'A bruxa chega nesta onda: fica atrás e cura a horda em volta.',
  troll: 'O troll chega nesta onda: recupera a vida, a não ser que magia ou flecha em brasa o queime.',
  necromante: 'O necromante chega nesta onda: levanta esqueletos ao lado.',
  lobisomem: 'Lobisomens chegam nesta onda: rápidos, rodeiam a muralha atrás de brecha.',
  orc: 'Orcs saqueadores chegam nesta onda: batem três vezes mais forte em muralhas e prédios.',
  bruto: 'O orc bruto chega nesta onda: muita vida e golpe pesado.',
};

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function Report({ game }: { game: Game }) {
  const w = game.world;
  const r = w.report!;
  const [pick, setPick] = useState<BlessingId | null>(null);
  const troopsLost = r.fallen.filter((f) => f.kind !== 'trabalhador').length;
  const workersLost = r.fallen.length - troopsLost;
  const losses = [troopsLost ? count(troopsLost, 'tropa', 'tropas') : '', workersLost ? count(workersLost, 'trabalhador', 'trabalhadores') : ''].filter(Boolean).join(' · ') || 'Nenhuma';
  const damage = [r.wallsLost ? count(r.wallsLost, 'trecho de muralha', 'trechos de muralha') : '', r.buildingsLost ? count(r.buildingsLost, 'prédio', 'prédios') : ''].filter(Boolean).join(' · ') || 'Nenhum';
  const works = (['madeira', 'pedra', 'ferro'] as Res[]).filter((k) => r.prod[k] >= 1).map((k) => `+${Math.floor(r.prod[k])} de ${RES_LABEL[k]}`).join(' · ') || 'Nada';
  const next = w.wave + 1;
  const nextMods = modsForWave(w.seed, next);
  const size = waveSizeWithMods(next, nextMods);
  const news = (Object.keys(size) as MonsterKind[]).filter((k) => MONSTERS[k].from === next && size[k] > 0 && NEWS[k]).map((k) => NEWS[k]);
  for (const k of ['golem', 'golemOssos'] as MonsterKind[]) if (size[k] > 0) news.push(`Chefe nesta onda: ${MONSTERS[k].name}. ${MONSTERS[k].blurb.replace('Chefe. ', '')}`);
  const rift = CONFIG.waves.riftOpens.includes(next) && next > 1;
  const fix = repairAllCost(w);
  const needChoice = r.choices.length > 0;
  const bonus = Math.floor(w.waveTimer / 3);
  return (
    <div class="overlay">
      <article class="report-card report">
        <header>
          <small>Relatório</small>
          <h2>Onda {r.wave} resistida</h2>
          <p>{r.fallen.length ? 'O castelo aguentou, mas não sem perdas.' : 'O castelo aguentou e ninguém caiu.'}</p>
        </header>
        <div class="report-stats">
          <div><span>Monstros abatidos</span><strong>{r.kills}</strong></div>
          <div><span>Perdas</span><strong>{losses}</strong></div>
          <div><span>Estragos</span><strong>{damage}</strong></div>
          <div><span>Colheita</span><strong>+{Math.floor(r.prod.comida)} de comida</strong></div>
          <div><span>Serraria, pedreira e mina</span><strong>{works}</strong></div>
          <div><span>Saque da onda</span><strong style="color: var(--gold)">+{r.gold} de ouro</strong></div>
        </div>
        {r.fallen.length ? (
          <>
            <h3>Caídos</h3>
            <div class="death">
              {r.fallen.slice(0, 6).map((f) => (
                <p class="epitaph">{f.text}</p>
              ))}
              {r.fallen.length > 6 ? <p class="sub">E mais {r.fallen.length - 6}.</p> : null}
            </div>
          </>
        ) : null}
        {needChoice ? (
          <>
            <h3>
              Escolha uma bênção <span class="muted" style="font-family: var(--font-sans); font-size: 0.8rem">a cada 4 ondas</span>
            </h3>
            <div class="blessings">
              {r.choices.map((id) => (
                <button class={`decree${pick === id ? ' active' : ''}`} onClick={() => setPick(id)}>
                  <strong>{BLESSINGS[id].name}</strong>
                  <span>{BLESSINGS[id].text}</span>
                  <em>{BLESSINGS[id].tag}</em>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <h3>Próxima: onda {next}</h3>
        <div class="row">
          {(Object.keys(size) as MonsterKind[])
            .filter((k) => size[k] > 0)
            .map((k) => (
              <span class={`tag${MONSTERS[k].boss || k === 'bruto' ? ' bad' : k === 'orc' || k === 'morcego' ? ' warn' : ''}`}>{count(size[k], PLURAL[k][0], PLURAL[k][1])}</span>
            ))}
        </div>
        {news.map((n) => (
          <p class="sub" style="color: var(--warn)">{n}</p>
        ))}
        {rift ? <p class="sub" style="color: var(--bad)">Uma nova fenda se abre nesta onda.</p> : null}
        {nextMods.map((k) => (
          <p class="sub" style="color: var(--warn)">
            <b>{WAVE_MODS[k].name}:</b> {WAVE_MODS[k].text}
          </p>
        ))}
        <label class="report-pref">
          <input type="checkbox" checked={game.autoReport} onChange={(e) => game.setAutoReport((e.target as HTMLInputElement).checked)} />
          Abrir este relatório a cada onda (desligado, ele só abre quando há bênção para escolher)
        </label>
        <div class="report-actions">
          {Object.keys(fix).length ? (
            <button class="btn ghost" disabled={!!missing(w, fix)} onClick={() => game.repairAll()}>
              Reparar tudo ({costText(fix)}){missing(w, fix) ? <small> · {missing(w, fix)}</small> : null}
            </button>
          ) : null}
          <button class="btn" disabled={needChoice && !pick} onClick={() => game.closeReport(pick, true)}>
            Chamar agora (+{bonus} de ouro)
          </button>
          <button class="btn primary" disabled={needChoice && !pick} onClick={() => game.closeReport(pick)}>
            {needChoice && !pick ? 'Escolha uma bênção' : `Continuar (onda ${next} em ${clock(w.waveTimer)})`}
          </button>
        </div>
      </article>
    </div>
  );
}

function Intro({ game }: { game: Game }) {
  const saved = Game.saved();
  return (
    <div class="overlay">
      <article class="report-card">
        <header>
          <small>Tower defense sem fim</small>
          <h2>Reino Sitiado</h2>
          <p>As hordas saem das fendas ao norte. Até quando o castelo aguenta?</p>
        </header>
        <ul>
          <li>Os trabalhadores chegam sozinhos enquanto houver casa vaga, comida e teto no castelo.</li>
          <li>Construa fazendas, serraria perto da floresta, pedreira perto da rocha e mina em cima do veio.</li>
          <li>Toque num prédio para recrutar, marcar o ponto de encontro, melhorar, mover, consertar ou destruir.</li>
          <li>Toque numa tropa (ou use Selecionar e arraste) e depois no mapa para mandá-las até lá.</li>
          <li>Muralhas desviam a horda; orcs derrubam. Torres só atiram com arqueiros dentro.</li>
          <li>Arraste para mover o mapa e use a pinça ou a roda do mouse para o zoom.</li>
        </ul>
        <div class="report-actions">
          {saved ? (
            <button class="btn" onClick={() => game.restart(Math.floor(Math.random() * 1e9))}>
              Nova partida
            </button>
          ) : null}
          {saved ? (
            <button class="btn primary" onClick={() => game.continueSaved()}>
              {saved.wave > 0 ? `Continuar partida (onda ${saved.wave})` : 'Continuar partida'}
            </button>
          ) : (
            <button class="btn primary" onClick={() => ((game.started = true), game.emit())}>
              Começar
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

function Lost({ game }: { game: Game }) {
  const w = game.world;
  return (
    <div class="overlay">
      <article class="report-card">
        <header>
          <small>Relatório</small>
          <h2>O castelo caiu</h2>
          <p>
            Você resistiu a {Math.max(0, w.wave - 1)} {w.wave - 1 === 1 ? 'onda' : 'ondas'} e abateu {w.kills} monstros.
          </p>
        </header>
        <p class="sub">A horda da onda {w.wave} trouxe {Object.entries(waveSize(w.wave)).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${MONSTERS[k as keyof typeof MONSTERS].name.toLowerCase()}`).join(', ')}.</p>
        <div class="report-actions">
          <button class="btn primary" onClick={() => game.restart(Math.floor(Math.random() * 1e9))}>
            Começar de novo
          </button>
        </div>
      </article>
    </div>
  );
}

export function App({ game, cam, touch }: { game: Game; cam: IsoCamera; touch: boolean }) {
  useGame(game);
  const [tray, setTray] = useState(false);
  const w = game.world;
  const sel = game.selected >= 0 ? w.buildings.get(game.selected) : undefined;
  return (
    <>
      <Hud game={game} />
      <div class="toasts">
        {game.toasts.map((t) => (
          <div key={t.id} class={`toast ${t.tone === 'info' ? '' : t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
      {game.mode.kind === 'none' && !sel && game.units.length === 0 && !game.boxMode ? (
        <div class="bottom-row">
          <button class="nav-btn build-btn" onClick={() => setTray(!tray)}>
            <Icon name="martelo" /> Construir
          </button>
          {troops(w) > 0 ? (
            <button class="nav-btn" onClick={() => (setTray(false), game.setBoxMode(true))}>
              <Icon name="caixa" /> Selecionar
            </button>
          ) : null}
        </div>
      ) : null}
      {game.boxMode ? (
        <div class="placebar">
          <span>{touch ? 'Arraste o dedo' : 'Arraste'} sobre as tropas para escolher.{touch ? '' : ' Shift + arrastar também funciona.'}</span>
          <button class="btn ghost small" onClick={() => game.setBoxMode(false)}>
            Cancelar
          </button>
        </div>
      ) : null}
      {game.units.length > 0 && game.mode.kind === 'none' ? <SelectionBar game={game} touch={touch} /> : null}
      {tray && game.mode.kind === 'none' && !sel && game.units.length === 0 ? <Tray game={game} onClose={() => setTray(false)} /> : null}
      <PlaceBar game={game} touch={touch} />
      {sel && game.mode.kind === 'none' ? <BuildingMenu key={sel.id} game={game} cam={cam} b={sel} /> : null}
      {w.report && !w.lost ? <Report key={w.report.wave} game={game} /> : null}
      {!game.started ? <Intro game={game} /> : null}
      {w.lost ? <Lost game={game} /> : null}
    </>
  );
}
