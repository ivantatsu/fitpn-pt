/**
 * Backend simulado del modo demostración: implementa en el navegador la misma API
 * REST que el servidor Go (mismas rutas, formatos y reglas de suscripción), sobre
 * datos de ejemplo guardados en localStorage. Solo se incluye en el build `demo`.
 */
import {
  HttpBackend,
  HttpErrorResponse,
  HttpEvent,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';
import { MembershipStatus, Plan, PlanInput, Role, User, WorkoutInput } from '../app/core/models';
import { TestType } from '../app/core/physical-tests';
import { DemoDb, DemoUser, DemoWorkout, createSeed, isoDay } from './demo-data';

const STORAGE_KEY = 'fitpn-demo-v1';
const DAY = 86_400_000;
const LATENCY = 120;

class ApiError {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly message: string,
    readonly fields?: Record<string, string>,
  ) {}
}

const notFound = () => new ApiError(404, 'not_found', 'Recurso no encontrado');

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DemoDb;
  } catch {
    /* almacenamiento no disponible: se usan datos nuevos */
  }
  return createSeed();
}

@Injectable()
export class DemoBackend implements HttpBackend {
  private db: DemoDb = load();

  reset(): void {
    this.db = createSeed();
    this.save();
  }

  handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    try {
      const { status, body } = this.route(req);
      if (req.method !== 'GET') this.save();
      return of(new HttpResponse({ status, body, url: req.url })).pipe(delay(LATENCY));
    } catch (e) {
      const err =
        e instanceof ApiError ? e : new ApiError(500, 'internal_error', 'Error interno de la demo');
      if (!(e instanceof ApiError)) console.error(e);
      return timer(LATENCY).pipe(
        switchMap(() =>
          throwError(
            () =>
              new HttpErrorResponse({
                status: err.status,
                url: req.url,
                error: { error: { code: err.code, message: err.message, fields: err.fields } },
              }),
          ),
        ),
      );
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    } catch {
      /* sin persistencia: la demo sigue funcionando en memoria */
    }
  }

  private nextId(): number {
    return ++this.db.seq;
  }

  // ------------------------------------------------------------------ router

  private route(req: HttpRequest<unknown>): { status: number; body: unknown } {
    const url = new URL(req.urlWithParams, 'http://demo.local');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const q = url.searchParams;
    const m = req.method;
    const body = (req.body ?? {}) as Record<string, any>;
    const ok = (b: unknown, status = 200) => ({ status, body: b });
    let match: RegExpMatchArray | null;

    // --- Autenticación (sin token) ---
    if (m === 'POST' && path === '/auth/login')
      return ok(this.login(body['email'], body['password']));
    if (m === 'POST' && path === '/auth/refresh') return ok(this.refresh());
    if (m === 'POST' && path === '/auth/logout') {
      this.db.sessionUserId = null;
      return ok(null, 204);
    }

    const me = this.authenticate(req);

    if (m === 'GET' && path === '/me') return ok(this.view(me));
    if (m === 'PUT' && path === '/me/password') {
      if (body['currentPassword'] !== me.password) {
        throw new ApiError(422, 'validation_error', 'Hay campos con valores no válidos', {
          currentPassword: 'La contraseña actual no es correcta',
        });
      }
      me.password = body['newPassword'];
      return ok(this.session(me));
    }

    // --- Ejercicios ---
    if (path === '/exercises' && m === 'GET') {
      return ok(
        [...this.db.exercises].sort(
          (a, b) =>
            a.muscleGroup.localeCompare(b.muscleGroup) || a.name.localeCompare(b.name, 'es'),
        ),
      );
    }
    if (path === '/exercises' && m === 'POST') {
      this.requireAdmin(me);
      const e = { id: this.nextId(), ...this.exerciseInput(body) };
      this.db.exercises.push(e);
      return ok(e, 201);
    }
    if ((match = path.match(/^\/exercises\/(\d+)$/))) {
      this.requireAdmin(me);
      const id = +match[1];
      const e = this.db.exercises.find((x) => x.id === id);
      if (!e) throw notFound();
      if (m === 'PUT') {
        Object.assign(e, this.exerciseInput(body));
        return ok(e);
      }
      if (m === 'DELETE') {
        const used =
          this.db.workouts.some((w) => w.exercises.some((x) => x.exerciseId === id)) ||
          this.db.plans.some((p) => p.items.some((x) => x.exerciseId === id));
        if (used) throw new ApiError(409, 'in_use', 'El recurso está en uso y no puede eliminarse');
        this.db.exercises = this.db.exercises.filter((x) => x.id !== id);
        return ok(null, 204);
      }
    }

    // --- Datos de entrenamiento (/me/... o /admin/users/{id}/...) ---
    if ((match = path.match(/^\/me(\/.+)$/))) {
      const r = this.userData(m, match[1], me.id, q, body);
      if (r) return r;
    }

    // --- Administración ---
    if (path.startsWith('/admin/')) {
      this.requireAdmin(me);
      if (m === 'GET' && path === '/admin/stats') return ok(this.stats());
      if (path === '/admin/users') {
        if (m === 'GET') return ok(this.listUsers(q));
        if (m === 'POST') return ok(this.view(this.createUser(body)), 201);
      }
      if ((match = path.match(/^\/admin\/users\/(\d+)(\/.*)?$/))) {
        const target = this.user(+match[1]);
        const rest = match[2] ?? '';
        if (rest === '') {
          if (m === 'GET') return ok(this.view(target));
          if (m === 'PATCH') return ok(this.view(this.updateUser(me, target, body)));
          if (m === 'DELETE') {
            this.deleteUser(me, target);
            return ok(null, 204);
          }
        }
        if (rest === '/renew' && m === 'POST')
          return ok(this.view(this.renew(me, target, body['months'] ?? 1)));
        if (rest === '/renewals' && m === 'GET') {
          return ok(
            this.db.renewals
              .filter((r) => r.userId === target.id)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          );
        }
        if (rest === '/password' && m === 'PUT') {
          target.password = body['password'];
          return ok(null, 204);
        }
        if (rest === '/plans' && m === 'POST')
          return ok(this.savePlan(target.id, 0, body as PlanInput), 201);
        const pm = rest.match(/^\/plans\/(\d+)$/);
        if (pm && m === 'PUT') return ok(this.savePlan(target.id, +pm[1], body as PlanInput));
        if (pm && m === 'DELETE') {
          this.removeOwned('plans', +pm[1], target.id);
          return ok(null, 204);
        }
        const r = this.userData(m, rest, target.id, q, body);
        if (r) return r;
      }
    }

    throw new ApiError(404, 'not_found', 'Ruta no encontrada');
  }

  // ------------------------------------------------------------------ auth

  private login(email: string, password: string) {
    const u = this.db.users.find(
      (x) =>
        x.email ===
        String(email ?? '')
          .trim()
          .toLowerCase(),
    );
    if (!u || u.password !== password) {
      throw new ApiError(401, 'invalid_credentials', 'Email o contraseña incorrectos');
    }
    this.checkAccess(u);
    u.lastLoginAt = new Date().toISOString();
    this.db.sessionUserId = u.id;
    return this.session(u);
  }

  private refresh() {
    const u = this.db.users.find((x) => x.id === this.db.sessionUserId);
    if (!u || !this.hasAccess(u)) {
      this.db.sessionUserId = null;
      throw new ApiError(401, 'no_session', 'No hay sesión activa');
    }
    return this.session(u);
  }

  private session(u: DemoUser) {
    return {
      accessToken: `demo.${u.id}`,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      user: this.view(u),
    };
  }

  private authenticate(req: HttpRequest<unknown>): DemoUser {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const u = this.db.users.find((x) => token === `demo.${x.id}`);
    if (!u) throw new ApiError(401, 'invalid_token', 'Token inválido o caducado');
    this.checkAccess(u);
    return u;
  }

  private checkAccess(u: DemoUser): void {
    if (this.hasAccess(u)) return;
    if (u.disabled) {
      throw new ApiError(
        403,
        'account_disabled',
        'Tu cuenta está deshabilitada. Contacta con tu instructor.',
      );
    }
    throw new ApiError(
      403,
      'membership_expired',
      'Tu suscripción ha caducado. Contacta con tu instructor para renovarla.',
    );
  }

  private requireAdmin(u: DemoUser): void {
    if (u.role !== 'admin')
      throw new ApiError(403, 'forbidden', 'Necesitas permisos de administrador');
  }

  // ------------------------------------------------------------------ suscripción

  private hasAccess(u: DemoUser): boolean {
    if (u.disabled) return false;
    return u.role === 'admin' || (!!u.activeUntil && Date.parse(u.activeUntil) > Date.now());
  }

  private status(u: DemoUser): MembershipStatus {
    if (u.disabled) return 'disabled';
    if (u.role === 'admin') return 'unlimited';
    const left = u.activeUntil ? Date.parse(u.activeUntil) - Date.now() : -1;
    if (left <= 0) return 'expired';
    return left <= 7 * DAY ? 'expiring' : 'active';
  }

  private view(u: DemoUser): User {
    const { password: _password, ...rest } = u;
    return {
      ...rest,
      status: this.status(u),
      hasAccess: this.hasAccess(u),
      daysRemaining: u.activeUntil
        ? Math.max(0, Math.ceil((Date.parse(u.activeUntil) - Date.now()) / DAY))
        : null,
    };
  }

  private renew(by: DemoUser, u: DemoUser, months: number): DemoUser {
    if (u.role !== 'member') {
      throw new ApiError(
        409,
        'not_member',
        'Solo se pueden renovar alumnos; los administradores no caducan',
      );
    }
    const now = Date.now();
    const current = u.activeUntil ? Date.parse(u.activeUntil) : 0;
    const base = new Date(Math.max(now, current));
    base.setMonth(base.getMonth() + months);
    this.db.renewals.push({
      id: this.nextId(),
      userId: u.id,
      months,
      previousUntil: u.activeUntil,
      newUntil: base.toISOString(),
      renewedByName: by.fullName,
      createdAt: new Date().toISOString(),
    });
    u.activeUntil = base.toISOString();
    u.updatedAt = new Date().toISOString();
    return u;
  }

  // ------------------------------------------------------------------ usuarios

  private user(id: number): DemoUser {
    const u = this.db.users.find((x) => x.id === id);
    if (!u) throw notFound();
    return u;
  }

  private listUsers(q: URLSearchParams) {
    const text = (q.get('q') ?? '').trim().toLowerCase();
    const status = q.get('status') ?? '';
    const limit = Number(q.get('limit') ?? 25);
    const offset = Number(q.get('offset') ?? 0);
    const items = this.db.users
      .filter((u) => !text || u.email.includes(text) || u.fullName.toLowerCase().includes(text))
      .filter((u) => {
        if (!status) return true;
        if (status === 'admin') return u.role === 'admin';
        if (status === 'disabled') return u.disabled;
        const s = this.status(u);
        if (status === 'active') return u.role === 'member' && (s === 'active' || s === 'expiring');
        return s === status && u.role === 'member';
      })
      .sort(
        (a, b) =>
          a.role.localeCompare(b.role) ||
          (a.activeUntil ?? '9').localeCompare(b.activeUntil ?? '9') ||
          a.fullName.localeCompare(b.fullName, 'es'),
      );
    return {
      items: items.slice(offset, offset + limit).map((u) => this.view(u)),
      total: items.length,
      limit,
      offset,
    };
  }

  private createUser(b: Record<string, any>): DemoUser {
    const email = String(b['email'] ?? '')
      .trim()
      .toLowerCase();
    if (this.db.users.some((u) => u.email === email)) {
      throw new ApiError(422, 'validation_error', 'Hay campos con valores no válidos', {
        email: 'Ya existe un usuario con este email',
      });
    }
    const role = (b['role'] ?? 'member') as Role;
    const now = new Date();
    const until = new Date(now);
    until.setMonth(until.getMonth() + (b['months'] || 1));
    const u: DemoUser = {
      id: this.nextId(),
      email,
      fullName: String(b['fullName']).trim(),
      role,
      activeUntil: role === 'member' ? until.toISOString() : null,
      disabled: false,
      lastLoginAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      password: b['password'],
    };
    this.db.users.push(u);
    return u;
  }

  private activeAdmins(): number {
    return this.db.users.filter((u) => u.role === 'admin' && !u.disabled).length;
  }

  private updateUser(me: DemoUser, u: DemoUser, b: Record<string, any>): DemoUser {
    const wasActiveAdmin = u.role === 'admin' && !u.disabled;
    const next = { ...u };
    if (b['email'] !== undefined) next.email = String(b['email']).trim().toLowerCase();
    if (b['fullName'] !== undefined) next.fullName = String(b['fullName']).trim();
    if (b['role'] !== undefined && b['role'] !== u.role) {
      next.role = b['role'];
      const until = new Date();
      until.setMonth(until.getMonth() + 1);
      next.activeUntil = next.role === 'admin' ? null : until.toISOString();
    }
    if (b['activeUntil'] !== undefined && next.role === 'member')
      next.activeUntil = b['activeUntil'];
    if (b['disabled'] !== undefined) next.disabled = b['disabled'];

    if (wasActiveAdmin && (next.role !== 'admin' || next.disabled)) {
      if (u.id === me.id) {
        throw new ApiError(
          409,
          'self_modification',
          'No puedes quitarte permisos ni deshabilitarte a ti mismo',
        );
      }
      if (this.activeAdmins() <= 1) {
        throw new ApiError(409, 'last_admin', 'Debe existir al menos un administrador activo');
      }
    }
    if (this.db.users.some((x) => x.id !== u.id && x.email === next.email)) {
      throw new ApiError(422, 'validation_error', 'Hay campos con valores no válidos', {
        email: 'Ya existe un usuario con este email',
      });
    }
    Object.assign(u, next, { updatedAt: new Date().toISOString() });
    return u;
  }

  private deleteUser(me: DemoUser, u: DemoUser): void {
    if (u.id === me.id)
      throw new ApiError(409, 'self_modification', 'No puedes eliminar tu propia cuenta');
    if (u.role === 'admin' && !u.disabled && this.activeAdmins() <= 1) {
      throw new ApiError(409, 'last_admin', 'Debe existir al menos un administrador activo');
    }
    const keep = <T extends { userId: number }>(list: T[]) => list.filter((x) => x.userId !== u.id);
    this.db.users = this.db.users.filter((x) => x.id !== u.id);
    this.db.workouts = keep(this.db.workouts);
    this.db.measurements = keep(this.db.measurements);
    this.db.plans = keep(this.db.plans);
    this.db.tests = keep(this.db.tests);
    this.db.renewals = keep(this.db.renewals);
  }

  private stats() {
    const members = this.db.users.filter((u) => u.role === 'member');
    const recent = this.db.workouts.filter((w) => w.performedOn > isoDay(-7));
    const count = (s: MembershipStatus) => members.filter((u) => this.status(u) === s).length;
    return {
      totalMembers: members.length,
      activeMembers: count('active') + count('expiring'),
      expiringMembers: count('expiring'),
      expiredMembers: count('expired'),
      disabledUsers: this.db.users.filter((u) => u.disabled).length,
      admins: this.db.users.filter((u) => u.role === 'admin').length,
      workoutsLast7Days: recent.length,
      activeMembersLast7Days: new Set(recent.map((w) => w.userId)).size,
    };
  }

  // ------------------------------------------------------------------ datos del usuario

  private userData(
    m: string,
    rest: string,
    userId: number,
    q: URLSearchParams,
    b: Record<string, any>,
  ): { status: number; body: unknown } | null {
    const ok = (body: unknown, status = 200) => ({ status, body });
    let match: RegExpMatchArray | null;

    if (rest === '/workouts') {
      if (m === 'GET') return ok(this.listWorkouts(userId, q));
      if (m === 'POST') return ok(this.saveWorkout(userId, 0, b as WorkoutInput), 201);
    }
    if ((match = rest.match(/^\/workouts\/(\d+)$/))) {
      const id = +match[1];
      if (m === 'GET') return ok(this.workoutView(this.owned('workouts', id, userId), true));
      if (m === 'PUT') return ok(this.saveWorkout(userId, id, b as WorkoutInput));
      if (m === 'DELETE') {
        this.removeOwned('workouts', id, userId);
        return ok(null, 204);
      }
    }
    if (rest === '/measurements') {
      if (m === 'GET') {
        return ok(
          this.db.measurements
            .filter((x) => x.userId === userId)
            .sort((a, b2) => b2.measuredOn.localeCompare(a.measuredOn) || b2.id - a.id)
            .map(({ userId: _u, ...x }) => x),
        );
      }
      if (m === 'POST') {
        const rec = { id: this.nextId(), userId, ...b } as DemoDb['measurements'][number];
        this.db.measurements.push(rec);
        const { userId: _u, ...out } = rec;
        return ok(out, 201);
      }
    }
    if ((match = rest.match(/^\/measurements\/(\d+)$/)) && m === 'DELETE') {
      this.removeOwned('measurements', +match[1], userId);
      return ok(null, 204);
    }
    if (rest === '/plans' && m === 'GET') {
      return ok(
        this.db.plans
          .filter((p) => p.userId === userId)
          .sort(
            (a, b2) =>
              Number(b2.isActive) - Number(a.isActive) || b2.updatedAt.localeCompare(a.updatedAt),
          ),
      );
    }
    if (rest === '/tests') {
      if (m === 'GET') {
        return ok(
          this.db.tests
            .filter((t) => t.userId === userId)
            .sort((a, b2) => a.performedOn.localeCompare(b2.performedOn) || a.id - b2.id)
            .map(({ userId: _u, ...t }) => t),
        );
      }
      if (m === 'POST') {
        const t = {
          id: this.nextId(),
          userId,
          testType: b['testType'] as TestType,
          result: Math.round(Number(b['result']) * 100) / 100,
          performedOn: b['performedOn'],
          notes: b['notes'] ?? '',
        };
        this.db.tests.push(t);
        const { userId: _u, ...out } = t;
        return ok(out, 201);
      }
    }
    if ((match = rest.match(/^\/tests\/(\d+)$/)) && m === 'DELETE') {
      this.removeOwned('tests', +match[1], userId);
      return ok(null, 204);
    }
    if (rest === '/progress/summary' && m === 'GET') {
      return ok(this.summary(userId, Math.min(Math.max(Number(q.get('weeks') ?? 12), 1), 104)));
    }
    if ((match = rest.match(/^\/progress\/exercises\/(\d+)$/)) && m === 'GET') {
      return ok(this.exerciseProgress(userId, +match[1]));
    }
    return null;
  }

  private owned<K extends 'workouts' | 'measurements' | 'plans' | 'tests'>(
    key: K,
    id: number,
    userId: number,
  ): DemoDb[K][number] {
    const item = (this.db[key] as { id: number; userId: number }[]).find(
      (x) => x.id === id && x.userId === userId,
    );
    if (!item) throw notFound();
    return item as DemoDb[K][number];
  }

  private removeOwned(
    key: 'workouts' | 'measurements' | 'plans' | 'tests',
    id: number,
    userId: number,
  ) {
    this.owned(key, id, userId);
    (this.db[key] as { id: number }[]) = (this.db[key] as { id: number }[]).filter(
      (x) => x.id !== id,
    );
  }

  private exerciseName(id: number): string {
    return this.db.exercises.find((e) => e.id === id)?.name ?? 'Ejercicio';
  }

  private workoutView(w: DemoWorkout, withDetail: boolean) {
    const sets = w.exercises.flatMap((e) => e.sets);
    return {
      id: w.id,
      userId: w.userId,
      performedOn: w.performedOn,
      title: w.title,
      durationMinutes: w.durationMinutes,
      perceivedEffort: w.perceivedEffort,
      notes: w.notes,
      createdAt: w.createdAt,
      exerciseCount: new Set(w.exercises.map((e) => e.exerciseId)).size,
      setCount: sets.length,
      totalVolumeKg: sets.reduce((s, x) => s + x.reps * x.weightKg, 0),
      ...(withDetail
        ? {
            exercises: w.exercises.map((e) => ({
              ...e,
              exerciseName: this.exerciseName(e.exerciseId),
            })),
          }
        : {}),
    };
  }

  private listWorkouts(userId: number, q: URLSearchParams) {
    const from = q.get('from') ?? '';
    const to = q.get('to') ?? '';
    const limit = Number(q.get('limit') ?? 20);
    const offset = Number(q.get('offset') ?? 0);
    const all = this.db.workouts
      .filter(
        (w) =>
          w.userId === userId && (!from || w.performedOn >= from) && (!to || w.performedOn <= to),
      )
      .sort((a, b) => b.performedOn.localeCompare(a.performedOn) || b.id - a.id);
    return {
      items: all.slice(offset, offset + limit).map((w) => this.workoutView(w, false)),
      total: all.length,
      limit,
      offset,
    };
  }

  private saveWorkout(userId: number, id: number, b: WorkoutInput) {
    const data = {
      performedOn: b.performedOn,
      title: b.title,
      durationMinutes: b.durationMinutes,
      perceivedEffort: b.perceivedEffort,
      notes: b.notes ?? '',
      exercises: b.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets })),
    };
    let w: DemoWorkout;
    if (id) {
      w = this.owned('workouts', id, userId);
      Object.assign(w, data);
    } else {
      w = { id: this.nextId(), userId, createdAt: new Date().toISOString(), ...data };
      this.db.workouts.push(w);
    }
    return this.workoutView(w, true);
  }

  private savePlan(userId: number, id: number, b: PlanInput): Plan {
    const items = b.items.map((it) => ({ ...it, exerciseName: this.exerciseName(it.exerciseId) }));
    const now = new Date().toISOString();
    if (id) {
      const p = this.owned('plans', id, userId);
      Object.assign(p, {
        title: b.title,
        description: b.description,
        isActive: b.isActive,
        items,
        updatedAt: now,
      });
      return p;
    }
    const p: Plan = {
      id: this.nextId(),
      userId,
      title: b.title,
      description: b.description,
      isActive: b.isActive,
      createdAt: now,
      updatedAt: now,
      items,
    };
    this.db.plans.push(p);
    return p;
  }

  private exerciseInput(b: Record<string, any>) {
    return {
      name: String(b['name']).trim(),
      muscleGroup: b['muscleGroup'],
      equipment: b['equipment'] ?? '',
      description: b['description'] ?? '',
    };
  }

  // ------------------------------------------------------------------ progreso

  private summary(userId: number, weeks: number) {
    const mine = this.db.workouts.filter((w) => w.userId === userId);
    const volume = (w: DemoWorkout) =>
      w.exercises.flatMap((e) => e.sets).reduce((s, x) => s + x.reps * x.weightKg, 0);
    const today = isoDay(0);
    const last30 = mine.filter((w) => w.performedOn > isoDay(-30));

    const monday = (iso: string) => {
      const [y, mo, d] = iso.split('-').map(Number);
      const dt = new Date(Date.UTC(y, mo - 1, d));
      dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
      return dt.toISOString().slice(0, 10);
    };
    const addDays = (iso: string, n: number) => {
      const dt = new Date(`${iso}T00:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() + n);
      return dt.toISOString().slice(0, 10);
    };

    const thisWeek = monday(today);
    const weekly = Array.from({ length: weeks }, (_, i) => {
      const start = addDays(thisWeek, -7 * (weeks - 1 - i));
      const end = addDays(start, 7);
      const inWeek = mine.filter((w) => w.performedOn >= start && w.performedOn < end);
      return {
        weekStart: start,
        workouts: inWeek.length,
        volumeKg: inWeek.reduce((s, w) => s + volume(w), 0),
      };
    });

    const active = new Set(
      mine.filter((w) => w.performedOn <= today).map((w) => monday(w.performedOn)),
    );
    let cursor = active.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
    let streak = 0;
    while (active.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -7);
    }

    const prs = new Map<number, { weightKg: number; reps: number; e1rm: number; date: string }>();
    for (const w of [...mine].sort((a, b) => a.performedOn.localeCompare(b.performedOn))) {
      for (const e of w.exercises) {
        for (const s of e.sets) {
          if (s.weightKg <= 0 || s.reps <= 0) continue;
          const e1rm = Math.round(s.weightKg * (1 + s.reps / 30) * 10) / 10;
          const best = prs.get(e.exerciseId);
          if (!best || e1rm > best.e1rm) {
            prs.set(e.exerciseId, {
              weightKg: s.weightKg,
              reps: s.reps,
              e1rm,
              date: w.performedOn,
            });
          }
        }
      }
    }

    return {
      totalWorkouts: mine.length,
      workoutsLast30Days: last30.length,
      volumeLast30DaysKg: last30.reduce((s, w) => s + volume(w), 0),
      currentStreakWeeks: streak,
      lastWorkoutOn:
        mine
          .map((w) => w.performedOn)
          .sort()
          .at(-1) ?? null,
      weekly,
      bodyWeight: this.db.measurements
        .filter((x) => x.userId === userId && x.weightKg !== null)
        .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn) || a.id - b.id)
        .slice(-90)
        .map((x) => ({ date: x.measuredOn, weightKg: x.weightKg! })),
      personalRecords: [...prs.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([exerciseId, p]) => ({
          exerciseId,
          exerciseName: this.exerciseName(exerciseId),
          weightKg: p.weightKg,
          reps: p.reps,
          estimated1RmKg: p.e1rm,
          achievedOn: p.date,
        })),
    };
  }

  private exerciseProgress(userId: number, exerciseId: number) {
    const byDate = new Map<string, { max: number; e1rm: number; reps: number; vol: number }>();
    for (const w of this.db.workouts.filter((x) => x.userId === userId)) {
      for (const e of w.exercises.filter((x) => x.exerciseId === exerciseId)) {
        for (const s of e.sets) {
          const cur = byDate.get(w.performedOn) ?? { max: 0, e1rm: 0, reps: 0, vol: 0 };
          cur.max = Math.max(cur.max, s.weightKg);
          cur.e1rm = Math.max(cur.e1rm, Math.round(s.weightKg * (1 + s.reps / 30) * 10) / 10);
          cur.reps += s.reps;
          cur.vol += s.reps * s.weightKg;
          byDate.set(w.performedOn, cur);
        }
      }
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date,
        maxWeightKg: v.max,
        estimated1RmKg: v.e1rm,
        totalReps: v.reps,
        volumeKg: v.vol,
      }));
  }
}
