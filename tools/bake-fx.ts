/**
 * Assa efeitos do pixelfx (MIT, github.com/patch-gg/pixelfx) em folhas de quadros (Etapa 3).
 *
 *   node tools/bake-fx.ts ../pixelfx   (a cópia local do repositório, ao lado dos projetos)
 *
 * O código do pixelfx roda só aqui, no Mac; o jogo leva as imagens `public/assets/fx/<chave>.png`
 * e as medidas em `src/render/fxSheets.ts` (gerado, não editar). Da pasta baixada bastam
 * `src/core/` e os arquivos de `EFFECTS` com o `_lib.js` da categoria de cada um.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const src = resolve(process.argv[2] ?? '.');
if (!existsSync(join(src, 'src/core/index.js'))) throw new Error('uso: node tools/bake-fx.ts <pasta do pixelfx>');
const load = (p: string) => import(pathToFileURL(join(src, p)).href);
const core = await load('src/core/index.js');
const commit = existsSync(join(src, 'COMMIT')) ? readFileSync(join(src, 'COMMIT'), 'utf8').trim() : 'desconhecido';

/** Efeitos usados, com o ritmo da folha (os longos a 15 quadros por segundo, para pesar menos). */
const EFFECTS: { key: string; file: string; fps: number; opts?: Record<string, unknown>; semCorpo?: boolean }[] = [
  { key: 'faisca', file: 'impacts/hit-spark', fps: 30 },
  { key: 'pancada', file: 'impacts/blunt-hit', fps: 30 },
  { key: 'espada', file: 'melee/sword-slash', fps: 30 },
  { key: 'garra', file: 'melee/claw-swipe', fps: 30 },
  { key: 'poof', file: 'spawn/poof', fps: 20 },
  { key: 'explosao', file: 'explosions/dirt-explosion', fps: 12 },
  { key: 'fogo', file: 'status/burning', fps: 15 },
  { key: 'portal', file: 'arcane/portal', fps: 15 },
  // O texto do efeito vem em inglês; a fonte do pixelfx não tem acento.
  { key: 'nivel', file: 'ui/level-up', fps: 15, opts: { text: 'NOVO NIVEL!' } },
  { key: 'moedas', file: 'ui/coin-collect', fps: 15 },
  // Etapa 5: mago, clérigo e cavaleiro.
  { key: 'mana', file: 'arcane/mana-burst', fps: 20 },
  // O "heal" pinta o corpo do boneco de demonstração (cinza, depois colorido); no jogo o curado
  // é o personagem 3D, então a folha sai só com a luz: pétalas, aro, brilhos e corações.
  { key: 'cura', file: 'holy/heal', fps: 20, semCorpo: true },
  { key: 'golpe', file: 'melee/heavy-cleave', fps: 20 },
  // Etapa 6: o morcego (sprite em laço), a alma do esqueleto levantado e a cura da bruxa.
  { key: 'morcego', file: 'critters/bat', fps: 15 },
  { key: 'alma', file: 'spawn/soul-rise', fps: 15 },
  { key: 'bloom', file: 'nature/healing-bloom', fps: 15 },
  // Etapa 14: golpes dos heróis e o cone de luz quando um herói chega ou volta.
  { key: 'giro', file: 'melee/spin-slash', fps: 20 },
  { key: 'chuva', file: 'arcane/star-fall', fps: 12 },
  { key: 'raizes', file: 'nature/root-snare', fps: 15 },
  { key: 'pisao', file: 'impacts/heavy-landing', fps: 15 },
  { key: 'bencao', file: 'holy/blessing', fps: 12 },
  // Etapa 16: festa da vitória e mundo vivo (folhas grandes a poucos quadros por segundo).
  { key: 'fogos', file: 'explosions/firework-burst', fps: 10 },
  { key: 'confete', file: 'ui/confetti', fps: 10 },
  { key: 'borboleta', file: 'critters/butterfly', fps: 12 },
  { key: 'passaro', file: 'critters/bird', fps: 12 },
  { key: 'respingo', file: 'water/splash', fps: 12 },
];

const MAX_W = 2048;

function png(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const crcT = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcT[n] = c;
  }
  const crc = (b: Buffer) => {
    let c = -1;
    for (const x of b) c = crcT[(c ^ x) & 255]! ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Carrega uma cópia do efeito com `recolor` desligado (é a função que pinta os pixels do corpo do
 * boneco). A cópia vai para uma pasta temporária, com os imports apontando para o pixelfx.
 */
const tmp = mkdtempSync(join(tmpdir(), 'reino-fx-'));
async function loadSemCorpo(file: string) {
  const path = join(src, `src/fx/${file}.js`);
  let code = readFileSync(path, 'utf8');
  code = code.replace(/from "(\.[^"]+)"/g, (_m, rel: string) => `from "${pathToFileURL(resolve(dirname(path), rel)).href}"`);
  const calls = code.split('recolor(').length - 1;
  if (calls !== 1) throw new Error(`${file}: esperava uma chamada de recolor, achei ${calls}`);
  code = code.replace(/(\n\s*)recolor\(/, '$1semCorpo(') + '\nfunction semCorpo() {}\n';
  const out = join(tmp, `${file.replace('/', '-')}.mjs`);
  writeFileSync(out, code);
  return import(pathToFileURL(out).href);
}

mkdirSync('public/assets/fx', { recursive: true });
const lines: string[] = [];
let pixels = 0;
for (const e of EFFECTS) {
  const mod = e.semCorpo ? await loadSemCorpo(e.file) : await load(`src/fx/${e.file}.js`);
  const meta = mod.meta;
  const [W, H] = meta.size as [number, number];
  const [ox, oy] = meta.origin as [number, number];
  const loop = !!meta.loop;
  const step = Math.max(1, Math.round(meta.fps / e.fps));
  const total = loop ? Math.round(meta.duration * meta.fps) : Math.floor(meta.duration * meta.fps) + 1;
  const frame = core.createFrame(W, H);
  const fx = core.createFx(mod, { x: ox, y: oy, ...(e.opts ?? {}) });
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < total; i++) {
    if (i % step === 0) {
      core.clearFrame(frame);
      fx.draw(frame);
      const rgba = new Uint8ClampedArray(W * H * 4);
      core.composite(frame, rgba, null);
      frames.push(rgba);
    }
    fx.update(1 / meta.fps);
  }
  // Recorte: a caixa que cobre tudo o que aparece em algum quadro.
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const alive: boolean[] = [];
  for (const f of frames) {
    let any = false;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (f[(y * W + x) * 4 + 3]! < 8) continue;
        any = true;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    alive.push(any);
  }
  let last = frames.length;
  if (!loop) while (last > 1 && !alive[last - 1]) last--;
  const used = frames.slice(0, last);
  // 1 px vazio em volta de cada quadro: a amostragem nunca pega o vizinho.
  const cw = x1 - x0 + 3;
  const ch = y1 - y0 + 3;
  const cols = Math.min(used.length, Math.floor(MAX_W / cw));
  const rows = Math.ceil(used.length / cols);
  const AW = cols * cw;
  const AH = rows * ch;
  const atlas = new Uint8ClampedArray(AW * AH * 4);
  used.forEach((f, i) => {
    const cx = (i % cols) * cw + 1;
    const cy = Math.floor(i / cols) * ch + 1;
    for (let y = 0; y < ch - 2; y++)
      for (let x = 0; x < cw - 2; x++) {
        const s = ((y0 + y) * W + x0 + x) * 4;
        const d = ((cy + y) * AW + cx + x) * 4;
        atlas[d] = f[s]!;
        atlas[d + 1] = f[s + 1]!;
        atlas[d + 2] = f[s + 2]!;
        atlas[d + 3] = f[s + 3]!;
      }
  });
  const file = png(AW, AH, atlas);
  writeFileSync(`public/assets/fx/${e.key}.png`, file);
  pixels += AW * AH;
  const fps = meta.fps / step;
  lines.push(
    `  /** ${meta.name} (pixelfx \`${e.file}\`). */\n  ${e.key}: { file: '${e.key}.png', w: ${AW}, h: ${AH}, cols: ${cols}, cw: ${cw}, ch: ${ch}, frames: ${used.length}, fps: ${fps}, loop: ${loop}, ox: ${ox - x0 + 1}, oy: ${oy - y0 + 1} },`,
  );
  console.log(`${e.key}: ${AW}x${AH}, ${used.length} quadros de ${cw}x${ch}, ${(file.length / 1024).toFixed(1)} KB`);
}
writeFileSync(
  'src/render/fxSheets.ts',
  `// Gerado por tools/bake-fx.ts a partir do pixelfx (commit ${commit}). Não editar à mão.
/**
 * Folhas de quadros dos efeitos (\`public/assets/fx/<chave>.png\`), pixelfx, MIT (Patch e Hugo
 * Duprez), ver LICENSES.md. Quadros de \`cw\` x \`ch\` px em \`cols\` colunas (com 1 px vazio em volta);
 * \`ox\`, \`oy\`: a origem do efeito (o chão onde ele acontece) dentro do quadro, y para baixo.
 */
export const FX_SHEETS = {
${lines.join('\n')}
} as const;

export type FxKey = keyof typeof FX_SHEETS;
`,
);
console.log(`total ${(pixels / 1e6).toFixed(2)} Mpx (${((pixels * 4) / 1024 / 1024).toFixed(1)} MB na GPU)`);
