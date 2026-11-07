import { Component, inject, OnInit, signal } from '@angular/core';
import { Api, errMsg } from '../core/api';

@Component({
  selector: 'app-interview',
  template: `
    <h1 class="text-2xl font-bold text-slate-900">Interview prep</h1>
    <p class="mt-1 text-sm text-slate-500">Most of this happens in Phase 6, but HR answers get better the earlier you start drafting them.</p>
    @if (error()) { <p class="error-box mt-4">{{ error() }}</p> }

    <div class="mt-6 grid gap-4 md:grid-cols-2">
      @for (s of sections(); track s.section) {
        <section class="card">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-slate-900">{{ s.section }}</h2>
            <span class="text-xs text-slate-400">{{ count(s) }}/{{ s.items.length }}</span>
          </div>
          @if (s.note) { <p class="mt-1 text-xs text-slate-500">{{ s.note }}</p> }
          <ul class="mt-3 space-y-2">
            @for (i of s.items; track i.id) {
              <li>
                <label class="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" class="mt-0.5 accent-brand-600" [checked]="checked().has(i.id)" (change)="toggle(i.id)" />
                  <span [class.text-slate-400]="checked().has(i.id)">{{ i.text }}</span>
                </label>
              </li>
            }
          </ul>
        </section>
      }
    </div>

    <section class="card mt-6">
      <p class="section-title">Expected outcomes (India, approximate)</p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-slate-500"><th class="py-2 pr-4 font-medium">Where you land</th><th class="py-2 font-medium">Typical fresher package</th></tr></thead>
          <tbody class="divide-y divide-slate-100 text-slate-700">
            <tr><td class="py-2 pr-4">Small startup or service company</td><td>₹3–5 LPA</td></tr>
            <tr><td class="py-2 pr-4">Mid-size product company or good startup</td><td>₹6–12 LPA</td></tr>
            <tr><td class="py-2 pr-4">Top product companies (Google, Microsoft, Amazon)</td><td>₹20–45+ LPA</td></tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-slate-500">Most learners who finish seriously land in the first two rows within 2–4 months of applying. The top row usually needs 12–24 months of steady DSA, and often a first job first. Ranges change yearly; check current listings before relying on them.</p>
    </section>
  `,
})
export class Interview implements OnInit {
  private api = inject(Api);
  sections = signal<any[]>([]);
  checked = signal<Set<string>>(new Set());
  error = signal('');

  async ngOnInit() {
    try {
      const r = await this.api.get('/interview');
      this.sections.set(r.sections);
      this.checked.set(new Set(r.checked));
    } catch (e) { this.error.set(errMsg(e)); }
  }

  count(s: any) { return s.items.filter((i: any) => this.checked().has(i.id)).length; }

  async toggle(id: string) {
    const next = new Set(this.checked());
    const on = !next.has(id);
    on ? next.add(id) : next.delete(id);
    this.checked.set(next);
    try { await this.api.put(`/interview/${id}`, { checked: on }); } catch (e) { this.error.set(errMsg(e)); }
  }
}
