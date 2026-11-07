import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { catchError, throwError } from 'rxjs';

const TOKEN_KEY = 'jobready_token';

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

@Injectable({ providedIn: 'root' })
export class Auth {
  readonly token = signal<string | null>(readToken());

  set(token: string | null) {
    this.token.set(token);
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage blocked: session-only login */ }
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const t = auth.token();
  const r = t ? req.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : req;
  return next(r).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes('/auth/')) {
        auth.set(null);
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};

/** Pulls the server's friendly error message out of an HttpErrorResponse. */
export function errMsg(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'Cannot reach the server. Is the API running?';
    return e.error?.error ?? `Request failed (${e.status}).`;
  }
  return 'Something went wrong.';
}

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  get<T = any>(url: string) { return firstValueFrom(this.http.get<T>(`/api${url}`)); }
  getText(url: string) { return firstValueFrom(this.http.get(`/api${url}`, { responseType: 'text' })); }
  post<T = any>(url: string, body: unknown = {}) { return firstValueFrom(this.http.post<T>(`/api${url}`, body)); }
  put<T = any>(url: string, body: unknown = {}) { return firstValueFrom(this.http.put<T>(`/api${url}`, body)); }
}
