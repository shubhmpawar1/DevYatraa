import { AfterViewInit, Component, ElementRef, OnDestroy, effect, input, signal, viewChild } from '@angular/core';

interface Stroke { tool: 'pen' | 'eraser'; color: string; size: number; pts: [number, number][] }

/**
 * Rough paper: a ruled scratch pad you can draw on with mouse, finger or stylus.
 * Strokes are saved per `storageKey` in this browser only, so the working survives a reload.
 */
@Component({
  selector: 'app-rough-paper',
  template: `
    <div class="flex h-full flex-col overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60">
      <div class="flex flex-wrap items-center gap-1 border-b border-amber-200 px-2 py-1.5">
        <span class="mr-auto pl-1 text-xs font-semibold uppercase tracking-wider text-amber-800">Rough paper</span>
        @for (c of colors; track c) {
          <button type="button" class="h-6 w-6 rounded-full border-2 transition"
                  [style.background]="c"
                  [class.border-slate-900]="tool() === 'pen' && color() === c"
                  [class.border-transparent]="!(tool() === 'pen' && color() === c)"
                  [attr.aria-label]="'Pen ' + c" (click)="tool.set('pen'); color.set(c)"></button>
        }
        <button type="button" class="rounded-lg px-2 py-1 text-xs font-medium"
                [class.bg-slate-900]="tool() === 'eraser'" [class.text-white]="tool() === 'eraser'"
                [class.text-slate-700]="tool() !== 'eraser'" (click)="tool.set('eraser')">Eraser</button>
        <button type="button" class="rounded-lg px-2 py-1 text-xs font-medium text-slate-700 hover:bg-amber-100 disabled:opacity-40"
                [disabled]="!strokes.length" (click)="undo()">Undo</button>
        <button type="button" class="rounded-lg px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                [disabled]="!strokes.length" (click)="clear()">Clear</button>
      </div>
      <div #wrap class="paper relative min-h-0 flex-1">
        <canvas #canvas class="absolute inset-0 h-full w-full touch-none"
                [style.cursor]="tool() === 'eraser' ? 'cell' : 'crosshair'"
                (pointerdown)="down($event)" (pointermove)="move($event)"
                (pointerup)="up()" (pointercancel)="up()" (pointerleave)="up()"></canvas>
      </div>
    </div>
  `,
  styles: `
    .paper {
      background-color: #fffdf5;
      background-image:
        linear-gradient(to right, transparent 39px, #fca5a5 39px, #fca5a5 40px, transparent 40px),
        repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #dbeafe 27px, #dbeafe 28px);
    }
  `,
})
export class RoughPaper implements AfterViewInit, OnDestroy {
  storageKey = input.required<string>();
  colors = ['#0f172a', '#2563eb', '#dc2626'];
  tool = signal<'pen' | 'eraser'>('pen');
  color = signal(this.colors[0]);
  strokes: Stroke[] = [];

  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private wrap = viewChild.required<ElementRef<HTMLDivElement>>('wrap');
  private current: Stroke | null = null;
  private ro?: ResizeObserver;

  constructor() {
    effect(() => {
      const key = this.storageKey();
      try { this.strokes = JSON.parse(localStorage.getItem(this.key(key)) || '[]'); } catch { this.strokes = []; }
      this.redraw();
    });
  }

  ngAfterViewInit() {
    this.ro = new ResizeObserver(() => this.redraw());
    this.ro.observe(this.wrap().nativeElement);
  }

  ngOnDestroy() { this.ro?.disconnect(); }

  down(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const eraser = this.tool() === 'eraser';
    this.current = { tool: this.tool(), color: this.color(), size: eraser ? 22 : 2.2, pts: [this.pt(e)] };
    this.strokes.push(this.current);
    this.drawStroke(this.ctx(), this.current);
  }

  move(e: PointerEvent) {
    if (!this.current) return;
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events.length ? events : [e]) this.current.pts.push(this.pt(ev));
    this.drawStroke(this.ctx(), this.current, Math.max(0, this.current.pts.length - events.length - 1));
  }

  up() {
    if (!this.current) return;
    this.current = null;
    this.save();
  }

  undo() { this.strokes.pop(); this.save(); this.redraw(); }
  clear() { this.strokes = []; this.save(); this.redraw(); }

  private key(k: string) { return 'rough-paper:' + k; }

  private save() {
    try { localStorage.setItem(this.key(this.storageKey()), JSON.stringify(this.strokes)); } catch { /* storage full or blocked */ }
  }

  /** Points are stored in CSS pixels relative to the canvas, rounded to keep storage small. */
  private pt(e: PointerEvent): [number, number] {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10];
  }

  private ctx() {
    const ctx = this.canvas().nativeElement.getContext('2d')!;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }

  private redraw() {
    const c = this.canvas?.()?.nativeElement;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = this.ctx();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const s of this.strokes) this.drawStroke(ctx, s);
  }

  private drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, from = 0) {
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.size;
    const p = s.pts;
    if (p.length === 1) {
      ctx.beginPath();
      ctx.arc(p[0][0], p[0][1], s.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(p[from][0], p[from][1]);
      for (let i = from + 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
