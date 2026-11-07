import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Api, Auth } from './api';

export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  return auth.token() ? true : inject(Router).createUrlTree(['/login']);
};

/** Sends users who haven't answered the 7 onboarding questions to onboarding. */
export const onboardedGuard: CanActivateFn = async () => {
  const api = inject(Api);
  const router = inject(Router);
  try {
    const me = await api.get<{ onboarded: boolean }>('/auth/me');
    return me.onboarded ? true : router.createUrlTree(['/onboarding']);
  } catch {
    return router.createUrlTree(['/login']);
  }
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  return auth.token() ? inject(Router).createUrlTree(['/']) : true;
};
