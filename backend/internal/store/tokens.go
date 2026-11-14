package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// CreateRefreshToken guarda el hash de un refresh token.
func (s *Store) CreateRefreshToken(ctx context.Context, userID int64, hash []byte, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, hash, expiresAt)
	return translate(err)
}

const reuseGracePeriod = 10 * time.Second

// RotateRefreshToken invalida el token actual y registra uno nuevo de forma atómica.
// Si se presenta un token ya revocado se asume robo y se revocan todas las sesiones
// del usuario (detección de reutilización).
func (s *Store) RotateRefreshToken(ctx context.Context, oldHash, newHash []byte, newExpiresAt, now time.Time) (int64, error) {
	var userID int64
	reused := false
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		var (
			id        int64
			expiresAt time.Time
			revokedAt *time.Time
		)
		err := tx.QueryRow(ctx, `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
			oldHash).Scan(&id, &userID, &expiresAt, &revokedAt)
		if err != nil {
			return err
		}
		if revokedAt != nil {
			// Margen para peticiones concurrentes legítimas (p. ej. dos pestañas refrescando a la vez).
			if now.Sub(*revokedAt) < reuseGracePeriod {
				return ErrNotFound
			}
			reused = true
			_, err := tx.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, userID, now)
			return err
		}
		if !expiresAt.After(now) {
			return ErrNotFound
		}
		if _, err := tx.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = $2 WHERE id = $1`, id, now); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
			userID, newHash, newExpiresAt)
		return err
	})
	if err != nil {
		return 0, err
	}
	if reused {
		return userID, ErrTokenReused
	}
	return userID, nil
}

// RevokeRefreshToken revoca un token concreto (logout).
func (s *Store) RevokeRefreshToken(ctx context.Context, hash []byte, now time.Time) error {
	_, err := s.pool.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL`, hash, now)
	return translate(err)
}

// RevokeUserTokens revoca todas las sesiones de un usuario.
func (s *Store) RevokeUserTokens(ctx context.Context, userID int64, now time.Time) error {
	_, err := s.pool.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, userID, now)
	return translate(err)
}

// PurgeRefreshTokens elimina tokens caducados o revocados hace más de un día.
func (s *Store) PurgeRefreshTokens(ctx context.Context, now time.Time) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM refresh_tokens
		WHERE expires_at < $1 OR revoked_at < $1 - interval '1 day'`, now)
	return tag.RowsAffected(), translate(err)
}
