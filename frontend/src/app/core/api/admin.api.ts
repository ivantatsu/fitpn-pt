import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Plan, PlanInput, Role, Session, User } from '../models';

export const ADMIN_USERS_URL = '/api/v1/admin/users';

export interface CreateUserInput {
  email: string;
  fullName: string;
  password: string;
  role: Role;
  months: number;
}

export interface UpdateUserInput {
  email?: string;
  fullName?: string;
  role?: Role;
  disabled?: boolean;
  activeUntil?: string;
}

/** Operaciones de escritura del panel de administración. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  createUser(input: CreateUserInput): Observable<User> {
    return this.http.post<User>(ADMIN_USERS_URL, input);
  }

  updateUser(id: number, input: UpdateUserInput): Observable<User> {
    return this.http.patch<User>(`${ADMIN_USERS_URL}/${id}`, input);
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${ADMIN_USERS_URL}/${id}`);
  }

  renew(id: number, months: number): Observable<User> {
    return this.http.post<User>(`${ADMIN_USERS_URL}/${id}/renew`, { months });
  }

  resetPassword(id: number, password: string): Observable<void> {
    return this.http.put<void>(`${ADMIN_USERS_URL}/${id}/password`, { password });
  }

  createPlan(userId: number, input: PlanInput): Observable<Plan> {
    return this.http.post<Plan>(`${ADMIN_USERS_URL}/${userId}/plans`, input);
  }

  updatePlan(userId: number, planId: number, input: PlanInput): Observable<Plan> {
    return this.http.put<Plan>(`${ADMIN_USERS_URL}/${userId}/plans/${planId}`, input);
  }

  deletePlan(userId: number, planId: number): Observable<void> {
    return this.http.delete<void>(`${ADMIN_USERS_URL}/${userId}/plans/${planId}`);
  }
}

/** Cambio de contraseña del propio usuario. */
@Injectable({ providedIn: 'root' })
export class AccountApi {
  private readonly http = inject(HttpClient);

  changePassword(currentPassword: string, newPassword: string): Observable<Session> {
    return this.http.put<Session>('/api/v1/me/password', { currentPassword, newPassword });
  }
}
