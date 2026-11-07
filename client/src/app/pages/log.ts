import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errMsg } from '../core/api';

@Component({
  selector: 'app-log',
  imports: [FormsModule],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Progress log</h1>
        <p class="mt-1 max-w-2xl text-sm text-slate-500">Day, what you did, and where it was hard. Export it and share it when the next content batch is written, so later weeks fit how you're really doing.</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-secondary" (click)="copyExport()">{{ copied() ? 'Copied ✓' : 'Copy as Markdown' }}</button>
        <button class="btn-secondary" (click)="download()">Download .md</button>
      </div>
    </div>
    @if (error()) { <p class="error-box mt-4">{{ error() }}</p> }

    <form class="card mt-6 grid gap-3 md:grid-cols-[1fr_1fr_120px_auto] md:items-end" (ngSubmit)="add()">
      <div><label class="label" for="done">What you did</label><input id="done" class="input" name="done" [(ngModel)]="done" /></div>
      <div><label class="label" for="hard">Where it was hard</label><input id="hard" class="input" name="hard" [(ngModel)]="hard" /></div>
      <div><label class="label" for="min">Minutes</label><input id="min" class="input" type="number" min="0" name="min" [(ngModel)]="minutes" /></div>
      <button class="btn-primary" [disabled]="!done.trim()">Add entry</button>
    </form>

    <div class="card mt-4 overflow-x-auto !p-0">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-slate-500">
          <tr><th class="px-4 py-2 font-medium">Date</th><th class="px-4 py-2 font-medium">Day</th><th class="px-4 py-2 font-medium">Done</th><th class="px-4 py-2 font-medium">Hard</th><th class="px-4 py-2 font-medium">Min</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          @for (r of rows(); track r.id) {
            <tr class="align-top">
              <td class="whitespace-nowrap px-4 py-2 text-slate-500">{{ r.log_date }}</td>
              <td class="px-4 py-2">{{ r.day_number }}</td>
              <td class="px-4 py-2 text-slate-800">{{ r.done }}</td>
              <td class="px-4 py-2 text-slate-600">{{ r.hard }}</td>
              <td class="px-4 py-2 text-slate-500">{{ r.minutes }}</td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="px-4 py-6 text-center text-slate-400">No entries yet. You'll be asked for one each time you complete a day.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class Log implements OnInit {
  private api = inject(Api);
  rows = signal<any[]>([]);
  error = signal('');
  copied = signal(false);
  done = '';
  hard = '';
  minutes: number | null = null;

  async ngOnInit() { await this.load(); }
  async load() {
    try { this.rows.set(await this.api.get('/log')); } catch (e) { this.error.set(errMsg(e)); }
  }

  async add() {
    try {
      await this.api.post('/log', { done: this.done, hard: this.hard || undefined, minutes: this.minutes ?? undefined });
      this.done = ''; this.hard = ''; this.minutes = null;
      await this.load();
    } catch (e) { this.error.set(errMsg(e)); }
  }

  async copyExport() {
    try {
      await navigator.clipboard.writeText(await this.api.getText('/log/export'));
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch (e) { this.error.set(errMsg(e)); }
  }

  async download() {
    try {
      const md = await this.api.getText('/log/export');
      const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `progress-log-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { this.error.set(errMsg(e)); }
  }
}
