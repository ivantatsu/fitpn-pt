import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage, fieldErrors } from '../../core/api-error';
import { AdminApi } from '../../core/api/admin.api';
import { Role } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { generatePassword } from './password';

@Component({
  selector: 'app-user-create',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <a routerLink="/admin/usuarios" class="back">← Volver a usuarios</a>
    <div class="page-header"><h1>Nuevo usuario</h1></div>

    <form [formGroup]="form" (ngSubmit)="save()" class="card stack form" novalidate>
      <div class="form-grid">
        <div class="field">
          <label for="fullName">Nombre completo</label>
          <input id="fullName" class="input" formControlName="fullName" autocomplete="off" />
          @if (show('fullName')) {
            <span class="error-text">{{ errors()['fullName'] ?? 'Entre 2 y 100 caracteres' }}</span>
          }
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" class="input" type="email" formControlName="email" autocomplete="off" />
          @if (show('email')) {
            <span class="error-text">{{ errors()['email'] ?? 'Email no válido' }}</span>
          }
        </div>
      </div>

      <div class="field">
        <label for="password">Contraseña inicial</label>
        <div class="row">
          <input
            id="password"
            class="input pw"
            type="text"
            formControlName="password"
            autocomplete="new-password"
          />
          <button type="button" class="btn" (click)="generate()">Generar</button>
        </div>
        <span class="muted small"
          >Compártela con el socio de forma segura; podrá cambiarla desde su perfil.</span
        >
        @if (show('password')) {
          <span class="error-text">{{ errors()['password'] ?? 'Entre 8 y 72 caracteres' }}</span>
        }
      </div>

      <div class="form-grid">
        <div class="field">
          <label for="role">Rol</label>
          <select id="role" class="input" formControlName="role">
            <option value="member">Socio (acceso con caducidad)</option>
            <option value="admin">Administrador (sin caducidad)</option>
          </select>
        </div>
        @if (form.controls.role.value === 'member') {
          <div class="field">
            <label for="months">Duración inicial del acceso</label>
            <select id="months" class="input" formControlName="months">
              @for (m of monthOptions; track m) {
                <option [ngValue]="m">{{ m }} {{ m === 1 ? 'mes' : 'meses' }}</option>
              }
            </select>
          </div>
        }
      </div>

      <div class="row end">
        <a class="btn" routerLink="/admin/usuarios">Cancelar</a>
        <button class="btn btn-primary" type="submit" [disabled]="saving()">Crear usuario</button>
      </div>
    </form>
  `,
  styles: `
    .back {
      display: inline-block;
      margin-bottom: 1rem;
    }
    .form {
      max-width: 760px;
    }
    .pw {
      flex: 1;
      font-family: ui-monospace, monospace;
    }
    .end {
      justify-content: flex-end;
    }
  `,
})
export class UserCreate {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  protected readonly monthOptions = [1, 2, 3, 6, 12];
  protected readonly form = inject(NonNullableFormBuilder).group({
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: [
      generatePassword(),
      [Validators.required, Validators.minLength(8), Validators.maxLength(72)],
    ],
    role: ['member' as Role],
    months: [1],
  });
  protected readonly saving = signal(false);
  protected readonly errors = signal<Record<string, string>>({});

  protected show(name: 'fullName' | 'email' | 'password'): boolean {
    const c = this.form.controls[name];
    return (c.touched && c.invalid) || !!this.errors()[name];
  }

  protected generate(): void {
    this.form.controls.password.setValue(generatePassword());
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errors.set({});
    try {
      const v = this.form.getRawValue();
      const user = await firstValueFrom(
        this.api.createUser({ ...v, email: v.email.trim(), fullName: v.fullName.trim() }),
      );
      this.notify.success(`Usuario ${user.fullName} creado`);
      await this.router.navigate(['/admin/usuarios', user.id]);
    } catch (err) {
      this.errors.set(fieldErrors(err));
      this.notify.error(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
