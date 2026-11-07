import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Api, errMsg } from '../core/api';

@Component({
  selector: 'app-dsa',
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">DSA tracker</h1>
        <p class="mt-1 text-sm text-slate-500">Problems grouped by pattern. Solve in JavaScript, without AI. The curated list grows toward about 300 with each content batch.</p>
      </div>
      @if (data(); as d) {
        <div class="card !py-3 text-right">
          <p class="text-xs text-slate-500">Solved</p>
          <p class="text-2xl font-bold text-slate-900">{{ solved() }} <span class="text-sm font-medium text-slate-400">/ your goal {{ d.target }}</span></p>
        </div>
      }
    </div>
    @if (error()) { <p class="error-box mt-4">{{ error() }}</p> }
    <div class="mt-6 grid gap-4 md:grid-cols-2">
      @for (g of groups(); track g.pattern) {
        <section class="card">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-slate-900">{{ g.pattern }}</h2>
            <span class="text-xs text-slate-400">{{ g.solved }}/{{ g.items.length }}</span>
          </div>
          <ul class="mt-3 divide-y divide-slate-100">
            @for (p of g.items; track p.id) {
              <li class="flex items-center gap-2 py-2">
                <button class="grid h-5 w-5 shrink-0 place-items-center rounded border text-xs"
                        [class]="p.status === 'solved' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'"
                        (click)="set(p, p.status === 'solved' ? null : 'solved')" [attr.aria-label]="'Mark ' + p.title + ' solved'">
                  @if (p.status === 'solved') { ✓ }
                </button>
                <a [href]="p.url" target="_blank" rel="noopener" class="min-w-0 flex-1 truncate text-sm text-slate-800 hover:text-brand-700">{{ p.title }}</a>
                <span class="chip" [class]="p.difficulty === 'Easy' ? 'bg-emerald-50 text-emerald-700' : p.difficulty === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'">{{ p.difficulty }}</span>
                <button class="chip" [class]="p.status === 'revisit' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500'"
                        (click)="set(p, p.status === 'revisit' ? null : 'revisit')" title="Mark to revisit on revision days">↻</button>
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class Dsa implements OnInit {
  private api = inject(Api);
  data = signal<any>(null);
  error = signal('');

  solved = computed(() => (this.data()?.problems ?? []).filter((p: any) => p.status === 'solved').length);
  groups = computed(() => {
    const out: { pattern: string; items: any[]; solved: number }[] = [];
    for (const p of this.data()?.problems ?? []) {
      let g = out.find((x) => x.pattern === p.pattern);
      if (!g) { g = { pattern: p.pattern, items: [], solved: 0 }; out.push(g); }
      g.items.push(p);
      if (p.status === 'solved') g.solved++;
    }
    return out;
  });

  async ngOnInit() {
    try { this.data.set(await this.api.get('/dsa')); } catch (e) { this.error.set(errMsg(e)); }
  }

  async set(p: any, status: string | null) {
    const prev = p.status;
    this.patch(p.id, status);
    try { await this.api.put(`/dsa/${p.id}`, { status }); } catch (e) { this.patch(p.id, prev); this.error.set(errMsg(e)); }
  }

  private patch(id: string, status: string | null) {
    this.data.update((d) => ({ ...d, problems: d.problems.map((x: any) => (x.id === id ? { ...x, status } : x)) }));
  }
}
