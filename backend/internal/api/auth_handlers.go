package api

import (
	"errors"
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/ivantatsu/fitpn-pt/backend/internal/auth"
	"github.com/ivantatsu/fitpn-pt/backend/internal/store"
)

const refreshCookieName = "fitpn_refresh"
const refreshCookiePath = "/api/v1/auth"

// userResponse añade al usuario su estado de suscripción calculado.
type userResponse struct {
	store.User
	Status        string `json:"status"`
	HasAccess     bool   `json:"hasAccess"`
	DaysRemaining *int   `json:"daysRemaining"`
}

func (s *Server) toUserResponse(u store.User) userResponse {
	now := s.now()
	resp := userResponse{User: u, Status: u.Status(now), HasAccess: u.HasAccess(now)}
	if u.ActiveUntil != nil {
		days := int(math.Ceil(u.ActiveUntil.Sub(now).Hours() / 24))
		days = max(days, 0)
		resp.DaysRemaining = &days
	}
	return resp
}

type sessionResponse struct {
	AccessToken string       `json:"accessToken"`
	ExpiresAt   time.Time    `json:"expiresAt"`
	User        userResponse `json:"user"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if !s.allowLogin(w, r, req.Email) {
		return
	}
	if req.Email == "" || req.Password == "" || len(req.Password) > auth.MaxPasswordBytes {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Email o contraseña incorrectos")
		return
	}

	u, err := s.store.GetUserByEmail(r.Context(), req.Email)
	if errors.Is(err, store.ErrNotFound) {
		auth.CheckDummy(req.Password) // mismo coste temporal que un usuario real
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Email o contraseña incorrectos")
		return
	}
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	if !auth.CheckPassword(u.PasswordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Email o contraseña incorrectos")
		return
	}
	if !s.checkAccess(w, u) {
		return
	}

	if err := s.store.TouchLastLogin(r.Context(), u.ID, s.now()); err != nil {
		slog.WarnContext(r.Context(), "no se pudo registrar el último acceso", "error", err)
	}
	s.startSession(w, r, u)
}

// startSession emite un access token y un refresh token (en cookie httpOnly).
func (s *Server) startSession(w http.ResponseWriter, r *http.Request, u store.User) {
	refresh, hash, err := auth.NewRefreshToken()
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	expires := s.now().Add(s.cfg.RefreshTokenTTL)
	if err := s.store.CreateRefreshToken(r.Context(), u.ID, hash, expires); err != nil {
		writeStoreError(w, r, err)
		return
	}
	s.setRefreshCookie(w, refresh, expires)
	s.writeSession(w, r, u)
}

func (s *Server) writeSession(w http.ResponseWriter, r *http.Request, u store.User) {
	token, exp, err := s.tokens.Issue(u.ID, u.Role)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, sessionResponse{AccessToken: token, ExpiresAt: exp, User: s.toUserResponse(u)})
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(refreshCookieName)
	if err != nil || cookie.Value == "" {
		writeError(w, http.StatusUnauthorized, "no_session", "No hay sesión activa")
		return
	}

	newToken, newHash, err := auth.NewRefreshToken()
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	now := s.now()
	expires := now.Add(s.cfg.RefreshTokenTTL)
	userID, err := s.store.RotateRefreshToken(r.Context(), auth.HashRefreshToken(cookie.Value), newHash, expires, now)
	switch {
	case errors.Is(err, store.ErrTokenReused):
		slog.WarnContext(r.Context(), "reutilización de refresh token detectada; sesiones revocadas", "user_id", userID)
		s.clearRefreshCookie(w)
		writeError(w, http.StatusUnauthorized, "no_session", "La sesión ya no es válida")
		return
	case errors.Is(err, store.ErrNotFound):
		s.clearRefreshCookie(w)
		writeError(w, http.StatusUnauthorized, "no_session", "La sesión ha caducado")
		return
	case err != nil:
		writeStoreError(w, r, err)
		return
	}

	u, err := s.store.GetUser(r.Context(), userID)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	if !u.HasAccess(now) {
		_ = s.store.RevokeUserTokens(r.Context(), u.ID, now)
		s.clearRefreshCookie(w)
		s.checkAccess(w, u)
		return
	}
	s.setRefreshCookie(w, newToken, expires)
	s.writeSession(w, r, u)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(refreshCookieName); err == nil && cookie.Value != "" {
		if err := s.store.RevokeRefreshToken(r.Context(), auth.HashRefreshToken(cookie.Value), s.now()); err != nil {
			slog.WarnContext(r.Context(), "no se pudo revocar el refresh token", "error", err)
		}
	}
	s.clearRefreshCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.toUserResponse(currentUser(r)))
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	var req changePasswordRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	u := currentUser(r)
	if !auth.CheckPassword(u.PasswordHash, req.CurrentPassword) {
		writeValidation(w, validationError{"currentPassword": "La contraseña actual no es correcta"})
		return
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeValidation(w, validationError{"newPassword": err.Error()})
		return
	}
	if err := s.store.SetPassword(r.Context(), u.ID, hash); err != nil {
		writeStoreError(w, r, err)
		return
	}
	// Cerramos el resto de sesiones y abrimos una nueva para este dispositivo.
	if err := s.store.RevokeUserTokens(r.Context(), u.ID, s.now()); err != nil {
		writeStoreError(w, r, err)
		return
	}
	s.startSession(w, r, u)
}

func (s *Server) setRefreshCookie(w http.ResponseWriter, value string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    value,
		Path:     refreshCookiePath,
		Expires:  expires,
		MaxAge:   int(time.Until(expires).Seconds()),
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
}

func (s *Server) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     refreshCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
}
