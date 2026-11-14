# FitPN · Preparación física para oposiciones a Policía Nacional

Aplicación web para que una academia o un preparador gestione a sus alumnos y haga seguimiento de
su **preparación física**, con especial atención a las pruebas de la oposición: circuito de
agilidad, dominadas o suspensión en barra y carrera de 1000 m.

> FitPN es una plataforma **independiente** de preparación física. No está vinculada a la
> Dirección General de la Policía ni utiliza su escudo ni sus emblemas oficiales.

- **Acceso con usuario y contraseña.** Las altas las hace un administrador; no hay registro público.
- **Suscripción mensual.** Cada socio tiene acceso durante **1 mes** desde su alta. Cuando caduca,
  pierde el acceso al momento, salvo que un administrador lo **renueve**. Los **administradores
  no caducan nunca**.
- **Pruebas físicas de la oposición.** Registro de simulacros con la mejor marca, la tendencia y
  la evolución de cada prueba.
- **Formación y progreso.** Planes de entrenamiento asignados por el entrenador, registro de
  sesiones (ejercicios, series, repeticiones y peso), medidas corporales, récords personales,
  1RM estimado, volumen semanal y racha de entrenamiento.

---

## Índice

1. [Funcionalidades](#funcionalidades)
2. [Stack tecnológico y decisiones](#stack-tecnológico-y-decisiones)
3. [Arquitectura](#arquitectura)
4. [Reglas de suscripción](#reglas-de-suscripción)
5. [Seguridad](#seguridad)
6. [Estructura del proyecto](#estructura-del-proyecto)
7. [Puesta en marcha rápida (Docker)](#puesta-en-marcha-rápida-docker)
8. [Desarrollo local](#desarrollo-local)
9. [Configuración (variables de entorno)](#configuración-variables-de-entorno)
10. [API REST](#api-rest)
11. [Tests y calidad](#tests-y-calidad)
12. [Despliegue en producción](#despliegue-en-producción)
13. [Mantenimiento](#mantenimiento)

---

## Funcionalidades

En la interfaz, los socios se llaman **alumnos** y los administradores, **instructores**.

### Alumno (`member`)

| Sección            | Qué puede hacer                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| **Pruebas físicas**| Registrar marcas del circuito de agilidad (s), dominadas (rep.), suspensión en barra (s) y 1000 m (mm:ss). Muestra la mejor marca, si el último intento mejora al anterior, un gráfico de evolución y el historial. |
| **Mi panel**       | Estado de la suscripción y días restantes, plan actual, indicadores de 30 días, gráficos y récords. |
| **Entrenamientos** | Registrar, editar y eliminar sesiones. Puede precargar una sesión a partir de un día de su plan.   |
| **Mis planes**     | Consultar los planes que le ha asignado su entrenador, agrupados por día.                       |
| **Progreso**       | Evolución por ejercicio: 1RM estimado (Epley), peso máximo, volumen y repeticiones.             |
| **Medidas**        | Peso, % de grasa y perímetro de cintura con su gráfico de evolución.                            |
| **Mi perfil**      | Ver sus datos y cambiar la contraseña (se cierran sus sesiones en otros dispositivos).          |

Cuando le quedan 7 días o menos de suscripción, el socio ve un aviso para que hable con su entrenador.

### Administrador (`admin`)

Además de todo lo anterior:

| Sección                 | Qué puede hacer                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Resumen**             | Socios activos, a punto de caducar (≤ 7 días) y caducados, actividad de la última semana y renovación en un clic. |
| **Usuarios**            | Buscar y filtrar por estado; crear socios o administradores; renovar con +1 mes o +3 meses.                  |
| **Ficha de usuario**    | Pruebas físicas, progreso, entrenamientos, planes (crear y editar), medidas, historial de renovaciones, ajuste manual de la caducidad, bloqueo, restablecer contraseña y baja. |
| **Ejercicios**          | Mantener el catálogo de ejercicios. Se incluyen 21 de inicio, varios de ellos específicos de las pruebas.       |

### Estética

La identidad visual se inspira en el azul marino institucional y en la bandera de España:

- Barra lateral azul marino con una franja rojigualda.
- Acentos dorados.
- Titulares en tipografía condensada (Barlow Condensed, alojada en la propia aplicación, así que
  no necesita un CDN y respeta la CSP).

El emblema es un escudo genérico con una mancuerna, de diseño propio: **no se usa el escudo ni
ningún logotipo oficial** de la Policía Nacional. Todos los colores están en variables CSS en
`frontend/src/styles.scss`, así que se pueden ajustar fácilmente, y hay modo oscuro automático.

---

## Stack tecnológico y decisiones

| Capa          | Tecnología                                                       | Por qué                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend      | **Angular 22** (componentes standalone, signals, zoneless, `httpResource`, control flow `@if/@for`, Reactive Forms tipados, lazy loading) | El framework estable más completo para aplicaciones de gestión: incluye router, formularios, HTTP y tests sin piezas de terceros.                                                                     |
| Backend       | **Go 1.27** con la librería estándar `net/http`                 | Un único binario estático, muy rápido y concurrente (una goroutine por petición), arranque instantáneo y ~15 MB de RAM. Solo 4 dependencias directas, así que actualizar es fácil.                        |
| Base de datos | **PostgreSQL 17** con `pgx`                                      | Fiable, transaccional y con buen soporte para consultas analíticas (series semanales, récords con `DISTINCT ON`).                                                                                  |
| Despliegue    | **Docker Compose** + nginx                                       | Se levanta con un solo comando. Las imágenes son pequeñas: la del backend es *distroless* y corre sin usuario root.                                                                                               |

Pensado para que el mantenimiento sea bajo:

- Sin ORM: el SQL es explícito y legible (`backend/internal/store`).
- Las migraciones SQL van embebidas en el binario y se aplican solas al arrancar.
- Los gráficos son SVG propios, sin librería de gráficos.
- En el frontend no hay más dependencias que las del propio Angular, más RxJS y tslib.
- Los tests cubren las reglas de negocio y la API completa contra un PostgreSQL real.
- Hay CI en GitHub Actions.

---

## Arquitectura

```
                 ┌──────────────────────────── docker compose ────────────────────────────┐
 Navegador ──►   │  web (nginx)                 api (Go)                    db (PostgreSQL) │
  HTTPS          │  ├─ /        → SPA Angular   ├─ /api/v1/*  REST JSON     └─ volumen pgdata │
                 │  └─ /api/*   → proxy ───────►├─ /healthz, /readyz                          │
                 │                              └─ migraciones automáticas                    │
                 └─────────────────────────────────────────────────────────────────────────────┘
```

- El frontend y la API se sirven desde el **mismo origen**, así que no hace falta CORS y la cookie
  de sesión puede ser `SameSite=Strict`.
- La API no guarda estado entre peticiones: se pueden levantar varias réplicas detrás de un balanceador. Las
  migraciones usan un *advisory lock* de PostgreSQL para que dos instancias no migren a la vez.

---

## Reglas de suscripción

Están implementadas en `backend/internal/membership` y cubiertas por tests:

| Situación                          | Resultado                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Alta de socio                      | Acceso hasta `fecha de alta + MEMBERSHIP_MONTHS` (1 mes por defecto; el admin puede elegir 1–12). |
| Renovar un socio **aún activo**    | Los meses se **suman** a su fecha de caducidad actual (no pierde días).                          |
| Renovar un socio **ya caducado**   | Los meses cuentan **desde hoy**.                                                                 |
| Administrador                      | Sin caducidad (`active_until = NULL`).                                                           |
| Socio caducado o deshabilitado     | No puede iniciar sesión. Si ya tenía la sesión abierta, la siguiente petición devuelve `403` y la app le lleva al login con un mensaje explicativo. |
| Cambio de rol admin → socio        | Recibe 1 mes de acceso desde ese momento.                                                       |

El acceso se comprueba **en cada petición** contra la base de datos, así que una caducidad, un
bloqueo o una renovación tienen efecto al momento, sin esperar a que caduque ningún token.

El historial de renovaciones (quién renovó, cuándo, cuántos meses y la fecha anterior y la nueva) queda registrado.

Para no quedarse sin administradores, un admin no puede quitarse el rol, bloquearse ni borrarse a
sí mismo, y siempre debe quedar al menos un administrador activo.

---

## Seguridad

- **Contraseñas** con bcrypt (coste 12) y una longitud de 8 a 72 caracteres. Si el email no existe,
  el login tarda lo mismo que con uno real, para no revelar qué emails están registrados.
- **Sesión**:
  - El *access token* es un JWT HS256 que dura 15 minutos y vive **solo en memoria** del navegador,
    nunca en `localStorage`.
  - El *refresh token* es un valor aleatorio de 256 bits que viaja en una cookie `HttpOnly`,
    `Secure` y `SameSite=Strict`, y se **rota** en cada uso. En base de datos solo se guarda su
    hash SHA-256.
  - Si alguien reutiliza un refresh token ya rotado (señal de robo), se revocan todas las sesiones
    del usuario.
  - Al cambiar o restablecer la contraseña y al deshabilitar una cuenta también se revocan todas
    sus sesiones.
- **Límite de intentos de login** por IP y email, más un tope general por IP. Así se frena la
  fuerza bruta sin bloquear a todo un gimnasio que comparte la misma wifi.
- **Autorización**: un socio solo accede a sus propios datos (todas las consultas filtran por
  `user_id`) y las rutas `/admin` exigen el rol de administrador.
- **Validación estricta** de entrada:
  - El JSON no admite campos desconocidos y el cuerpo está limitado a 1 MiB.
  - Los rangos se validan tanto en la API como con `CHECK` en la base de datos.
  - Los comodines de `LIKE` se escapan en las búsquedas.
- **Cabeceras de seguridad**: CSP estricta (`script-src 'self'`, sin scripts *inline*),
  `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` y `Cache-Control: no-store`
  en la API.
- **Contenedores**: el backend usa una imagen distroless, sin shell y sin usuario root.

---

## Estructura del proyecto

```
.
├── backend/                     API REST en Go
│   ├── cmd/api/main.go          Arranque, apagado ordenado, admin inicial, healthcheck
│   ├── internal/
│   │   ├── api/                 Router, middlewares, handlers y tests de integración
│   │   ├── auth/                bcrypt, JWT y refresh tokens
│   │   ├── config/              Carga y validación de variables de entorno
│   │   ├── database/            Pool de conexiones y migraciones embebidas (migrations/*.sql)
│   │   ├── membership/          Reglas de negocio de la suscripción (puras y testeadas)
│   │   └── store/               Acceso a datos (SQL explícito)
│   └── Dockerfile
├── frontend/                    SPA en Angular 22
│   ├── src/app/
│   │   ├── core/                Autenticación (servicio, interceptor, guards), modelos y clientes de la API
│   │   ├── layout/              Estructura con menú lateral (adaptado a móvil)
│   │   ├── shared/              Gráficos SVG, tablas, insignias y notificaciones
│   │   └── features/            auth · dashboard · workouts · plans · progress · measurements · profile · admin
│   ├── nginx.conf               Servidor estático + proxy /api + cabeceras de seguridad
│   ├── proxy.conf.json          Proxy de desarrollo hacia la API
│   └── Dockerfile
├── docker-compose.yml           Despliegue completo (db + api + web)
├── docker-compose.dev.yml       Solo PostgreSQL para desarrollo
├── .env.example                 Plantilla de configuración
├── Makefile                     Atajos (make help)
└── .github/workflows/ci.yml     Integración continua
```

---

## Puesta en marcha rápida (Docker)

Requisitos: Docker con el plugin Compose.

```bash
cp .env.example .env
# Edita .env y define como mínimo:
#   POSTGRES_PASSWORD   → una contraseña segura
#   JWT_SECRET          → openssl rand -base64 48
#   ADMIN_EMAIL / ADMIN_PASSWORD → el primer administrador
docker compose up -d --build
```

Abre <http://localhost:8080> y entra con el administrador que configuraste. Desde
**Administración → Usuarios → Nuevo usuario** puedes dar de alta a tus socios.

> **¿Probando en local sin HTTPS?** Los navegadores aceptan cookies `Secure` en
> `http://localhost`. Si accedes por la IP de otra máquina sin HTTPS, pon `COOKIE_SECURE=false`
> en `.env`, y **solo para pruebas**.

---

## Desarrollo local

Requisitos: **Go 1.27+**, **Node.js 24 LTS** (o 22.22+), npm y Docker (solo para PostgreSQL).

```bash
make db        # PostgreSQL en localhost:5432 (crea también la BD de tests)
make api       # API en http://localhost:8080   (admin: admin@fitpn.local / admin12345)
make web       # Angular en http://localhost:4200 con recarga en caliente (proxy /api → :8080)
```

Ejecuta `make help` para ver todos los comandos. Sin `make`:

```bash
# Backend
cd backend
DATABASE_URL="postgres://fitpn:fitpn@localhost:5432/fitpn?sslmode=disable" \
JWT_SECRET="dev-only-secret-change-me-0123456789abcdef" \
ADMIN_EMAIL=admin@fitpn.local ADMIN_PASSWORD=admin12345 \
go run ./cmd/api

# Frontend
cd frontend
npm install
npm start
```

### Añadir una migración

Crea `backend/internal/database/migrations/000N_descripcion.sql`, con un número correlativo. Se
aplica sola al arrancar, dentro de una transacción. Nunca modifiques una migración que ya se haya
aplicado: crea una nueva.

---

## Configuración (variables de entorno)

| Variable                | Por defecto     | Descripción                                                                                   |
| ----------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | — (obligatoria) | Cadena de conexión de PostgreSQL.                                                              |
| `JWT_SECRET`            | — (obligatoria) | Secreto para firmar los JWT; mínimo 32 caracteres.                                             |
| `APP_ENV`               | `development`   | `production` activa los logs en JSON y las cookies `Secure` por defecto.                       |
| `HTTP_ADDR`             | `:8080`         | Dirección en la que escucha la API.                                                           |
| `ACCESS_TOKEN_TTL`      | `15m`           | Duración del access token.                                                                    |
| `REFRESH_TOKEN_TTL`     | `168h`          | Duración de la sesión (cookie de refresco).                                                   |
| `COOKIE_SECURE`         | `true` en prod. | Cookie solo por HTTPS.                                                                        |
| `TRUST_PROXY`           | `false`         | Usa `X-Real-IP` / `X-Forwarded-For` para saber la IP del cliente. Ponlo a `true` solo detrás de nginx u otro proxy de confianza. |
| `MEMBERSHIP_MONTHS`     | `1`             | Meses por defecto de un alta o una renovación.                                                |
| `LOGIN_RATE_PER_MINUTE` | `10`            | Intentos de login por minuto por IP y email; el tope por IP es 6 veces ese valor.             |
| `ADMIN_EMAIL`           | —               | Administrador inicial. Se crea **solo si no existe ningún administrador**.                    |
| `ADMIN_PASSWORD`        | —               | Contraseña de ese administrador inicial (puedes vaciarla tras el primer arranque).            |
| `ADMIN_NAME`            | `Administrador` | Nombre del administrador inicial.                                                             |

---

## API REST

Base: `/api/v1`. Todas las respuestas son JSON. Los errores tienen siempre el mismo formato:

```json
{ "error": { "code": "validation_error", "message": "…", "fields": { "email": "Email no válido" } } }
```

Códigos de error relevantes: `invalid_credentials`, `membership_expired`, `account_disabled`,
`invalid_token`, `forbidden`, `validation_error` (422), `rate_limited` (429), `last_admin` y
`self_modification` (409).

### Autenticación

| Método | Ruta                | Descripción                                                            |
| ------ | ------------------- | ---------------------------------------------------------------------- |
| POST   | `/auth/login`       | `{email, password}` → `{accessToken, expiresAt, user}` y la cookie de refresco. |
| POST   | `/auth/refresh`     | Rota la cookie y devuelve un nuevo access token.                       |
| POST   | `/auth/logout`      | Revoca la sesión actual.                                               |

### Usuario autenticado (`Authorization: Bearer <token>`)

| Método              | Ruta                                  | Descripción                                    |
| ------------------- | ------------------------------------- | ---------------------------------------------- |
| GET                 | `/me`                                 | Perfil con `status`, `hasAccess` y `daysRemaining`. |
| PUT                 | `/me/password`                        | Cambiar la contraseña.                          |
| GET · POST          | `/me/workouts`                        | Listado paginado (`from`, `to`, `limit`, `offset`) y alta. |
| GET · PUT · DELETE  | `/me/workouts/{id}`                   | Detalle con series, edición y borrado.          |
| GET · POST          | `/me/measurements`                    | Medidas corporales.                             |
| DELETE              | `/me/measurements/{id}`               |                                                |
| GET                 | `/me/plans`                           | Planes asignados.                               |
| GET · POST          | `/me/tests`                           | Marcas de las pruebas físicas (`testType`: `agility_circuit`, `pull_ups`, `bar_hang`, `run_1000m`; `result` en segundos o repeticiones). |
| DELETE              | `/me/tests/{id}`                      |                                                |
| GET                 | `/me/progress/summary?weeks=12`       | Indicadores, serie semanal, peso y récords.     |
| GET                 | `/me/progress/exercises/{exerciseId}` | Evolución de un ejercicio.                      |
| GET                 | `/exercises`                          | Catálogo de ejercicios.                         |

### Administración (rol `admin`)

| Método               | Ruta                                       | Descripción                                                         |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| GET                  | `/admin/stats`                             | Métricas del panel.                                                 |
| GET · POST           | `/admin/users`                             | Listado (`q`, `status`=active/expiring/expired/disabled/admin) y alta. |
| GET · PATCH · DELETE | `/admin/users/{id}`                        | Ficha, edición (nombre, email, rol, bloqueo, `activeUntil`) y baja. |
| POST                 | `/admin/users/{id}/renew`                  | `{months}`: renovar la suscripción.                                |
| GET                  | `/admin/users/{id}/renewals`               | Historial de renovaciones.                                          |
| PUT                  | `/admin/users/{id}/password`               | Restablecer la contraseña.                                          |
| POST · PUT · DELETE  | `/admin/users/{id}/plans[/{planId}]`       | Gestión de planes del socio.                                        |
| *                    | `/admin/users/{id}/workouts…`, `/measurements…`, `/tests…`, `/plans`, `/progress…` | Mismas rutas que `/me/…`, pero sobre el socio indicado. |
| POST · PUT · DELETE  | `/exercises[/{id}]`                        | Gestión del catálogo (no se puede borrar un ejercicio en uso).      |

### Sondas

`GET /healthz` (el proceso está vivo) y `GET /readyz` (la base de datos responde).

---

## Tests y calidad

```bash
make test            # todo
make test-backend    # Go: unitarios + integración (necesita la BD de `make db`)
make test-frontend   # Angular: Vitest
make lint            # gofmt, go vet, prettier
```

- **Backend**:
  - Tests unitarios de las reglas de suscripción, de los tokens y de las rachas.
  - Tests de integración de la API contra PostgreSQL real:
    - Login, refresh, logout y detección de reutilización de tokens.
    - Caducidad, renovación y bloqueo de cuentas.
    - Aislamiento entre socios.
    - Cálculo de progreso y récords.
    - Protecciones de administradores y límite de intentos.
  - Los tests de integración se omiten si no hay `TEST_DATABASE_URL`.
- **Frontend**:
  - Interceptor de autenticación: refresco transparente del token, una sola petición de refresh
    aunque haya varias a la vez y redirección cuando la suscripción ha caducado.
  - Guards y gráficos.
- **CI** (`.github/workflows/ci.yml`): en cada push y pull request comprueba formato, vet, tests y
  build de ambos proyectos.

---

## Despliegue en producción

1. **Servidor** con Docker (un VPS pequeño, de 1 vCPU y 1 GB, es suficiente para cientos de socios).
2. **HTTPS obligatorio.** Pon delante un proxy con TLS automático, por ejemplo
   [Caddy](https://caddyserver.com/) (`reverse_proxy localhost:8080`), Traefik o el balanceador de tu
   proveedor. La cookie de sesión es `Secure`.
3. Rellena `.env` con secretos robustos (`openssl rand -base64 48`) y ejecuta
   `docker compose up -d --build`.
4. **Copias de seguridad** diarias de PostgreSQL, por ejemplo con cron:

   ```bash
   docker compose exec -T db pg_dump -U fitpn -Fc fitpn > backup-$(date +%F).dump
   # Restaurar:
   docker compose exec -T db pg_restore -U fitpn -d fitpn --clean < backup-AAAA-MM-DD.dump
   ```

5. **Monitorización**: Docker comprueba la salud de cada contenedor (`docker compose ps`). Desde
   fuera, apunta tu *uptime checker* a la URL pública. En producción los logs salen en JSON por la
   salida estándar (`docker compose logs -f`).

---

## Mantenimiento

- **Actualizar la aplicación**: `git pull && docker compose up -d --build`. Las migraciones se
  aplican solas.
- **Actualizar dependencias**:
  - Backend: `cd backend && go get -u ./... && go mod tidy && make test-backend`.
  - Frontend: `cd frontend && npx ng update @angular/core @angular/cli`, que migra el código
    automáticamente entre versiones de Angular.
- **Sesiones caducadas**: la API purga cada hora los refresh tokens caducados o revocados.
- **Socios que caducan**: no hace falta ninguna tarea programada. El estado se calcula al momento a
  partir de `active_until`.

### Ideas para siguientes versiones

- **Puntuación según el baremo oficial** de cada prueba, por sexo, para calcular la nota prevista y
  mostrar si se supera el mínimo. Hay que cargar las tablas de la convocatoria vigente (BOE).

- Recuperación de contraseña por email y aviso automático unos días antes de que caduque la suscripción.
- Integración con pasarela de pago (por ejemplo Stripe) para que la renovación sea automática.
- Exportación del progreso a PDF o CSV.
- Fotos de progreso y vídeos de técnica en el catálogo de ejercicios.
