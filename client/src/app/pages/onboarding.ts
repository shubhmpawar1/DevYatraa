import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, errMsg } from '../core/api';

interface Answers {
  level: string | null;
  hours: string | null;
  track_months: number | null;
  background: string | null;
  college_year: number | null;
  start: string | null;
  rest_day: number | null;
  goal: string | null;
}

interface Opt { value: any; label: string; sub?: string }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

@Component({
  selector: 'app-onboarding',
  template: `
    <div class="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8">
      <div class="mb-8 flex items-center gap-3">
        <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">JR</span>
        <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div class="h-full rounded-full bg-brand-600 transition-all" [style.width.%]="(step() / 7) * 100"></div>
        </div>
        <span class="text-sm text-slate-500">{{ step() < 7 ? step() + 1 : 7 }} / 7</span>
      </div>

      @if (step() < 7) {
        @let q = questions[step()];
        <h1 class="text-2xl font-bold text-slate-900">{{ q.title }}</h1>
        @if (q.help) { <p class="mt-1 text-slate-500">{{ q.help }}</p> }
        <div class="mt-6 space-y-2">
          @for (o of q.options; track o.value) {
            <button type="button" class="option w-full text-left" [class.option-selected]="isSelected(q.key, o.value)" (click)="choose(q.key, o.value)">
              <span class="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-slate-400">
                @if (isSelected(q.key, o.value)) { <span class="h-2 w-2 rounded-full bg-brand-600"></span> }
              </span>
              <span>
                <span class="font-medium text-slate-900">{{ o.label }}</span>
                @if (o.sub) { <span class="block text-xs text-slate-500">{{ o.sub }}</span> }
              </span>
            </button>
          }
        </div>

        @if (q.key === 'background' && a().background === 'student') {
          <div class="mt-4">
            <p class="label">Which year?</p>
            <div class="flex flex-wrap gap-2">
              @for (y of [1, 2, 3, 4]; track y) {
                <button type="button" class="option px-4 py-2" [class.option-selected]="a().college_year === y" (click)="set('college_year', y)">Year {{ y }}</button>
              }
            </div>
          </div>
        }

        @if (q.key === 'level' && a().level === 'builder') {
          <p class="ok-box mt-4">You can skip topics you already know by passing a short test (about 80%) from the Test-out page. Git basics can't be skipped.</p>
        }

        @if (q.key === 'track_months' && preview()?.warning) {
          <p class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠ {{ preview()!.warning }}</p>
        }

        <div class="mt-auto flex justify-between pt-8">
          <button class="btn-ghost" [disabled]="step() === 0" (click)="back()">← Back</button>
          <button class="btn-primary" [disabled]="!answered(q.key)" (click)="next()">Next →</button>
        </div>
      } @else {
        <h1 class="text-2xl font-bold text-slate-900">Your plan</h1>
        <p class="mt-1 text-slate-500">You can change any of this later in Settings.</p>
        @if (preview(); as p) {
          <div class="card mt-6">
            <p class="text-lg font-semibold leading-relaxed text-slate-900">"{{ p.summary }}"</p>
            @if (p.warning) { <p class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠ {{ p.warning }}</p> }
          </div>
          <div class="card mt-4 text-sm text-slate-600">
            <p class="section-title">How it works</p>
            <ul class="list-disc space-y-1 pl-5">
              <li>Every day: one build task, a GitHub commit as proof, and 3 explain-back questions on your own code.</li>
              <li>Weeks 1–8: no AI. After that, AI only for review and explanation, never for writing your code.</li>
              <li>Miss a day? The plan moves forward by one day. No guilt, just a new date.</li>
            </ul>
          </div>
        }
        @if (error()) { <p class="error-box mt-4">{{ error() }}</p> }
        <div class="mt-auto flex justify-between pt-8">
          <button class="btn-ghost" (click)="back()">← Back</button>
          <button class="btn-primary" [disabled]="busy()" (click)="finish()">{{ busy() ? 'Saving…' : 'Start my plan' }}</button>
        </div>
      }
    </div>
  `,
})
export class Onboarding {
  private api = inject(Api);
  private router = inject(Router);
  step = signal(0);
  busy = signal(false);
  error = signal('');
  preview = signal<{ summary: string; warning: string | null; recommendedTrack: number } | null>(null);
  a = signal<Answers>({ level: null, hours: null, track_months: 9, background: null, college_year: null, start: null, rest_day: 0, goal: null });

  questions: { key: keyof Answers; title: string; help?: string; options: Opt[] }[] = [
    { key: 'level', title: 'Where are you starting from?', options: [
      { value: 'beginner', label: 'Total beginner', sub: "I've never written code" },
      { value: 'some', label: 'Know a little', sub: 'Some HTML or tutorials, nothing built on my own' },
      { value: 'builder', label: 'Can build simple things', sub: 'I can make a basic page or script without help' },
    ] },
    { key: 'hours', title: 'How many hours can you give on a normal day?', help: 'A normal day, not your best day.', options: [
      { value: '1-2', label: '1–2 hours' }, { value: '3-4', label: '3–4 hours' }, { value: '5-6', label: '5–6 hours' }, { value: '7+', label: '7+ hours' },
    ] },
    { key: 'track_months', title: 'Which track?', help: 'Same content in every track, with less work per day on longer ones.', options: [
      { value: 6, label: '6 months', sub: 'Full-time, 6–8 hrs/day. Realistic job-ready time: 6–7 months.' },
      { value: 9, label: '9 months (recommended)', sub: 'Student or working, 3–4 hrs/day. Realistic: 9–12 months.' },
      { value: 12, label: '12 months', sub: 'Casual, 1–2 hrs/day. Realistic: 18+ months.' },
    ] },
    { key: 'background', title: 'What best describes you?', options: [
      { value: 'student', label: 'College student' },
      { value: 'graduate', label: 'Graduate looking for a job' },
      { value: 'professional', label: 'Working professional switching careers', sub: 'Your plan puts heavier work on weekends' },
    ] },
    { key: 'start', title: 'When do you want to start Day 1?', options: [
      { value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }, { value: 'monday', label: 'Next Monday' },
    ] },
    { key: 'rest_day', title: 'Pick your weekly rest day', help: 'One day off a week is built into the plan.',
      options: DAYS.map((d, i) => ({ value: i, label: d })) },
    { key: 'goal', title: "What's your goal?", help: 'This sets how much DSA you do.', options: [
      { value: 'any', label: 'Any developer job', sub: 'Small startup or service company. Typical fresher package ₹3–5 LPA' },
      { value: 'product', label: 'A good product company', sub: 'Mid-size product company or good startup. ₹6–12 LPA' },
      { value: 'top', label: 'A top product company', sub: 'Google, Microsoft, Amazon. ₹20–45+ LPA. Usually takes 12–24 months of steady DSA.' },
    ] },
  ];

  isSelected(k: keyof Answers, v: any) { return this.a()[k] === v; }

  answered = (k: keyof Answers) => {
    const v = this.a()[k];
    if (v === null) return false;
    if (k === 'background' && v === 'student') return this.a().college_year !== null;
    return true;
  };

  set(k: keyof Answers, v: any) { this.a.update((x) => ({ ...x, [k]: v })); }

  choose(k: keyof Answers, v: any) {
    this.set(k, v);
    if (k === 'hours') {
      const rec = v === '7+' ? 6 : v === '1-2' ? 12 : 9;
      this.set('track_months', rec);
    }
    if (k === 'track_months' || k === 'hours') this.refreshPreview();
  }

  private complete = computed(() => {
    const x = this.a();
    return { ...x, start: x.start ?? 'today', level: x.level ?? 'beginner', hours: x.hours ?? '3-4', background: x.background ?? 'graduate', goal: x.goal ?? 'any' };
  });

  async refreshPreview() {
    try { this.preview.set(await this.api.post('/onboarding/preview', this.complete())); } catch { /* preview is best-effort */ }
  }

  next() {
    this.step.update((s) => s + 1);
    if (this.step() === 7 || this.questions[this.step()]?.key === 'track_months') this.refreshPreview();
  }
  back() { this.step.update((s) => Math.max(0, s - 1)); }

  async finish() {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.post('/onboarding', this.a());
      this.router.navigate(['/']);
    } catch (e) {
      this.error.set(errMsg(e));
    } finally {
      this.busy.set(false);
    }
  }
}
