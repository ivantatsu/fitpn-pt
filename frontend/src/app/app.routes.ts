import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/auth/guards';
import { AuthService } from './core/auth/auth.service';

export const routes: Routes = [
  {
    path: 'login',
    canMatch: [guestGuard],
    title: 'Acceso · FitPN',
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: '',
    canMatch: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: () => (inject(AuthService).isAdmin() ? 'admin' : 'panel'),
      },
      {
        path: 'panel',
        title: 'Mi panel · FitPN',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'simulacro',
        title: 'Simulacro · FitPN',
        loadComponent: () => import('./features/simulator/simulator').then((m) => m.Simulator),
      },
      {
        path: 'ejercicios',
        title: 'Ejercicios · FitPN',
        loadComponent: () =>
          import('./features/library/exercise-library').then((m) => m.ExerciseLibrary),
      },
      {
        path: 'pruebas',
        title: 'Pruebas físicas · FitPN',
        loadComponent: () => import('./features/tests/physical-tests').then((m) => m.PhysicalTests),
      },
      {
        path: 'entrenamientos',
        loadChildren: () =>
          import('./features/workouts/workouts.routes').then((m) => m.WORKOUT_ROUTES),
      },
      {
        path: 'medidas',
        title: 'Medidas · FitPN',
        loadComponent: () =>
          import('./features/measurements/measurements').then((m) => m.Measurements),
      },
      {
        path: 'planes',
        title: 'Mis planes · FitPN',
        loadComponent: () => import('./features/plans/plan-list').then((m) => m.PlanList),
      },
      {
        path: 'progreso',
        title: 'Progreso · FitPN',
        loadComponent: () =>
          import('./features/progress/exercise-progress').then((m) => m.ExerciseProgress),
      },
      {
        path: 'perfil',
        title: 'Mi perfil · FitPN',
        loadComponent: () => import('./features/profile/profile').then((m) => m.Profile),
      },
      {
        path: 'admin',
        canMatch: [adminGuard],
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
