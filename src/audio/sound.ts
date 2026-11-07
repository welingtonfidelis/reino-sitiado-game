/**
 * Sons feitos na hora com Web Audio (Etapa 7): nada é baixado. Cada som tem um intervalo
 * mínimo, para cem flechas por segundo não virarem um chiado. O áudio só liga depois do
 * primeiro toque (exigência do iPhone).
 */
export type Sfx = 'arco' | 'golpe' | 'morte' | 'pronto' | 'onda' | 'vitoria' | 'castelo' | 'magia' | 'cura' | 'nivel' | 'queda' | 'fogos' | 'figurinha';

const GAP: Record<Sfx, number> = { arco: 0.07, golpe: 0.09, morte: 0.08, pronto: 0.2, onda: 1, vitoria: 1, castelo: 0.4, magia: 0.12, cura: 0.3, nivel: 1, queda: 3, fogos: 0.12, figurinha: 0.8 };

export class Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private last = new Map<Sfx, number>();
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  constructor(muted: boolean) {
    this.muted = muted;
    const wake = () => {
      this.ensure();
      void this.ctx?.resume();
    };
    addEventListener('pointerdown', wake, { passive: true });
    addEventListener('keydown', wake);
  }

  /** Contexto e saída para a música (Etapa 16); null até o navegador deixar tocar. */
  audio(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.ctx || !this.out || this.ctx.state !== 'running') return null;
    return { ctx: this.ctx, out: this.out };
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
    } catch {
      return null;
    }
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.35;
    this.out.connect(this.ctx.destination);
    const n = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, n, n);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, f0: number, f1: number, delay = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    // A amostra tem 1 s: em laço, os sons longos (o castelo desabando) não acabam no meio.
    s.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = filter;
    fl.frequency.setValueAtTime(f0, t);
    fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(this.out!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  play(k: Sfx): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(k) ?? -9) < GAP[k]) return;
    this.last.set(k, now);
    switch (k) {
      case 'arco':
        this.noise(0.08, 0.25, 'highpass', 2500, 6000);
        this.tone('triangle', 520, 380, 0.07, 0.06);
        break;
      case 'golpe':
        this.tone('sine', 160, 60, 0.12, 0.35);
        this.noise(0.06, 0.15, 'lowpass', 1800, 400);
        break;
      case 'morte':
        this.noise(0.22, 0.18, 'lowpass', 1200, 150);
        break;
      case 'pronto':
        this.tone('triangle', 660, 660, 0.12, 0.12);
        this.tone('triangle', 880, 880, 0.18, 0.12, 0.1);
        break;
      case 'onda':
        this.tone('sawtooth', 110, 104, 0.9, 0.12);
        this.tone('sawtooth', 165, 156, 0.9, 0.08, 0.05);
        break;
      case 'vitoria':
        [523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.12, i * 0.12));
        break;
      case 'castelo':
        this.tone('sine', 90, 40, 0.3, 0.4);
        break;
      case 'magia':
        this.tone('sine', 900, 300, 0.25, 0.08);
        this.noise(0.2, 0.08, 'bandpass', 3000, 800);
        break;
      case 'cura':
        this.tone('sine', 700, 1050, 0.3, 0.07);
        break;
      case 'queda':
        // O castelo desabando: estrondo grave e comprido, com um segundo tombo no meio.
        this.noise(2.2, 0.45, 'lowpass', 900, 60);
        this.tone('sine', 70, 28, 1.8, 0.45);
        this.tone('sine', 55, 25, 1.2, 0.35, 1.1);
        break;
      case 'fogos': {
        // Fogo de artifício: assobio subindo e estalo com chiado.
        const f = 600 + Math.random() * 500;
        this.tone('sine', f, f * 2.2, 0.25, 0.05);
        this.noise(0.35, 0.22, 'bandpass', 2200, 700, 0.22);
        this.tone('sine', 120, 50, 0.2, 0.18, 0.22);
        break;
      }
      case 'figurinha':
        // Figurinha nova: arpejo brilhante subindo e um brilho no fim.
        [784, 988, 1175, 1568].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.1, i * 0.07));
        this.tone('sine', 2093, 2637, 0.4, 0.05, 0.28);
        break;
      case 'nivel':
        [392, 523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.12, i * 0.1));
        break;
    }
  }
}
