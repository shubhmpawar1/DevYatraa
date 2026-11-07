import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, Auth, errMsg } from '../core/api';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="grid min-h-screen lg:grid-cols-2">
      <section class="hidden flex-col justify-between bg-slate-900 p-12 text-white lg:flex">
        <div class="flex items-center gap-2 font-bold"><span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-500">JR</span> Job-Ready Dev Plan</div>
        <div>
          <h1 class="text-4xl font-bold leading-tight">One task. One proof.<br />One check that you really understood it.</h1>
          <ul class="mt-8 space-y-3 text-slate-300">
            <li>→ A day-wise plan, not a roadmap: we tell you what to do today.</li>
            <li>→ Learning that can't be faked: commits as proof, explain-back on your own code, debug labs.</li>
            <li>→ Honest timelines and outcomes. No overpromising.</li>
          </ul>
        </div>
        <p class="text-sm text-slate-500">Free. Built for beginners, students, graduates and career switchers.</p>
      </section>

      <section class="flex items-center justify-center p-6">
        <form class="w-full max-w-sm space-y-4" (ngSubmit)="submit()">
          <div>
            <h2 class="text-2xl font-bold text-slate-900">{{ mode() === 'login' ? 'Welcome back' : 'Create your account' }}</h2>
            <p class="mt-1 text-sm text-slate-500">{{ mode() === 'login' ? 'Log in to continue your plan.' : 'It takes 2 minutes to set up your plan.' }}</p>
          </div>
          @if (mode() === 'register') {
            <div><label class="label" for="name">Name</label><input id="name" class="input" name="name" [(ngModel)]="name" required autocomplete="name" /></div>
          }
          <div><label class="label" for="email">Email</label><input id="email" class="input" type="email" name="email" [(ngModel)]="email" required autocomplete="email" /></div>
          <div>
            <label class="label" for="pw">Password</label>
            <input id="pw" class="input" type="password" name="password" [(ngModel)]="password" required minlength="8"
                   [autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'" />
            @if (mode() === 'register') { <p class="mt-1 text-xs text-slate-500">At least 8 characters.</p> }
          </div>
          @if (error()) { <p class="error-box">{{ error() }}</p> }
          <button class="btn-primary w-full" [disabled]="busy()">{{ busy() ? 'Please wait…' : mode() === 'login' ? 'Log in' : 'Create account' }}</button>
          <p class="text-center text-sm text-slate-500">
            {{ mode() === 'login' ? 'New here?' : 'Already have an account?' }}
            <a class="font-semibold text-brand-600" (click)="toggle()">{{ mode() === 'login' ? 'Create an account' : 'Log in' }}</a>
          </p>
        </form>
      </section>
    </div>
  `,
})
export class Login {
  private api = inject(Api);
  private auth = inject(Auth);
  private router = inject(Router);
  mode = signal<'login' | 'register'>('login');
  busy = signal(false);
  error = signal('');
  name = '';
  email = '';
  password = '';

  toggle() {
    this.mode.set(this.mode() === 'login' ? 'register' : 'login');
    this.error.set('');
  }

  async submit() {
    this.busy.set(true);
    this.error.set('');
    try {
      const body = this.mode() === 'login'
        ? { email: this.email, password: this.password }
        : { name: this.name, email: this.email, password: this.password };
      const { token } = await this.api.post<{ token: string }>(`/auth/${this.mode()}`, body);
      this.auth.set(token);
      this.router.navigate([this.mode() === 'register' ? '/onboarding' : '/']);
    } catch (e) {
      this.error.set(errMsg(e));
    } finally {
      this.busy.set(false);
    }
  }
}
