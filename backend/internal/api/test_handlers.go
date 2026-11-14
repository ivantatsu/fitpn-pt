package api

import (
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/ivantatsu/fitpn-pt/backend/internal/store"
)

// testLimits define los valores admisibles de cada prueba (para descartar errores de tecleo).
var testLimits = map[string]struct{ min, max float64 }{
	store.TestAgilityCircuit: {5, 60},     // segundos
	store.TestPullUps:        {0, 100},    // repeticiones
	store.TestBarHang:        {0, 600},    // segundos
	store.TestRun1000m:       {120, 1200}, // segundos (2:00 – 20:00)
}

type testResultRequest struct {
	TestType    string  `json:"testType"`
	Result      float64 `json:"result"`
	PerformedOn string  `json:"performedOn"`
	Notes       string  `json:"notes"`
}

func (s *Server) handleListTestResults(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	items, err := s.store.ListTestResults(r.Context(), userID)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handleCreateTestResult(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	var req testResultRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Notes = strings.TrimSpace(req.Notes)

	v := validationError{}
	limits, known := testLimits[req.TestType]
	if !known {
		v.add("testType", "Prueba no válida")
	} else if math.IsNaN(req.Result) || req.Result < limits.min || req.Result > limits.max {
		v.add("result", "Marca fuera de rango para esta prueba")
	}
	if req.TestType == store.TestPullUps && req.Result != math.Trunc(req.Result) {
		v.add("result", "Las dominadas deben ser un número entero")
	}
	if d, err := time.Parse(store.DateLayout, req.PerformedOn); err != nil {
		v.add("performedOn", "Fecha no válida (YYYY-MM-DD)")
	} else if d.After(s.now().AddDate(0, 0, 1)) {
		v.add("performedOn", "La fecha no puede estar en el futuro")
	}
	if runeLen(req.Notes) > 500 {
		v.add("notes", "Máximo 500 caracteres")
	}
	if !v.ok() {
		writeValidation(w, v)
		return
	}

	t, err := s.store.CreateTestResult(r.Context(), userID, store.TestResult{
		TestType: req.TestType, Result: math.Round(req.Result*100) / 100, PerformedOn: req.PerformedOn, Notes: req.Notes,
	})
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

func (s *Server) handleDeleteTestResult(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.subjectUserID(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r, "testID")
	if !ok {
		return
	}
	if err := s.store.DeleteTestResult(r.Context(), userID, id); err != nil {
		writeStoreError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
