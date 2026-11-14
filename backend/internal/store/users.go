package store

import (
	"context"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ivantatsu/fitpn-pt/backend/internal/membership"
)

// User representa una cuenta de la plataforma.
type User struct {
	ID           int64      `json:"id"`
	Email        string     `json:"email"`
	FullName     string     `json:"fullName"`
	Role         string     `json:"role"`
	ActiveUntil  *time.Time `json:"activeUntil"`
	Disabled     bool       `json:"disabled"`
	LastLoginAt  *time.Time `json:"lastLoginAt"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	PasswordHash string     `json:"-"`
}

// HasAccess indica si el usuario puede acceder en el instante now.
func (u User) HasAccess(now time.Time) bool {
	return membership.HasAccess(u.Role, u.Disabled, u.ActiveUntil, now)
}

// Status devuelve el estado de suscripción.
func (u User) Status(now time.Time) string {
	return membership.Status(u.Role, u.Disabled, u.ActiveUntil, now)
}

const userColumns = `id, email, full_name, role, active_until, disabled, last_login_at, created_at, updated_at, password_hash`

func scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &u.ActiveUntil, &u.Disabled,
		&u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt, &u.PasswordHash)
	return u, translate(err)
}

// NormalizeEmail aplica la forma canónica de un email.
func NormalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

// CreateUser inserta un usuario nuevo.
func (s *Store) CreateUser(ctx context.Context, u User) (User, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, full_name, role, active_until, disabled)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING `+userColumns,
		NormalizeEmail(u.Email), u.PasswordHash, u.FullName, u.Role, u.ActiveUntil, u.Disabled)
	return scanUser(row)
}

// GetUser obtiene un usuario por ID.
func (s *Store) GetUser(ctx context.Context, id int64) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id))
}

// GetUserByEmail obtiene un usuario por email (sin distinguir mayúsculas).
func (s *Store) GetUserByEmail(ctx context.Context, email string) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE lower(email) = $1`, NormalizeEmail(email)))
}

// UserFilter define los filtros del listado de usuarios.
type UserFilter struct {
	Query  string
	Status string // active | expiring | expired | disabled | admin | "" (todos)
	Limit  int
	Offset int
}

// ListUsers devuelve una página de usuarios y el total que cumple el filtro.
func (s *Store) ListUsers(ctx context.Context, f UserFilter, now time.Time) ([]User, int, error) {
	var (
		where []string
		args  []any
	)
	arg := func(v any) string {
		args = append(args, v)
		return "$" + itoa(len(args))
	}

	if q := strings.TrimSpace(f.Query); q != "" {
		p := arg("%" + escapeLike(strings.ToLower(q)) + "%")
		where = append(where, "(lower(email) LIKE "+p+" OR lower(full_name) LIKE "+p+")")
	}
	switch f.Status {
	case membership.StatusActive:
		where = append(where, "role = 'member' AND NOT disabled AND active_until > "+arg(now))
	case membership.StatusExpiring:
		p := arg(now)
		where = append(where, "role = 'member' AND NOT disabled AND active_until > "+p+" AND active_until <= "+p+" + interval '7 days'")
	case membership.StatusExpired:
		where = append(where, "role = 'member' AND NOT disabled AND active_until <= "+arg(now))
	case membership.StatusDisabled:
		where = append(where, "disabled")
	case membership.RoleAdmin:
		where = append(where, "role = 'admin'")
	}

	cond := "TRUE"
	if len(where) > 0 {
		cond = strings.Join(where, " AND ")
	}

	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE `+cond, args...).Scan(&total); err != nil {
		return nil, 0, translate(err)
	}

	limit, offset := arg(f.Limit), arg(f.Offset)
	rows, err := s.pool.Query(ctx, `SELECT `+userColumns+` FROM users WHERE `+cond+`
		ORDER BY role, active_until NULLS LAST, lower(full_name)
		LIMIT `+limit+` OFFSET `+offset, args...)
	if err != nil {
		return nil, 0, translate(err)
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, 0, err
		}
		users = append(users, u)
	}
	return users, total, translate(rows.Err())
}

// UpdateUser guarda los campos editables de un usuario.
func (s *Store) UpdateUser(ctx context.Context, u User) (User, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE users SET email = $2, full_name = $3, role = $4, active_until = $5, disabled = $6, updated_at = now()
		WHERE id = $1
		RETURNING `+userColumns,
		u.ID, NormalizeEmail(u.Email), u.FullName, u.Role, u.ActiveUntil, u.Disabled)
	return scanUser(row)
}

// SetPassword actualiza el hash de contraseña.
func (s *Store) SetPassword(ctx context.Context, id int64, hash string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, id, hash)
	if err != nil {
		return translate(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// TouchLastLogin registra la fecha del último acceso.
func (s *Store) TouchLastLogin(ctx context.Context, id int64, at time.Time) error {
	_, err := s.pool.Exec(ctx, `UPDATE users SET last_login_at = $2 WHERE id = $1`, id, at)
	return translate(err)
}

// DeleteUser elimina un usuario y, en cascada, todos sus datos.
func (s *Store) DeleteUser(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return translate(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CountActiveAdmins cuenta administradores no deshabilitados.
func (s *Store) CountActiveAdmins(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE role = 'admin' AND NOT disabled`).Scan(&n)
	return n, translate(err)
}

// Renewal es una entrada del historial de renovaciones.
type Renewal struct {
	ID            int64      `json:"id"`
	Months        int        `json:"months"`
	PreviousUntil *time.Time `json:"previousUntil"`
	NewUntil      time.Time  `json:"newUntil"`
	RenewedByName *string    `json:"renewedByName"`
	CreatedAt     time.Time  `json:"createdAt"`
}

// RenewMembership amplía la suscripción de un socio de forma atómica y deja registro.
func (s *Store) RenewMembership(ctx context.Context, userID, renewedBy int64, months int, now time.Time) (User, error) {
	var out User
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		u, err := scanUser(tx.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1 FOR UPDATE`, userID))
		if err != nil {
			return err
		}
		if u.Role != membership.RoleMember {
			return ErrConflict
		}
		newUntil := membership.RenewedExpiry(now, u.ActiveUntil, months)
		if _, err := tx.Exec(ctx, `
			INSERT INTO membership_renewals (user_id, renewed_by, months, previous_until, new_until)
			VALUES ($1, $2, $3, $4, $5)`, userID, renewedBy, months, u.ActiveUntil, newUntil); err != nil {
			return err
		}
		out, err = scanUser(tx.QueryRow(ctx, `
			UPDATE users SET active_until = $2, updated_at = now() WHERE id = $1
			RETURNING `+userColumns, userID, newUntil))
		return err
	})
	return out, err
}

// ListRenewals devuelve el historial de renovaciones de un usuario.
func (s *Store) ListRenewals(ctx context.Context, userID int64) ([]Renewal, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT r.id, r.months, r.previous_until, r.new_until, u.full_name, r.created_at
		FROM membership_renewals r
		LEFT JOIN users u ON u.id = r.renewed_by
		WHERE r.user_id = $1
		ORDER BY r.created_at DESC
		LIMIT 100`, userID)
	if err != nil {
		return nil, translate(err)
	}
	defer rows.Close()
	out := []Renewal{}
	for rows.Next() {
		var r Renewal
		if err := rows.Scan(&r.ID, &r.Months, &r.PreviousUntil, &r.NewUntil, &r.RenewedByName, &r.CreatedAt); err != nil {
			return nil, translate(err)
		}
		out = append(out, r)
	}
	return out, translate(rows.Err())
}

// AdminStats resume el estado de la plataforma.
type AdminStats struct {
	TotalMembers       int `json:"totalMembers"`
	ActiveMembers      int `json:"activeMembers"`
	ExpiringMembers    int `json:"expiringMembers"`
	ExpiredMembers     int `json:"expiredMembers"`
	DisabledUsers      int `json:"disabledUsers"`
	Admins             int `json:"admins"`
	WorkoutsLast7Days  int `json:"workoutsLast7Days"`
	ActiveMembersLast7 int `json:"activeMembersLast7Days"`
}

// Stats calcula las métricas del panel de administración.
func (s *Store) Stats(ctx context.Context, now time.Time) (AdminStats, error) {
	var st AdminStats
	err := s.pool.QueryRow(ctx, `
		SELECT
			count(*) FILTER (WHERE role = 'member'),
			count(*) FILTER (WHERE role = 'member' AND NOT disabled AND active_until > $1),
			count(*) FILTER (WHERE role = 'member' AND NOT disabled AND active_until > $1 AND active_until <= $1 + interval '7 days'),
			count(*) FILTER (WHERE role = 'member' AND NOT disabled AND active_until <= $1),
			count(*) FILTER (WHERE disabled),
			count(*) FILTER (WHERE role = 'admin'),
			(SELECT count(*) FROM workouts WHERE performed_on > ($1::timestamptz)::date - 7),
			(SELECT count(DISTINCT user_id) FROM workouts WHERE performed_on > ($1::timestamptz)::date - 7)
		FROM users`, now).Scan(
		&st.TotalMembers, &st.ActiveMembers, &st.ExpiringMembers, &st.ExpiredMembers,
		&st.DisabledUsers, &st.Admins, &st.WorkoutsLast7Days, &st.ActiveMembersLast7)
	return st, translate(err)
}
