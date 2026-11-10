/**
 * Luzes da noite (2026-11-10), no lugar das bolinhas de brilho soltas no ar. Tudo sai no próprio
 * desenho, sem luz de verdade (cada uma pesaria no iPhone):
 * - janelas acesas: o vidro das casas e as janelas do castelo brilham à noite. A arte do KayKit
 *   pinta cada parte com uma faixa de uma paleta (8 por 4); o vidro é a faixa (6, 1) e a janela do
 *   castelo, a (3, 0). Essa mesma (3, 0) é o ferro dos canhões e do carrinho, então cada modelo diz
 *   quais faixas acendem (só os da lista ganham o material aceso);
 * - lanterna dos postes e chama das tochas: o que é laranja vivo na textura deles brilha;
 * - a poça de luz quente no chão vem do mapa pintado em ground.ts (`paintLight`).
 */
import * as THREE from 'three';
import { snowy } from './season.ts';

/** 0 de dia, 1 de noite (o World3D acompanha a noite de lua e a Noite sem lua). */
export const LIGHT_U = { uNight: { value: 0 } };

const WARM = 'vec3(1.0, 0.64, 0.28)';

/**
 * Cópia do material do pack medieval com as faixas `cells` acesas à noite. `always`: todas as
 * janelas (castelo); senão umas 70% das casas acendem (sorteio fixo pela posição de cada uma).
 */
export function litWindows(base: THREE.Material, cells: [number, number][], always: boolean): THREE.Material {
  const m = base.clone();
  snowy(m);
  const snow = m.onBeforeCompile;
  const test = cells.map(([x, y]) => `(cell.x == ${x.toFixed(1)} && cell.y == ${y.toFixed(1)})`).join(' || ');
  m.onBeforeCompile = (sh, r) => {
    snow.call(m, sh, r);
    sh.uniforms.uNight = LIGHT_U.uNight;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec2 cell = floor(vMapUv * vec2(8.0, 4.0));
          float win = (${test}) ? 1.0 : 0.0;
          float on = ${always ? '1.0' : 'step(0.3, vVar)'};
          totalEmissiveRadiance += ${WARM} * win * on * uNight * 1.25;
        }`,
      );
  };
  m.customProgramCacheKey = () => `reino-janela-${cells.flat().join('')}-${always ? 1 : 0}`;
  return m;
}

/**
 * Cópia do material com a lanterna ou a chama brilhando à noite. `cells`: as faixas da paleta que
 * acendem (o vidro da lanterna é a (2, 3) do Halloween Bits); sem elas, o que é laranja vivo na
 * textura (a chama da tocha do Dungeon).
 */
export function litFlame(base: THREE.Material, key: string, cells?: [number, number][]): THREE.Material {
  const m = base.clone();
  const test = cells?.map(([x, y]) => `(cell.x == ${x.toFixed(1)} && cell.y == ${y.toFixed(1)})`).join(' || ');
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = LIGHT_U.uNight;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 t = diffuseColor.rgb;
          ${
            test
              ? `vec2 cell = floor(vMapUv * vec2(8.0, 4.0));
          float hot = (${test}) ? 1.0 : 0.0;`
              : `float hot = step(0.5, t.r) * step(0.1, t.g) * step(t.b * 2.2, t.g) * step(t.g * 1.15, t.r);`
          }
          // À noite o vidro escurece e fica o brilho laranja (somado à cor clara, saía branco).
          diffuseColor.rgb *= 1.0 - 0.6 * hot * uNight;
          totalEmissiveRadiance += vec3(1.0, 0.5, 0.14) * hot * uNight * 1.45;
        }`,
      );
  };
  m.customProgramCacheKey = () => `reino-chama-${key}`;
  return m;
}

/** O mesmo sorteio da janela acesa (vVar em season.ts), para a poça de luz sair só nas casas acesas. */
export function houseLit(x: number, z: number): boolean {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s) >= 0.3;
}
