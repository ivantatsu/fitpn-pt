-- Esquema inicial de FitPN.

CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    full_name     TEXT        NOT NULL,
    role          TEXT        NOT NULL CHECK (role IN ('admin', 'member')),
    -- Fecha hasta la que el acceso está activo. NULL solo para administradores (sin caducidad).
    active_until  TIMESTAMPTZ,
    disabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_member_has_expiry CHECK (role = 'admin' OR active_until IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_lower_uidx ON users (lower(email));
CREATE INDEX users_active_until_idx ON users (active_until) WHERE role = 'member';

CREATE TABLE refresh_tokens (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  BYTEA       NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE membership_renewals (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    renewed_by     BIGINT      REFERENCES users (id) ON DELETE SET NULL,
    months         INT         NOT NULL CHECK (months BETWEEN 1 AND 24),
    previous_until TIMESTAMPTZ,
    new_until      TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX membership_renewals_user_idx ON membership_renewals (user_id, created_at DESC);

CREATE TABLE exercises (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         TEXT        NOT NULL,
    muscle_group TEXT        NOT NULL,
    equipment    TEXT        NOT NULL DEFAULT '',
    description  TEXT        NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX exercises_name_lower_uidx ON exercises (lower(name));

CREATE TABLE training_plans (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by  BIGINT      REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX training_plans_user_idx ON training_plans (user_id);

CREATE TABLE plan_exercises (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_id      BIGINT NOT NULL REFERENCES training_plans (id) ON DELETE CASCADE,
    exercise_id  BIGINT NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
    day_label    TEXT   NOT NULL DEFAULT '',
    position     INT    NOT NULL,
    sets         INT    NOT NULL CHECK (sets BETWEEN 1 AND 50),
    reps         TEXT   NOT NULL,
    rest_seconds INT    NOT NULL DEFAULT 0 CHECK (rest_seconds >= 0),
    notes        TEXT   NOT NULL DEFAULT ''
);
CREATE INDEX plan_exercises_plan_idx ON plan_exercises (plan_id, position);

CREATE TABLE workouts (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    performed_on     DATE        NOT NULL,
    title            TEXT        NOT NULL,
    duration_minutes INT         CHECK (duration_minutes BETWEEN 0 AND 1440),
    perceived_effort INT         CHECK (perceived_effort BETWEEN 1 AND 10),
    notes            TEXT        NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workouts_user_date_idx ON workouts (user_id, performed_on DESC);

CREATE TABLE workout_sets (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workout_id  BIGINT        NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
    exercise_id BIGINT        NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
    position    INT           NOT NULL,
    set_number  INT           NOT NULL,
    reps        INT           NOT NULL CHECK (reps BETWEEN 0 AND 1000),
    weight_kg   NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0)
);
CREATE INDEX workout_sets_workout_idx ON workout_sets (workout_id, position, set_number);
CREATE INDEX workout_sets_exercise_idx ON workout_sets (exercise_id);

CREATE TABLE body_measurements (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    measured_on  DATE          NOT NULL,
    weight_kg    NUMERIC(5, 2) CHECK (weight_kg > 0),
    body_fat_pct NUMERIC(4, 1) CHECK (body_fat_pct BETWEEN 0 AND 100),
    waist_cm     NUMERIC(5, 1) CHECK (waist_cm > 0),
    notes        TEXT          NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX body_measurements_user_date_idx ON body_measurements (user_id, measured_on DESC);

-- Catálogo inicial de ejercicios.
INSERT INTO exercises (name, muscle_group, equipment, description) VALUES
    ('Sentadilla trasera',     'piernas',   'barra',        'Sentadilla con barra apoyada en trapecios.'),
    ('Peso muerto',            'espalda',   'barra',        'Levantamiento desde el suelo con espalda neutra.'),
    ('Press banca',            'pecho',     'barra',        'Press horizontal tumbado en banco plano.'),
    ('Press militar',          'hombros',   'barra',        'Press vertical de pie por encima de la cabeza.'),
    ('Remo con barra',         'espalda',   'barra',        'Remo inclinado con barra hacia el abdomen.'),
    ('Dominadas',              'espalda',   'peso corporal','Tracción vertical en barra fija.'),
    ('Fondos en paralelas',    'pecho',     'peso corporal','Empuje vertical en paralelas.'),
    ('Zancadas',               'piernas',   'mancuernas',   'Zancada alterna con mancuernas.'),
    ('Hip thrust',             'piernas',   'barra',        'Extensión de cadera con espalda apoyada en banco.'),
    ('Prensa de piernas',      'piernas',   'máquina',      'Empuje de piernas en máquina de prensa.'),
    ('Curl de bíceps',         'brazos',    'mancuernas',   'Flexión de codo con mancuernas.'),
    ('Extensión de tríceps',   'brazos',    'polea',        'Extensión de codo en polea alta.'),
    ('Elevaciones laterales',  'hombros',   'mancuernas',   'Abducción de hombro con mancuernas.'),
    ('Plancha',                'core',      'peso corporal','Isométrico abdominal en antebrazos (reps = segundos).'),
    ('Rueda abdominal',        'core',      'rueda',        'Extensión anterior con rueda abdominal.'),
    ('Remo en ergómetro',      'cardio',    'máquina',      'Trabajo cardiovascular en remoergómetro (reps = minutos).'),
    ('Burpees',                'cuerpo completo', 'peso corporal', 'Ejercicio metabólico de cuerpo completo.');
