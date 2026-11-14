package membership

import (
	"testing"
	"time"
)

var now = time.Date(2026, 1, 31, 10, 0, 0, 0, time.UTC)

func ptr(t time.Time) *time.Time { return &t }

func TestInitialExpiry(t *testing.T) {
	got := InitialExpiry(time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC), 1)
	want := time.Date(2026, 4, 15, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("got %v want %v", got, want)
	}
}

func TestRenewedExpiry(t *testing.T) {
	tests := []struct {
		name    string
		current *time.Time
		months  int
		want    time.Time
	}{
		{"sin fecha previa", nil, 1, now.AddDate(0, 1, 0)},
		{"aún activo: se acumula", ptr(now.Add(10 * 24 * time.Hour)), 1, now.Add(10*24*time.Hour).AddDate(0, 1, 0)},
		{"caducado: cuenta desde hoy", ptr(now.Add(-30 * 24 * time.Hour)), 2, now.AddDate(0, 2, 0)},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := RenewedExpiry(now, tc.current, tc.months); !got.Equal(tc.want) {
				t.Errorf("got %v want %v", got, tc.want)
			}
		})
	}
}

func TestHasAccessAndStatus(t *testing.T) {
	tests := []struct {
		name       string
		role       string
		disabled   bool
		until      *time.Time
		wantAccess bool
		wantStatus string
	}{
		{"admin sin caducidad", RoleAdmin, false, nil, true, StatusUnlimited},
		{"admin deshabilitado", RoleAdmin, true, nil, false, StatusDisabled},
		{"socio activo", RoleMember, false, ptr(now.Add(20 * 24 * time.Hour)), true, StatusActive},
		{"socio por caducar", RoleMember, false, ptr(now.Add(3 * 24 * time.Hour)), true, StatusExpiring},
		{"socio caducado", RoleMember, false, ptr(now.Add(-time.Second)), false, StatusExpired},
		{"socio caduca justo ahora", RoleMember, false, ptr(now), false, StatusExpired},
		{"socio deshabilitado", RoleMember, true, ptr(now.Add(20 * 24 * time.Hour)), false, StatusDisabled},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := HasAccess(tc.role, tc.disabled, tc.until, now); got != tc.wantAccess {
				t.Errorf("HasAccess = %v, want %v", got, tc.wantAccess)
			}
			if got := Status(tc.role, tc.disabled, tc.until, now); got != tc.wantStatus {
				t.Errorf("Status = %v, want %v", got, tc.wantStatus)
			}
		})
	}
}
