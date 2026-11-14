import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { BrandMark } from '../shared/brand-mark';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

/** Estructura principal: barra lateral de navegación + contenido. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, BrandMark],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly menuOpen = signal(false);

  protected readonly trainingNav: NavItem[] = [
    { path: '/panel', label: 'Mi panel', icon: '◎' },
    { path: '/pruebas', label: 'Pruebas físicas', icon: '⏱' },
    { path: '/entrenamientos', label: 'Entrenamientos', icon: '🏋' },
    { path: '/planes', label: 'Mis planes', icon: '☰' },
    { path: '/progreso', label: 'Progreso', icon: '↗' },
    { path: '/medidas', label: 'Medidas', icon: '⚖' },
  ];

  protected readonly adminNav: NavItem[] = [
    { path: '/admin', label: 'Resumen', icon: '▦', exact: true },
    { path: '/admin/usuarios', label: 'Alumnos y usuarios', icon: '👥' },
    { path: '/admin/ejercicios', label: 'Ejercicios', icon: '✚' },
  ];

  protected readonly initials = computed(() =>
    (this.auth.user()?.fullName ?? '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join(''),
  );

  protected readonly expiringSoon = computed(() => this.auth.user()?.status === 'expiring');

  constructor() {
    // Cierra el menú móvil al navegar.
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
  }
}
