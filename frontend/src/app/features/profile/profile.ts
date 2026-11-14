import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { errorMessage, fieldErrors } from '../../core/api-error';
import { AccountApi } from '../../core/api/admin.api';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notification.service';
import { StatusBadge } from '../../shared/status-badge';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const { newPassword, confirm } = group.value as { newPassword: string; confirm: string };
  return newPassword === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, DatePipe, StatusBadge],
  template: `
    <div class="page-header"><h1>Mi perfil</h1></div>

    <div class="grid" style="--min: 320px; align-items: start">
      @if (auth.user(); as u) {
        <section class="card">
          <h2>Datos de la cuenta</h2>
          <dl>
            <dt>Nombre</dt>
            <dd>{{ u.fullName }}</dd>
            <dt>Email</dt>
            <dd>{{ u.email }}</dd>
            <dt>Rol</dt>
            <dd>{{ u.role === 'admin' ? 'Administrador' : 'Alumno' }}</dd>
            <dt>Suscripción</dt>
            <dd>
              <app-status-badge [status]="u.status" />
              @if (u.activeUntil) {
                <span> hasta el {{ u.activeUntil | date: 'd MMM y, HH:mm' }}</span>
              }
            </dd>
            <dt>Alta</dt>
            <dd>{{ u.createdAt | date: 'd MMM y' }}</dd>
          </dl>
        </section>
      }

      <section class="card">
        <h2>Cambiar contraseña</h2>
        <form [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
          <div class="field">
            <label for="current">Contraseña actual</label>
            <input
              id="current"
              class="input"
              type="password"
              formControlName="currentPassword"
              autocomplete="current-password"
            />
            @if (errors()['currentPassword']; as e) {
              <span class="error-text">{{ e }}</span>
            }
          </div>
          <div class="field">
            <label for="new">Nueva contraseña</label>
            <input
              id="new"
              class="input"
              type="password"
              formControlName="newPassword"
              autocomplete="new-password"
            />
            @if (form.controls.newPassword.touched && form.controls.newPassword.invalid) {
              <span class="error-text">Entre 8 y 72 caracteres</span>
            }
          </div>
          <div class="field">
            <label for="confirm">Repite la nueva contraseña</label>
            <input
              id="confirm"
              class="input"
              type="password"
              formControlName="confirm"
              autocomplete="new-password"
            />
            @if (form.touched && form.hasError('mismatch')) {
              <span class="error-text">Las contraseñas no coinciden</span>
            }
          </div>
          <button class="btn btn-primary" type="submit" [disabled]="saving()">
            Actualizar contraseña
          </button>
          <p class="muted small">Por seguridad se cerrarán tus sesiones en otros dispositivos.</p>
        </form>
      </section>
    </div>
  `,
  styles: `
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.6rem 1.25rem;
      margin: 0;
    }
    dt {
      color: var(--text-muted);
    }
    dd {
      margin: 0;
    }
  `,
})
export class Profile {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(AccountApi);
  private readonly notify = inject(NotificationService);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );
  protected readonly saving = signal(false);
  protected readonly errors = signal<Record<string, string>>({});

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errors.set({});
    const { currentPassword, newPassword } = this.form.getRawValue();
    try {
      const session = await firstValueFrom(this.api.changePassword(currentPassword, newPassword));
      this.auth.setSession(session);
      this.form.reset();
      this.notify.success('Contraseña actualizada');
    } catch (err) {
      this.errors.set(fieldErrors(err));
      this.notify.error(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
