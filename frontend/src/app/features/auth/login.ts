import { Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorCode, errorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { DEMO_MODE } from '../../core/demo-mode';
import { BrandMark } from '../../shared/brand-mark';
import { Pictogram } from '../../shared/pictogram';

const REASONS: Record<string, string> = {
  membership_expired: 'Tu suscripción ha caducado. Contacta con tu instructor para renovarla.',
  account_disabled: 'Tu cuenta está deshabilitada. Contacta con tu instructor.',
  session_expired: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  demo_reset: 'Datos de demostración restaurados.',
};

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, BrandMark, Pictogram],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly demo = inject(DEMO_MODE);

  /** Parámetros de la URL (vinculados por el router). */
  readonly returnUrl = input<string>();
  readonly motivo = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = computed(() => {
    const m = this.motivo();
    return m ? (REASONS[m] ?? null) : null;
  });

  protected useDemoAccount(email: string, password: string): void {
    this.form.setValue({ email, password });
    void this.submit();
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    try {
      await firstValueFrom(this.auth.login(email, password));
      const target = this.returnUrl();
      // Solo se aceptan rutas internas para evitar redirecciones abiertas.
      await this.router.navigateByUrl(
        target?.startsWith('/') && !target.startsWith('//') ? target : '/',
      );
    } catch (err) {
      const code = errorCode(err);
      this.error.set(code && REASONS[code] ? REASONS[code] : errorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }
}
