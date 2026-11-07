import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, errMsg } from '../core/api';

@Component({
  selector: 'app-module-test',
  imports: [FormsModule, RouterLink],
  template: `
    <a routerLink="/modules" class="text-sm text-slate-500">← All modules</a>
    @if (error()) { <p class="error-box mt-4">{{ error() }}</p> }
    @if (t(); as t) {
      <h1 class="mt-2 text-2xl font-bold text-slate-900">{{ t.title }}: test-out</h1>
      <p class="mt-1 text-sm text-slate-500">Pass mark {{ t.passPercent }}%. No AI, no looking things up. This only helps if it's honest.</p>

      @if (!result()) {
        <div class="mt-6 space-y-4">
          @for (q of t.questions; track $index; let i = $index) {
            <div class="card">
              <p class="text-sm font-medium text-slate-900">{{ i + 1 }}. {{ q.q }}</p>
              @if (q.code) { <pre class="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{{ q.code }}</pre> }
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                @for (o of q.options; track $index; let j = $index) {
                  <button type="button" class="option text-left" [class.option-selected]="answers()[i] === j" (click)="pick(i, j)">
                    <span class="font-mono text-xs text-slate-400">{{ 'ABCD'[j] }}</span><span>{{ o }}</span>
                  </button>
                }
              </div>
            </div>
          }
          <div class="card">
            <p class="section-title">Build task</p>
            <p class="text-sm text-slate-800">{{ t.buildTask.task }}</p>
            <ul class="mt-2 list-disc pl-5 text-sm text-slate-600">@for (a of t.buildTask.acceptance; track a) { <li>{{ a }}</li> }</ul>
            <label class="label mt-4" for="commit">Commit link</label>
            <input id="commit" class="input" [(ngModel)]="commitUrl" name="commit" placeholder="https://github.com/you/repo/commit/abc1234" />
          </div>
          @if (submitError()) { <p class="error-box">{{ submitError() }}</p> }
          <button class="btn-primary" [disabled]="busy() || !commitUrl || answeredCount() < t.questions.length" (click)="submit()">
            {{ busy() ? 'Checking…' : 'Submit test (' + answeredCount() + '/' + t.questions.length + ')' }}
          </button>
        </div>
      } @else {
        @let r = result();
        <div class="card mt-6 text-center">
          <p class="text-5xl">{{ r.passed ? '🎉' : '📚' }}</p>
          <p class="mt-2 text-2xl font-bold text-slate-900">{{ r.score }}/{{ r.total }} ({{ r.pct }}%)</p>
          @if (r.passed) {
            <p class="mt-2 text-slate-600">Passed. The rest of this module is marked "skipped (tested)" and your plan is shorter.</p>
            <a routerLink="/" class="btn-primary mt-4">Back to dashboard</a>
          } @else {
            <p class="mt-2 text-slate-600">Not this time, and that's useful information. Your weak parts:</p>
            <div class="mt-3 flex flex-wrap justify-center gap-1.5">
              @for (w of r.weakTopics; track w) { <span class="chip bg-amber-50 text-amber-800">{{ w }}</span> }
            </div>
            @if (r.shortModuleDays.length) {
              <p class="mt-4 text-sm text-slate-600">A shorter module covers only Day {{ r.shortModuleDays.join(', ') }}.</p>
              <button class="btn-primary mt-3" (click)="short()">Take the shorter module</button>
            }
            <p class="mt-3 text-xs text-slate-400">You can retry the full test after 24 hours.</p>
            @if (shortMsg()) { <p class="ok-box mt-3">{{ shortMsg() }}</p> }
          }
        </div>
      }
    }
  `,
})
export class ModuleTest {
  private api = inject(Api);
  id = input.required<string>();
  t = signal<any>(null);
  error = signal('');
  submitError = signal('');
  busy = signal(false);
  answers = signal<(number | null)[]>([]);
  result = signal<any>(null);
  shortMsg = signal('');
  commitUrl = '';

  constructor() {
    effect(async () => {
      try { this.t.set(await this.api.get(`/modules/${this.id()}/test`)); } catch (e) { this.error.set(errMsg(e)); }
    });
  }

  answeredCount() { return this.answers().filter((a) => a !== null && a !== undefined).length; }
  pick(i: number, j: number) { const a = [...this.answers()]; a[i] = j; this.answers.set(a); }

  async submit() {
    this.busy.set(true);
    this.submitError.set('');
    try {
      const answers = this.t().questions.map((_: any, i: number) => this.answers()[i] ?? null);
      this.result.set(await this.api.post(`/modules/${this.id()}/test`, { answers, commitUrl: this.commitUrl }));
    } catch (e) { this.submitError.set(errMsg(e)); } finally { this.busy.set(false); }
  }

  async short() {
    try {
      const r = await this.api.post(`/modules/${this.id()}/short`);
      this.shortMsg.set(r.skipped.length ? `Done. Day ${r.skipped.join(', ')} skipped; you'll study Day ${r.keep.join(', ')}.` : 'Every day covers a weak part, so you\'ll do the full module.');
    } catch (e) { this.shortMsg.set(errMsg(e)); }
  }
}
