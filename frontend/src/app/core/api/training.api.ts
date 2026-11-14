import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Exercise, Measurement, MeasurementInput, Workout, WorkoutInput } from '../models';

/**
 * Prefijo de los datos de entrenamiento de un usuario: los del propio usuario
 * (`/me`) o los de un alumno concreto cuando quien consulta es un administrador.
 */
export function userBase(userId?: number | null): string {
  return userId ? `/api/v1/admin/users/${userId}` : '/api/v1/me';
}

export const EXERCISES_URL = '/api/v1/exercises';

/** Operaciones de escritura sobre entrenamientos, medidas y ejercicios. */
@Injectable({ providedIn: 'root' })
export class TrainingApi {
  private readonly http = inject(HttpClient);

  createWorkout(input: WorkoutInput, userId?: number | null): Observable<Workout> {
    return this.http.post<Workout>(`${userBase(userId)}/workouts`, input);
  }

  updateWorkout(id: number, input: WorkoutInput, userId?: number | null): Observable<Workout> {
    return this.http.put<Workout>(`${userBase(userId)}/workouts/${id}`, input);
  }

  deleteWorkout(id: number, userId?: number | null): Observable<void> {
    return this.http.delete<void>(`${userBase(userId)}/workouts/${id}`);
  }

  createMeasurement(input: MeasurementInput, userId?: number | null): Observable<Measurement> {
    return this.http.post<Measurement>(`${userBase(userId)}/measurements`, input);
  }

  deleteMeasurement(id: number, userId?: number | null): Observable<void> {
    return this.http.delete<void>(`${userBase(userId)}/measurements/${id}`);
  }

  createExercise(input: Omit<Exercise, 'id'>): Observable<Exercise> {
    return this.http.post<Exercise>(EXERCISES_URL, input);
  }

  updateExercise(id: number, input: Omit<Exercise, 'id'>): Observable<Exercise> {
    return this.http.put<Exercise>(`${EXERCISES_URL}/${id}`, input);
  }

  deleteExercise(id: number): Observable<void> {
    return this.http.delete<void>(`${EXERCISES_URL}/${id}`);
  }
}
