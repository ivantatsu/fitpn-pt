package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/ivantatsu/fitpn-pt/backend/internal/membership"
	"github.com/ivantatsu/fitpn-pt/backend/internal/store"
)

type ctxKey int

const (
	ctxUser ctxKey = iota
	ctxRequestID
)

// currentUser devuelve el usuario autenticado de la petición.
func currentUser(r *http.Request) store.User {
	u, _ := r.Context().Value(ctxUser).(store.User)
	return u
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }

// withRequestLogging asigna un ID a cada petición y registra su resultado.
func withRequestLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" || len(id) > 64 {
			b := make([]byte, 8)
			_, _ = rand.Read(b)
			id = hex.EncodeToString(b)
		}
		w.Header().Set("X-Request-ID", id)
		ctx := context.WithValue(r.Context(), ctxRequestID, id)

		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r.WithContext(ctx))

		level := slog.LevelInfo
		if rec.status >= 500 {
			level = slog.LevelError
		}
		slog.Log(ctx, level, "http",
			"method", r.Method, "path", r.URL.Path, "status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(), "request_id", id)
	})
}

// withRecover convierte un panic en un 500 sin tumbar el proceso.
func withRecover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v)
				}
				slog.ErrorContext(r.Context(), "panic", "value", v, "stack", string(debug.Stack()))
				writeError(w, http.StatusInternalServerError, "internal_error", "Error interno del servidor")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// withSecurityHeaders añade cabeceras de seguridad básicas a las respuestas de la API.
func withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// authenticate valida el access token y comprueba en cada petición que el usuario
// sigue teniendo acceso (así una caducidad o un bloqueo tienen efecto inmediato).
func (s *Server) authenticate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Se requiere autenticación")
			return
		}
		userID, _, err := s.tokens.Parse(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid_token", "Token inválido o caducado")
			return
		}
		u, err := s.store.GetUser(r.Context(), userID)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid_token", "Token inválido o caducado")
			return
		}
		if !s.checkAccess(w, u) {
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), ctxUser, u)))
	}
}

// checkAccess responde con 403 si el usuario no puede usar la plataforma.
func (s *Server) checkAccess(w http.ResponseWriter, u store.User) bool {
	if u.HasAccess(s.now()) {
		return true
	}
	if u.Disabled {
		writeError(w, http.StatusForbidden, "account_disabled", "Tu cuenta está deshabilitada. Contacta con tu instructor.")
	} else {
		writeError(w, http.StatusForbidden, "membership_expired", "Tu suscripción ha caducado. Contacta con tu instructor para renovarla.")
	}
	return false
}

// admin exige autenticación y rol de administrador.
func (s *Server) admin(next http.HandlerFunc) http.HandlerFunc {
	return s.authenticate(func(w http.ResponseWriter, r *http.Request) {
		if currentUser(r).Role != membership.RoleAdmin {
			writeError(w, http.StatusForbidden, "forbidden", "Necesitas permisos de administrador")
			return
		}
		next(w, r)
	})
}

// ipRateLimiter limita peticiones por IP con un token bucket en memoria.
type ipRateLimiter struct {
	mu       sync.Mutex
	limiters map[string]*limiterEntry
	limit    rate.Limit
	burst    int
}

type limiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newIPRateLimiter(perMinute int) *ipRateLimiter {
	return &ipRateLimiter{
		limiters: map[string]*limiterEntry{},
		limit:    rate.Limit(float64(perMinute) / 60),
		burst:    perMinute,
	}
}

func (l *ipRateLimiter) allow(ip string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	e, ok := l.limiters[ip]
	if !ok {
		e = &limiterEntry{limiter: rate.NewLimiter(l.limit, l.burst)}
		l.limiters[ip] = e
	}
	e.lastSeen = now
	return e.limiter.AllowN(now, 1)
}

// cleanup elimina entradas inactivas para acotar el uso de memoria.
func (l *ipRateLimiter) cleanup(olderThan time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for ip, e := range l.limiters {
		if e.lastSeen.Before(olderThan) {
			delete(l.limiters, ip)
		}
	}
}

// allowLogin aplica los límites de intentos de login. Devuelve false (y responde 429) si se superan.
func (s *Server) allowLogin(w http.ResponseWriter, r *http.Request, email string) bool {
	ip, now := s.clientIP(r), s.now()
	if s.ipLimiter.allow(ip, now) && s.loginLimiter.allow(ip+"|"+store.NormalizeEmail(email), now) {
		return true
	}
	w.Header().Set("Retry-After", "60")
	writeError(w, http.StatusTooManyRequests, "rate_limited", "Demasiados intentos. Inténtalo de nuevo en un minuto.")
	return false
}

func (s *Server) clientIP(r *http.Request) string {
	if s.cfg.TrustProxy {
		if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" {
			return ip
		}
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			first, _, _ := strings.Cut(xff, ",")
			return strings.TrimSpace(first)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
