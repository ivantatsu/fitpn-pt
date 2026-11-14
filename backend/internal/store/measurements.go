package store

import (
	"context"
	"time"
)

// Measurement es un registro de medidas corporales.
type Measurement struct {
	ID         int64     `json:"id"`
	MeasuredOn string    `json:"measuredOn"`
	WeightKg   *float64  `json:"weightKg"`
	BodyFatPct *float64  `json:"bodyFatPct"`
	WaistCm    *float64  `json:"waistCm"`
	Notes      string    `json:"notes"`
	CreatedAt  time.Time `json:"createdAt"`
}

const measurementColumns = `id, to_char(measured_on, 'YYYY-MM-DD'), weight_kg::float8, body_fat_pct::float8, waist_cm::float8, notes, created_at`

// ListMeasurements devuelve las medidas más recientes primero.
func (s *Store) ListMeasurements(ctx context.Context, userID int64, limit int) ([]Measurement, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+measurementColumns+` FROM body_measurements
		WHERE user_id = $1 ORDER BY measured_on DESC, id DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, translate(err)
	}
	defer rows.Close()
	out := []Measurement{}
	for rows.Next() {
		var m Measurement
		if err := rows.Scan(&m.ID, &m.MeasuredOn, &m.WeightKg, &m.BodyFatPct, &m.WaistCm, &m.Notes, &m.CreatedAt); err != nil {
			return nil, translate(err)
		}
		out = append(out, m)
	}
	return out, translate(rows.Err())
}

// CreateMeasurement registra nuevas medidas.
func (s *Store) CreateMeasurement(ctx context.Context, userID int64, m Measurement) (Measurement, error) {
	err := s.pool.QueryRow(ctx, `
		INSERT INTO body_measurements (user_id, measured_on, weight_kg, body_fat_pct, waist_cm, notes)
		VALUES ($1, $2::date, $3, $4, $5, $6)
		RETURNING `+measurementColumns,
		userID, m.MeasuredOn, m.WeightKg, m.BodyFatPct, m.WaistCm, m.Notes).
		Scan(&m.ID, &m.MeasuredOn, &m.WeightKg, &m.BodyFatPct, &m.WaistCm, &m.Notes, &m.CreatedAt)
	return m, translate(err)
}

// DeleteMeasurement elimina un registro de medidas del usuario.
func (s *Store) DeleteMeasurement(ctx context.Context, userID, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM body_measurements WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return translate(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
