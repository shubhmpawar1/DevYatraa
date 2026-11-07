import { Routes } from '@angular/router';
import { authGuard, guestGuard, onboardedGuard } from './core/guards';
import { Shell } from './shell';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login').then((m) => m.Login) },
  { path: 'onboarding', canActivate: [authGuard], loadComponent: () => import('./pages/onboarding').then((m) => m.Onboarding) },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard, onboardedGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/dashboard').then((m) => m.Dashboard) },
      { path: 'day/:n', loadComponent: () => import('./pages/day').then((m) => m.Day) },
      { path: 'plan', loadComponent: () => import('./pages/plan').then((m) => m.Plan) },
      { path: 'modules', loadComponent: () => import('./pages/modules').then((m) => m.Modules) },
      { path: 'modules/:id/test', loadComponent: () => import('./pages/module-test').then((m) => m.ModuleTest) },
      { path: 'dsa', loadComponent: () => import('./pages/dsa').then((m) => m.Dsa) },
      { path: 'revision', loadComponent: () => import('./pages/revision').then((m) => m.Revision) },
      { path: 'interview', loadComponent: () => import('./pages/interview').then((m) => m.Interview) },
      { path: 'log', loadComponent: () => import('./pages/log').then((m) => m.Log) },
      { path: 'settings', loadComponent: () => import('./pages/settings').then((m) => m.Settings) },
    ],
  },
  { path: '**', redirectTo: '' },
];
