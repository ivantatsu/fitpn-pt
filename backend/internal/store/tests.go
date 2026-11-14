package store

import (
	"context"
	"time"
)

// Tipos de prueba física de la oposición.
const (
	TestAgilityCircuit = "agility_circuit" // segundos (menos es mejor)
	TestPullUps        = "pull_ups"        // repeticiones (más es mejor)
	TestBarHang        = "bar_hang"        // segundos (más es mejor)
	TestRun1000m       = "run_1000m"       // segundos (menos es mejor)
)

// TestResult es una marca registrada en una prueba física.
type TestResult struct {
	ID          int64     `json:"id"`
	TestType    string    `json:"testType"`
	Result      float64   `json:"result"`
	PerformedOn string    `json:"performedOn"`
	Notes       string    `json:"notes"`
	CreatedAt   time.Time `json:"createdAt"`
}

const testColumns = `id, test_type, result::float8, to_char(performed_on, 'YYYY-MM-DD'), notes, created_at`

// ListTestResults devuelve las marcas de un usuario en orden cronológico.
func (s *Store) ListTestResults(ctx context.Context, userID int64) ([]TestResult, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+testColumns+` FROM test_results
		WHERE user_id = $1 ORDER BY performed_on, id LIMIT 2000`, userID)
	if err != nil {
		return nil, translate(err)
	}
	defer rows.Close()
	out := []TestResult{}
	for rows.Next() {
		var t TestResult
		if err := rows.Scan(&t.ID, &t.TestType, &t.Result, &t.PerformedOn, &t.Notes, &t.CreatedAt); err != nil {
			return nil, translate(err)
		}
		out = append(out, t)
	}
	return out, translate(rows.Err())
}

// CreateTestResult registra una marca.
func (s *Store) CreateTestResult(ctx context.Context, userID int64, t TestResult) (TestResult, error) {
	err := s.pool.QueryRow(ctx, `
		INSERT INTO test_results (user_id, test_type, result, performed_on, notes)
		VALUES ($1, $2, $3, $4::date, $5)
		RETURNING `+testColumns, userID, t.TestType, t.Result, t.PerformedOn, t.Notes).
		Scan(&t.ID, &t.TestType, &t.Result, &t.PerformedOn, &t.Notes, &t.CreatedAt)
	return t, translate(err)
}

// DeleteTestResult elimina una marca del usuario.
func (s *Store) DeleteTestResult(ctx context.Context, userID, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM test_results WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return translate(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
