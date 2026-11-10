/**
 * A interface por cima do mapa, no visual do Vigília: recursos e onda nos cantos, um botão
 * Construir, o menu do prédio tocado (recrutar, melhorar, mover, consertar, destruir),
 * avisos e as telas de começo e fim.
 */
import { useEffect, useReducer, useState } from 'preact/hooks';
import { MODES, MODE_NAMES, SEASON_ICON, SEASON_NAME, BUILDINGS, RES_ORDER, castle, castleCap, housing, troops, workers, missing, waveSize, MONSTERS, BLESSINGS, repairAllCost, modsForWave, waveSizeWithMods, WAVE_MODS, WAVE_THEMES, themeForWave, tileAt, hexToWorld } from '../sim/index.ts';
import type { BlessingId, Category, Mode, MonsterKind, Res } from '../sim/index.ts';
import { FALL_TIME, Game, readGameMode } from '../game/game.ts';
import type { IsoCamera } from '../render/camera.ts';
import { QUALITY_NAME, QUALITY_ORDER } from '../render/quality.ts';
import type { Quality } from '../render/quality.ts';
import { Icon, RES_LABEL, costText, short } from './common.tsx';
import { BuildFan, RadialMenu } from './Radial.tsx';
import { STICKERS } from '../game/album.ts';
import { BOOK_ORDER, COUNTERS, TRAITS } from '../game/bestiary.ts';


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
  const [album, setAlbum] = useState(false);
  const [book, setBook] = useState(false);
  const w = game.world;
  const pop = workers(w);
  const room = Math.min(housing(w), castleCap(w));
  const c = castle(w);
  const calm = w.waveState === 'calm';
  const left = calm ? 0 : [...w.monsters.values()].filter((m) => m.state !== 'dead').length + w.spawnQueue.length;
  const boss = [...w.monsters.values()].find((m) => m.state !== 'dead' && MONSTERS[m.kind].boss);
  const nextTheme = themeForWave(w.seed, w.wave + 1, w.mode);
  const nextMods = [...(nextTheme ? [WAVE_THEMES[nextTheme].name] : []), ...modsForWave(w.seed, w.wave + 1, w.mode).map((k) => WAVE_MODS[k].name)];
  const nowMods = [...(w.waveTheme ? [WAVE_THEMES[w.waveTheme].name] : []), ...w.waveMods.map((k) => WAVE_MODS[k].name)];
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
            <WaveIcon season={game.season} />
            <span class="wave-lines">
              <strong>Onda {w.wave + 1}</strong>
              {/* Com modificador, ele vai na segunda linha com o tempo (na primeira, cortava no celular). */}
              <span>{nextMods.length ? `${nextMods.join(', ')} · em ${clock(w.waveTimer)}` : `em ${clock(w.waveTimer)} · chamar`}</span>
            </span>
          </button>
        ) : (
          <div class="chip wave-chip attack" role="status">
            <WaveIcon season={game.season} />
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
          {(small && game.unread) || game.album.fresh.size || game.book.fresh.size ? <span class="dot" /> : null}
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
      {more ? (
        <MoreMenu
          game={game}
          onClose={() => setMore(false)}
          onAlbum={() => {
            setMore(false);
            setAlbum(true);
          }}
          onBook={() => {
            setMore(false);
            setBook(true);
          }}
        />
      ) : null}
      {album ? <AlbumView game={game} onClose={() => setAlbum(false)} /> : null}
      {book ? <BookView game={game} onClose={() => setBook(false)} /> : null}
    </div>
  );
}

/**
 * Etapa 16: o álbum de figurinhas. Figura grande colorida quando ganha; cinza com a dica quando
 * falta (para quem lê junto). As novas brilham até fechar o álbum.
 */
function AlbumView({ game, onClose }: { game: Game; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    return () => {
      removeEventListener('keydown', key);
      game.albumSeen();
    };
  }, []);
  return (
    <div class="album-backdrop" onPointerDown={onClose}>
      <section class="panel album" role="dialog" aria-label="Álbum de figurinhas" onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <Icon name="album" />
          <h2>Álbum de figurinhas</h2>
          <span class="album-count">
            {game.album.count}/{STICKERS.length}
          </span>
          <button class="round" aria-label="Fechar o álbum" onClick={onClose}>
            <Icon name="fechar" />
          </button>
        </header>
        <div class="album-grid">
          {STICKERS.map((s) => {
            const got = !!game.album.got[s.id];
            return (
              <div key={s.id} class={`sticker${got ? ' got' : ''}${game.album.fresh.has(s.id) ? ' fresh' : ''}`} style={{ '--c': s.color }} title={s.hint}>
                <span class="sticker-face">
                  <Icon name={s.icon} />
                </span>
                <strong>{s.name}</strong>
                <small>{s.hint}</small>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/**
 * Livro do Sábio (2026-11-10): um cartão por monstro, com a figura dele. Quem ainda não apareceu
 * fica de sombra com "?". Tocar num visto abre a página dele: o que faz e o que funciona contra,
 * em ícones grandes, com a frase embaixo para quem lê.
 */
function BookView({ game, onClose }: { game: Game; onClose: () => void }) {
  const [open, setOpen] = useState<MonsterKind | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    return () => {
      removeEventListener('keydown', key);
      game.bookRead();
    };
  }, []);
  const pic = (k: MonsterKind) => `${import.meta.env.BASE_URL}ui/bestiario/${k}.jpg`;
  const seen = BOOK_ORDER.filter((k) => game.book.seen.has(k)).length;
  const m = open ? MONSTERS[open] : null;
  return (
    <div class="album-backdrop" onPointerDown={onClose}>
      <section class="panel album book" role="dialog" aria-label="Livro do Sábio" onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <img class="book-sage" src={`${import.meta.env.BASE_URL}ui/sabio.png`} alt="" />
          <h2>Livro do Sábio</h2>
          <span class="album-count">
            {seen}/{BOOK_ORDER.length}
          </span>
          <button class="round" aria-label="Fechar o livro" onClick={onClose}>
            <Icon name="fechar" />
          </button>
        </header>
        {open && m ? (
          <article class="book-page">
            <img class="book-pic" src={pic(open)} alt={m.name} />
            <div class="book-info">
              <h3>{m.name}</h3>
              <div class="book-row" aria-label="O que faz">
                {TRAITS[open].map((n) => (
                  <span class="book-chip bad">
                    <Icon name={n} />
                  </span>
                ))}
              </div>
              <p>{m.blurb}</p>
              <div class="book-row" aria-label="O que funciona contra">
                <span class="book-vs">
                  <Icon name="check" />
                </span>
                {COUNTERS[open].icons.map((n) => (
                  <span class="book-chip good">
                    <Icon name={n} />
                  </span>
                ))}
              </div>
              <p>{COUNTERS[open].text}</p>
              <small>Aparece da onda {m.from} em diante{m.boss ? ', a cada tantas ondas, como chefe' : ''}.</small>
            </div>
            <button class="round book-back" aria-label="Voltar para a lista" onClick={() => setOpen(null)}>
              <Icon name="voltar" />
            </button>
          </article>
        ) : null}
        <div class="album-grid book-grid">
          {BOOK_ORDER.map((k) => {
            const got = game.book.seen.has(k);
            return (
              <button
                key={k}
                class={`book-card${got ? ' got' : ''}${game.book.fresh.has(k) ? ' fresh' : ''}${open === k ? ' on' : ''}${MONSTERS[k].boss ? ' boss' : ''}`}
                disabled={!got}
                aria-label={got ? MONSTERS[k].name : 'Ainda não apareceu'}
                onClick={() => setOpen(k)}
              >
                <span class="book-face">
                  <img src={pic(k)} alt="" />
                  {got ? null : <b>?</b>}
                </span>
                <strong>{got ? MONSTERS[k].name : '???'}</strong>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** O que cada nível de gráfico muda (2026-11-10), embaixo do nome no ⋯. */
const GFX_HINT: Record<Quality, string> = {
  baixo: 'roda melhor, mapa menor, sem sombra',
  medio: 'equilíbrio, com sombra e cor de cinema',
  alto: 'mais bonito, grama cheia',
};

/** O Sábio (2026-11-09): retrato no canto e a dica em figuras; tocar fecha. */
function Guide({ game }: { game: Game }) {
  const t = game.tip;
  if (!t) return null;
  return (
    <button class="guide" key={t.id} onClick={() => game.dismissTip()} aria-label={`Dica do Sábio: ${t.text} Toque para fechar.`}>
      <img class="guide-face" src={`${import.meta.env.BASE_URL}ui/sabio.png`} alt="" />
      <span class="guide-bubble">
        <span class="guide-icons" aria-hidden="true">
          {t.icons.map((n, i) => (n === 'seta' ? <span key={i} class="guide-arrow">➜</span> : <Icon key={i} name={n} />))}
        </span>
        <span class="guide-text">{t.text}</span>
      </span>
    </button>
  );
}

/** Figurinha nova: a figura grande aparece embaixo, no meio, por uns segundos. */
function StickerPop({ game }: { game: Game }) {
  const s = game.sticker;
  if (!s) return null;
  return (
    <div class="sticker-pop" key={s.id} role="status" style={{ '--c': s.color }}>
      <span class="sticker-face">
        <Icon name={s.icon} />
      </span>
      <span class="sticker-pop-text">
        <small>Figurinha nova!</small>
        <strong>{s.name}</strong>
      </span>
    </div>
  );
}

/** Caveira da onda com a estação de agora num selinho no canto. */
function WaveIcon({ season }: { season: number }) {
  return (
    <span class="wave-ico" title={SEASON_NAME[season]}>
      <Icon name="caveira" />
      <span class={`season-dot s${season}`}>
        <Icon name={SEASON_ICON[season] ?? 'flor'} />
      </span>
    </span>
  );
}

/** Estação nova: figura grande no meio da tela por uns segundos (quem joga ainda não lê). */
function SeasonCard({ season }: { season: number }) {
  return (
    <div class={`season-card s${season}`} role="status" aria-label={`Chegou o ${SEASON_NAME[season]}`.replace('o Primavera', 'a Primavera')}>
      <span class="season-big">
        <Icon name={SEASON_ICON[season] ?? 'flor'} />
      </span>
      <strong>{SEASON_NAME[season]}</strong>
    </div>
  );
}

/** O ⋯: som, relatório a cada onda, nova partida e o diário de avisos. */
/**
 * Etapa 18: os dois modos em botões grandes com figura (o filho do usuário não lê): o sol é o
 * fácil (nada acaba, ondas leves), as espadas são o normal.
 */
function ModePick({ current, onPick }: { current: Mode; onPick: (m: Mode) => void }) {
  return (
    <div class="mode-pick">
      {(['facil', 'normal'] as Mode[]).map((m) => (
        <button key={m} class={`mode-btn ${m}${m === current ? ' on' : ''}`} onClick={() => onPick(m)} aria-label={`Jogar no modo ${MODE_NAMES[m].toLowerCase()}`}>
          <Icon name={m === 'facil' ? 'sol' : 'espadas'} />
          <strong>{MODE_NAMES[m]}</strong>
          <small>{m === 'facil' ? 'nada acaba, ondas leves' : 'recursos acabam, ondas fortes'}</small>
        </button>
      ))}
    </div>
  );
}

const newSeed = () => Math.floor(Math.random() * 1e9);

function MoreMenu({ game, onClose, onAlbum, onBook }: { game: Game; onClose: () => void; onAlbum: () => void; onBook: () => void }) {
  const [confirmNew, setConfirmNew] = useState(false);
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
        <div class="more-row static" aria-label={`Modo desta partida: ${MODE_NAMES[game.world.mode].toLowerCase()}`}>
          <Icon name={game.world.mode === 'facil' ? 'sol' : 'espadas'} />
          <span>Modo {MODE_NAMES[game.world.mode].toLowerCase()}</span>
          <small class="more-hint">até o fim da partida</small>
        </div>
        <button class="more-row album-row" onClick={onAlbum}>
          <Icon name="album" />
          <span>Álbum de figurinhas</span>
          <span class="album-count">
            {game.album.count}/{STICKERS.length}
          </span>
          {game.album.fresh.size ? <span class="fresh-dot" aria-label={`${game.album.fresh.size} novas`} /> : null}
        </button>
        <button class="more-row album-row" onClick={onBook}>
          <Icon name="livro" />
          <span>Livro do Sábio</span>
          <span class="album-count">
            {BOOK_ORDER.filter((k) => game.book.seen.has(k)).length}/{BOOK_ORDER.length}
          </span>
          {game.book.fresh.size ? <span class="fresh-dot" aria-label={`${game.book.fresh.size} monstros novos`} /> : null}
        </button>
        <button class="more-row" onClick={() => game.setSound(!game.sound)}>
          <Icon name={game.sound ? 'som' : 'mudo'} />
          {game.sound ? 'Som ligado' : 'Som desligado'}
        </button>
        <button class="more-row" onClick={() => game.setGuide(!game.guide)}>
          <Icon name={game.guide ? 'pessoa' : 'fechar'} />
          {game.guide ? 'Dicas do Sábio ligadas' : 'Dicas do Sábio desligadas'}
        </button>
        <button class={`more-row${game.sound ? '' : ' off'}`} disabled={!game.sound} onClick={() => game.setMusic(!game.music)}>
          <Icon name={game.music && game.sound ? 'musica' : 'semMusica'} />
          {game.music ? 'Música ligada' : 'Música desligada'}
        </button>
        <div class="more-row static gfx-row" role="group" aria-label="Gráficos">
          <Icon name={game.quality === 'baixo' ? 'pena' : 'brilho'} />
          <span class="gfx-label">
            Gráficos
            <small class="more-hint">{GFX_HINT[game.quality]}</small>
          </span>
          <span class="gfx-seg">
            {QUALITY_ORDER.map((q) => (
              <button key={q} class={q === game.quality ? 'on' : ''} aria-pressed={q === game.quality} onClick={() => game.setQuality(q)}>
                {QUALITY_NAME[q]}
              </button>
            ))}
          </span>
        </div>
        <label class="more-row">
          <input type="checkbox" checked={game.autoReport} onChange={(e) => game.setAutoReport((e.target as HTMLInputElement).checked)} />
          Relatório a cada onda vencida
        </label>
        {confirmNew ? (
          <div class="more-confirm">
            <p>Começar uma partida nova? O reino de agora (onda {game.world.wave}) se perde. Escolha o modo:</p>
            <ModePick
              current={game.world.mode}
              onPick={(m) => {
                onClose();
                game.restart(newSeed(), m);
              }}
            />
            <div class="row">
              <button class="btn ghost" onClick={() => setConfirmNew(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button class="more-row" onClick={() => setConfirmNew(true)}>
            <Icon name="novo" />
            Nova partida
          </button>
        )}
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

/**
 * Barra da escolha de tropas: só quantas foram escolhidas e o Limpar (pedido do usuário em
 * 2026-11-10; antes listava o nome de cada tropa e a explicação de como mandar).
 */
function SelectionBar({ game }: { game: Game }) {
  const n = game.units.length;
  return (
    <div class="placebar selbar">
      <span class="selbar-count" aria-label={`${n} ${n === 1 ? 'tropa escolhida' : 'tropas escolhidas'}`}>
        <Icon name="espadas" />
        <strong>{n}</strong>
      </span>
      <button class="btn ghost small" onClick={() => game.clearUnits()}>
        Limpar
      </button>
    </div>
  );
}

const PLURAL: Record<MonsterKind, [string, string]> = {
  esqueleto: ['esqueleto', 'esqueletos'],
  esqueletoGuerreiro: ['esqueleto guerreiro', 'esqueletos guerreiros'],
  acumulador: ['acumulador', 'acumuladores'],
  vampiro: ['vampiro', 'vampiros'],
  golemMusgo: ['Golem de musgo', 'Golens de musgo'],
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
  esqueletoGuerreiro: 'Esqueletos guerreiros chegam nesta onda: de escudo, as flechas pegam bem menos neles.',
  acumulador: 'O acumulador chega nesta onda: não briga, rouba recursos do primeiro prédio que alcança e foge para a fenda. Derrubado, devolve tudo.',
  vampiro: 'O vampiro chega nesta onda: chama morcegos e se cura com cada golpe.',
};

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Como cada bênção aparece no relatório (pedido do usuário em 2026-11-07, para quem ainda não lê):
 * um ícone do que melhora, um ícone menor do efeito, o tamanho do ganho e um nome curto.
 */
const BOON: Record<BlessingId, { icon: string; extra: string; amount: string; short: string }> = {
  brasa: { icon: 'arco', extra: 'fogo', amount: '+40%', short: 'Flechas mais fortes' },
  celeiros: { icon: 'comida', extra: 'casa', amount: '+25%', short: 'Mais comida' },
  pedraBenta: { icon: 'muralha', extra: 'coracao', amount: '+⅓', short: 'Muralhas se curam' },
  machados: { icon: 'madeira', extra: 'machado', amount: '+30%', short: 'Mais madeira' },
  picaretas: { icon: 'pedra', extra: 'ferro', amount: '+30%', short: 'Mais pedra e ferro' },
  escudos: { icon: 'escudo', extra: 'coracao', amount: '+30%', short: 'Soldados mais fortes' },
  muralhasGrossas: { icon: 'muralha', extra: 'escudo', amount: '+40%', short: 'Muralhas mais duras' },
  vigia: { icon: 'castelo', extra: 'arco', amount: '×2', short: 'Castelo atira mais forte' },
  bracos: { icon: 'pessoa', extra: 'relogio', amount: '+40%', short: 'Gente chega mais rápido' },
  coroa: { icon: 'ouro', extra: 'coroa', amount: '+30%', short: 'Mais ouro' },
};
/** Cor de cada tipo de bênção (a mesma no ícone, no ganho e na borda). */
const BOON_COLOR: Record<string, string> = {
  Defesa: '#f0a060',
  Economia: '#8cc56a',
  Muralhas: '#9fb4f0',
  Tropas: '#6cc0c0',
  Moradia: '#e0b860',
  Ouro: '#e9b949',
};

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
  const nextMods = modsForWave(w.seed, next, w.mode);
  const theme = themeForWave(w.seed, next, w.mode);
  const size = waveSizeWithMods(next, nextMods, w.mode, theme);
  const news = (Object.keys(size) as MonsterKind[]).filter((k) => MONSTERS[k].from === next && size[k] > 0 && NEWS[k]).map((k) => NEWS[k]);
  for (const k of ['golem', 'golemOssos', 'golemMusgo'] as MonsterKind[]) if (size[k] > 0) news.push(`Chefe nesta onda: ${MONSTERS[k].name}. ${MONSTERS[k].blurb.replace('Chefe. ', '')}`);
  const rift = MODES[w.mode].riftOpens.includes(next) && next > 1;
  const fix = repairAllCost(w);
  const needChoice = r.choices.length > 0;
  const bonus = Math.floor(w.waveTimer / 3);
  return (
    <div class="overlay">
      <article class="report-card report">
        <header class="win-head">
          <div class="win-badge" aria-hidden="true">
            <Icon name="coroa" />
          </div>
          <div class="win-title">
            <small>Vitória!</small>
            <h2>Onda {r.wave} vencida</h2>
            <p>{r.fallen.length ? 'O castelo aguentou, mas não sem perdas.' : 'O castelo aguentou e ninguém caiu.'}</p>
          </div>
          <div class="loot" title="Prêmio em ouro">
            <Icon name="ouro" />
            <strong>+{r.gold}</strong>
            <span>ouro</span>
          </div>
        </header>
        {needChoice ? (
          <section class="boons" aria-label="Escolha uma bênção">
            <h3>
              <Icon name="estrela" /> Escolha um presente para o reino
            </h3>
            <div class="boon-grid">
              {r.choices.map((id) => {
                const b = BLESSINGS[id];
                const look = BOON[id];
                const color = BOON_COLOR[b.tag] ?? 'var(--gold)';
                return (
                  <button class={`boon${pick === id ? ' active' : ''}`} style={{ '--boon': color } as Record<string, string>} aria-pressed={pick === id} aria-label={`${b.name}: ${b.text}`} onClick={() => setPick(id)}>
                    <span class="boon-art" aria-hidden="true">
                      <Icon name={look.icon} />
                      <span class="boon-extra">
                        <Icon name={look.extra} />
                      </span>
                    </span>
                    <span class="boon-amount" aria-hidden="true">
                      <Icon name="melhorar" />
                      {look.amount}
                    </span>
                    <strong>{look.short}</strong>
                    <small>{b.name}</small>
                    {pick === id ? (
                      <span class="boon-check" aria-hidden="true">
                        <Icon name="check" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p class="boon-detail">{pick ? BLESSINGS[pick].text : 'Toque num cartão para escolher. Depois toque em Continuar.'}</p>
          </section>
        ) : null}
        <div class="report-stats icons">
          <div title="Monstros abatidos">
            <Icon name="caveira" />
            <strong>{r.kills}</strong>
            <span>monstros abatidos</span>
          </div>
          <div title="Perdas">
            <Icon name="pessoa" />
            <strong>{losses}</strong>
            <span>perdas</span>
          </div>
          <div title="Estragos">
            <Icon name="muralha" />
            <strong>{damage}</strong>
            <span>estragos</span>
          </div>
          <div title="Colheita">
            <Icon name="comida" />
            <strong>+{Math.floor(r.prod.comida)}</strong>
            <span>comida</span>
          </div>
          <div title="Serraria, pedreira e mina">
            <Icon name="madeira" />
            <strong>{works}</strong>
            <span>serraria, pedreira e mina</span>
          </div>
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
        {theme ? (
          <p class="theme-note">
            <Icon name={WAVE_THEMES[theme].icon} />
            <span>
              <b>{WAVE_THEMES[theme].name}!</b> {WAVE_THEMES[theme].text}
            </span>
          </p>
        ) : null}
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

/**
 * Tela de começo. Com partida salva (2026-11-07, pedido do usuário), o Continuar é o botão
 * grande da tela, com figura e a onda; começar outra fica num botão pequeno que só então mostra
 * a escolha do modo, para a criança não apagar a partida sem querer.
 */
function Intro({ game }: { game: Game }) {
  const saved = Game.saved();
  const [another, setAnother] = useState(false);
  const tips = (
    <ul>
      <li>Os trabalhadores chegam sozinhos enquanto houver casa vaga, comida e teto no castelo.</li>
      <li>Construa fazendas, serraria perto da floresta, pedreira perto da rocha e mina em cima do veio.</li>
      <li>Toque num prédio para recrutar, marcar o ponto de encontro, melhorar, mover, consertar ou destruir.</li>
      <li>Toque numa tropa (ou use Selecionar e arraste) e depois no mapa para mandá-las até lá.</li>
      <li>Muralhas desviam a horda; orcs derrubam. Torres só atiram com arqueiros dentro.</li>
      <li>Arraste para mover o mapa e use a pinça ou a roda do mouse para o zoom.</li>
    </ul>
  );
  return (
    <div class="overlay">
      <article class="report-card">
        <header>
          <small>Tower defense sem fim</small>
          <h2>Hordas &amp; Hortas</h2>
          <p>As hordas saem das fendas na beira do mapa. Até quando o castelo aguenta?</p>
        </header>
        {saved ? (
          <>
            <button class="continue-big" onClick={() => game.continueSaved()} aria-label={`Continuar a partida da onda ${saved.wave}`}>
              <span class="continue-play">
                <Icon name="play" />
              </span>
              <span class="continue-text">
                <strong>Continuar</strong>
                <span class="continue-info">
                  <span>
                    <Icon name="caveira" /> Onda {Math.max(1, saved.wave)}
                  </span>
                  <span>
                    <Icon name={saved.mode === 'facil' ? 'sol' : 'espadas'} /> {MODE_NAMES[saved.mode]}
                  </span>
                </span>
              </span>
            </button>
            {another ? (
              <>
                <p class="mode-title">Outra partida (a salva some):</p>
                <ModePick current={saved.mode} onPick={(m) => game.restart(newSeed(), m)} />
                <button class="btn new-game back" onClick={() => setAnother(false)}>
                  <Icon name="voltar" /> Voltar
                </button>
              </>
            ) : (
              <button class="btn new-game" onClick={() => setAnother(true)}>
                <Icon name="novo" /> Começar outra partida
              </button>
            )}
            <details class="intro-tips">
              <summary>Como jogar</summary>
              {tips}
            </details>
          </>
        ) : (
          <>
            {tips}
            <p class="mode-title">Como quer jogar?</p>
            <ModePick current={readGameMode()} onPick={(m) => game.begin(m)} />
          </>
        )}
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
        <p class="sub">A horda da onda {w.wave} trouxe {Object.entries(waveSize(w.wave, w.mode)).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${MONSTERS[k as keyof typeof MONSTERS].name.toLowerCase()}`).join(', ')}.</p>
        <p class="mode-title">Começar de novo:</p>
        <ModePick current={w.mode} onPick={(m) => game.restart(newSeed(), m)} />
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
  const free = game.mode.kind === 'none' && !sel && game.units.length === 0 && !game.boxMode && !w.lost;
  const army = troops(w);
  const closeFan = () => {
    setFan(false);
    setCat(null);
  };
  return (
    <>
      <Hud game={game} cam={cam} small={small} />
      {game.seasonCard > 0 ? <SeasonCard key={game.season} season={game.season} /> : null}
      {game.themeCard > 0 && game.world.waveTheme ? (
        <div key={`tema${game.world.wave}`} class="season-card theme-card" role="status" aria-label={`${WAVE_THEMES[game.world.waveTheme].name}: ${WAVE_THEMES[game.world.waveTheme].text}`}>
          <span class="season-big">
            <Icon name={WAVE_THEMES[game.world.waveTheme].icon} />
          </span>
          <strong>{WAVE_THEMES[game.world.waveTheme].name}!</strong>
        </div>
      ) : null}
      <StickerPop game={game} />
      <Guide game={game} />
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
      {game.units.length > 0 && game.mode.kind === 'none' ? <SelectionBar game={game} /> : null}
      <PlaceBar game={game} touch={touch} />
      {sel && game.mode.kind === 'none' ? <RadialMenu key={sel.id} game={game} cam={cam} b={sel} touch={touch} /> : null}
      {w.report && !w.lost && game.reportOpen ? <Report key={w.report.wave} game={game} /> : null}
      {!game.started ? <Intro game={game} /> : null}
      {w.lost && (game.fallT < 0 || game.fallT >= FALL_TIME) ? <Lost game={game} /> : null}
    </>
  );
}
