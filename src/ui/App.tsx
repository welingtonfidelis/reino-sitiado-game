/**
 * A interface por cima do mapa, no visual do Vigília: recursos e onda nos cantos, um botão
 * Construir, o menu do prédio tocado (recrutar, melhorar, mover, consertar, destruir),
 * avisos e as telas de começo e fim.
 */
import { useEffect, useReducer, useState } from 'preact/hooks';
import { BUILDINGS, CONFIG, RES_ORDER, castle, castleCap, housing, troops, workers, missing, waveSize, MONSTERS, BLESSINGS, repairAllCost, modsForWave, waveSizeWithMods, WAVE_MODS, tileAt, hexToWorld } from '../sim/index.ts';
import type { BlessingId, Category, MonsterKind, Res, UnitKind } from '../sim/index.ts';
import { Game } from '../game/game.ts';
import type { IsoCamera } from '../render/camera.ts';
import { Icon, RES_LABEL, costText, short } from './common.tsx';
import { BuildFan, RadialMenu } from './Radial.tsx';


function clock(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}


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

/** Celular (em pé ou deitado): sem avisos na tela, só no diário do ⋯. */
const SMALL = '(max-width: 599px), (max-height: 499px)';

/**
 * Topo em pilha (etapa 12): castelo, onda, recursos, pausa, ritmo e ⋯ num bloco só, com o
 * chefe embaixo. O CSS arruma em duas linhas no celular em pé e numa linha só nos outros.
 */
function Hud({ game, cam, small }: { game: Game; cam: IsoCamera; small: boolean }) {
  const [more, setMore] = useState(false);
  const w = game.world;
  const pop = workers(w);
  const room = Math.min(housing(w), castleCap(w));
  const c = castle(w);
  const calm = w.waveState === 'calm';
  const left = calm ? 0 : [...w.monsters.values()].filter((m) => m.state !== 'dead').length + w.spawnQueue.length;
  const boss = [...w.monsters.values()].find((m) => m.state !== 'dead' && MONSTERS[m.kind].boss);
  const nextMods = modsForWave(w.seed, w.wave + 1).map((k) => WAVE_MODS[k].name);
  const nowMods = w.waveMods.map((k) => WAVE_MODS[k].name);
  // Cristal só aparece quando já conta: com estoque ou com uma mina no veio de cristal.
  const crystal = w.res.cristal >= 1 || [...w.buildings.values()].some((b) => b.kind === 'mina' && tileAt(w, b.q, b.r)?.terrain === 'crystal');
  const speed = game.speed || game.resumeSpeed;
  const hpFrac = c ? c.hp / c.maxHp : 0;
  const goCastle = () => {
    if (!c) return;
    const p = hexToWorld(c.q, c.r);
    cam.target.set(p.x, 0, p.z + 1);
    cam.apply();
    game.selected = c.id;
    game.emit();
  };
  return (
    <div class="hud-stack">
      <div class="hud-top">
        <button class={`chip castle-chip${hpFrac < 0.35 ? ' low' : ''}`} aria-label={`Castelo: ${Math.ceil(c?.hp ?? 0)} de ${c?.maxHp ?? 0} de vida. Toque para ir até ele.`} onClick={goCastle}>
          <Icon name="castelo" />
          <span class="castle-info">
            <span class="chip-bar">
              <span style={{ width: `${hpFrac * 100}%` }} />
            </span>
            <strong>{Math.ceil(c?.hp ?? 0)}</strong>
          </span>
        </button>
        {calm ? (
          <button class="chip wave-chip" title="Chamar a onda agora rende ouro pelo tempo que sobrou" onClick={() => game.callWave()}>
            <Icon name="caveira" />
            <span class="wave-lines">
              <strong>Onda {w.wave + 1}</strong>
              {/* Com modificador, ele vai na segunda linha com o tempo (na primeira, cortava no celular). */}
              <span>{nextMods.length ? `${nextMods.join(', ')} · em ${clock(w.waveTimer)}` : `em ${clock(w.waveTimer)} · chamar`}</span>
            </span>
          </button>
        ) : (
          <div class="chip wave-chip attack" role="status">
            <Icon name="caveira" />
            <span class="wave-lines">
              <strong>
                Onda {w.wave} · {left}
              </strong>
              <span>{nowMods.length ? nowMods.join(' · ') : 'monstros'}</span>
            </span>
          </div>
        )}
        <div class="res-strip">
          {RES_ORDER.filter((r) => r !== 'cristal' || crystal).map((r) => (
            <span class={`res-item${r === 'ouro' ? ' gold' : ''}${r === 'comida' && w.hungry ? ' low' : ''}`} title={`${RES_LABEL[r]}: ${Math.floor(w.res[r])}`}>
              <Icon name={r} />
              {short(w.res[r])}
              <span class="res-label">{RES_LABEL[r]}</span>
            </span>
          ))}
          <span class="res-item" title={`Trabalhadores ${pop} · vagas nas casas ${housing(w)} · teto do castelo ${castleCap(w)}`}>
            <Icon name="casa" />
            {pop}/{room}
            <span class="res-label">moradores</span>
          </span>
        </div>
        <button class={`round pause${game.speed === 0 ? ' on' : ''}`} aria-label={game.speed === 0 ? 'Continuar' : 'Pausar'} onClick={() => game.togglePause()}>
          <Icon name={game.speed === 0 ? 'play' : 'pausa'} />
        </button>
        <button class={`round speed${speed > 1 ? ' fast' : ''}`} aria-label={`Velocidade ${speed}×; toque para ${(speed % 3) + 1}×`} onClick={() => game.cycleSpeed()}>
          {speed}×
        </button>
        <button
          class="round more"
          aria-label={game.unread && small ? `Mais opções: ${game.unread} avisos novos` : 'Mais opções'}
          aria-expanded={more}
          onClick={() => {
            setMore(!more);
            game.markRead();
          }}
        >
          <Icon name="mais" />
          {small && game.unread ? <span class="dot" /> : null}
        </button>
      </div>
      {boss ? (
        <div class="boss-card" role="status">
          <header>
            <strong>{MONSTERS[boss.kind].name}</strong>
            <small>{MONSTERS[boss.kind].immuneArrows ? 'Flechas não ferem' : 'Magia não fere'}</small>
          </header>
          <div class="rbar">
            <div style={{ width: `${(100 * boss.hp) / boss.maxHp}%`, background: 'var(--bad)' }} />
          </div>
        </div>
      ) : null}
      {more ? <MoreMenu game={game} onClose={() => setMore(false)} /> : null}
    </div>
  );
}

/** O ⋯: som, relatório a cada onda e o diário de avisos. */
function MoreMenu({ game, onClose }: { game: Game; onClose: () => void }) {
  useEffect(() => {
    game.markRead();
  }, [game.log.length]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  return (
    <>
      <div class="more-backdrop" onPointerDown={onClose} />
      <section class="panel more-menu" aria-label="Opções">
        <button class="more-row" onClick={() => game.setSound(!game.sound)}>
          <Icon name={game.sound ? 'som' : 'mudo'} />
          {game.sound ? 'Som ligado' : 'Som desligado'}
        </button>
        <label class="more-row">
          <input type="checkbox" checked={game.autoReport} onChange={(e) => game.setAutoReport((e.target as HTMLInputElement).checked)} />
          Relatório a cada onda vencida
        </label>
        <h3>Diário de avisos</h3>
        <ol class="diary">
          {game.log.length ? (
            game.log.map((l) => (
              <li key={l.id} class={l.tone}>
                <span class="tone" aria-hidden="true" />
                <span>{l.text}</span>
                <small>{l.wave ? `onda ${l.wave}` : 'início'}</small>
              </li>
            ))
          ) : (
            <li class="empty">Nenhum aviso ainda.</li>
          )}
        </ol>
      </section>
    </>
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
        {parts.join(' e ')} {game.units.length === 1 ? 'escolhido' : 'escolhidos'}. {touch ? 'Toque' : 'Clique'} no mapa para mandar; numa torre, os arqueiros sobem; numa tropa, põe ou tira da escolha.
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
  const [fan, setFan] = useState(false);
  const [cat, setCat] = useState<Category | null>(null);
  const w = game.world;
  const sel = game.selected >= 0 ? w.buildings.get(game.selected) : undefined;
  const small = window.matchMedia(SMALL).matches;
  const free = game.mode.kind === 'none' && !sel && game.units.length === 0 && !game.boxMode;
  const army = troops(w);
  const closeFan = () => {
    setFan(false);
    setCat(null);
  };
  return (
    <>
      <Hud game={game} cam={cam} small={small} />
      {small ? null : (
        <div class="toasts">
          {game.toasts.map((t) => (
            <div key={t.id} class={`toast ${t.tone === 'info' ? '' : t.tone}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}
      {free && fan ? <div class="fan-backdrop" onPointerDown={closeFan} /> : null}
      {free && fan ? <BuildFan game={game} touch={touch} cat={cat} setCat={setCat} close={closeFan} /> : null}
      {free ? (
        <>
          {army > 0 && !fan ? (
            <button class="fab fab-select" aria-label={`Selecionar tropas (${army})`} onClick={() => game.setBoxMode(true)}>
              <Icon name="caixa" />
              <span class="fab-badge">{army}</span>
              <span class="fab-label">Selecionar</span>
            </button>
          ) : null}
          <button
            class={`fab fab-build${fan ? ' open' : ''}`}
            aria-label={fan ? (cat ? 'Voltar às categorias' : 'Fechar Construir') : 'Construir'}
            onClick={() => (fan ? (cat ? setCat(null) : closeFan()) : setFan(true))}
          >
            <Icon name={fan ? (cat ? 'voltar' : 'fechar') : 'martelo'} />
            {fan ? null : <span class="fab-label">Construir</span>}
          </button>
        </>
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
      <PlaceBar game={game} touch={touch} />
      {sel && game.mode.kind === 'none' ? <RadialMenu key={sel.id} game={game} cam={cam} b={sel} touch={touch} /> : null}
      {w.report && !w.lost ? <Report key={w.report.wave} game={game} /> : null}
      {!game.started ? <Intro game={game} /> : null}
      {w.lost ? <Lost game={game} /> : null}
    </>
  );
}
