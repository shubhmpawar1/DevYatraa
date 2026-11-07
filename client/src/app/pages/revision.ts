import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errMsg } from '../core/api';

@Component({
  selector: 'app-revision',
  imports: [RouterLink],
  template: `
    <h1 class="text-2xl font-bold text-slate-900">Revision</h1>
    <p class="mt-1 text-sm text-slate-500">Your weak areas come back here. Spend 10 minutes a day, or a full session on a welcome-back day.</p>
    @if (error()) { <p class="error-box mt-4">{{ error() }}</p> }
    @if (r(); as r) {
      <div class="mt-6 grid gap-4 lg:grid-cols-2">
        <section class="card">
          <p class="section-title">Weak topics</p>
          @if (r.weak.length) {
            <ul class="space-y-2">
              @for (w of r.weak; track w.id) {
                <li class="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-slate-900">{{ w.topic }}</p>
                    <p class="text-xs text-slate-400">{{ source(w.source) }}@if (w.day_number) { · Day {{ w.day_number }} }</p>
                  </div>
                  @if (w.day_number) { <a class="btn-ghost !px-2 !py-1 text-xs" [routerLink]="['/day', w.day_number]">Open day</a> }
                  <button class="btn-secondary !px-2 !py-1 text-xs" (click)="resolve(w.id)">I've got it now</button>
                </li>
              }
            </ul>
          } @else {
            <p class="text-sm text-slate-500">No weak topics. Nice.</p>
          }
        </section>

        <section class="card">
          <p class="section-title">Recent days to review</p>
          @if (r.recent.length) {
            @for (d of r.recent; track d.day_number) {
              <div class="mb-4">
                <a [routerLink]="['/day', d.day_number]" class="text-sm font-semibold text-brand-700">Day {{ d.day_number }}: {{ d.title }}</a>
                <p class="mt-1 text-xs text-slate-500">Can you explain each of these without notes?</p>
                <ul class="mt-1 list-disc pl-5 text-sm text-slate-700">
                  @for (c of d.concepts; track c) { <li>{{ c }}</li> }
                </ul>
              </div>
            }
          } @else {
            <p class="text-sm text-slate-500">Complete a day first.</p>
          }
        </section>

        @if (r.revisit.length) {
          <section class="card">
            <p class="section-title">DSA to re-solve</p>
            <ul class="space-y-1">
              @for (p of r.revisit; track p.id) {
                <li><a [href]="p.url" target="_blank" rel="noopener" class="text-sm text-brand-700 hover:underline">{{ p.title }}</a> <span class="text-xs text-slate-400">· {{ p.pattern }}</span></li>
              }
            </ul>
          </section>
        }
      </div>
    }
  `,
})
export class Revision implements OnInit {
  private api = inject(Api);
  r = signal<any>(null);
  error = signal('');

  async ngOnInit() { await this.load(); }
  async load() {
    try { this.r.set(await this.api.get('/revision')); } catch (e) { this.error.set(errMsg(e)); }
  }
  source(s: string) {
    return s === 'explain_back' ? 'From explain-back' : s === 'test_out' ? 'From a module test' : 'From a quiz';
  }
  async resolve(id: number) {
    await this.api.post(`/weak/${id}/resolve`);
    await this.load();
  }
}
