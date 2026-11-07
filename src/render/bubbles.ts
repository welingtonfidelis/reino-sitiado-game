/**
 * Etapa 17: balões de ícone no mundo, para quem ainda não lê. Um balão claro com o desenho do
 * recurso: riscado em vermelho em cima do prédio que ficou sem (serraria sem floresta, pedreira
 * sem rocha, mina sem veio) e inteiro, por alguns segundos, em cima do recurso que acabou de
 * brotar. Os desenhos são feitos em canvas na hora (sem arquivo).
 */
import * as THREE from 'three';

export type BubbleIcon = 'arvore' | 'pedra' | 'ferro' | 'cristal' | 'trigo' | 'semMadeira' | 'semPedra' | 'semFerro' | 'semComida';

const PX = 128;

function draw(icon: BubbleIcon): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const g = c.getContext('2d')!;
  // Balão: círculo claro com contorno escuro e um biquinho embaixo.
  g.fillStyle = '#fff8ea';
  g.strokeStyle = '#3b2a1c';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(52, 104);
  g.lineTo(64, 124);
  g.lineTo(76, 104);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(64, 58, 50, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff8ea';
  g.fillRect(54, 100, 20, 8);
  const base = icon === 'semMadeira' ? 'arvore' : icon === 'semPedra' ? 'pedra' : icon === 'semFerro' ? 'ferro' : icon === 'semComida' ? 'trigo' : icon;
  g.lineJoin = 'round';
  if (base === 'arvore') {
    g.fillStyle = '#7a4a26';
    g.fillRect(58, 70, 12, 22);
    g.fillStyle = '#3f9a3a';
    g.strokeStyle = '#24561f';
    g.lineWidth = 4;
    for (const [y, w] of [
      [26, 22],
      [42, 30],
      [58, 36],
    ]) {
      g.beginPath();
      g.moveTo(64, y!);
      g.lineTo(64 + w!, y! + 26);
      g.lineTo(64 - w!, y! + 26);
      g.closePath();
      g.fill();
      g.stroke();
    }
  } else if (base === 'pedra' || base === 'ferro') {
    g.fillStyle = base === 'ferro' ? '#6d6f78' : '#9a9a9e';
    g.strokeStyle = '#3f3f46';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(30, 84);
    g.lineTo(38, 52);
    g.lineTo(60, 36);
    g.lineTo(86, 44);
    g.lineTo(100, 70);
    g.lineTo(94, 86);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = base === 'ferro' ? '#c98a4a' : '#c4c4c8';
    for (const [x, y, r] of base === 'ferro'
      ? [
          [52, 62, 7],
          [74, 56, 6],
          [70, 76, 6],
        ]
      : [[54, 52, 6]]) {
      g.beginPath();
      g.arc(x!, y!, r!, 0, Math.PI * 2);
      g.fill();
    }
  } else if (base === 'trigo') {
    // Espiga de trigo: talo verde, folhas e os grãos dourados em cima.
    g.strokeStyle = '#4f8a34';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(64, 96);
    g.lineTo(64, 40);
    g.moveTo(64, 78);
    g.quadraticCurveTo(46, 70, 42, 58);
    g.moveTo(64, 70);
    g.quadraticCurveTo(82, 62, 86, 50);
    g.stroke();
    g.fillStyle = '#e2b53e';
    g.strokeStyle = '#8a6a1c';
    g.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      for (const side of [-1, 1]) {
        g.beginPath();
        g.ellipse(64 + side * 7, 46 - k * 8, 6, 9, side * 0.5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
    g.beginPath();
    g.ellipse(64, 16, 5, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else if (base === 'cristal') {
    g.fillStyle = '#5ab4f0';
    g.strokeStyle = '#1f5a8a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(64, 22);
    g.lineTo(88, 56);
    g.lineTo(64, 94);
    g.lineTo(40, 56);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#bfe6ff';
    g.beginPath();
    g.moveTo(64, 30);
    g.lineTo(74, 54);
    g.lineTo(64, 60);
    g.closePath();
    g.fill();
  }
  if (icon.startsWith('sem')) {
    // Riscado: círculo vermelho com a barra atravessada.
    g.strokeStyle = '#d2342a';
    g.lineWidth = 9;
    g.beginPath();
    g.arc(64, 58, 38, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(37, 31);
    g.lineTo(91, 85);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SIZE = 1.25;

export class Bubbles {
  private scene: THREE.Scene;
  private mats = new Map<BubbleIcon, THREE.SpriteMaterial>();
  /** Balões presos a um prédio (some quando o prédio sai da lista). */
  private fixed = new Map<number, { sprite: THREE.Sprite; icon: BubbleIcon }>();
  /** Balões que somem sozinhos (recurso novo). */
  private flashes: { sprite: THREE.Sprite; t0: number; life: number; y: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private mat(icon: BubbleIcon): THREE.SpriteMaterial {
    let m = this.mats.get(icon);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: draw(icon), depthTest: false, transparent: true });
      this.mats.set(icon, m);
    }
    return m;
  }

  private sprite(icon: BubbleIcon): THREE.Sprite {
    const s = new THREE.Sprite(this.mat(icon));
    s.scale.setScalar(SIZE);
    s.center.set(0.5, 0);
    s.renderOrder = 20;
    this.scene.add(s);
    return s;
  }

  /** Balão por alguns segundos (sobe um pouco e some no fim). */
  flash(icon: BubbleIcon, x: number, y: number, z: number, now: number, life: number): void {
    const sprite = this.sprite(icon);
    sprite.position.set(x, y, z);
    sprite.material = this.mat(icon).clone();
    this.flashes.push({ sprite, t0: now, life, y });
  }

  /** Balões dos prédios: cria, move, troca e tira conforme a lista; anima os de passagem. */
  sync(want: Map<number, { icon: BubbleIcon; x: number; y: number; z: number }>, now: number): void {
    for (const [id, f] of this.fixed) {
      const w = want.get(id);
      if (w && w.icon === f.icon) continue;
      this.scene.remove(f.sprite);
      this.fixed.delete(id);
    }
    for (const [id, w] of want) {
      let f = this.fixed.get(id);
      if (!f) {
        f = { sprite: this.sprite(w.icon), icon: w.icon };
        this.fixed.set(id, f);
      }
      // Balança devagar para chamar a atenção.
      f.sprite.position.set(w.x, w.y + Math.sin(now * 3 + id) * 0.08, w.z);
    }
    this.flashes = this.flashes.filter((f) => {
      const k = (now - f.t0) / f.life;
      if (k >= 1) {
        this.scene.remove(f.sprite);
        f.sprite.material.dispose();
        return false;
      }
      f.sprite.position.y = f.y + Math.min(1, k * 4) * 0.4 + Math.sin(now * 3) * 0.06;
      f.sprite.material.opacity = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, k * 6);
      return true;
    });
  }
}
