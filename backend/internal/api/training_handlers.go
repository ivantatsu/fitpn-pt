package api

import (
	"math"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ivantatsu/fitpn-pt/backend/internal/store"
)

// MuscleGroups son los grupos musculares admitidos en el catálogo.
var MuscleGroups = []string{"piernas", "pecho", "espalda", "hombros", "brazos", "core", "cardio", "cuerpo completo"}

const (
	maxNotesLength       = 2000
	maxExercisesPerEntry = 40
	maxSetsPerExercise   = 30
)

func runeLen(s string) int { return utf8.RuneCountInString(s) }

// ---------- Ejercicios ----------

type exerciseRequest struct {
	Name        string `json:"name"`
	MuscleGroup string `json:"muscleGroup"`
	Equipment   string `json:"equipment"`
	Description string `json:"description"`
}

func (req *exerciseRequest) validate() validationError {
	req.Name = strings.TrimSpace(req.Name)
	req.Equipment = strings.TrimSpace(req.Equipment)
	req.Description = strings.TrimSpace(req.Description)
	v := validationError{}
	if n := runeLen(req.Name); n < 2 || n > 100 {
		v.add("name", "El nombre debe tener entre 2 y 100 caracteres")
	}
	if !slices.Contains(MuscleGroups, req.MuscleGroup) {
		v.add("muscleGroup", "Grupo muscular no válido")
	}
	if runeLen(req.Equipment) > 60 {
		v.add("equipment", "Máximo 60 caracteres")
	}
	if runeLen(req.Description) > maxNotesLength {
		v.add("description", "Descripción demasiado larga")
	}
	return v
}

func (s *Server) handleListExercises(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListExercises(r.Context())
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handleCreateExercise(w http.ResponseWriter, r *http.Request) {
	var req exerciseRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if v := req.validate(); !v.ok() {
		writeValidation(w, v)
		return
	}
	e, err := s.store.CreateExercise(r.Context(), store.Exercise{
		Name: req.Name, MuscleGroup: req.MuscleGroup, Equipment: req.Equipment, Description: req.Description,
	})
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, e)
}

func (s *Server) handleUpdateExercise(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "exerciseID")
	if !ok {
		return
	}
	var req exerciseRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if v := req.validate(); !v.ok() {
		writeValidation(w, v)
		return
	}
	e, err := s.store.UpdateExercise(r.Context(), store.Exercise{
		ID: id, Name: req.Name, MuscleGroup: req.MuscleGroup, Equipment: req.Equipment, Description: req.Description,
	})
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func (s *Server) handleDeleteExercise(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "exerciseID")
	if !ok {
		return
	}
	if err := s.store.DeleteExercise(r.Context(), id); err != nil {
		writeStoreError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Sesiones de entrenamiento ----------

type workoutRequest struct {
	PerformedOn     string                  `json:"performedOn"`
	Title           string                  `json:"title"`
	DurationMinutes *int                    `json:"durationMinutes"`
	PerceivedEffort *int                    `json:"perceivedEffort"`
	Notes           string                  `json:"notes"`
	Exercises       []store.WorkoutExercise `json:"exercises"`
}

func (s *Server) validateWorkout(req *workoutRequest) validationError {
	req.Title = strings.TrimSpace(req.Title)
	req.Notes = strings.TrimSpace(req.Notes)
	v := validationError{}
	if d, err := time.Parse(store.DateLayout, req.PerformedOn); err != nil {
		v.add("performedOn", "Fecha no válida (YYYY-MM-DD)")
	} else if d.After(s.now().AddDate(0, 0, 1)) {
		v.add("performedOn", "La fecha no puede estar en el futuro")
	}
	if n := runeLen(req.Title); n < 1 || n > 120 {
		v.add("title", "El título debe tener entre 1 y 120 caracteres")
	}
	if req.DurationMinutes != nil && (*req.DurationMinutes < 0 || *req.DurationMinutes > 1440) {
		v.add("durationMinutes", "Duración no válida")
	}
	if req.PerceivedEffort != nil && (*req.PerceivedEffort < 1 || *req.PerceivedEffort > 10) {
		v.add("perceivedEffort", "El esfuerzo percibido va de 1 a 10")
	}
	if runeLen(req.Notes) > maxNotesLength {
		v.add("notes", "Notas demasiado largas")
	}
	if len(req.Exercises) > maxExercisesPerEntry {
		v.add("exercises", "Demasiados ejercicios en una sesión")
	}
	for i, ex := range req.Exercises {
		key := "exercises." + strconv.Itoa(i)
		if ex.ExerciseID <= 0 {
			v.add(key+".exerciseId", "Ejercicio obligatorio")
		}
		if len(ex.Sets) == 0 || len(ex.Sets) > maxSetsPerExercise {
			v.add(key+".sets", "Cada ejercicio necesita entre 1 y 30 series")
		}
		for j, set := range ex.Sets {
			if set.Reps < 0 || set.Reps > 1000 {
				v.add(key+".sets."+strconv.Itoa(j)+".reps", "Repeticiones no válidas")
			}
			if set.WeightKg < 0 || set.WeightKg > 2000 || math.IsNaN(set.WeightKg) {
				v.add(key+".sets."+strconv.Itoa(j)+".weightKg", "Peso no válido")
			}
		}
	}
	return v
}

func (s *Server) handleListWorkouts(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	from, to := q.Get("from"), q.Get("to")
	if (from != "" && !store.ValidDate(from)) || (to != "" && !store.ValidDate(to)) {
		writeError(w, http.StatusBadRequest, "invalid_date", "Fechas no válidas (YYYY-MM-DD)")
		return
	}
	limit, offset := pagination(r, 20, 100)
	items, total, err := s.store.ListWorkouts(r.Context(), userID, store.WorkoutFilter{From: from, To: to, Limit: limit, Offset: offset})
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, Page[store.Workout]{Items: items, Total: total, Limit: limit, Offset: offset})
}

func (s *Server) handleGetWorkout(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "workoutID")
	if !ok {
		return
	}
	wo, err := s.store.GetWorkout(r.Context(), userID, id)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, wo)
}

func (s *Server) handleCreateWorkout(w http.ResponseWriter, r *http.Request) {
	s.saveWorkout(w, r, 0)
}

func (s *Server) handleUpdateWorkout(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "workoutID")
	if !ok {
		return
	}
	s.saveWorkout(w, r, id)
}

func (s *Server) saveWorkout(w http.ResponseWriter, r *http.Request, id int64) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	var req workoutRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if v := s.validateWorkout(&req); !v.ok() {
		writeValidation(w, v)
		return
	}
	wo, err := s.store.SaveWorkout(r.Context(), store.Workout{
		ID: id, UserID: userID, PerformedOn: req.PerformedOn, Title: req.Title,
		DurationMinutes: req.DurationMinutes, PerceivedEffort: req.PerceivedEffort,
		Notes: req.Notes, Exercises: req.Exercises,
	})
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	writeJSON(w, status, wo)
}

func (s *Server) handleDeleteWorkout(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "workoutID")
	if !ok {
		return
	}
	if err := s.store.DeleteWorkout(r.Context(), userID, id); err != nil {
		writeStoreError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Medidas corporales ----------

type measurementRequest struct {
	MeasuredOn string   `json:"measuredOn"`
	WeightKg   *float64 `json:"weightKg"`
	BodyFatPct *float64 `json:"bodyFatPct"`
	WaistCm    *float64 `json:"waistCm"`
	Notes      string   `json:"notes"`
}

func inRange(p *float64, lo, hi float64) bool {
	return p == nil || (*p > lo && *p <= hi && !math.IsNaN(*p))
}

func (s *Server) handleListMeasurements(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	limit, _ := pagination(r, 100, 500)
	items, err := s.store.ListMeasurements(r.Context(), userID, limit)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handleCreateMeasurement(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	var req measurementRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Notes = strings.TrimSpace(req.Notes)
	v := validationError{}
	if !store.ValidDate(req.MeasuredOn) {
		v.add("measuredOn", "Fecha no válida (YYYY-MM-DD)")
	}
	if !inRange(req.WeightKg, 0, 500) {
		v.add("weightKg", "Peso no válido")
	}
	if !inRange(req.BodyFatPct, 0, 75) {
		v.add("bodyFatPct", "Porcentaje no válido")
	}
	if !inRange(req.WaistCm, 0, 300) {
		v.add("waistCm", "Medida no válida")
	}
	if req.WeightKg == nil && req.BodyFatPct == nil && req.WaistCm == nil {
		v.add("weightKg", "Indica al menos una medida")
	}
	if runeLen(req.Notes) > maxNotesLength {
		v.add("notes", "Notas demasiado largas")
	}
	if !v.ok() {
		writeValidation(w, v)
		return
	}
	m, err := s.store.CreateMeasurement(r.Context(), userID, store.Measurement{
		MeasuredOn: req.MeasuredOn, WeightKg: req.WeightKg, BodyFatPct: req.BodyFatPct, WaistCm: req.WaistCm, Notes: req.Notes,
	})
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (s *Server) handleDeleteMeasurement(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "measurementID")
	if !ok {
		return
	}
	if err := s.store.DeleteMeasurement(r.Context(), userID, id); err != nil {
		writeStoreError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Planes de entrenamiento ----------

type planRequest struct {
	Title       string           `json:"title"`
	Description string           `json:"description"`
	IsActive    *bool            `json:"isActive"`
	Items       []store.PlanItem `json:"items"`
}

func (req *planRequest) validate() validationError {
	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	v := validationError{}
	if n := runeLen(req.Title); n < 2 || n > 120 {
		v.add("title", "El título debe tener entre 2 y 120 caracteres")
	}
	if runeLen(req.Description) > maxNotesLength {
		v.add("description", "Descripción demasiado larga")
	}
	if len(req.Items) > 100 {
		v.add("items", "Demasiados ejercicios en el plan")
	}
	for i := range req.Items {
		it := &req.Items[i]
		key := "items." + strconv.Itoa(i)
		it.DayLabel = strings.TrimSpace(it.DayLabel)
		it.Reps = strings.TrimSpace(it.Reps)
		it.Notes = strings.TrimSpace(it.Notes)
		if it.ExerciseID <= 0 {
			v.add(key+".exerciseId", "Ejercicio obligatorio")
		}
		if it.Sets < 1 || it.Sets > 50 {
			v.add(key+".sets", "Series entre 1 y 50")
		}
		if n := runeLen(it.Reps); n < 1 || n > 20 {
			v.add(key+".reps", "Indica las repeticiones (p. ej. 8-10)")
		}
		if it.RestSeconds < 0 || it.RestSeconds > 3600 {
			v.add(key+".restSeconds", "Descanso no válido")
		}
		if runeLen(it.DayLabel) > 40 {
			v.add(key+".dayLabel", "Máximo 40 caracteres")
		}
		if runeLen(it.Notes) > 500 {
			v.add(key+".notes", "Máximo 500 caracteres")
		}
	}
	return v
}

func (s *Server) handleListPlans(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	plans, err := s.store.ListPlans(r.Context(), userID, false)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, plans)
}

func (s *Server) handleCreatePlan(w http.ResponseWriter, r *http.Request) { s.savePlan(w, r, 0) }

func (s *Server) handleUpdatePlan(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "planID")
	if !ok {
		return
	}
	s.savePlan(w, r, id)
}

func (s *Server) savePlan(w http.ResponseWriter, r *http.Request, id int64) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	var req planRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if v := req.validate(); !v.ok() {
		writeValidation(w, v)
		return
	}
	active := req.IsActive == nil || *req.IsActive
	p, err := s.store.SavePlan(r.Context(), store.Plan{
		ID: id, UserID: userID, Title: req.Title, Description: req.Description, IsActive: active, Items: req.Items,
	}, currentUser(r).ID)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	status := http.StatusOK
	if id == 0 {
		status = http.StatusCreated
	}
	writeJSON(w, status, p)
}

func (s *Server) handleDeletePlan(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "planID")
	if !ok {
		return
	}
	if err := s.store.DeletePlan(r.Context(), userID, id); err != nil {
		writeStoreError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Progreso ----------

func (s *Server) handleProgressSummary(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	weeks := 12
	if v, err := strconv.Atoi(r.URL.Query().Get("weeks")); err == nil && v >= 1 {
		weeks = min(v, 104)
	}
	sum, err := s.store.Summary(r.Context(), userID, weeks, s.now())
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, sum)
}

func (s *Server) handleExerciseProgress(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	exID, ok := pathID(w, r, "exerciseID")
	if !ok {
		return
	}
	points, err := s.store.ExerciseProgress(r.Context(), userID, exID)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, points)
}
