// Package membership contiene las reglas de negocio de las suscripciones de socios.
//
// Reglas:
//   - Un socio nuevo tiene acceso durante N meses (por defecto 1) desde su alta.
//   - Renovar suma N meses a partir de la fecha de caducidad si sigue activo,
//     o a partir de hoy si ya había caducado (no se "regalan" los días perdidos).
//   - Los administradores no caducan nunca.
//   - Un usuario deshabilitado no puede acceder, sea cual sea su fecha.
package membership

import "time"

// Roles disponibles.
const (
	RoleAdmin  = "admin"
	RoleMember = "member"
)

// Estados calculados de la suscripción.
const (
	StatusActive    = "active"
	StatusExpiring  = "expiring"
	StatusExpired   = "expired"
	StatusDisabled  = "disabled"
	StatusUnlimited = "unlimited"
)

// ExpiringWindow es el margen en el que una suscripción se considera "a punto de caducar".
const ExpiringWindow = 7 * 24 * time.Hour

// MaxRenewMonths limita una renovación individual.
const MaxRenewMonths = 24

// IsValidRole indica si el rol es conocido.
func IsValidRole(role string) bool { return role == RoleAdmin || role == RoleMember }

// InitialExpiry calcula la caducidad para un alta nueva.
func InitialExpiry(now time.Time, months int) time.Time {
	return now.AddDate(0, months, 0)
}

// RenewedExpiry calcula la nueva caducidad tras renovar.
func RenewedExpiry(now time.Time, current *time.Time, months int) time.Time {
	base := now
	if current != nil && current.After(now) {
		base = *current
	}
	return base.AddDate(0, months, 0)
}

// HasAccess indica si el usuario puede usar la plataforma en el instante now.
func HasAccess(role string, disabled bool, activeUntil *time.Time, now time.Time) bool {
	if disabled {
		return false
	}
	if role == RoleAdmin {
		return true
	}
	return activeUntil != nil && activeUntil.After(now)
}

// Status devuelve el estado legible de la suscripción.
func Status(role string, disabled bool, activeUntil *time.Time, now time.Time) string {
	switch {
	case disabled:
		return StatusDisabled
	case role == RoleAdmin:
		return StatusUnlimited
	case activeUntil == nil || !activeUntil.After(now):
		return StatusExpired
	case activeUntil.Sub(now) <= ExpiringWindow:
		return StatusExpiring
	default:
		return StatusActive
	}
}
