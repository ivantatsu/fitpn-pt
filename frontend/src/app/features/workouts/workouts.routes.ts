import { Routes } from '@angular/router';

export const WORKOUT_ROUTES: Routes = [
  {
    path: '',
    title: 'Entrenamientos · FitPN',
    loadComponent: () => import('./workout-list').then((m) => m.WorkoutList),
  },
  {
    path: 'nuevo',
    title: 'Nuevo entrenamiento · FitPN',
    loadComponent: () => import('./workout-form').then((m) => m.WorkoutForm),
  },
  {
    path: ':workoutId',
    title: 'Entrenamiento · FitPN',
    loadComponent: () => import('./workout-detail').then((m) => m.WorkoutDetail),
  },
  {
    path: ':workoutId/editar',
    title: 'Editar entrenamiento · FitPN',
    loadComponent: () => import('./workout-form').then((m) => m.WorkoutForm),
  },
];
