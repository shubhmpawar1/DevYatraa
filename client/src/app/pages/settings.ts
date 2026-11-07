import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errMsg } from '../core/api';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  template: `
    <h1 class="text-2xl font-bold text-slate-900">Settings</h1>
    <p class="mt-1 text-sm text-slate-500">Completed days always stay completed. Changing hours or track re-plans only the days you have left.</p>
    @if (error()) { <p class="error-box mt-4">{{ error() }}</p> }

    @if (f) {
      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <form class="card grid gap-5 sm:grid-cols-2" (ngSubmit)="previewSave()">
          <div>
            <label class="label" for="level">Current level</label>
            <select id="level" class="input" name="level" [(ngModel)]="f.level" (ngModelChange)="dirty()">
              <option value="beginner">Total beginner</option><option value="some">Know a little</option><option value="builder">Can build simple things</option>
            </select>
          </div>
          <div>
            <label class="label" for="hours">Hours per normal day</label>
            <select id="hours" class="input" name="hours" [(ngModel)]="f.hours" (ngModelChange)="dirty()">
              <option value="1-2">1–2</option><option value="3-4">3–4</option><option value="5-6">5–6</option><option value="7+">7+</option>
            </select>
          </div>
          <div>
            <label class="label" for="track">Track</label>
            <select id="track" class="input" name="track" [(ngModel)]="f.track_months" (ngModelChange)="dirty()" [disabled]="!!s().trackLockedUntil">
              <option [ngValue]="6">6 months</option><option [ngValue]="9">9 months</option><option [ngValue]="12">12 months</option>
            </select>
            @if (s().trackLockedUntil) { <p class="mt-1 text-xs text-slate-500">Track changes are limited to once every 2 weeks. Next change: {{ s().trackLockedUntilPretty }}.</p> }
          </div>
          <div>
            <label class="label" for="rest">Rest day</label>
            <select id="rest" class="input" name="rest" [(ngModel)]="f.rest_day" (ngModelChange)="dirty()">
              @for (d of days; track $index; let i = $index) { <option [ngValue]="i">{{ d }}</option> }
            </select>
          </div>
          <div>
            <label class="label" for="bg">Background</label>
            <select id="bg" class="input" name="bg" [(ngModel)]="f.background" (ngModelChange)="dirty()">
              <option value="student">College student</option><option value="graduate">Graduate</option><option value="professional">Working professional</option>
            </select>
          </div>
          @if (f.background === 'student') {
            <div>
              <label class="label" for="year">College year</label>
              <select id="year" class="input" name="year" [(ngModel)]="f.college_year" (ngModelChange)="dirty()">
                @for (y of [1, 2, 3, 4, 5]; track y) { <option [ngValue]="y">Year {{ y }}</option> }
              </select>
            </div>
          }
          <div>
            <label class="label" for="goal">Goal</label>
            <select id="goal" class="input" name="goal" [(ngModel)]="f.goal" (ngModelChange)="dirty()">
              <option value="any">Any job</option><option value="product">Good product company</option><option value="top">Top product company</option>
            </select>
          </div>
          <div>
            <label class="label" for="start">Start date</label>
            <input id="start" class="input" type="date" name="start" [(ngModel)]="f.start_date" (ngModelChange)="dirty()" [disabled]="!s().startDateEditable" />
            @if (!s().startDateEditable) { <p class="mt-1 text-xs text-slate-500">Locked after your first completed day.</p> }
          </div>
          <div class="sm:col-span-2">
            <button class="btn-primary" [disabled]="busy()">Preview change</button>
          </div>
        </form>

        <aside class="space-y-4">
          @if (pv(); as pv) {
            <div class="card">
              <p class="section-title">Effect on your finish date</p>
              <p class="text-sm text-slate-500">Now: <span class="font-medium text-slate-800">{{ pv.currentFinishPretty }}</span></p>
              <p class="text-sm text-slate-500">After: <span class="font-semibold text-slate-900">{{ pv.newFinishPretty }}</span></p>
              <p class="mt-2 text-sm" [class]="pv.deltaDays > 0 ? 'text-amber-700' : pv.deltaDays < 0 ? 'text-emerald-700' : 'text-slate-500'">
                {{ pv.deltaDays === 0 ? 'No change' : (pv.deltaDays > 0 ? pv.deltaDays + ' days later' : -pv.deltaDays + ' days earlier') }}
              </p>
              @if (pv.warning) { <p class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠ {{ pv.warning }}</p> }
              <button class="btn-primary mt-4 w-full" [disabled]="busy()" (click)="save()">Save changes</button>
            </div>
          }
          @if (saved()) { <p class="ok-box">{{ saved() }}</p> }
        </aside>
      </div>
    }
  `,
})
export class Settings implements OnInit {
  private api = inject(Api);
  days = DAYS;
  s = signal<any>(null);
  pv = signal<any>(null);
  error = signal('');
  saved = signal('');
  busy = signal(false);
  f: any = null;

  async ngOnInit() { await this.load(); }

  async load() {
    try {
      const s = await this.api.get('/settings');
      this.s.set(s);
      const p = s.profile;
      this.f = { level: p.level, hours: p.hours, track_months: p.track_months, background: p.background, college_year: p.college_year ?? 3, rest_day: p.rest_day, goal: p.goal, start_date: p.start_date };
    } catch (e) { this.error.set(errMsg(e)); }
  }

  dirty() { this.pv.set(null); this.saved.set(''); }

  private body() {
    const b = { ...this.f };
    if (b.background !== 'student') b.college_year = null;
    if (this.s().trackLockedUntil) delete b.track_months;
    if (!this.s().startDateEditable) delete b.start_date;
    return b;
  }

  async previewSave() {
    this.busy.set(true);
    this.error.set('');
    try { this.pv.set(await this.api.post('/settings/preview', this.body())); } catch (e) { this.error.set(errMsg(e)); } finally { this.busy.set(false); }
  }

  async save() {
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.api.put('/settings', this.body());
      this.saved.set(`Saved. Your finish date is now ${r.finishPretty}.`);
      this.pv.set(null);
      await this.load();
    } catch (e) { this.error.set(errMsg(e)); } finally { this.busy.set(false); }
  }
}
