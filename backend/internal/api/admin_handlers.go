package api

import (
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ivantatsu/fitpn-pt/backend/internal/auth"
	"github.com/ivantatsu/fitpn-pt/backend/internal/membership"
	"github.com/ivantatsu/fitpn-pt/backend/internal/store"
)

func validEmail(email string) bool {
	if len(email) > 254 {
		return false
	}
	addr, err := mail.ParseAddress(email)
	return err == nil && addr.Address == email && strings.Contains(email, "@")
}

func validName(name string) bool {
	n := utf8.RuneCountInString(name)
	return n >= 2 && n <= 100
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	st, err := s.store.Stats(r.Context(), s.now())
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	limit, offset := pagination(r, 25, 100)
	q := r.URL.Query()
	users, total, err := s.store.ListUsers(r.Context(), store.UserFilter{
		Query: q.Get("q"), Status: q.Get("status"), Limit: limit, Offset: offset,
	}, s.now())
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	items := make([]userResponse, len(users))
	for i, u := range users {
		items[i] = s.toUserResponse(u)
	}
	writeJSON(w, http.StatusOK, Page[userResponse]{Items: items, Total: total, Limit: limit, Offset: offset})
}

type createUserRequest struct {
	Email    string `json:"email"`
	FullName string `json:"fullName"`
	Password string `json:"password"`
	Role     string `json:"role"`
	// Months es la duración inicial de la suscripción (por defecto MEMBERSHIP_MONTHS).
	Months int `json:"months"`
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Email = store.NormalizeEmail(req.Email)
	req.FullName = strings.TrimSpace(req.FullName)
	if req.Role == "" {
		req.Role = membership.RoleMember
	}
	if req.Months == 0 {
		req.Months = s.cfg.MembershipMonths
	}

	v := validationError{}
	if !validEmail(req.Email) {
		v.add("email", "Email no válido")
	}
	if !validName(req.FullName) {
		v.add("fullName", "El nombre debe tener entre 2 y 100 caracteres")
	}
	if err := auth.ValidatePassword(req.Password); err != nil {
		v.add("password", err.Error())
	}
	if !membership.IsValidRole(req.Role) {
		v.add("role", "Rol no válido")
	}
	if req.Months < 1 || req.Months > membership.MaxRenewMonths {
		v.add("months", "Los meses deben estar entre 1 y 24")
	}
	if !v.ok() {
		writeValidation(w, v)
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	u := store.User{Email: req.Email, FullName: req.FullName, Role: req.Role, PasswordHash: hash}
	if u.Role == membership.RoleMember {
		until := membership.InitialExpiry(s.now(), req.Months)
		u.ActiveUntil = &until
	}
	created, err := s.store.CreateUser(r.Context(), u)
	if errors.Is(err, store.ErrConflict) {
		writeValidation(w, validationError{"email": "Ya existe un usuario con este email"})
		return
	}
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, s.toUserResponse(created))
}

func (s *Server) handleGetUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "userID")
	if !ok {
		return
	}
	u, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, s.toUserResponse(u))
}

type updateUserRequest struct {
	Email       *string    `json:"email"`
	FullName    *string    `json:"fullName"`
	Role        *string    `json:"role"`
	Disabled    *bool      `json:"disabled"`
	ActiveUntil *time.Time `json:"activeUntil"`
}

func (s *Server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "userID")
	if !ok {
		return
	}
	var req updateUserRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	u, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	wasAdminActive := u.Role == membership.RoleAdmin && !u.Disabled
	now := s.now()

	v := validationError{}
	if req.Email != nil {
		u.Email = store.NormalizeEmail(*req.Email)
		if !validEmail(u.Email) {
			v.add("email", "Email no válido")
		}
	}
	if req.FullName != nil {
		u.FullName = strings.TrimSpace(*req.FullName)
		if !validName(u.FullName) {
			v.add("fullName", "El nombre debe tener entre 2 y 100 caracteres")
		}
	}
	if req.Role != nil && *req.Role != u.Role {
		if !membership.IsValidRole(*req.Role) {
			v.add("role", "Rol no válido")
		} else {
			u.Role = *req.Role
			if u.Role == membership.RoleAdmin {
				u.ActiveUntil = nil // los administradores no caducan
			} else {
				until := membership.InitialExpiry(now, s.cfg.MembershipMonths)
				u.ActiveUntil = &until
			}
		}
	}
	if req.ActiveUntil != nil {
		if u.Role == membership.RoleAdmin {
			v.add("activeUntil", "Los administradores no tienen fecha de caducidad")
		} else {
			until := req.ActiveUntil.UTC()
			u.ActiveUntil = &until
		}
	}
	if req.Disabled != nil {
		u.Disabled = *req.Disabled
	}
	if !v.ok() {
		writeValidation(w, v)
		return
	}

	// Protecciones para no quedarse sin administradores.
	if wasAdminActive && (u.Role != membership.RoleAdmin || u.Disabled) {
		if id == currentUser(r).ID {
			writeError(w, http.StatusConflict, "self_modification", "No puedes quitarte permisos ni deshabilitarte a ti mismo")
			return
		}
		if n, err := s.store.CountActiveAdmins(r.Context()); err != nil {
			writeStoreError(w, r, err)
			return
		} else if n <= 1 {
			writeError(w, http.StatusConflict, "last_admin", "Debe existir al menos un administrador activo")
			return
		}
	}

	updated, err := s.store.UpdateUser(r.Context(), u)
	if errors.Is(err, store.ErrConflict) {
		writeValidation(w, validationError{"email": "Ya existe un usuario con este email"})
		return
	}
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	if updated.Disabled {
		if err := s.store.RevokeUserTokens(r.Context(), updated.ID, now); err != nil {
			writeStoreError(w, r, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, s.toUserResponse(updated))
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "userID")
	if !ok {
		return
	}
	if id == currentUser(r).ID {
		writeError(w, http.StatusConflict, "self_modification", "No puedes eliminar tu propia cuenta")
		return
	}
	u, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	if u.Role == membership.RoleAdmin && !u.Disabled {
		if n, err := s.store.CountActiveAdmins(r.Context()); err != nil {
			writeStoreError(w, r, err)
			return
		} else if n <= 1 {
			writeError(w, http.StatusConflict, "last_admin", "Debe existir al menos un administrador activo")
			return
		}
	}
	if err := s.store.DeleteUser(r.Context(), id); err != nil {
		writeStoreError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type renewRequest struct {
	Months int `json:"months"`
}

func (s *Server) handleRenewUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "userID")
	if !ok {
		return
	}
	req := renewRequest{Months: s.cfg.MembershipMonths}
	if r.ContentLength != 0 && !decodeJSON(w, r, &req) {
		return
	}
	if req.Months < 1 || req.Months > membership.MaxRenewMonths {
		writeValidation(w, validationError{"months": "Los meses deben estar entre 1 y 24"})
		return
	}
	u, err := s.store.RenewMembership(r.Context(), id, currentUser(r).ID, req.Months, s.now())
	if errors.Is(err, store.ErrConflict) {
		writeError(w, http.StatusConflict, "not_member", "Solo se pueden renovar socios; los administradores no caducan")
		return
	}
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, s.toUserResponse(u))
}

func (s *Server) handleListRenewals(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "userID")
	if !ok {
		return
	}
	items, err := s.store.ListRenewals(r.Context(), id)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

type resetPasswordRequest struct {
	Password string `json:"password"`
}

func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "userID")
	if !ok {
		return
	}
	var req resetPasswordRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeValidation(w, validationError{"password": err.Error()})
		return
	}
	if err := s.store.SetPassword(r.Context(), id, hash); err != nil {
		writeStoreError(w, r, err)
		return
	}
	if err := s.store.RevokeUserTokens(r.Context(), id, s.now()); err != nil {
		writeStoreError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
