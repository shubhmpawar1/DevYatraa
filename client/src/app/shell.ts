import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from './core/api';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <a routerLink="/" class="flex items-center gap-2 font-bold text-slate-900">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm text-white">JR</span>
          <span class="hidden sm:inline">Job-Ready Dev Plan</span>
        </a>
        <nav class="ml-auto hidden items-center gap-1 lg:flex">
          @for (l of links; track l.path) {
            <a [routerLink]="l.path" routerLinkActive="bg-brand-50 text-brand-700" [routerLinkActiveOptions]="{ exact: l.path === '/' }"
               class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">{{ l.label }}</a>
          }
          <button class="btn-ghost ml-2" (click)="logout()">Log out</button>
        </nav>
        <button class="btn-ghost ml-auto lg:hidden" (click)="open.set(!open())" aria-label="Menu">☰</button>
      </div>
      @if (open()) {
        <nav class="border-t border-slate-200 px-4 py-2 lg:hidden">
          @for (l of links; track l.path) {
            <a [routerLink]="l.path" (click)="open.set(false)" class="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">{{ l.label }}</a>
          }
          <button class="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100" (click)="logout()">Log out</button>
        </nav>
      }
    </header>
    <main class="mx-auto max-w-6xl px-4 py-6">
      <router-outlet />
    </main>
  `,
})
export class Shell {
  private auth = inject(Auth);
  private router = inject(Router);
  open = signal(false);
  links = [
    { path: '/', label: 'Dashboard' },
    { path: '/plan', label: 'Plan' },
    { path: '/revision', label: 'Revision' },
    { path: '/dsa', label: 'DSA' },
    { path: '/modules', label: 'Test-out' },
    { path: '/interview', label: 'Interview' },
    { path: '/log', label: 'Log' },
    { path: '/settings', label: 'Settings' },
  ];
  logout() {
    this.auth.set(null);
    this.router.navigate(['/login']);
  }
}
