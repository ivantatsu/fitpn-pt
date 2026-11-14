// Package api expone la API HTTP REST (JSON) de la plataforma.
package api

import (
	"context"
	"net/http"
	"time"

	"github.com/ivantatsu/fitpn-pt/backend/internal/auth"
	"github.com/ivantatsu/fitpn-pt/backend/internal/config"
	"github.com/ivantatsu/fitpn-pt/backend/internal/store"
)

// Server contiene las dependencias de los handlers.
type Server struct {
	cfg    config.Config
	store  *store.Store
	tokens *auth.TokenIssuer
	// loginLimiter limita intentos por IP+email (fuerza bruta sobre una cuenta);
	// ipLimiter es un tope más amplio por IP (muchos socios pueden compartir la wifi del gimnasio).
	loginLimiter *ipRateLimiter
	ipLimiter    *ipRateLimiter
	now          func() time.Time
}

// NewServer construye el servidor de la API.
func NewServer(cfg config.Config, st *store.Store) *Server {
	return &Server{
		cfg:          cfg,
		store:        st,
		tokens:       auth.NewTokenIssuer(cfg.JWTSecret, cfg.AccessTokenTTL),
		loginLimiter: newIPRateLimiter(cfg.LoginRatePerMinute),
		ipLimiter:    newIPRateLimiter(cfg.LoginRatePerMinute * 6),
		now:          time.Now,
	}
}

// RunJanitor ejecuta tareas periódicas de mantenimiento hasta que ctx se cancele.
func (s *Server) RunJanitor(ctx context.Context, every time.Duration, purge func(context.Context) error) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.loginLimiter.cleanup(s.now().Add(-10 * time.Minute))
			s.ipLimiter.cleanup(s.now().Add(-10 * time.Minute))
			if purge != nil {
				_ = purge(ctx)
			}
		}
	}
}

// Handler devuelve el router HTTP con todos los middlewares globales.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// Sondas para orquestadores (Docker, Kubernetes...).
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := s.store.Ping(ctx); err != nil {
			writeError(w, http.StatusServiceUnavailable, "not_ready", "Base de datos no disponible")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})

	const v1 = "/api/v1"

	// Autenticación.
	mux.HandleFunc("POST "+v1+"/auth/login", s.handleLogin)
	// El refresh token es un valor aleatorio de 256 bits: no es atacable por fuerza bruta.
	mux.HandleFunc("POST "+v1+"/auth/refresh", s.handleRefresh)
	mux.HandleFunc("POST "+v1+"/auth/logout", s.handleLogout)

	// Usuario autenticado (socio o admin).
	mux.HandleFunc("GET "+v1+"/me", s.authenticate(s.handleMe))
	mux.HandleFunc("PUT "+v1+"/me/password", s.authenticate(s.handleChangePassword))
	s.registerUserData(mux, v1+"/me", s.authenticate)

	// Catálogo de ejercicios.
	mux.HandleFunc("GET "+v1+"/exercises", s.authenticate(s.handleListExercises))
	mux.HandleFunc("POST "+v1+"/exercises", s.admin(s.handleCreateExercise))
	mux.HandleFunc("PUT "+v1+"/exercises/{exerciseID}", s.admin(s.handleUpdateExercise))
	mux.HandleFunc("DELETE "+v1+"/exercises/{exerciseID}", s.admin(s.handleDeleteExercise))

	// Administración.
	mux.HandleFunc("GET "+v1+"/admin/stats", s.admin(s.handleStats))
	mux.HandleFunc("GET "+v1+"/admin/users", s.admin(s.handleListUsers))
	mux.HandleFunc("POST "+v1+"/admin/users", s.admin(s.handleCreateUser))
	mux.HandleFunc("GET "+v1+"/admin/users/{userID}", s.admin(s.handleGetUser))
	mux.HandleFunc("PATCH "+v1+"/admin/users/{userID}", s.admin(s.handleUpdateUser))
	mux.HandleFunc("DELETE "+v1+"/admin/users/{userID}", s.admin(s.handleDeleteUser))
	mux.HandleFunc("POST "+v1+"/admin/users/{userID}/renew", s.admin(s.handleRenewUser))
	mux.HandleFunc("GET "+v1+"/admin/users/{userID}/renewals", s.admin(s.handleListRenewals))
	mux.HandleFunc("PUT "+v1+"/admin/users/{userID}/password", s.admin(s.handleResetPassword))
	mux.HandleFunc("POST "+v1+"/admin/users/{userID}/plans", s.admin(s.handleCreatePlan))
	mux.HandleFunc("PUT "+v1+"/admin/users/{userID}/plans/{planID}", s.admin(s.handleUpdatePlan))
	mux.HandleFunc("DELETE "+v1+"/admin/users/{userID}/plans/{planID}", s.admin(s.handleDeletePlan))
	// El admin puede consultar y gestionar los datos de cualquier socio.
	s.registerUserData(mux, v1+"/admin/users/{userID}", s.admin)

	// Cualquier otra ruta de la API: 404 en JSON.
	mux.HandleFunc(v1+"/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "Ruta no encontrada")
	})

	return withRecover(withRequestLogging(withSecurityHeaders(mux)))
}

// registerUserData registra las rutas de datos de entrenamiento de un usuario
// bajo un prefijo (/me para el propio usuario o /admin/users/{userID} para un admin).
func (s *Server) registerUserData(mux *http.ServeMux, prefix string, guard func(http.HandlerFunc) http.HandlerFunc) {
	mux.HandleFunc("GET "+prefix+"/workouts", guard(s.handleListWorkouts))
	mux.HandleFunc("POST "+prefix+"/workouts", guard(s.handleCreateWorkout))
	mux.HandleFunc("GET "+prefix+"/workouts/{workoutID}", guard(s.handleGetWorkout))
	mux.HandleFunc("PUT "+prefix+"/workouts/{workoutID}", guard(s.handleUpdateWorkout))
	mux.HandleFunc("DELETE "+prefix+"/workouts/{workoutID}", guard(s.handleDeleteWorkout))

	mux.HandleFunc("GET "+prefix+"/measurements", guard(s.handleListMeasurements))
	mux.HandleFunc("POST "+prefix+"/measurements", guard(s.handleCreateMeasurement))
	mux.HandleFunc("DELETE "+prefix+"/measurements/{measurementID}", guard(s.handleDeleteMeasurement))

	mux.HandleFunc("GET "+prefix+"/plans", guard(s.handleListPlans))

	mux.HandleFunc("GET "+prefix+"/progress/summary", guard(s.handleProgressSummary))
	mux.HandleFunc("GET "+prefix+"/progress/exercises/{exerciseID}", guard(s.handleExerciseProgress))
}

// subjectUserID resuelve sobre qué usuario actúa la petición: el indicado en la ruta
// (rutas de admin, ya protegidas por el middleware admin) o el usuario autenticado.
func (s *Server) subjectUserID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	if r.PathValue("userID") == "" {
		return currentUser(r).ID, true
	}
	id, ok := pathID(w, r, "userID")
	if !ok {
		return 0, false
	}
	if _, err := s.store.GetUser(r.Context(), id); err != nil {
		writeStoreError(w, r, err)
		return 0, false
	}
	return id, true
}
