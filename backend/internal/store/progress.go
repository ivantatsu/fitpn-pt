package store

import (
	"context"
	"time"
)

// WeeklyPoint resume una semana de entrenamiento.
type WeeklyPoint struct {
	WeekStart string  `json:"weekStart"`
	Workouts  int     `json:"workouts"`
	VolumeKg  float64 `json:"volumeKg"`
}

// WeightPoint es un punto de la serie de peso corporal.
type WeightPoint struct {
	Date     string  `json:"date"`
	WeightKg float64 `json:"weightKg"`
}

// PersonalRecord es la mejor marca de un usuario en un ejercicio.
type PersonalRecord struct {
	ExerciseID     int64   `json:"exerciseId"`
	ExerciseName   string  `json:"exerciseName"`
	WeightKg       float64 `json:"weightKg"`
	Reps           int     `json:"reps"`
	Estimated1RMKg float64 `json:"estimated1RmKg"`
	AchievedOn     string  `json:"achievedOn"`
}

// ProgressSummary agrega los indicadores de progreso de un usuario.
type ProgressSummary struct {
	TotalWorkouts      int              `json:"totalWorkouts"`
	WorkoutsLast30Days int              `json:"workoutsLast30Days"`
	VolumeLast30DaysKg float64          `json:"volumeLast30DaysKg"`
	CurrentStreakWeeks int              `json:"currentStreakWeeks"`
	LastWorkoutOn      *string          `json:"lastWorkoutOn"`
	Weekly             []WeeklyPoint    `json:"weekly"`
	BodyWeight         []WeightPoint    `json:"bodyWeight"`
	PersonalRecords    []PersonalRecord `json:"personalRecords"`
}

// Summary calcula el resumen de progreso de las últimas `weeks` semanas.
func (s *Store) Summary(ctx context.Context, userID int64, weeks int, today time.Time) (ProgressSummary, error) {
	sum := ProgressSummary{Weekly: []WeeklyPoint{}, BodyWeight: []WeightPoint{}, PersonalRecords: []PersonalRecord{}}
	day := today.Format(DateLayout)

	err := s.pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM workouts WHERE user_id = $1),
			(SELECT count(*) FROM workouts WHERE user_id = $1 AND performed_on > $2::date - 30),
			(SELECT COALESCE(sum(s.reps * s.weight_kg), 0)::float8
			   FROM workouts w JOIN workout_sets s ON s.workout_id = w.id
			  WHERE w.user_id = $1 AND w.performed_on > $2::date - 30),
			(SELECT to_char(max(performed_on), 'YYYY-MM-DD') FROM workouts WHERE user_id = $1)`,
		userID, day).Scan(&sum.TotalWorkouts, &sum.WorkoutsLast30Days, &sum.VolumeLast30DaysKg, &sum.LastWorkoutOn)
	if err != nil {
		return sum, translate(err)
	}

	// Serie semanal (lunes a domingo), incluyendo semanas sin actividad.
	rows, err := s.pool.Query(ctx, `
		WITH weeks AS (
			SELECT generate_series(
				date_trunc('week', $2::date) - ($3::int - 1) * interval '1 week',
				date_trunc('week', $2::date),
				interval '1 week')::date AS week_start
		),
		per_workout AS (
			SELECT w.id, w.performed_on, COALESCE(sum(s.reps * s.weight_kg), 0) AS volume
			FROM workouts w LEFT JOIN workout_sets s ON s.workout_id = w.id
			WHERE w.user_id = $1 AND w.performed_on >= date_trunc('week', $2::date) - ($3::int - 1) * interval '1 week'
			GROUP BY w.id
		)
		SELECT to_char(wk.week_start, 'YYYY-MM-DD'), count(pw.id), COALESCE(sum(pw.volume), 0)::float8
		FROM weeks wk
		LEFT JOIN per_workout pw ON pw.performed_on >= wk.week_start AND pw.performed_on < wk.week_start + 7
		GROUP BY wk.week_start
		ORDER BY wk.week_start`, userID, day, weeks)
	if err != nil {
		return sum, translate(err)
	}
	for rows.Next() {
		var p WeeklyPoint
		if err := rows.Scan(&p.WeekStart, &p.Workouts, &p.VolumeKg); err != nil {
			rows.Close()
			return sum, translate(err)
		}
		sum.Weekly = append(sum.Weekly, p)
	}
	rows.Close()

	// Racha: semanas consecutivas con al menos una sesión, contando hacia atrás
	// desde la semana actual (o la anterior si esta aún no tiene sesiones).
	weekRows, err := s.pool.Query(ctx, `
		SELECT DISTINCT date_trunc('week', performed_on)::date AS wk
		FROM workouts WHERE user_id = $1 AND performed_on <= $2::date
		ORDER BY wk DESC LIMIT 260`, userID, day)
	if err != nil {
		return sum, translate(err)
	}
	var activeWeeks []time.Time
	for weekRows.Next() {
		var wk time.Time
		if err := weekRows.Scan(&wk); err != nil {
			weekRows.Close()
			return sum, translate(err)
		}
		activeWeeks = append(activeWeeks, wk)
	}
	weekRows.Close()
	sum.CurrentStreakWeeks = streak(activeWeeks, today)

	// Evolución del peso corporal.
	wRows, err := s.pool.Query(ctx, `
		SELECT d, w FROM (
			SELECT to_char(measured_on, 'YYYY-MM-DD') AS d, weight_kg::float8 AS w, measured_on, id
			FROM body_measurements WHERE user_id = $1 AND weight_kg IS NOT NULL
			ORDER BY measured_on DESC, id DESC LIMIT 90
		) t ORDER BY measured_on, id`, userID)
	if err != nil {
		return sum, translate(err)
	}
	for wRows.Next() {
		var p WeightPoint
		if err := wRows.Scan(&p.Date, &p.WeightKg); err != nil {
			wRows.Close()
			return sum, translate(err)
		}
		sum.BodyWeight = append(sum.BodyWeight, p)
	}
	wRows.Close()

	// Récords personales por 1RM estimado (fórmula de Epley).
	prRows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (s.exercise_id)
			s.exercise_id, e.name, s.weight_kg::float8, s.reps,
			round(s.weight_kg * (1 + s.reps / 30.0), 1)::float8 AS e1rm,
			to_char(w.performed_on, 'YYYY-MM-DD')
		FROM workout_sets s
		JOIN workouts w ON w.id = s.workout_id
		JOIN exercises e ON e.id = s.exercise_id
		WHERE w.user_id = $1 AND s.weight_kg > 0 AND s.reps > 0
		ORDER BY s.exercise_id, e1rm DESC, w.performed_on ASC`, userID)
	if err != nil {
		return sum, translate(err)
	}
	defer prRows.Close()
	for prRows.Next() {
		var pr PersonalRecord
		if err := prRows.Scan(&pr.ExerciseID, &pr.ExerciseName, &pr.WeightKg, &pr.Reps, &pr.Estimated1RMKg, &pr.AchievedOn); err != nil {
			return sum, translate(err)
		}
		sum.PersonalRecords = append(sum.PersonalRecords, pr)
	}
	return sum, translate(prRows.Err())
}

// streak cuenta semanas consecutivas activas. activeWeeks viene ordenado de más
// reciente a más antigua y cada valor es el lunes de la semana.
func streak(activeWeeks []time.Time, today time.Time) int {
	if len(activeWeeks) == 0 {
		return 0
	}
	cur := mondayOf(today)
	first := activeWeeks[0].Format(DateLayout)
	if first != cur.Format(DateLayout) {
		cur = cur.AddDate(0, 0, -7)
		if first != cur.Format(DateLayout) {
			return 0
		}
	}
	n := 0
	for _, wk := range activeWeeks {
		if wk.Format(DateLayout) != cur.Format(DateLayout) {
			break
		}
		n++
		cur = cur.AddDate(0, 0, -7)
	}
	return n
}

func mondayOf(t time.Time) time.Time {
	t = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	offset := (int(t.Weekday()) + 6) % 7 // lunes = 0
	return t.AddDate(0, 0, -offset)
}

// ExercisePoint es la mejor marca de un ejercicio en una sesión.
type ExercisePoint struct {
	Date           string  `json:"date"`
	MaxWeightKg    float64 `json:"maxWeightKg"`
	Estimated1RMKg float64 `json:"estimated1RmKg"`
	TotalReps      int     `json:"totalReps"`
	VolumeKg       float64 `json:"volumeKg"`
}

// ExerciseProgress devuelve la evolución de un ejercicio sesión a sesión.
func (s *Store) ExerciseProgress(ctx context.Context, userID, exerciseID int64) ([]ExercisePoint, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT to_char(w.performed_on, 'YYYY-MM-DD'),
		       max(s.weight_kg)::float8,
		       round(max(s.weight_kg * (1 + s.reps / 30.0)), 1)::float8,
		       sum(s.reps)::int,
		       sum(s.reps * s.weight_kg)::float8
		FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
		WHERE w.user_id = $1 AND s.exercise_id = $2
		GROUP BY w.performed_on
		ORDER BY w.performed_on
		LIMIT 500`, userID, exerciseID)
	if err != nil {
		return nil, translate(err)
	}
	defer rows.Close()
	out := []ExercisePoint{}
	for rows.Next() {
		var p ExercisePoint
		if err := rows.Scan(&p.Date, &p.MaxWeightKg, &p.Estimated1RMKg, &p.TotalReps, &p.VolumeKg); err != nil {
			return nil, translate(err)
		}
		out = append(out, p)
	}
	return out, translate(rows.Err())
}
