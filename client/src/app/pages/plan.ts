import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, errMsg } from '../core/api';

@Component({
  selector: 'app-plan',
  template: `
    <h1 class="text-2xl font-bold text-slate-900">Your plan</h1>
    @if (p(); as p) {
      <p class="mt-1 text-sm text-slate-500">{{ p.track }}-month track · {{ p.restDayName }} off · dates are targets and move forward if you miss a day.</p>

      <div class="mt-4 inline-flex rounded-xl bg-slate-100 p-1 text-sm">
        <button type="button" class="rounded-lg px-3 py-1.5 font-medium" [class]="view() === 'calendar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'" (click)="setView('calendar')">Day by day</button>
        <button type="button" class="rounded-lg px-3 py-1.5 font-medium" [class]="view() === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'" (click)="setView('grid')">Lesson grid</button>
      </div>

      @if (view() === 'calendar') {
        @if (s(); as s) {
          @if (p.track !== 6) {
            <p class="mt-3 text-xs text-slate-500">On the {{ p.track }}-month track each lesson takes about {{ p.track === 9 ? '1.5' : '2' }} days, so a lesson's parts are spread across dates.</p>
          }
          <div class="mt-4 space-y-6">
            @for (w of visibleWeeks(); track w.label) {
              <section>
                <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{{ w.label }}</h2>
                <div class="space-y-2">
                  @for (d of w.dates; track d.date) {
                    <div class="card !p-0 overflow-hidden" [class.ring-2]="d.date === s.today" [class.ring-brand-300]="d.date === s.today">
                      <div class="flex flex-col sm:flex-row">
                        <div class="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3 sm:w-36 sm:flex-col sm:items-start sm:gap-0 sm:border-b-0 sm:border-r">
                          <span class="text-xs font-medium text-slate-400">{{ dow(d.date) }}</span>
                          <span class="text-lg font-bold text-slate-900">{{ short(d.date) }}</span>
                          @if (d.date === s.today) { <span class="chip bg-brand-50 text-brand-700 sm:mt-1">Today</span> }
                        </div>
                        <div class="flex-1 px-4 py-3">
                          @if (d.rest) {
                            <p class="text-sm text-slate-500">🌿 Rest day</p>
                          } @else {
                            <ul class="space-y-2">
                              @for (task of d.tasks; track $index) {
                                <li>
                                  <button type="button" class="flex w-full items-start gap-3 text-left disabled:cursor-default" [disabled]="!canOpen(task.day)" (click)="openDay(task.day)">
                                    <span class="chip mt-0.5 shrink-0 w-20 justify-center" [class]="kindClass(task.kind)">{{ kindName(task.kind) }}</span>
                                    <span class="min-w-0">
                                      <span class="block text-sm font-medium text-slate-800">Day {{ task.day }} · {{ task.label }}</span>
                                      @if (task.detail) { <span class="block text-xs text-slate-500">{{ task.detail }}</span> }
                                    </span>
                                  </button>
                                </li>
                              }
                            </ul>
                          }
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </section>
            }
          </div>
          @if (shownWeeks() < weeks().length) {
            <button type="button" class="btn-secondary mt-4" (click)="shownWeeks.set(shownWeeks() + 4)">Show next 4 weeks</button>
          }
        }
      } @else {
      <div class="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <span class="flex items-center gap-1"><span class="h-3 w-3 rounded bg-emerald-500"></span> Completed</span>
        <span class="flex items-center gap-1"><span class="h-3 w-3 rounded bg-emerald-200"></span> Skipped (tested)</span>
        <span class="flex items-center gap-1"><span class="h-3 w-3 rounded bg-brand-600"></span> Current</span>
        <span class="flex items-center gap-1"><span class="h-3 w-3 rounded border border-slate-300 bg-white"></span> Written</span>
        <span class="flex items-center gap-1"><span class="h-3 w-3 rounded bg-slate-100"></span> Coming in a later batch</span>
      </div>

      <div class="mt-6 space-y-6">
        @for (ph of phases(); track ph.phase) {
          <section class="card">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="font-semibold text-slate-900">Phase {{ ph.phase }}: {{ ph.title }}</h2>
              <span class="text-xs text-slate-400">Weeks {{ ph.weeks[0] }}–{{ ph.weeks[1] }}</span>
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5 text-xs">
              @for (b of ph.build; track b) { <span class="chip bg-slate-100 text-slate-600">{{ b }}</span> }
            </div>
            <p class="mt-2 text-xs text-slate-500">DSA: {{ ph.dsa.join(', ') }} · Aptitude: {{ ph.aptitude.join(', ') }}</p>
            <div class="mt-4 space-y-2">
              @for (w of ph.weekList; track w.week) {
                <div class="flex items-center gap-3">
                  <span class="w-14 shrink-0 text-xs font-medium text-slate-500">Week {{ w.week }}</span>
                  <div class="grid flex-1 grid-cols-6 gap-1.5">
                    @for (day of w.days; track day.day) {
                      <button type="button" [title]="tip(day)" [disabled]="!day.title || (day.status === 'upcoming')"
                              (click)="open(day)"
                              class="flex h-10 flex-col items-center justify-center rounded-lg text-[11px] leading-tight transition disabled:cursor-default"
                              [class]="cellClass(day)">
                        <span class="font-semibold">{{ day.day }}</span>
                        @if (day.date) { <span class="opacity-75">{{ day.status === 'completed' || day.status === 'skipped_tested' ? '' : 'by ' }}{{ short(day.date) }}</span> }
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          </section>
        }
      </div>
      }
    }
    @if (error()) { <p class="error-box mt-4">{{ error() }}</p> }
  `,
})
export class Plan implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  p = signal<any>(null);
  s = signal<any>(null);
  error = signal('');
  view = signal<'calendar' | 'grid'>(this.savedView());
  shownWeeks = signal(2);

  /** Schedule dates grouped into Monday-to-Sunday weeks. */
  weeks = computed(() => {
    const s = this.s();
    if (!s) return [];
    const out: { label: string; dates: any[] }[] = [];
    let cur: { label: string; dates: any[] } | null = null;
    for (const d of s.dates) {
      const monday = this.mondayOf(d.date);
      const label = monday <= s.today && s.today <= this.addDays(monday, 6) ? 'This week' : `Week of ${this.short(monday)}`;
      if (!cur || cur.label !== label) { cur = { label, dates: [] }; out.push(cur); }
      cur.dates.push(d);
    }
    return out;
  });
  visibleWeeks = computed(() => this.weeks().slice(0, this.shownWeeks()));

  phases = computed(() => {
    const p = this.p();
    if (!p) return [];
    return p.phases.map((ph: any) => {
      const weekList = [];
      for (let w = ph.weeks[0]; w <= ph.weeks[1]; w++) {
        weekList.push({ week: w, days: p.days.filter((d: any) => d.week === w) });
      }
      return { ...ph, weekList };
    });
  });

  async ngOnInit() {
    try {
      const [p, s] = await Promise.all([this.api.get('/plan'), this.api.get('/plan/schedule')]);
      this.p.set(p);
      this.s.set(s);
    } catch (e) { this.error.set(errMsg(e)); }
  }

  private savedView(): 'calendar' | 'grid' {
    try { return localStorage.getItem('planView') === 'grid' ? 'grid' : 'calendar'; } catch { return 'calendar'; }
  }

  setView(v: 'calendar' | 'grid') {
    this.view.set(v);
    try { localStorage.setItem('planView', v); } catch {}
  }

  private parse(iso: string) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  private addDays(iso: string, n: number) {
    const d = this.parse(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  private mondayOf(iso: string) {
    const wd = this.parse(iso).getUTCDay();
    return this.addDays(iso, -((wd + 6) % 7));
  }

  dow(iso: string) {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][this.parse(iso).getUTCDay()];
  }

  kindName(k: string) {
    return ({ learn: 'Learn', dsa: 'DSA', build: 'Build', aptitude: 'Aptitude', submit: 'Submit', done: 'Done' } as any)[k] ?? k;
  }

  kindClass(k: string) {
    return ({
      learn: 'bg-sky-50 text-sky-700',
      dsa: 'bg-violet-50 text-violet-700',
      build: 'bg-amber-50 text-amber-800',
      aptitude: 'bg-rose-50 text-rose-700',
      submit: 'bg-slate-100 text-slate-700',
      done: 'bg-emerald-50 text-emerald-700',
    } as any)[k] ?? 'bg-slate-100 text-slate-600';
  }

  canOpen(day: number) {
    const cur = this.s()?.currentDay;
    return cur === null || cur === undefined || day <= cur;
  }

  openDay(day: number) {
    if (this.canOpen(day)) this.router.navigate(['/day', day]);
  }

  short(iso: string) {
    const [, m, d] = iso.split('-').map(Number);
    return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`;
  }

  cellClass(d: any) {
    if (d.status === 'completed') return 'bg-emerald-500 text-white';
    if (d.status === 'skipped_tested') return 'bg-emerald-200 text-emerald-900';
    if (d.status === 'current') return 'bg-brand-600 text-white ring-2 ring-brand-200';
    if (d.title) return 'border border-slate-300 bg-white text-slate-700';
    return 'bg-slate-100 text-slate-400';
  }

  tip(d: any) {
    return `Day ${d.day}${d.title ? ': ' + d.title : ' (not written yet)'}${d.date ? ' · ' + d.date : ''}`;
  }

  open(d: any) {
    if (d.title && d.status !== 'upcoming') this.router.navigate(['/day', d.day]);
  }
}
