import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api, errMsg } from '../core/api';

@Component({
  selector: 'app-modules',
  imports: [RouterLink, DatePipe],
  template: `
    <h1 class="text-2xl font-bold text-slate-900">Skip a topic (test-out)</h1>
    <p class="mt-1 max-w-2xl text-sm text-slate-500">
      Already know a module? Pass its test (10 questions plus one small build task, about 80% to pass) and those days are marked
      "skipped (tested)", which shortens your plan. If you fail, you see your weak parts and can take a shorter module covering only those.
      You can retry after 24 hours. Git basics, DSA and capstone explain-backs can't be skipped.
    </p>
    @if (error()) { <p class="error-box mt-4">{{ error() }}</p> }
    <div class="mt-6 grid gap-4 md:grid-cols-2">
      @for (m of mods(); track m.id) {
        <div class="card flex flex-col">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-xs text-slate-400">Phase {{ m.phase }}</p>
              <h2 class="font-semibold text-slate-900">{{ m.title }}</h2>
            </div>
            @if (!m.skippable) { <span class="chip bg-slate-100 text-slate-600">Mandatory</span> }
            @else if (m.remaining === 0) { <span class="chip bg-emerald-100 text-emerald-800">Done</span> }
          </div>
          <div class="mt-3 flex flex-wrap gap-1.5">
            @for (d of m.days; track d.day) {
              <span class="chip" [class]="d.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : d.status === 'skipped_tested' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'">Day {{ d.day }}</span>
            }
          </div>
          @if (m.lastTest; as t) {
            <p class="mt-3 text-sm" [class]="t.passed ? 'text-emerald-700' : 'text-slate-600'">
              Last test: {{ t.score }}/{{ t.total }} {{ t.passed ? '(passed)' : '(not passed)' }}
              @if (!t.passed && t.weak.length) { · weak: {{ t.weak.join(', ') }} }
            </p>
          }
          <div class="mt-auto pt-4">
            @if (m.skippable && m.remaining > 0) {
              @if (m.retryAt) {
                <p class="text-sm text-slate-500">Retry available {{ m.retryAt | date: 'EEE d MMM, h:mm a' }}</p>
                @if (m.lastTest && !m.lastTest.passed) {
                  <button class="btn-secondary mt-2" (click)="short(m.id)">Take the shorter module (weak parts only)</button>
                }
              } @else {
                <a class="btn-primary" [routerLink]="['/modules', m.id, 'test']">Take the test</a>
              }
            }
          </div>
          @if (msg()[m.id]) { <p class="ok-box mt-3">{{ msg()[m.id] }}</p> }
        </div>
      }
    </div>
  `,
})
export class Modules implements OnInit {
  private api = inject(Api);
  mods = signal<any[]>([]);
  error = signal('');
  msg = signal<Record<string, string>>({});

  async ngOnInit() { await this.load(); }
  async load() {
    try { this.mods.set(await this.api.get('/modules')); } catch (e) { this.error.set(errMsg(e)); }
  }

  async short(id: string) {
    try {
      const r = await this.api.post(`/modules/${id}/short`);
      this.msg.update((m) => ({ ...m, [id]: r.skipped.length ? `Skipped Day ${r.skipped.join(', ')}. You'll still do Day ${r.keep.join(', ')}.` : 'Every day in this module covers a weak part, so none were skipped.' }));
      await this.load();
    } catch (e) { this.error.set(errMsg(e)); }
  }
}
