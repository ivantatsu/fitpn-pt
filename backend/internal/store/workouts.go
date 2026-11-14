package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// Workout es una sesión de entrenamiento registrada.
type Workout struct {
	ID              int64             `json:"id"`
	UserID          int64             `json:"userId"`
	PerformedOn     string            `json:"performedOn"`
	Title           string            `json:"title"`
	DurationMinutes *int              `json:"durationMinutes"`
	PerceivedEffort *int              `json:"perceivedEffort"`
	Notes           string            `json:"notes"`
	CreatedAt       time.Time         `json:"createdAt"`
	ExerciseCount   int               `json:"exerciseCount"`
	SetCount        int               `json:"setCount"`
	TotalVolumeKg   float64           `json:"totalVolumeKg"`
	Exercises       []WorkoutExercise `json:"exercises,omitempty"`
}

// WorkoutExercise agrupa las series de un ejercicio dentro de una sesión.
type WorkoutExercise struct {
	ExerciseID   int64        `json:"exerciseId"`
	ExerciseName string       `json:"exerciseName,omitempty"`
	Sets         []WorkoutSet `json:"sets"`
}

// WorkoutSet es una serie concreta.
type WorkoutSet struct {
	Reps     int     `json:"reps"`
	WeightKg float64 `json:"weightKg"`
}

// WorkoutFilter filtra el listado de sesiones.
type WorkoutFilter struct {
	From, To      string // fechas YYYY-MM-DD opcionales
	Limit, Offset int
}

// ListWorkouts devuelve las sesiones de un usuario (sin el detalle de series).
func (s *Store) ListWorkouts(ctx context.Context, userID int64, f WorkoutFilter) ([]Workout, int, error) {
	const filter = `w.user_id = $1
		AND ($2::date IS NULL OR w.performed_on >= $2::date)
		AND ($3::date IS NULL OR w.performed_on <= $3::date)`
	from, to := nullIfEmpty(f.From), nullIfEmpty(f.To)

	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM workouts w WHERE `+filter, userID, from, to).Scan(&total); err != nil {
		return nil, 0, translate(err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT w.id, w.user_id, to_char(w.performed_on, 'YYYY-MM-DD'), w.title, w.duration_minutes,
		       w.perceived_effort, w.notes, w.created_at,
		       count(DISTINCT s.exercise_id), count(s.id), COALESCE(sum(s.reps * s.weight_kg), 0)::float8
		FROM workouts w
		LEFT JOIN workout_sets s ON s.workout_id = w.id
		WHERE `+filter+`
		GROUP BY w.id
		ORDER BY w.performed_on DESC, w.id DESC
		LIMIT $4 OFFSET $5`, userID, from, to, f.Limit, f.Offset)
	if err != nil {
		return nil, 0, translate(err)
	}
	defer rows.Close()

	out := []Workout{}
	for rows.Next() {
		var w Workout
		if err := rows.Scan(&w.ID, &w.UserID, &w.PerformedOn, &w.Title, &w.DurationMinutes, &w.PerceivedEffort,
			&w.Notes, &w.CreatedAt, &w.ExerciseCount, &w.SetCount, &w.TotalVolumeKg); err != nil {
			return nil, 0, translate(err)
		}
		out = append(out, w)
	}
	return out, total, translate(rows.Err())
}

// GetWorkout devuelve una sesión con todas sus series.
func (s *Store) GetWorkout(ctx context.Context, userID, id int64) (Workout, error) {
	var w Workout
	err := s.pool.QueryRow(ctx, `
		SELECT id, user_id, to_char(performed_on, 'YYYY-MM-DD'), title, duration_minutes, perceived_effort, notes, created_at
		FROM workouts WHERE id = $1 AND user_id = $2`, id, userID).
		Scan(&w.ID, &w.UserID, &w.PerformedOn, &w.Title, &w.DurationMinutes, &w.PerceivedEffort, &w.Notes, &w.CreatedAt)
	if err != nil {
		return w, translate(err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT s.exercise_id, e.name, s.position, s.reps, s.weight_kg::float8
		FROM workout_sets s JOIN exercises e ON e.id = s.exercise_id
		WHERE s.workout_id = $1
		ORDER BY s.position, s.set_number`, id)
	if err != nil {
		return w, translate(err)
	}
	defer rows.Close()

	w.Exercises = []WorkoutExercise{}
	lastPos := -1
	exercises := map[int64]struct{}{}
	for rows.Next() {
		var (
			exID     int64
			name     string
			position int
			set      WorkoutSet
		)
		if err := rows.Scan(&exID, &name, &position, &set.Reps, &set.WeightKg); err != nil {
			return w, translate(err)
		}
		if position != lastPos {
			w.Exercises = append(w.Exercises, WorkoutExercise{ExerciseID: exID, ExerciseName: name})
			lastPos = position
		}
		cur := &w.Exercises[len(w.Exercises)-1]
		cur.Sets = append(cur.Sets, set)
		exercises[exID] = struct{}{}
		w.SetCount++
		w.TotalVolumeKg += float64(set.Reps) * set.WeightKg
	}
	w.ExerciseCount = len(exercises)
	return w, translate(rows.Err())
}

// SaveWorkout crea (w.ID == 0) o reemplaza una sesión completa con sus series.
func (s *Store) SaveWorkout(ctx context.Context, w Workout) (Workout, error) {
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if w.ID == 0 {
			if err := tx.QueryRow(ctx, `
				INSERT INTO workouts (user_id, performed_on, title, duration_minutes, perceived_effort, notes)
				VALUES ($1, $2::date, $3, $4, $5, $6) RETURNING id`,
				w.UserID, w.PerformedOn, w.Title, w.DurationMinutes, w.PerceivedEffort, w.Notes).Scan(&w.ID); err != nil {
				return err
			}
		} else {
			tag, err := tx.Exec(ctx, `
				UPDATE workouts SET performed_on = $3::date, title = $4, duration_minutes = $5, perceived_effort = $6, notes = $7
				WHERE id = $1 AND user_id = $2`,
				w.ID, w.UserID, w.PerformedOn, w.Title, w.DurationMinutes, w.PerceivedEffort, w.Notes)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return ErrNotFound
			}
			if _, err := tx.Exec(ctx, `DELETE FROM workout_sets WHERE workout_id = $1`, w.ID); err != nil {
				return err
			}
		}

		var rows [][]any
		for pos, ex := range w.Exercises {
			for n, set := range ex.Sets {
				rows = append(rows, []any{w.ID, ex.ExerciseID, pos, n + 1, set.Reps, set.WeightKg})
			}
		}
		if len(rows) == 0 {
			return nil
		}
		_, err := tx.CopyFrom(ctx, pgx.Identifier{"workout_sets"},
			[]string{"workout_id", "exercise_id", "position", "set_number", "reps", "weight_kg"},
			pgx.CopyFromRows(rows))
		return err
	})
	if err != nil {
		return Workout{}, err
	}
	return s.GetWorkout(ctx, w.UserID, w.ID)
}

// DeleteWorkout elimina una sesión del usuario.
func (s *Store) DeleteWorkout(ctx context.Context, userID, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM workouts WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return translate(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
