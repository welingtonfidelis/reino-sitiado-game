/**
 * Etapa 16: música ambiente feita na hora (Web Audio, sem arquivo de som).
 *
 * Na calmaria toca um tema calmo em dó maior (dedilhado, acordes macios e baixo); na onda, um
 * tema de batalha em lá menor com tambores. Cada tema tem 16 compassos: nos 8 primeiros a melodia
 * inteira, nos 8 seguintes só umas notas soltas (para não cansar). A troca entre os dois é suave.
 * As notas são agendadas um pouco à frente a cada quadro; com a aba escondida, para sozinha.
 */
export type MusicMode = 'calm' | 'battle' | 'off';

interface Chord {
  bass: number;
  pad: number[];
}

interface Theme {
  bpm: number;
  chords: Chord[];
  /** Por compasso, 8 colcheias: nota (MIDI) ou null. */
  melody: (number | null)[][];
  drums: boolean;
}

const _ = null;

const CALM: Theme = {
  bpm: 84,
  // Dó, Lá menor, Fá, Sol.
  chords: [
    { bass: 48, pad: [60, 64, 67] },
    { bass: 45, pad: [60, 64, 69] },
    { bass: 41, pad: [60, 65, 69] },
    { bass: 43, pad: [59, 62, 67] },
  ],
  melody: [
    [76, _, 79, _, 81, 79, 76, _],
    [72, _, 76, _, 74, _, 72, _],
    [69, _, 72, _, 74, _, 77, _],
    [79, _, _, 74, 76, _, 74, _],
    [76, _, 79, _, 84, _, 81, 79],
    [81, _, 79, 76, _, _, 72, _],
    [74, _, 72, _, 69, _, 72, 74],
    [74, _, _, _, 71, _, _, _],
  ],
  drums: false,
};

const BATTLE: Theme = {
  bpm: 116,
  // Lá menor, Fá, Sol, Mi.
  chords: [
    { bass: 45, pad: [57, 60, 64] },
    { bass: 41, pad: [57, 60, 65] },
    { bass: 43, pad: [55, 59, 62] },
    { bass: 40, pad: [56, 59, 64] },
  ],
  melody: [
    [69, _, 69, 72, 76, _, 74, 72],
    [72, _, 69, _, 65, _, 69, _],
    [71, _, 74, _, 79, _, 77, 76],
    [76, _, _, 74, _, 71, 68, _],
    [69, _, 69, 72, 76, _, 74, 72],
    [72, _, 69, _, 65, _, 69, _],
    [71, _, 74, _, 79, _, 77, 76],
    [76, _, 80, _, 76, _, _, _],
  ],
  drums: true,
};

const freq = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Music {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus = new Map<Theme, GainNode>();
  private noise: AudioBuffer | null = null;
  private theme: Theme | null = null;
  private step = 0;
  private next = 0;

  private audio: () => { ctx: AudioContext; out: AudioNode } | null;

  /** audio: o contexto e a saída do som do jogo (null enquanto o navegador não deixa tocar). */
  constructor(audio: () => { ctx: AudioContext; out: AudioNode } | null) {
    this.audio = audio;
  }

  /** A cada quadro: o que deve estar tocando agora. */
  update(mode: MusicMode): void {
    const a = this.audio();
    if (!a) return;
    if (!this.ctx) this.init(a.ctx, a.out);
    const c = this.ctx!;
    const want = this.enabled ? (mode === 'calm' ? CALM : mode === 'battle' ? BATTLE : null) : null;
    const t = c.currentTime;
    if (want !== this.theme) {
      for (const [th, g] of this.bus) {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(th === want ? 1 : 0, t, th === want ? 0.25 : 0.5);
      }
      this.theme = want;
      this.step = 0;
      this.next = t + 0.15;
    }
    const th = this.theme;
    if (!th) return;
    const dur = 30 / th.bpm;
    // Voltando de uma pausa longa (aba escondida): recomeça do agora.
    if (this.next < t) this.next = t + 0.05;
    while (this.next < t + 0.3) {
      this.play(th, this.step, this.next, dur);
      this.next += dur;
      this.step = (this.step + 1) % (16 * 8);
    }
  }

  private init(ctx: AudioContext, out: AudioNode): void {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(out);
    for (const th of [CALM, BATTLE]) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      this.bus.set(th, g);
    }
    const n = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Uma colcheia do tema: acorde no começo do compasso, baixo, melodia e tambores. */
  private play(th: Theme, step: number, t: number, dur: number): void {
    const bar = Math.floor(step / 8);
    const s = step % 8;
    const chord = th.chords[bar % 4]!;
    const out = this.bus.get(th)!;
    const barDur = dur * 8;
    const full = bar < 8;
    if (s === 0) for (const m of chord.pad) this.pad(out, t, freq(m), barDur, th.drums ? 0.03 : 0.04);
    if (th.drums) {
      // Batalha: baixo pulsando nas colcheias, bumbo, caixa e chimbal.
      this.bass(out, t, freq(s === 7 ? chord.bass + 7 : chord.bass), dur * 0.9, 0.16, 'triangle');
      if (s === 0 || s === 3 || s === 4) this.kick(out, t);
      if (s === 2 || s === 6 || (bar % 8 === 7 && s >= 5)) this.snare(out, t, s === 2 || s === 6 ? 0.22 : 0.14);
      this.hat(out, t, s % 2 === 0 ? 0.05 : 0.03);
    } else {
      // Calmaria: baixo no tempo 1 e no 3.
      if (s === 0 || s === 4) this.bass(out, t, freq(s === 0 ? chord.bass : chord.bass + 7), barDur * 0.45, 0.2, 'sine');
    }
    const note = th.melody[bar % 8]![s];
    if (note == null) return;
    // Segunda metade: só o começo de cada tempo forte, uma oitava abaixo e mais baixinho.
    if (!full && s !== 0 && s !== 4) return;
    const f = freq(full ? note : note - 12);
    if (th.drums) this.lead(out, t, f, dur * 1.6, full ? 0.07 : 0.05);
    else this.pluck(out, t, f, 1.1, full ? 0.15 : 0.1);
  }

  private env(g: GainNode, t: number, vol: number, attack: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private pluck(out: AudioNode, t: number, f: number, dur: number, vol: number): void {
    const c = this.ctx!;
    const g = c.createGain();
    this.env(g, t, vol, 0.01, dur);
    g.connect(out);
    for (const [type, mul, v] of [['triangle', 1, 1], ['sine', 2, 0.3]] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      const og = c.createGain();
      og.gain.value = v;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private pad(out: AudioNode, t: number, f: number, dur: number, vol: number): void {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.6, dur * 0.3));
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    lp.connect(g).connect(out);
    for (const detune of [1, 1.004]) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.35);
    }
  }

  private bass(out: AudioNode, t: number, f: number, dur: number, vol: number, type: OscillatorType): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = c.createGain();
    this.env(g, t, vol, 0.01, dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private lead(out: AudioNode, t: number, f: number, dur: number, vol: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const g = c.createGain();
    this.env(g, t, vol, 0.015, dur);
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(out: AudioNode, t: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = c.createGain();
    this.env(g, t, 0.45, 0.005, 0.25);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.3);
  }

  private hit(out: AudioNode, t: number, vol: number, type: BiquadFilterType, f: number, dur: number): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    const g = c.createGain();
    this.env(g, t, vol, 0.003, dur);
    s.connect(fl).connect(g).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  private snare(out: AudioNode, t: number, vol: number): void {
    this.hit(out, t, vol, 'bandpass', 1800, 0.16);
    this.bass(out, t, 190, 0.08, vol * 0.6, 'triangle');
  }

  private hat(out: AudioNode, t: number, vol: number): void {
    this.hit(out, t, vol, 'highpass', 7000, 0.05);
  }
}
