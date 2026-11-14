import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    title: 'Administración · FitPN',
    loadComponent: () => import('./admin-dashboard').then((m) => m.AdminDashboard),
  },
  {
    path: 'usuarios',
    title: 'Usuarios · FitPN',
    loadComponent: () => import('./user-list').then((m) => m.UserList),
  },
  {
    path: 'usuarios/nuevo',
    title: 'Nuevo usuario · FitPN',
    loadComponent: () => import('./user-create').then((m) => m.UserCreate),
  },
  {
    path: 'usuarios/:userId',
    title: 'Ficha de usuario · FitPN',
    loadComponent: () => import('./user-detail').then((m) => m.UserDetail),
  },
  {
    path: 'usuarios/:userId/entrenamientos',
    pathMatch: 'full',
    redirectTo: ({ params }) =>
      inject(Router).createUrlTree(['/admin/usuarios', params['userId']], {
        queryParams: { tab: 'entrenamientos' },
      }),
  },
  {
    path: 'usuarios/:userId/entrenamientos/nuevo',
    title: 'Nuevo entrenamiento · FitPN',
    loadComponent: () => import('../workouts/workout-form').then((m) => m.WorkoutForm),
  },
  {
    path: 'usuarios/:userId/entrenamientos/:workoutId',
    title: 'Entrenamiento · FitPN',
    loadComponent: () => import('../workouts/workout-detail').then((m) => m.WorkoutDetail),
  },
  {
    path: 'usuarios/:userId/entrenamientos/:workoutId/editar',
    title: 'Editar entrenamiento · FitPN',
    loadComponent: () => import('../workouts/workout-form').then((m) => m.WorkoutForm),
  },
  {
    path: 'ejercicios',
    title: 'Ejercicios · FitPN',
    loadComponent: () => import('./exercise-admin').then((m) => m.ExerciseAdmin),
  },
];
