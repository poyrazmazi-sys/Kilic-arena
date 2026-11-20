/** One set of controls for keyboard and mouse, gamepads and touch. Edge-triggered buttons are consumed once per frame. */
export interface Cmd { mx: number; my: number; light: boolean; heavy: boolean; block: boolean; dodge: boolean; lookX: number; lookY: number; cam: boolean; view: boolean; device: 'kb' | 'pad' | 'touch' }

export class Input {
  private keys = new Set<string>(); private mouse = { l: false, r: false }; private edges = new Set<string>();
  private look = { x: 0, y: 0 }; private touchMove = { x: 0, y: 0 }; private touchHeld = new Set<string>();
  private padPrev: boolean[] = []; device: Cmd['device'] = 'kb'; padName = '';

  constructor(private canvas: HTMLElement) {
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!this.keys.has(e.code)) this.edges.add(e.code); this.keys.add(e.code); this.device = 'kb';
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mouse.l = true; this.edges.add('Mouse0'); } if (e.button === 2) this.mouse.r = true; if (e.button === 1) this.edges.add('Mouse1'); this.device = 'kb'; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousemove', (e) => { if (e.buttons & 1 || e.buttons & 2 || document.pointerLockElement) { this.look.x += e.movementX; this.look.y += e.movementY; } });
  }

  /** Touch: a floating stick on the left half, look by dragging on the right, and action buttons. */
  bindTouch(stick: HTMLElement, knob: HTMLElement, buttons: Record<string, HTMLElement>) {
    let id = -1, ox = 0, oy = 0, lookId = -1, lx = 0, ly = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault(); this.device = 'touch';
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < innerWidth * 0.45 && id < 0) { id = t.identifier; ox = t.clientX; oy = t.clientY; stick.style.display = 'block'; stick.style.left = `${ox - 60}px`; stick.style.top = `${oy - 60}px`; }
        else if (lookId < 0) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === id) { let x = (t.clientX - ox) / 55, y = (t.clientY - oy) / 55; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } this.touchMove.x = x; this.touchMove.y = -y; knob.style.transform = `translate(${x * 36}px,${y * 36}px)`; }
        if (t.identifier === lookId) { this.look.x += (t.clientX - lx) * 1.6; this.look.y += (t.clientY - ly) * 1.6; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: false });
    const end = (e: TouchEvent) => { for (const t of Array.from(e.changedTouches)) { if (t.identifier === id) { id = -1; this.touchMove.x = this.touchMove.y = 0; stick.style.display = 'none'; knob.style.transform = ''; } if (t.identifier === lookId) lookId = -1; } };
    this.canvas.addEventListener('touchend', end); this.canvas.addEventListener('touchcancel', end);
    for (const [name, el] of Object.entries(buttons)) {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.device = 'touch'; this.touchHeld.add(name); this.edges.add('T' + name); el.classList.add('on'); }, { passive: false });
      const up = (e: Event) => { e.preventDefault(); this.touchHeld.delete(name); el.classList.remove('on'); };
      el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
    }
  }

  read(): Cmd {
    const k = this.keys, e = this.edges;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let my = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let light = e.has('Mouse0') || e.has('KeyJ') || e.has('Tlight');
    let heavy = e.has('KeyK') || e.has('KeyE') || e.has('Mouse1') || e.has('Theavy') || (e.has('Mouse0') && (k.has('ShiftLeft') || k.has('ShiftRight')));
    if (heavy) light = false;
    let block = this.mouse.r || k.has('KeyL') || k.has('KeyQ') || this.touchHeld.has('block');
    let dodge = e.has('Space') || e.has('Tdodge');
    let cam = e.has('KeyC') || e.has('Tcam'); let view = e.has('KeyV') || e.has('Tview');
    let lookX = this.look.x, lookY = this.look.y;
    mx += this.touchMove.x; my += this.touchMove.y;
    // gamepad (standard mapping): stick moves, X/Square light, Y/Triangle heavy, LB/LT/RB block, A/Cross dodge, B/Circle dodge, View/Select camera
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) as Gamepad[] : [];
    const p = pads[0];
    if (p) {
      const b = (i: number) => !!p.buttons[i]?.pressed, edge = (i: number) => b(i) && !this.padPrev[i];
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      const ax = dz(p.axes[0] ?? 0), ay = dz(p.axes[1] ?? 0), rx = dz(p.axes[2] ?? 0), ry = dz(p.axes[3] ?? 0);
      if (ax || ay || p.buttons.some((x) => x.pressed)) { this.device = 'pad'; this.padName = p.id; }
      mx += ax; my -= ay; lookX += rx * 14; lookY += ry * 10;
      light ||= edge(2) || edge(7); heavy ||= edge(3); block ||= b(4) || b(5) || b(6); dodge ||= edge(0) || edge(1); cam ||= edge(8); view ||= edge(10) || edge(11);
      this.padPrev = p.buttons.map((x) => x.pressed);
    }
    this.edges.clear(); this.look.x = this.look.y = 0;
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    return { mx, my, light, heavy, block, dodge, lookX, lookY, cam, view, device: this.device };
  }
}
