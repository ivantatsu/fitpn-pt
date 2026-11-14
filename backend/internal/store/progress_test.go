package store

import (
	"testing"
	"time"
)

func d(s string) time.Time {
	t, _ := time.Parse(DateLayout, s)
	return t
}

func TestStreak(t *testing.T) {
	today := d("2026-11-12") // jueves; lunes = 2026-11-09
	tests := []struct {
		name  string
		weeks []time.Time
		want  int
	}{
		{"sin sesiones", nil, 0},
		{"solo semana actual", []time.Time{d("2026-11-09")}, 1},
		{"tres semanas seguidas", []time.Time{d("2026-11-09"), d("2026-11-02"), d("2026-10-26")}, 3},
		{"semana actual vacía, previa activa", []time.Time{d("2026-11-02"), d("2026-10-26")}, 2},
		{"hueco rompe la racha", []time.Time{d("2026-11-09"), d("2026-10-26")}, 1},
		{"última hace tiempo", []time.Time{d("2026-10-19")}, 0},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := streak(tc.weeks, today); got != tc.want {
				t.Errorf("got %d want %d", got, tc.want)
			}
		})
	}
}
