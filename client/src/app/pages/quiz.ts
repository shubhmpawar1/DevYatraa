import { Component, inject, input, output, signal } from '@angular/core';
import { Api, errMsg } from '../core/api';
import { RoughPaper } from './rough-paper';

interface Q { q: string; code?: string | null; options: string[] }

/** Multiple-choice quiz graded on the server; answers are revealed only after submitting. */
@Component({
  selector: 'app-quiz',
  imports: [RoughPaper],
  template: `
    @if (roughPaper()) {
      <div class="mb-4 flex justify-end">
        <button type="button" class="btn-secondary !py-1.5 text-xs" (click)="paperOpen.set(!paperOpen())">
          ✏️ {{ paperOpen() ? 'Hide rough paper' : 'Open rough paper' }}
        </button>
      </div>
    }
    <div [class]="showPaper() ? 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''">
    <div class="space-y-5">
      @for (q of questions(); track $index; let i = $index) {
        <div>
          <p class="text-sm font-medium text-slate-900">{{ i + 1 }}. {{ q.q }}</p>
          @if (q.code) { <pre class="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{{ q.code }}</pre> }
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            @for (o of q.options; track $index; let j = $index) {
              <button type="button" class="option text-left" [disabled]="!!result()"
                      [class.option-selected]="!result() && answers()[i] === j"
                      [class.!border-emerald-500]="result() && result().results[i].correct === j"
                      [class.!bg-emerald-50]="result() && result().results[i].correct === j"
                      [class.!border-rose-400]="result() && answers()[i] === j && result().results[i].correct !== j"
                      [class.!bg-rose-50]="result() && answers()[i] === j && result().results[i].correct !== j"
                      (click)="pick(i, j)">
                <span class="font-mono text-xs text-slate-400">{{ 'ABCD'[j] }}</span><span>{{ o }}</span>
              </button>
            }
          </div>
          @if (result() && result().results[i].why) {
            <p class="mt-2 text-xs text-slate-600"><span class="font-semibold">{{ result().results[i].ok ? '✓' : '✗' }}</span> {{ result().results[i].why }}</p>
          }
        </div>
      }
      @if (error()) { <p class="error-box">{{ error() }}</p> }
      @if (result()) {
        <div class="flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3">
          <span class="font-semibold text-slate-900">Score: {{ result().score }}/{{ result().total }}</span>
          <button class="btn-ghost" (click)="reset()">Try again</button>
        </div>
      } @else {
        <button class="btn-primary" [disabled]="busy() || answeredCount() < questions().length" (click)="submit()">
          Check answers ({{ answeredCount() }}/{{ questions().length }})
        </button>
      }
    </div>
    @if (showPaper()) {
      <div class="order-first h-[360px] lg:order-none lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:self-start">
        <app-rough-paper [storageKey]="endpoint() + ':' + kind()" />
      </div>
    }
    </div>
  `,
})
export class Quiz {
  private api = inject(Api);
  questions = input.required<Q[]>();
  endpoint = input.required<string>();
  kind = input.required<string>();
  /** Show a scratch pad beside the questions for working things out. */
  roughPaper = input(false);
  paperOpen = signal(true);
  done = output<any>();
  answers = signal<(number | null)[]>([]);
  result = signal<any>(null);
  busy = signal(false);
  error = signal('');

  showPaper() { return this.roughPaper() && this.paperOpen(); }

  answeredCount() { return this.answers().filter((a) => a !== null && a !== undefined).length; }

  pick(i: number, j: number) {
    const a = [...this.answers()];
    a[i] = j;
    this.answers.set(a);
  }

  reset() { this.answers.set([]); this.result.set(null); }

  async submit() {
    this.busy.set(true);
    this.error.set('');
    try {
      const answers = this.questions().map((_, i) => this.answers()[i] ?? null);
      const r = await this.api.post(this.endpoint(), { kind: this.kind(), answers });
      this.result.set(r);
      this.done.emit(r);
    } catch (e) {
      this.error.set(errMsg(e));
    } finally {
      this.busy.set(false);
    }
  }
}
