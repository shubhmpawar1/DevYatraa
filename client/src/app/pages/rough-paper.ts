import { AfterViewInit, Component, ElementRef, OnDestroy, effect, input, output, signal, viewChild } from '@angular/core';

/** A point is [x, y, pressure] in CSS pixels relative to the canvas. */
type Pt = [number, number, number];
interface Stroke { tool: 'pen' | 'eraser'; color: string; size: number; pts: Pt[] }

const SIZES = { fine: 1.8, medium: 2.8, bold: 4 };

/**
 * Rough paper: a ruled scratch pad you can write on with mouse, finger or stylus.
 *
 * Built for fast, accurate handwriting under a timer:
 * - pointer input is handled outside Angular, so drawing never waits on change detection;
 * - every sampled point is kept (coalesced events) and joined with smooth curves;
 * - stylus pressure changes the line width, and touches are ignored while a stylus is in use (palm rejection);
 * - a stroke keeps going if the pen slides past the edge.
 * Strokes are saved per `storageKey` in this browser only.
 */
@Component({
  selector: 'app-rough-paper',
  template: `
    <div class="flex h-full flex-col overflow-hidden border border-amber-200 bg-amber-50 shadow-sm"
         [class.rounded-2xl]="!expanded()"
         [class.fixed]="expanded()" [class.inset-2]="expanded()" [class.z-50]="expanded()"
         [class.sm:inset-6]="expanded()" [class.rounded-xl]="expanded()" [class.shadow-2xl]="expanded()">
      <div class="flex flex-wrap items-center gap-1 border-b border-amber-200 px-2 py-1.5">
        <span class="mr-auto pl-1 text-xs font-semibold uppercase tracking-wider text-amber-800">Rough paper</span>
        @for (c of colors; track c) {
          <button type="button" class="h-6 w-6 rounded-full border-2 transition"
                  [style.background]="c"
                  [class.border-amber-500]="tool() === 'pen' && color() === c"
                  [class.border-transparent]="!(tool() === 'pen' && color() === c)"
                  [attr.aria-label]="'Pen ' + c" (click)="tool.set('pen'); color.set(c)"></button>
        }
        <select class="rounded-lg border border-amber-200 bg-white px-1 py-0.5 text-xs text-slate-700"
                aria-label="Pen size" [value]="size()" (change)="setSize($any($event.target).value)">
          <option value="fine">Fine</option>
          <option value="medium">Medium</option>
          <option value="bold">Bold</option>
        </select>
        <button type="button" class="rounded-lg px-2 py-1 text-xs font-medium"
                [class.bg-slate-900]="tool() === 'eraser'" [class.text-white]="tool() === 'eraser'"
                [class.text-slate-700]="tool() !== 'eraser'" (click)="tool.set('eraser')">Eraser</button>
        <button type="button" class="rounded-lg px-2 py-1 text-xs font-medium text-slate-700 hover:bg-amber-100 disabled:opacity-40"
                [disabled]="!count()" (click)="undo()" title="Undo (Ctrl/⌘+Z)">Undo</button>
        <button type="button" class="rounded-lg px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                [disabled]="!count()" (click)="clear()">Clear</button>
        <button type="button" class="rounded-lg px-2 py-1 text-xs font-medium text-slate-700 hover:bg-amber-100"
                (click)="expanded.set(!expanded())" [title]="expanded() ? 'Back beside questions (Esc)' : 'Bigger page to write on'">
          {{ expanded() ? '⤡ Shrink' : '⤢ Expand' }}
        </button>
        <button type="button" class="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-amber-100" aria-label="Close rough paper"
                (click)="expanded.set(false); closed.emit()">✕</button>
      </div>
      <div #wrap class="paper relative min-h-0 flex-1">
        <canvas #canvas class="absolute inset-0 h-full w-full touch-none select-none"
                [style.cursor]="tool() === 'eraser' ? 'cell' : 'crosshair'"></canvas>
      </div>
    </div>
    @if (expanded()) { <div class="fixed inset-0 z-40 bg-slate-900/30" (click)="expanded.set(false)"></div> }
  `,
  styles: `
    :host { display: block; height: 100%; }
    .paper {
      background-color: #fffdf5;
      background-image:
        linear-gradient(to right, transparent 39px, #fca5a5 39px, #fca5a5 40px, transparent 40px),
        repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #dbeafe 31px, #dbeafe 32px);
    }
  `,
  host: { '(document:keydown)': 'key($event)' },
})
export class RoughPaper implements AfterViewInit, OnDestroy {
  storageKey = input.required<string>();
  closed = output<void>();
  colors = ['#0f172a', '#2563eb', '#dc2626'];
  tool = signal<'pen' | 'eraser'>('pen');
  color = signal(this.colors[0]);
  size = signal<keyof typeof SIZES>(load('rough-paper:size', 'medium') as keyof typeof SIZES);
  expanded = signal(false);
  count = signal(0);

  private strokes: Stroke[] = [];
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private wrap = viewChild.required<ElementRef<HTMLDivElement>>('wrap');
  private ctx?: CanvasRenderingContext2D;
  private current: Stroke | null = null;
  private drawnUpTo = 0;
  private rect?: DOMRect;
  private penActive = false;
  private frame = 0;
  private ro?: ResizeObserver;
  private off: (() => void)[] = [];

  constructor() {
    effect(() => {
      const key = this.storageKey();
      try { this.strokes = JSON.parse(localStorage.getItem('rough-paper:' + key) || '[]'); } catch { this.strokes = []; }
      this.strokes = this.strokes.map((s) => ({ ...s, pts: s.pts.map((p) => [p[0], p[1], p[2] ?? 0.5] as Pt) }));
      this.count.set(this.strokes.length);
      this.redraw();
    });
  }

  ngAfterViewInit() {
    const c = this.canvas().nativeElement;
    this.ctx = c.getContext('2d', { desynchronized: true }) ?? c.getContext('2d')!;
    // Native listeners: no Angular change detection on every pen movement.
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      t.addEventListener(type, fn as EventListener, { passive: false });
      this.off.push(() => t.removeEventListener(type, fn as EventListener));
    };
    on(c, 'pointerdown', (e) => this.down(e));
    on(c, 'pointermove', (e) => this.move(e));
    on(c, 'pointerup', (e) => this.up(e));
    on(c, 'pointercancel', (e) => this.up(e));
    on(c, 'contextmenu', (e) => e.preventDefault());
    this.ro = new ResizeObserver(() => this.redraw());
    this.ro.observe(this.wrap().nativeElement);
  }

  ngOnDestroy() {
    this.ro?.disconnect();
    this.off.forEach((f) => f());
    cancelAnimationFrame(this.frame);
  }

  setSize(s: keyof typeof SIZES) {
    this.size.set(s);
    try { localStorage.setItem('rough-paper:size', s); } catch { /* ignore */ }
  }

  undo() { this.strokes.pop(); this.changed(); this.redraw(); }
  clear() { this.strokes = []; this.changed(); this.redraw(); }

  key(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.expanded()) this.expanded.set(false);
    const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]');
    if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && this.count() && (this.expanded() || this.hovering())) {
      e.preventDefault();
      this.undo();
    }
  }

  private hovering() { return this.wrap().nativeElement.matches(':hover'); }

  private down(e: PointerEvent) {
    if (e.pointerType === 'pen') this.penActive = true;
    if (e.pointerType === 'touch' && this.penActive) return; // palm rejection
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.current) return;
    e.preventDefault();
    this.canvas().nativeElement.setPointerCapture(e.pointerId);
    this.rect = this.canvas().nativeElement.getBoundingClientRect();
    const eraser = this.tool() === 'eraser';
    this.current = { tool: this.tool(), color: this.color(), size: eraser ? 24 : SIZES[this.size()], pts: [this.pt(e)] };
    this.strokes.push(this.current);
    this.drawnUpTo = 0;
    this.schedule();
  }

  private move(e: PointerEvent) {
    if (!this.current) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents?.() ?? [];
    for (const ev of evs.length ? evs : [e]) this.current.pts.push(this.pt(ev));
    this.schedule();
  }

  private up(e: PointerEvent) {
    if (!this.current) return;
    this.current.pts.push(this.pt(e));
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.drawLive(true);
    this.current = null;
    this.changed();
  }

  private changed() {
    this.count.set(this.strokes.length);
    try { localStorage.setItem('rough-paper:' + this.storageKey(), JSON.stringify(this.strokes)); } catch { /* storage full or blocked */ }
  }

  private pt(e: PointerEvent): Pt {
    const r = this.rect!;
    // Mouse and touch report a fixed 0.5 (or 0 / 1); only a real stylus varies.
    const p = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
    return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10, Math.round(p * 100) / 100];
  }

  /** Draw once per animation frame, however many points arrived. */
  private schedule() {
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.drawLive(false); });
  }

  private drawLive(final: boolean) {
    if (!this.ctx || !this.current) return;
    this.drawnUpTo = this.drawStroke(this.ctx, this.current, this.drawnUpTo, final);
  }

  private redraw() {
    const c = this.canvas?.()?.nativeElement;
    if (!c || !this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    if (!width || !height) return;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, width, height);
    for (const s of this.strokes) this.drawStroke(this.ctx, s, 0, true);
    if (this.current) this.drawnUpTo = this.drawStroke(this.ctx, this.current, 0, false);
  }

  /**
   * Draws a stroke as smooth quadratic curves through the midpoints of its samples.
   * Segment i runs from mid(p[i-1], p[i]) to mid(p[i], p[i+1]) with p[i] as the control point.
   * Returns the next segment index to draw, so a live stroke can be drawn in pieces.
   */
  private drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, from: number, final: boolean): number {
    const p = s.pts;
    const n = p.length;
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = s.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const w = (pr: number) => (s.tool === 'eraser' ? s.size : s.size * (0.55 + pr * 0.9));
    const mid = (a: Pt, b: Pt): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

    if (final && n <= 2 && Math.hypot(p[n - 1][0] - p[0][0], p[n - 1][1] - p[0][1]) < 1) {
      // A tap: draw a dot (decimal points, dots on i).
      ctx.beginPath();
      ctx.arc(p[0][0], p[0][1], w(p[0][2]) / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      let i = Math.max(from, 0);
      for (; i < n - 1; i++) {
        const start = i === 0 ? [p[0][0], p[0][1]] : mid(p[i - 1], p[i]);
        const end = mid(p[i], p[i + 1]);
        ctx.lineWidth = w(p[i][2]);
        ctx.beginPath();
        ctx.moveTo(start[0], start[1]);
        ctx.quadraticCurveTo(p[i][0], p[i][1], end[0], end[1]);
        ctx.stroke();
      }
      if (final && n > 1) {
        const start = mid(p[n - 2], p[n - 1]);
        ctx.lineWidth = w(p[n - 1][2]);
        ctx.beginPath();
        ctx.moveTo(start[0], start[1]);
        ctx.lineTo(p[n - 1][0], p[n - 1][1]);
        ctx.stroke();
      }
      from = i;
    }
    ctx.globalCompositeOperation = 'source-over';
    return from;
  }
}

function load(key: string, fallback: string) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
