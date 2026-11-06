/**
 * Câmera ortográfica em ângulo isométrico (o "2.5D"). Um dedo ou o mouse arrasta o mapa,
 * pinça ou roda dá zoom. Toque sem arrastar vira `onTap`; mouse parado em cima vira
 * `onHover` (para o fantasma de construção no computador).
 */
import * as THREE from 'three';

export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  target = new THREE.Vector3(0, 0, 1);
  /** Altura da vista em metros (menor = mais perto). */
  view = 24;
  minView = 9;
  maxView = 46;
  yaw = Math.PI / 6;
  pitch = 0.82;
  bound = 24;
  onTap: ((x: number, y: number) => void) | null = null;
  onHover: ((x: number, y: number) => void) | null = null;
  /** Arrastar de um dedo desenha caixa de seleção em vez de mover o mapa (Shift no mouse). */
  boxMode = false;
  onBox: ((phase: 'move' | 'end', x0: number, y0: number, x1: number, y1: number) => void) | null = null;
  private box: { x: number; y: number } | null = null;
  private el: HTMLElement;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  private pinch: number | null = null;
  private moved = false;
  private aspect = 1;

  constructor(el: HTMLElement) {
    this.el = el;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
  }

  resize(w: number, h: number): void {
    this.aspect = w / Math.max(1, h);
    // Celular em pé: mostra um pouco mais de altura para caber o castelo e as muralhas.
    if (this.aspect < 0.8 && this.view === 24) this.view = 30;
    this.apply();
  }

  apply(): void {
    const v = this.view;
    const c = this.camera;
    c.top = v / 2;
    c.bottom = -v / 2;
    c.left = (-v * this.aspect) / 2;
    c.right = (v * this.aspect) / 2;
    c.updateProjectionMatrix();
    const d = 120;
    c.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * d,
      Math.sin(this.pitch) * d,
      this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * d,
    );
    c.lookAt(this.target);
    c.updateMatrixWorld();
  }

  /** Metros do chão por pixel de tela. */
  private perPixel(): number {
    return this.view / Math.max(1, this.el.clientHeight);
  }

  private panBy(dx: number, dy: number): void {
    const k = this.perPixel();
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    // Na vista inclinada, um pixel na vertical anda mais no chão.
    this.target.addScaledVector(right, -dx * k);
    this.target.addScaledVector(fwd, (dy * k) / Math.sin(this.pitch));
    const r = Math.hypot(this.target.x, this.target.z);
    if (r > this.bound) this.target.multiplyScalar(this.bound / r);
    this.apply();
  }

  zoomBy(f: number): void {
    this.view = Math.min(this.maxView, Math.max(this.minView, this.view * f));
    this.apply();
  }

  private down = (e: PointerEvent): void => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (this.pointers.size === 1) {
      this.moved = false;
      this.box = this.boxMode || e.shiftKey ? { x: e.clientX, y: e.clientY } : null;
    } else this.box = null;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.moved = true;
    }
  };

  private move = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.onHover?.(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (d > 0) this.zoomBy(this.pinch / d);
      this.pinch = d;
      return;
    }
    if (!this.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) this.moved = true;
    if (this.box) {
      if (this.moved) this.onBox?.('move', this.box.x, this.box.y, e.clientX, e.clientY);
      return;
    }
    if (this.moved) this.panBy(dx, dy);
    else if (e.pointerType === 'mouse') this.onHover?.(e.clientX, e.clientY);
  };

  private up = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.box && p) {
      const b = this.box;
      this.box = null;
      if (this.moved) {
        this.onBox?.('end', b.x, b.y, e.clientX, e.clientY);
        return;
      }
    }
    if (p && !this.moved && this.pointers.size === 0 && e.type === 'pointerup') this.onTap?.(e.clientX, e.clientY);
  };

  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoomBy(Math.exp(e.deltaY * 0.0015));
  };

  /** Ponto do chão (y = 0) sob o pixel da tela. */
  groundAt(x: number, y: number): THREE.Vector3 | null {
    const r = this.el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? hit : null;
  }

  raycaster(x: number, y: number): THREE.Raycaster {
    const r = this.el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray;
  }

  /** Pixel da tela de um ponto do mundo. */
  toScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.el.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }
}
