import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errMsg } from '../core/api';
import { Quiz } from './quiz';

const LEVEL: Record<string, { label: string; cls: string; icon: string }> = {
  clear: { label: 'Clear', cls: 'bg-emerald-100 text-emerald-800', icon: '✓' },
  almost: { label: 'Almost', cls: 'bg-amber-100 text-amber-800', icon: '~' },
  not_yet: { label: 'Not yet', cls: 'bg-rose-100 text-rose-800', icon: '✗' },
};

@Component({
  selector: 'app-day',
  imports: [FormsModule, RouterLink, Quiz],
  template: `
    @if (error()) {
      <div class="card text-center">
        <p class="text-slate-700">{{ error() }}</p>
        <a routerLink="/" class="btn-secondary mt-4">Back to dashboard</a>
      </div>
    }
    @if (d(); as d) {
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm text-slate-500">Day {{ d.day }} · Week {{ d.week }} · Phase {{ d.phase }}</p>
          <h1 class="text-2xl font-bold text-slate-900">{{ d.title }}</h1>
        </div>
        <span class="chip" [class]="statusChip()">{{ statusLabel() }}</span>
      </div>
      <div class="mt-3 rounded-xl px-4 py-2 text-sm font-medium"
           [class]="d.aiLevel.level === 'no_ai' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-800 border border-amber-200'">
        {{ d.aiLevel.level === 'no_ai' ? '🚫 ' : '🔍 ' }}{{ d.aiLevel.label }}
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div class="min-w-0 space-y-6">
          <!-- Goal + Learn -->
          <section class="card">
            <p class="section-title">Goal</p>
            <p class="text-lg font-medium text-slate-900">{{ d.goal }}</p>
            <p class="section-title mt-6">Learn</p>
            <ul class="list-disc space-y-1 pl-5 text-sm text-slate-700">
              @for (c of d.learn.concepts; track c) { <li>{{ c }}</li> }
            </ul>
            <div class="mt-4 flex flex-col gap-2">
              @for (r of d.learn.resources; track r.url) {
                <a [href]="r.url" target="_blank" rel="noopener" class="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-brand-700 hover:bg-brand-50">📖 {{ r.title }} <span class="ml-auto text-slate-400">↗</span></a>
              }
            </div>
          </section>

          <!-- Build -->
          <section class="card">
            <p class="section-title">Build task</p>
            <p class="text-slate-800">{{ d.build.task }}</p>
            @if (d.build.starterFiles?.length) {
              <p class="mt-5 text-sm font-semibold text-slate-700">Starter files</p>
              @for (f of d.build.starterFiles; track f.name) {
                <div class="mt-2 overflow-hidden rounded-xl border border-slate-200">
                  <div class="flex items-center justify-between bg-slate-100 px-3 py-1.5">
                    <code class="text-xs text-slate-700">{{ f.name }}</code>
                    <button class="text-xs font-semibold text-brand-600" (click)="copy(f.content, f.name)">{{ copied() === f.name ? 'Copied ✓' : 'Copy' }}</button>
                  </div>
                  <pre class="max-h-72 overflow-auto bg-slate-900 p-3 text-xs text-slate-100">{{ f.content }}</pre>
                </div>
              }
            }
            <p class="mt-5 text-sm font-semibold text-slate-700">Acceptance criteria</p>
            <ul class="mt-2 space-y-1.5">
              @for (a of d.build.acceptance; track $index; let i = $index) {
                <li>
                  <label class="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" class="mt-0.5 accent-brand-600" [checked]="checks()[i]" (change)="toggleCheck(i)" />
                    <span [class.line-through]="checks()[i]" [class.text-slate-400]="checks()[i]">{{ a }}</span>
                  </label>
                </li>
              }
            </ul>
          </section>

          @if (d.debugLab) {
            <section class="card border-rose-200">
              <p class="section-title !text-rose-600">🐞 Debug lab: {{ d.debugLab.title }}</p>
              <p class="text-sm text-slate-700">This code is broken on purpose ({{ d.debugLab.bugCount }} bugs). The files are in the starter files above.</p>
              <p class="mt-3 text-sm font-semibold text-slate-700">What you see:</p>
              <ul class="list-disc pl-5 text-sm text-slate-700">
                @for (s of d.debugLab.symptoms; track s) { <li>{{ s }}</li> }
              </ul>
            </section>
          }

          <!-- Hints -->
          <section class="card">
            <div class="flex items-center justify-between">
              <p class="section-title !mb-0">Hint ladder</p>
              <span class="text-xs text-slate-400">{{ d.hints.length }}/{{ d.hintsTotal }} used</span>
            </div>
            <p class="mt-1 text-xs text-slate-500">Try for 20 minutes before each hint. Hint 1 is a small nudge; hint 3 is close to the answer.</p>
            <ol class="mt-3 space-y-2">
              @for (h of d.hints; track $index; let i = $index) {
                <li class="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"><span class="font-semibold">Hint {{ i + 1 }}:</span> {{ h }}</li>
              }
            </ol>
            @if (d.hints.length < d.hintsTotal) {
              <button class="btn-secondary mt-3" (click)="hint()">Show hint {{ d.hints.length + 1 }}</button>
            }
          </section>

          <!-- Proof -->
          <section class="card" id="proof">
            <p class="section-title">Proof of work</p>
            <p class="text-sm text-slate-700">{{ d.proof }}</p>
            @if (d.commits.length) {
              <ul class="mt-3 space-y-1.5">
                @for (c of d.commits; track c.url) {
                  <li class="flex items-start gap-2 text-sm">
                    <span class="text-emerald-600">✓</span>
                    <a [href]="c.url" target="_blank" rel="noopener" class="min-w-0 truncate text-brand-700 hover:underline">{{ firstLine(c.message) || c.url }}</a>
                  </li>
                }
              </ul>
            }
            @if (d.status === 'open') {
              <form class="mt-3 flex flex-col gap-2 sm:flex-row" (ngSubmit)="submitCommit()">
                <input class="input" name="commit" [(ngModel)]="commitUrl" placeholder="https://github.com/you/jobready-journey/commit/abc1234" />
                <button class="btn-primary shrink-0" [disabled]="busy() === 'commit' || !commitUrl">{{ busy() === 'commit' ? 'Checking…' : d.commits.length ? 'Add commit' : 'Verify commit' }}</button>
              </form>
              <p class="mt-1 text-xs text-slate-400">Repo must be public. Work-in-progress commits count toward your streak too.</p>
              @if (commitMsg()) { <p class="mt-2" [class]="commitOk() ? 'ok-box' : 'error-box'">{{ commitMsg() }}</p> }
            }
          </section>

          <!-- Explain-back -->
          <section class="card" id="explain">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="section-title !mb-0">Explain-back</p>
              @if (d.status === 'open') {
                <span class="text-xs text-slate-400">Attempts today: {{ d.attempts.todayCount }}/{{ d.attempts.maxPerDay }}</span>
              }
            </div>
            <p class="mt-1 text-xs text-slate-500">Answer in your own words, about your own code. Hinglish and grammar mistakes are fine: understanding is what counts.</p>

            @if (passed()) {
              <p class="ok-box mt-4">✓ Explain-back done ({{ gradeLabel() }}).</p>
            } @else if (d.status === 'open' && !d.commitVerified) {
              <p class="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600">Submit your commit first. The questions are about the code you wrote.</p>
            }

            <!-- Latest graded attempt -->
            @if (last(); as la) {
              @if (!passed() || la.result === 'clear') {
                <div class="mt-4 rounded-xl border border-slate-200 p-4">
                  <div class="flex items-center gap-2">
                    <span class="chip" [class]="level(la.result).cls">{{ level(la.result).icon }} {{ level(la.result).label }}</span>
                    <span class="text-xs text-slate-400">{{ la.gradedBy === 'ai' ? 'AI graded' : 'Self-assessed' }} · attempt {{ d.attempts.history.length }}</span>
                  </div>
                  @for (f of la.feedback.questions ?? []; track $index) {
                    <p class="mt-3 text-sm text-slate-700"><span class="font-semibold">Q{{ f.index }}</span>
                      <span class="chip ml-1" [class]="level(f.verdict).cls">{{ level(f.verdict).label }}</span> {{ f.feedback }}</p>
                  }
                  @if (la.feedback.gap_explanation) {
                    <div class="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900"><span class="font-semibold">The gap:</span> {{ la.feedback.gap_explanation }}</div>
                  }
                  @if (la.result === 'almost' && la.followupQuestion && !la.followupAnswer) {
                    <div class="mt-4">
                      <p class="text-sm font-semibold text-slate-900">One follow-up question:</p>
                      <p class="mt-1 text-sm text-slate-700">{{ la.followupQuestion }}</p>
                      <textarea class="input mt-2" rows="3" [(ngModel)]="followup" name="followup"></textarea>
                      <button class="btn-primary mt-2" [disabled]="busy() === 'grade' || !followup.trim()" (click)="sendFollowup(la.id)">{{ busy() === 'grade' ? 'Grading…' : 'Send answer' }}</button>
                    </div>
                  }
                  @if (la.followupAnswer) {
                    <p class="mt-3 text-xs text-slate-500">Follow-up: "{{ la.followupQuestion }}" · you answered: "{{ la.followupAnswer }}"</p>
                  }
                </div>
              }
            }

            @if (canAnswer()) {
              <div class="mt-4 space-y-4">
                @for (e of d.explainBack; track $index; let i = $index) {
                  <div>
                    <label class="label" [for]="'eb' + i">{{ i + 1 }}. {{ e.q }}</label>
                    <textarea class="input" rows="4" [id]="'eb' + i" [name]="'eb' + i" [(ngModel)]="answers[i]" [disabled]="!!keyIdeas()"></textarea>
                    @if (keyIdeas()) {
                      <div class="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">
                        <span class="font-semibold">A good answer covers:</span>
                        <ul class="list-disc pl-4">@for (k of keyIdeas()![i]; track k) { <li>{{ k }}</li> }</ul>
                      </div>
                    }
                  </div>
                }
                @if (gradeError()) { <p class="error-box">{{ gradeError() }}</p> }

                @if (d.aiGrading) {
                  <button class="btn-primary" [disabled]="busy() === 'grade' || !allAnswered()" (click)="submitExplain()">
                    {{ busy() === 'grade' ? 'Reading your commit and grading…' : 'Submit for grading' }}
                  </button>
                } @else if (!keyIdeas()) {
                  <button class="btn-primary" [disabled]="busy() === 'grade' || !allAnswered()" (click)="selfCheck()">Compare with key ideas</button>
                } @else {
                  <div class="rounded-xl border border-slate-200 p-4">
                    <p class="text-sm font-semibold text-slate-900">Be honest: how did you do?</p>
                    <p class="text-xs text-slate-500">Only you lose if you mark "Clear" without understanding it.</p>
                    <input class="input mt-3" [(ngModel)]="weakTopic" name="weakTopic" placeholder="If not clear: which topic was weak? (optional)" />
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button class="btn-secondary !border-emerald-300 !text-emerald-700" (click)="selfGrade('clear')">✓ Clear: I covered these</button>
                      <button class="btn-secondary !border-amber-300 !text-amber-700" (click)="selfGrade('almost')">~ Almost: one gap</button>
                      <button class="btn-secondary !border-rose-300 !text-rose-700" (click)="selfGrade('not_yet')">✗ Not yet</button>
                    </div>
                  </div>
                }
              </div>
            } @else if (d.status === 'open' && !passed() && d.commitVerified && d.attempts.todayCount >= d.attempts.maxPerDay) {
              <p class="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600">You've used today's 3 attempts. Read the feedback, revisit the code, and try again tomorrow.</p>
            }

            @if (d.attempts.unlocked && !passed()) {
              <div class="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                <p class="font-semibold">Unlocked after 3 tries: short explanation</p>
                <p class="mt-1">{{ d.lastHintExplanation }}</p>
                <p class="mt-2 text-xs">This day's topic is saved to your weak topics and comes back on revision days.</p>
                <button class="btn-secondary mt-3" (click)="moveOn()">Move on</button>
              </div>
            }
          </section>

          @if (d.predict.length) {
            <section class="card">
              <p class="section-title">Predict the output</p>
              <app-quiz [questions]="d.predict" [endpoint]="'/days/' + d.day + '/quiz'" kind="predict" />
            </section>
          }

          <!-- DSA -->
          <section class="card">
            <p class="section-title">DSA · {{ d.dsa.pattern }}</p>
            @if (d.dsa.note) { <p class="text-sm text-slate-700">{{ d.dsa.note }}</p> }
            <p class="mt-2 text-xs text-brand-700">{{ d.notes.dsa }}</p>
            <div class="mt-3 flex flex-col gap-2">
              @for (p of d.dsa.problems; track p.url) {
                <a [href]="p.url" target="_blank" rel="noopener" class="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">🧩 {{ p.title }} <span class="ml-auto text-slate-400">↗</span></a>
              }
            </div>
            <a routerLink="/dsa" class="mt-3 inline-block text-xs font-semibold text-brand-600">Track LeetCode problems in the DSA tracker →</a>
          </section>

          <!-- Aptitude -->
          <section class="card">
            <p class="section-title">Aptitude · {{ d.aptitude.topic }}</p>
            <p class="mb-4 text-xs text-brand-700">{{ d.notes.aptitude }}</p>
            <app-quiz [questions]="d.aptitude.questions" [endpoint]="'/days/' + d.day + '/quiz'" kind="aptitude" />
          </section>

          <!-- Revision -->
          <section class="card">
            <p class="section-title">Revision (10 min)</p>
            <ul class="list-disc space-y-1 pl-5 text-sm text-slate-700">
              @for (r of d.revision; track r) { <li>{{ r }}</li> }
            </ul>
          </section>
        </div>

        <!-- Sidebar -->
        <aside class="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div class="card">
            <p class="section-title">Today's checklist</p>
            <ul class="space-y-2 text-sm">
              <li class="flex gap-2"><span>{{ d.commitVerified ? '✅' : '⬜' }}</span> Verified GitHub commit</li>
              <li class="flex gap-2"><span>{{ passed() ? '✅' : '⬜' }}</span> Explain-back passed</li>
              <li class="flex gap-2 text-slate-500"><span>{{ hasQuiz('aptitude') ? '✅' : '⬜' }}</span> Aptitude quiz (optional)</li>
              @if (d.predict.length) { <li class="flex gap-2 text-slate-500"><span>{{ hasQuiz('predict') ? '✅' : '⬜' }}</span> Predict quiz (optional)</li> }
            </ul>
            @if (d.status === 'open' && d.isCurrent) {
              @if (d.canComplete) {
                <div class="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  <p class="text-sm font-semibold text-slate-900">Progress log</p>
                  <textarea class="input" rows="2" [(ngModel)]="log.done" name="logDone" placeholder="What you did today"></textarea>
                  <textarea class="input" rows="2" [(ngModel)]="log.hard" name="logHard" placeholder="Where it was hard"></textarea>
                  <input class="input" type="number" min="0" [(ngModel)]="log.minutes" name="logMin" placeholder="Minutes spent" />
                  <button class="btn-primary w-full" [disabled]="busy() === 'complete'" (click)="complete()">Complete Day {{ d.day }} ✓</button>
                </div>
              } @else {
                <p class="mt-4 text-xs text-slate-500">Finish the two required items to complete this day.</p>
              }
            } @else if (d.status === 'completed') {
              <p class="ok-box mt-4">Day completed 🎉</p>
            } @else if (d.status === 'skipped_tested') {
              <p class="ok-box mt-4">Skipped by passing the module test.</p>
            }
          </div>
          @if (d.notes.schedule) { <p class="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">{{ d.notes.schedule }}</p> }
          <div class="flex justify-between">
            @if (d.day > 1) { <a class="btn-ghost" [routerLink]="['/day', d.day - 1]">← Day {{ d.day - 1 }}</a> } @else { <span></span> }
            @if (d.status !== 'open') { <a class="btn-ghost" [routerLink]="['/day', d.day + 1]">Day {{ d.day + 1 }} →</a> }
          </div>
        </aside>
      </div>
    }
  `,
})
export class Day {
  private api = inject(Api);
  private router = inject(Router);
  n = input.required<string>();

  d = signal<any>(null);
  error = signal('');
  busy = signal<string | null>(null);
  copied = signal<string | null>(null);
  checks = signal<boolean[]>([]);
  commitMsg = signal('');
  commitOk = signal(false);
  gradeError = signal('');
  keyIdeas = signal<string[][] | null>(null);
  commitUrl = '';
  answers: string[] = ['', '', ''];
  followup = '';
  weakTopic = '';
  log: { done: string; hard: string; minutes: number | null } = { done: '', hard: '', minutes: null };

  constructor() {
    effect(() => { this.load(Number(this.n())); });
  }

  last = computed(() => {
    const h = this.d()?.attempts.history ?? [];
    return h.length ? h[h.length - 1] : null;
  });
  passed = computed(() => ['clear', 'self_clear', 'moved_on'].includes(this.d()?.grade));
  canAnswer = computed(() => {
    const d = this.d();
    if (!d || d.status !== 'open' || !d.commitVerified || this.passed()) return false;
    if (d.attempts.todayCount >= d.attempts.maxPerDay) return false;
    const la = this.last();
    return !(la && la.result === 'almost' && la.followupQuestion && !la.followupAnswer);
  });

  async load(n: number) {
    this.error.set('');
    this.keyIdeas.set(null);
    this.commitMsg.set('');
    this.answers = ['', '', ''];
    this.d.set(null); // recreate child quizzes when switching days
    try {
      const d = await this.api.get(`/days/${n}`);
      this.d.set(d);
      this.checks.set(this.readChecks(n, d.build.acceptance.length));
    } catch (e) {
      this.d.set(null);
      this.error.set(errMsg(e));
    }
  }

  async refresh() { this.d.set(await this.api.get(`/days/${this.d().day}`)); }

  level(r: string) { return LEVEL[r] ?? LEVEL['not_yet']; }
  gradeLabel() {
    const g = this.d()?.grade;
    return g === 'clear' ? 'Clear' : g === 'self_clear' ? 'self-assessed Clear' : 'moved on after 3 tries';
  }
  statusLabel() {
    const d = this.d();
    return d.status === 'completed' ? 'Completed' : d.status === 'skipped_tested' ? 'Skipped (tested)' : d.isCurrent ? 'Today' : 'Open';
  }
  statusChip() {
    const s = this.d().status;
    return s === 'open' ? 'bg-brand-100 text-brand-700' : 'bg-emerald-100 text-emerald-800';
  }
  firstLine(s: string | null) { return (s ?? '').split('\n')[0]; }
  hasQuiz(kind: string) { return this.d().quizzes.some((x: any) => x.kind === kind); }
  allAnswered() { return this.answers.every((a) => a.trim().length >= 10); }

  private checksKey(n: number) { return `jobready_checks_${n}`; }
  private readChecks(n: number, len: number): boolean[] {
    try {
      const v = JSON.parse(localStorage.getItem(this.checksKey(n)) ?? '[]');
      return Array.from({ length: len }, (_, i) => Boolean(v[i]));
    } catch { return Array(len).fill(false); }
  }
  toggleCheck(i: number) {
    const c = [...this.checks()];
    c[i] = !c[i];
    this.checks.set(c);
    try { localStorage.setItem(this.checksKey(this.d().day), JSON.stringify(c)); } catch { /* ignore */ }
  }

  async copy(text: string, name: string) {
    try { await navigator.clipboard.writeText(text); this.copied.set(name); setTimeout(() => this.copied.set(null), 1500); } catch { /* ignore */ }
  }

  async hint() {
    const r = await this.api.post(`/days/${this.d().day}/hint`);
    this.d.update((d) => ({ ...d, hints: r.hints }));
  }

  async submitCommit() {
    this.busy.set('commit');
    this.commitMsg.set('');
    try {
      const r = await this.api.post(`/days/${this.d().day}/commit`, { url: this.commitUrl });
      this.commitOk.set(true);
      this.commitMsg.set(`Verified: "${this.firstLine(r.message)}" (${r.files.length} file${r.files.length === 1 ? '' : 's'} changed)`);
      this.commitUrl = '';
      await this.refresh();
    } catch (e) {
      this.commitOk.set(false);
      this.commitMsg.set(errMsg(e));
    } finally {
      this.busy.set(null);
    }
  }

  async submitExplain() {
    this.busy.set('grade');
    this.gradeError.set('');
    try {
      await this.api.post(`/days/${this.d().day}/explain`, { answers: this.answers });
      await this.refresh();
    } catch (e) {
      this.gradeError.set(errMsg(e));
    } finally {
      this.busy.set(null);
    }
  }

  async sendFollowup(attemptId: number) {
    this.busy.set('grade');
    this.gradeError.set('');
    try {
      await this.api.post(`/days/${this.d().day}/followup`, { attemptId, answer: this.followup });
      this.followup = '';
      await this.refresh();
    } catch (e) {
      this.gradeError.set(errMsg(e));
    } finally {
      this.busy.set(null);
    }
  }

  async selfCheck() {
    this.gradeError.set('');
    try {
      const r = await this.api.post(`/days/${this.d().day}/self-check`, { answers: this.answers });
      this.keyIdeas.set(r.keyIdeas);
    } catch (e) { this.gradeError.set(errMsg(e)); }
  }

  async selfGrade(result: string) {
    this.gradeError.set('');
    try {
      await this.api.post(`/days/${this.d().day}/self-grade`, { answers: this.answers, result, weakTopic: this.weakTopic || undefined });
      this.keyIdeas.set(null);
      this.weakTopic = '';
      await this.refresh();
    } catch (e) { this.gradeError.set(errMsg(e)); }
  }

  async moveOn() {
    await this.api.post(`/days/${this.d().day}/move-on`);
    await this.refresh();
  }

  async complete() {
    this.busy.set('complete');
    try {
      await this.api.post(`/days/${this.d().day}/complete`, {
        done: this.log.done || undefined, hard: this.log.hard || undefined, minutes: this.log.minutes ?? undefined,
      });
      this.router.navigate(['/']);
    } catch (e) {
      this.error.set(errMsg(e));
    } finally {
      this.busy.set(null);
    }
  }
}
