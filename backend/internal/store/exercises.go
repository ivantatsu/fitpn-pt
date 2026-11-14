package store

import (
	"context"
	"time"
)

// Exercise es un ejercicio del catálogo.
type Exercise struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	MuscleGroup string    `json:"muscleGroup"`
	Equipment   string    `json:"equipment"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
}

const exerciseColumns = `id, name, muscle_group, equipment, description, created_at`

// ListExercises devuelve el catálogo completo ordenado por grupo y nombre.
func (s *Store) ListExercises(ctx context.Context) ([]Exercise, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+exerciseColumns+` FROM exercises ORDER BY muscle_group, lower(name)`)
	if err != nil {
		return nil, translate(err)
	}
	defer rows.Close()
	out := []Exercise{}
	for rows.Next() {
		var e Exercise
		if err := rows.Scan(&e.ID, &e.Name, &e.MuscleGroup, &e.Equipment, &e.Description, &e.CreatedAt); err != nil {
			return nil, translate(err)
		}
		out = append(out, e)
	}
	return out, translate(rows.Err())
}

// CreateExercise añade un ejercicio al catálogo.
func (s *Store) CreateExercise(ctx context.Context, e Exercise) (Exercise, error) {
	err := s.pool.QueryRow(ctx, `
		INSERT INTO exercises (name, muscle_group, equipment, description) VALUES ($1, $2, $3, $4)
		RETURNING `+exerciseColumns, e.Name, e.MuscleGroup, e.Equipment, e.Description).
		Scan(&e.ID, &e.Name, &e.MuscleGroup, &e.Equipment, &e.Description, &e.CreatedAt)
	return e, translate(err)
}

// UpdateExercise modifica un ejercicio.
func (s *Store) UpdateExercise(ctx context.Context, e Exercise) (Exercise, error) {
	err := s.pool.QueryRow(ctx, `
		UPDATE exercises SET name = $2, muscle_group = $3, equipment = $4, description = $5 WHERE id = $1
		RETURNING `+exerciseColumns, e.ID, e.Name, e.MuscleGroup, e.Equipment, e.Description).
		Scan(&e.ID, &e.Name, &e.MuscleGroup, &e.Equipment, &e.Description, &e.CreatedAt)
	return e, translate(err)
}

// DeleteExercise elimina un ejercicio si no está referenciado.
func (s *Store) DeleteExercise(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM exercises WHERE id = $1`, id)
	if err != nil {
		return translate(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
