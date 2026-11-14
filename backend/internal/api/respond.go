package api

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/ivantatsu/fitpn-pt/backend/internal/store"
)

const maxBodyBytes = 1 << 20 // 1 MiB

type apiError struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		if err := json.NewEncoder(w).Encode(v); err != nil {
			slog.Error("escribir respuesta JSON", "error", err)
		}
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]apiError{"error": {Code: code, Message: message}})
}

// validationError acumula errores de validación por campo.
type validationError map[string]string

func (v validationError) add(field, msg string) { v[field] = msg }
func (v validationError) ok() bool              { return len(v) == 0 }

func writeValidation(w http.ResponseWriter, v validationError) {
	writeJSON(w, http.StatusUnprocessableEntity, map[string]apiError{"error": {
		Code: "validation_error", Message: "Hay campos con valores no válidos", Fields: v,
	}})
}

// writeStoreError traduce errores del store a respuestas HTTP.
func writeStoreError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "Recurso no encontrado")
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, "conflict", "El recurso ya existe o está en conflicto")
	case errors.Is(err, store.ErrInUse):
		writeError(w, http.StatusConflict, "in_use", "El recurso está en uso y no puede eliminarse")
	case errors.Is(err, store.ErrInvalidReference):
		writeError(w, http.StatusUnprocessableEntity, "invalid_reference", "Alguna referencia no existe")
	default:
		slog.ErrorContext(r.Context(), "error interno", "error", err, "path", r.URL.Path)
		writeError(w, http.StatusInternalServerError, "internal_error", "Error interno del servidor")
	}
}

// decodeJSON lee el cuerpo como JSON estricto (sin campos desconocidos y con tamaño máximo).
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Se esperaba application/json")
		return false
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Cuerpo JSON inválido: "+err.Error())
		return false
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid_json", "El cuerpo debe contener un único objeto JSON")
		return false
	}
	return true
}

func pathID(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid_id", "Identificador inválido")
		return 0, false
	}
	return id, true
}

// pagination lee limit/offset con valores por defecto y máximos razonables.
func pagination(r *http.Request, defLimit, maxLimit int) (limit, offset int) {
	limit, offset = defLimit, 0
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
		limit = min(v, maxLimit)
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && v > 0 {
		offset = v
	}
	return limit, offset
}

// Page es la envoltura estándar de los listados paginados.
type Page[T any] struct {
	Items  []T `json:"items"`
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}
