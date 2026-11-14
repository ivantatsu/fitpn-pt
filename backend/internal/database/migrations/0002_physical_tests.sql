-- Marcas de las pruebas físicas de la oposición (simulacros y pruebas reales).

CREATE TABLE test_results (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    test_type    TEXT          NOT NULL CHECK (test_type IN ('agility_circuit', 'pull_ups', 'bar_hang', 'run_1000m')),
    -- Segundos para pruebas de tiempo; repeticiones para dominadas.
    result       NUMERIC(7, 2) NOT NULL CHECK (result >= 0),
    performed_on DATE          NOT NULL,
    notes        TEXT          NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX test_results_user_type_date_idx ON test_results (user_id, test_type, performed_on);

-- Ejercicios específicos de preparación para las pruebas.
INSERT INTO exercises (name, muscle_group, equipment, description) VALUES
    ('Dominadas pronas (agarre oposición)', 'espalda', 'barra fija', 'Agarre prono, partiendo de brazos extendidos y superando la barbilla.'),
    ('Suspensión en barra con brazos flexionados', 'brazos', 'barra fija', 'Mantener la barbilla por encima de la barra el máximo tiempo (reps = segundos).'),
    ('Series de 200 m', 'cardio', 'pista', 'Intervalos a ritmo de prueba de 1000 m (reps = número de series).'),
    ('Técnica de circuito de agilidad', 'cuerpo completo', 'conos y vallas', 'Práctica por tramos del circuito: salidas, cambios de dirección, vallas y conos.')
ON CONFLICT DO NOTHING;
