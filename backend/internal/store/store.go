// Package store implementa el acceso a datos sobre PostgreSQL.
//
// Las consultas son SQL explícito (sin ORM) para que sean fáciles de leer,
// optimizar y mantener.
package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Errores de dominio devueltos por el store.
var (
	ErrNotFound         = errors.New("no encontrado")
	ErrConflict         = errors.New("conflicto: el recurso ya existe")
	ErrInvalidReference = errors.New("referencia inválida")
	ErrInUse            = errors.New("el recurso está en uso")
	ErrTokenReused      = errors.New("refresh token reutilizado")
)

// Store agrupa los repositorios sobre un pool de conexiones.
type Store struct {
	pool *pgxpool.Pool
}

// New crea un Store.
func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Ping comprueba la conectividad con la base de datos.
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

// translate convierte errores de PostgreSQL en errores de dominio.
func translate(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505": // unique_violation
			return ErrConflict
		case "23503": // foreign_key_violation
			if strings.Contains(pgErr.Message, "update or delete") {
				return ErrInUse
			}
			return ErrInvalidReference
		}
	}
	return err
}

// inTx ejecuta fn dentro de una transacción.
func (s *Store) inTx(ctx context.Context, fn func(pgx.Tx) error) error {
	return translate(pgx.BeginFunc(ctx, s.pool, fn))
}
