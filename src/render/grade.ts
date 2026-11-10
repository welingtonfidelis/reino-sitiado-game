/**
 * Luz de cinema barata (2026-11-10). A primeira versão passava a cena por pós-processamento (sombra
 * de contato, bloom e acerto de cor) e ficou pesada demais: no Mac, em tela retina, de 12 para
 * 60 ms por quadro. Agora tudo sai no próprio desenho de cada material, sem passada a mais:
 * - o ajuste de tom é o ACES do Three seguido de um acerto de cor (mais cor, claros quentes e
 *   sombras frias), como "CustomToneMapping";
 * - a sombra de contato é pintada no chão (ground.ts, `paintShade`).
 */
import * as THREE from 'three';

const GRADE = /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  vec3 c = ACESFilmicToneMapping( color );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( l ), c, 1.14 );
  c *= mix( vec3( 1.0 ), vec3( 1.035, 1.0, 0.95 ), smoothstep( 0.25, 0.8, l ) );
  c += vec3( 0.0, 0.006, 0.018 ) * ( 1.0 - smoothstep( 0.0, 0.3, l ) );
  return clamp( c, 0.0, 1.0 );
}`;

/** Troca o "CustomToneMapping" do Three pelo acerto de cor (uma vez, antes de compilar material). */
export function installGrade(): void {
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  if (chunk.includes('1.035, 1.0, 0.95')) return;
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace('vec3 CustomToneMapping( vec3 color ) { return color; }', GRADE);
}
