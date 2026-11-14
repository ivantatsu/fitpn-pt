package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// Plan es un plan de entrenamiento asignado por un administrador a un socio.
type Plan struct {
	ID          int64      `json:"id"`
	UserID      int64      `json:"userId"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	IsActive    bool       `json:"isActive"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	Items       []PlanItem `json:"items"`
}

// PlanItem es un ejercicio prescrito dentro de un plan.
type PlanItem struct {
	ExerciseID   int64  `json:"exerciseId"`
	ExerciseName string `json:"exerciseName,omitempty"`
	DayLabel     string `json:"dayLabel"`
	Sets         int    `json:"sets"`
	Reps         string `json:"reps"`
	RestSeconds  int    `json:"restSeconds"`
	Notes        string `json:"notes"`
}

// ListPlans devuelve los planes de un usuario con sus ejercicios.
func (s *Store) ListPlans(ctx context.Context, userID int64, onlyActive bool) ([]Plan, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, user_id, title, description, is_active, created_at, updated_at
		FROM training_plans
		WHERE user_id = $1 AND (NOT $2 OR is_active)
		ORDER BY is_active DESC, updated_at DESC`, userID, onlyActive)
	if err != nil {
		return nil, translate(err)
	}
	plans := []Plan{}
	index := map[int64]int{}
	var ids []int64
	for rows.Next() {
		var p Plan
		if err := rows.Scan(&p.ID, &p.UserID, &p.Title, &p.Description, &p.IsActive, &p.CreatedAt, &p.UpdatedAt); err != nil {
			rows.Close()
			return nil, translate(err)
		}
		p.Items = []PlanItem{}
		index[p.ID] = len(plans)
		ids = append(ids, p.ID)
		plans = append(plans, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, translate(err)
	}
	if len(ids) == 0 {
		return plans, nil
	}

	itemRows, err := s.pool.Query(ctx, `
		SELECT pe.plan_id, pe.exercise_id, e.name, pe.day_label, pe.sets, pe.reps, pe.rest_seconds, pe.notes
		FROM plan_exercises pe JOIN exercises e ON e.id = pe.exercise_id
		WHERE pe.plan_id = ANY($1)
		ORDER BY pe.plan_id, pe.position`, ids)
	if err != nil {
		return nil, translate(err)
	}
	defer itemRows.Close()
	for itemRows.Next() {
		var (
			planID int64
			it     PlanItem
		)
		if err := itemRows.Scan(&planID, &it.ExerciseID, &it.ExerciseName, &it.DayLabel, &it.Sets, &it.Reps, &it.RestSeconds, &it.Notes); err != nil {
			return nil, translate(err)
		}
		p := &plans[index[planID]]
		p.Items = append(p.Items, it)
	}
	return plans, translate(itemRows.Err())
}

// GetPlan devuelve un plan concreto de un usuario.
func (s *Store) GetPlan(ctx context.Context, userID, planID int64) (Plan, error) {
	plans, err := s.ListPlans(ctx, userID, false)
	if err != nil {
		return Plan{}, err
	}
	for _, p := range plans {
		if p.ID == planID {
			return p, nil
		}
	}
	return Plan{}, ErrNotFound
}

// SavePlan crea (p.ID == 0) o reemplaza un plan completo.
func (s *Store) SavePlan(ctx context.Context, p Plan, createdBy int64) (Plan, error) {
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if p.ID == 0 {
			if err := tx.QueryRow(ctx, `
				INSERT INTO training_plans (user_id, title, description, is_active, created_by)
				VALUES ($1, $2, $3, $4, $5) RETURNING id`,
				p.UserID, p.Title, p.Description, p.IsActive, createdBy).Scan(&p.ID); err != nil {
				return err
			}
		} else {
			tag, err := tx.Exec(ctx, `
				UPDATE training_plans SET title = $3, description = $4, is_active = $5, updated_at = now()
				WHERE id = $1 AND user_id = $2`, p.ID, p.UserID, p.Title, p.Description, p.IsActive)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return ErrNotFound
			}
			if _, err := tx.Exec(ctx, `DELETE FROM plan_exercises WHERE plan_id = $1`, p.ID); err != nil {
				return err
			}
		}

		if len(p.Items) == 0 {
			return nil
		}
		rows := make([][]any, len(p.Items))
		for i, it := range p.Items {
			rows[i] = []any{p.ID, it.ExerciseID, it.DayLabel, i, it.Sets, it.Reps, it.RestSeconds, it.Notes}
		}
		_, err := tx.CopyFrom(ctx, pgx.Identifier{"plan_exercises"},
			[]string{"plan_id", "exercise_id", "day_label", "position", "sets", "reps", "rest_seconds", "notes"},
			pgx.CopyFromRows(rows))
		return err
	})
	if err != nil {
		return Plan{}, err
	}
	return s.GetPlan(ctx, p.UserID, p.ID)
}

// DeletePlan elimina un plan de un usuario.
func (s *Store) DeletePlan(ctx context.Context, userID, planID int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM training_plans WHERE id = $1 AND user_id = $2`, planID, userID)
	if err != nil {
		return translate(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
