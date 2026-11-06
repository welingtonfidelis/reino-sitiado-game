import { mkdirSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Recebe capturas do canvas (data URL de PNG) e grava em reports/snap-<nome>.png. Serve para
 * fotografar o jogo com o painel do navegador oculto. Só no servidor de desenvolvimento.
 */
function snapReceiver(): Plugin {
  return {
    name: 'snap-receiver',
    configureServer(server) {
      server.middlewares.use('/__snap', (req, res) => {
        const name = (new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'snap').replace(/[^a-z0-9-]/gi, '');
        if (req.method !== 'POST' || !name) {
          res.statusCode = 400;
          return res.end();
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > 12 * 1024 * 1024) req.destroy();
          else chunks.push(c);
        });
        req.on('end', () => {
          const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(Buffer.concat(chunks).toString('utf8'));
          if (!m) {
            res.statusCode = 400;
            return res.end();
          }
          mkdirSync('reports', { recursive: true });
          writeFileSync(`reports/snap-${name}.png`, Buffer.from(m[1]!, 'base64'));
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [snapReceiver()],
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
});
