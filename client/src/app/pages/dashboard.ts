import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, errMsg } from '../core/api';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  template: `
    @if (error()) { <p class="error-box">{{ error() }}</p> }
    @if (d(); as d) {
      @if (d.plan.showWelcomeBack) {
        <div class="fixed inset-0 z-30 grid place-items-center bg-slate-900/40 p-4">
          <div class="card max-w-md text-center">
            <p class="text-4xl">👋</p>
            <h2 class="mt-2 text-xl font-bold text-slate-900">Welcome back!</h2>
            <p class="mt-2 text-slate-600">It's been {{ d.plan.missedInARow }} working days. That happens to everyone. Your plan has already moved forward, and your finish date is now {{ d.projectedFinishPretty }}.</p>
            <p class="mt-2 text-slate-600">Want to start with a short revision day to warm up?</p>
            <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button class="btn-primary" (click)="welcome(true)">Start with revision</button>
              <button class="btn-secondary" (click)="welcome(false)">Go straight to Day {{ d.plan.currentDay }}</button>
            </div>
          </div>
        </div>
      }

      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-sm text-slate-500">{{ greeting() }}</p>
          <h1 class="text-2xl font-bold text-slate-900">
            @if (d.plan.currentDay) { Day {{ d.plan.currentDay }} of {{ d.totalDays }} } @else { Plan complete 🎉 }
          </h1>
        </div>
        @if (d.finishMessage) {
          <p class="rounded-xl bg-slate-100 px-3 py-1.5 text-sm text-slate-600">{{ d.finishMessage }}</p>
        }
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-3">
        <!-- Today -->
        <div class="card lg:col-span-2">
          <p class="section-title">Today</p>
          @if (d.plan.notStartedYet) {
            <p class="text-lg font-semibold text-slate-900">Your plan starts {{ d.startPretty }}.</p>
            <p class="mt-1 text-slate-600">You can open Day 1 now to get set up early.</p>
            <a class="btn-primary mt-4" routerLink="/day/1">Preview Day 1</a>
          } @else if (d.isRestDay) {
            <p class="text-lg font-semibold text-slate-900">Rest day 🌿</p>
            <p class="mt-1 text-slate-600">Rest is part of the plan. If you want, do a light revision, or nothing at all.</p>
            <a class="btn-secondary mt-4" routerLink="/revision">Light revision</a>
          } @else if (d.current) {
            <p class="text-xs font-medium text-brand-600">Week {{ d.current.week }} · Phase {{ d.current.phase }}</p>
            <p class="mt-1 text-xl font-semibold text-slate-900">{{ d.current.title }}</p>
            @if (d.plan.completedToday) {
              <p class="ok-box mt-3">✓ You finished a day today. Working ahead is fine, and so is stopping here.</p>
            } @else if (d.profile.track_months !== 6) {
              <p class="mt-2 text-sm text-slate-500">On the {{ d.profile.track_months }}-month track, one day of content takes about {{ d.profile.track_months === 9 ? '1.5' : '2' }} sessions. Split it however suits you.</p>
            }
            @if (todayTasks().length) {
              <p class="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Today's tasks</p>
              <ul class="mt-2 space-y-1.5">
                @for (t of todayTasks(); track $index) {
                  <li class="text-sm text-slate-700"><span class="font-medium">Day {{ t.day }}</span> · {{ t.label }}@if (t.kind === 'build' && t.detail) { <span class="text-slate-500"> ({{ t.detail }})</span> }</li>
                }
              </ul>
            }
            <div class="mt-4 flex flex-wrap gap-2">
              <a class="btn-primary" [routerLink]="['/day', d.plan.currentDay]">Open Day {{ d.plan.currentDay }} →</a>
              <a class="btn-secondary" routerLink="/plan">See the full calendar</a>
            </div>
          } @else if (d.plan.currentDay) {
            <p class="text-lg font-semibold text-slate-900">Day {{ d.plan.currentDay }} isn't written yet</p>
            <p class="mt-1 text-slate-600">Content is written in 1–2 week batches. Export your progress log and share it so the next batch fits how you're doing.</p>
            <a class="btn-secondary mt-4" routerLink="/log">Open progress log</a>
          } @else {
            <p class="text-lg font-semibold text-slate-900">You finished every day of the plan.</p>
            <a class="btn-primary mt-4" routerLink="/interview">Go to interview prep</a>
          }
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-2 gap-4">
          <div class="card">
            <p class="text-xs text-slate-500">Streak</p>
            <p class="mt-1 text-3xl font-bold text-slate-900">{{ d.plan.streak }}<span class="text-base font-medium text-slate-400"> days</span></p>
            <p class="mt-1 text-xs text-slate-400">Real commits only</p>
          </div>
          <div class="card">
            <p class="text-xs text-slate-500">Progress</p>
            <p class="mt-1 text-3xl font-bold text-slate-900">{{ d.percent }}<span class="text-base font-medium text-slate-400">%</span></p>
            <p class="mt-1 text-xs text-slate-400">{{ d.plan.doneCount }}/{{ d.totalDays }} days</p>
          </div>
          <div class="card col-span-2">
            <p class="text-xs text-slate-500">Expected finish</p>
            <p class="mt-1 text-lg font-bold text-slate-900">{{ d.projectedFinishPretty }}</p>
            <p class="mt-1 text-xs text-slate-400">{{ d.profile.track_months }}-month track · {{ d.profile.hours }} hrs/day · {{ d.profile.restDayName }} off</p>
          </div>
        </div>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <div class="card lg:col-span-2">
          <p class="section-title">Phases</p>
          <div class="space-y-3">
            @for (p of d.phases; track p.phase) {
              <div>
                <div class="flex justify-between text-sm">
                  <span class="font-medium text-slate-700">{{ p.phase }}. {{ p.title }}</span>
                  <span class="text-slate-400">{{ p.done }}/{{ p.days }}</span>
                </div>
                <div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div class="h-full rounded-full bg-brand-500" [style.width.%]="(p.done / p.days) * 100"></div>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="space-y-4">
          <div class="card">
            <div class="flex items-center justify-between">
              <p class="section-title !mb-0">Weak topics</p>
              <a routerLink="/revision" class="text-xs font-semibold text-brand-600">Revise →</a>
            </div>
            @if (d.weak.length) {
              <div class="mt-3 flex flex-wrap gap-1.5">
                @for (w of d.weak.slice(0, 8); track w.id) { <span class="chip bg-amber-50 text-amber-800">{{ w.topic }}</span> }
              </div>
            } @else {
              <p class="mt-3 text-sm text-slate-500">None right now. Topics you struggle with in explain-back, quizzes or tests show up here.</p>
            }
          </div>
          <div class="card grid grid-cols-2 gap-4">
            <a routerLink="/dsa">
              <p class="text-xs text-slate-500">DSA solved</p>
              <p class="mt-1 text-2xl font-bold text-slate-900">{{ d.dsa.solved }}</p>
              <p class="text-xs text-slate-400">goal ≈ 300</p>
            </a>
            <div>
              <p class="text-xs text-slate-500">Aptitude avg</p>
              <p class="mt-1 text-2xl font-bold text-slate-900">{{ d.aptitude.avg ?? '–' }}{{ d.aptitude.avg !== null ? '%' : '' }}</p>
              <p class="text-xs text-slate-400">{{ d.aptitude.tests }} quizzes</p>
            </div>
          </div>
        </div>
      </div>

      @if (!d.aiGrading) {
        <p class="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          AI grading is off, so explain-back uses honest self-assessment. To turn it on, add an Anthropic API key to <code class="rounded bg-slate-100 px-1">server/.env</code> (pay-as-you-go, a few rupees a day for one learner).
        </p>
      }
    }
  `,
})
export class Dashboard implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  d = signal<any>(null);
  todayTasks = signal<any[]>([]);
  error = signal('');

  async ngOnInit() {
    try { this.d.set(await this.api.get('/dashboard')); } catch (e) { this.error.set(errMsg(e)); }
    try {
      const s = await this.api.get<any>('/plan/schedule?days=2');
      const first = s.dates.find((x: any) => x.date === s.today);
      this.todayTasks.set(first && !first.rest ? first.tasks : []);
    } catch { /* the Today card still works without the task list */ }
  }

  greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  async welcome(revision: boolean) {
    await this.api.post('/welcome-back');
    if (revision) this.router.navigate(['/revision']);
    else this.router.navigate(['/day', this.d().plan.currentDay]);
  }
}
