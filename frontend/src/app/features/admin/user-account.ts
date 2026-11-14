import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage, fieldErrors } from '../../core/api-error';
import { ADMIN_USERS_URL, AdminApi, UpdateUserInput } from '../../core/api/admin.api';
import { AuthService } from '../../core/auth/auth.service';
import { Renewal, Role, User } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { generatePassword } from './password';

/** Edición de la cuenta, suscripción, contraseña y baja de un usuario. */
@Component({
  selector: 'app-user-account',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './user-account.html',
  styles: `
    .cols {
      --min: 340px;
      align-items: start;
    }
    .end {
      justify-content: flex-end;
    }
    .danger-zone {
      border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
    }
    .pw {
      flex: 1;
      font-family: ui-monospace, monospace;
    }
    .checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
    }
  `,
})
export class UserAccount {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly auth = inject(AuthService);

  readonly user = input.required<User>();
  readonly changed = output<User>();

  protected readonly renewals = httpResource<Renewal[]>(
    () => `${ADMIN_USERS_URL}/${this.user().id}/renewals`,
    { defaultValue: [] },
  );

  protected readonly form = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['member' as Role],
    disabled: [false],
    activeUntil: [''],
  });
  protected readonly renewMonths = signal(1);
  protected readonly newPassword = signal('');
  protected readonly busy = signal(false);
  protected readonly errors = signal<Record<string, string>>({});

  constructor() {
    effect(() => {
      const u = this.user();
      this.form.reset({
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        disabled: u.disabled,
        activeUntil: u.activeUntil ? u.activeUntil.slice(0, 10) : '',
      });
      // Un administrador no puede cambiarse el rol a sí mismo.
      if (untracked(() => this.isSelf())) this.form.controls.role.disable();
      else this.form.controls.role.enable();
    });
  }

  protected isSelf(): boolean {
    return this.auth.user()?.id === this.user().id;
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const u = this.user();
    const patch: UpdateUserInput = {};
    if (v.fullName.trim() !== u.fullName) patch.fullName = v.fullName.trim();
    if (v.email.trim().toLowerCase() !== u.email) patch.email = v.email.trim();
    if (v.role !== u.role) patch.role = v.role;
    if (v.disabled !== u.disabled) patch.disabled = v.disabled;
    if (
      v.role === 'member' &&
      u.role === 'member' &&
      v.activeUntil &&
      v.activeUntil !== u.activeUntil?.slice(0, 10)
    ) {
      // Se fija al final del día elegido (hora local).
      patch.activeUntil = new Date(`${v.activeUntil}T23:59:59`).toISOString();
    }
    if (Object.keys(patch).length === 0) {
      this.notify.info('No hay cambios que guardar');
      return;
    }
    await this.run(async () => {
      const updated = await firstValueFrom(this.api.updateUser(u.id, patch));
      this.notify.success('Usuario actualizado');
      this.changed.emit(updated);
    });
  }

  protected async renew(): Promise<void> {
    await this.run(async () => {
      const updated = await firstValueFrom(this.api.renew(this.user().id, this.renewMonths()));
      this.notify.success('Suscripción renovada');
      this.changed.emit(updated);
      this.renewals.reload();
    });
  }

  protected generatePassword(): void {
    this.newPassword.set(generatePassword());
  }

  protected async resetPassword(): Promise<void> {
    const pw = this.newPassword();
    if (pw.length < 8) {
      this.notify.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    await this.run(async () => {
      await firstValueFrom(this.api.resetPassword(this.user().id, pw));
      this.notify.success('Contraseña restablecida. Se han cerrado sus sesiones.');
    });
  }

  protected async remove(): Promise<void> {
    const u = this.user();
    if (
      !confirm(
        `¿Eliminar definitivamente a ${u.fullName} y TODOS sus datos (entrenamientos, medidas, planes)?`,
      )
    )
      return;
    await this.run(async () => {
      await firstValueFrom(this.api.deleteUser(u.id));
      this.notify.success('Usuario eliminado');
      await this.router.navigate(['/admin/usuarios']);
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.errors.set({});
    try {
      await fn();
    } catch (err) {
      this.errors.set(fieldErrors(err));
      this.notify.error(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
