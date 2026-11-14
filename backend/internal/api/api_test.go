package api

// Tests de integración de la API contra un PostgreSQL real.
// Se ejecutan solo si TEST_DATABASE_URL está definida (la base de datos se vacía).

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/ivantatsu/fitpn-pt/backend/internal/auth"
	"github.com/ivantatsu/fitpn-pt/backend/internal/config"
	"github.com/ivantatsu/fitpn-pt/backend/internal/database"
	"github.com/ivantatsu/fitpn-pt/backend/internal/membership"
	"github.com/ivantatsu/fitpn-pt/backend/internal/store"
)

type testEnv struct {
	t      *testing.T
	srv    *Server
	http   *httptest.Server
	store  *store.Store
	clock  time.Time
	userID int64
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL no definida; se omiten los tests de integración")
	}
	ctx := context.Background()
	pool, err := database.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}

	cfg := config.Config{
		JWTSecret: []byte("test-secret-test-secret-test-secret!"), AccessTokenTTL: time.Hour,
		RefreshTokenTTL: 24 * time.Hour, MembershipMonths: 1, LoginRatePerMinute: 1000,
	}
	env := &testEnv{t: t, store: store.New(pool), clock: time.Now().UTC().Truncate(time.Microsecond)}
	env.srv = NewServer(cfg, env.store)
	env.srv.now = func() time.Time { return env.clock }
	env.http = httptest.NewServer(env.srv.Handler())
	t.Cleanup(env.http.Close)

	hash, _ := auth.HashPassword("admin-password")
	admin, err := env.store.CreateUser(ctx, store.User{Email: "admin@fitpn.test", FullName: "Admin", Role: membership.RoleAdmin, PasswordHash: hash})
	if err != nil {
		t.Fatal(err)
	}
	env.userID = admin.ID
	return env
}

// client es un cliente HTTP con su propio cookie jar y token.
type client struct {
	env   *testEnv
	http  *http.Client
	token string
}

func (e *testEnv) client() *client {
	jar, _ := cookiejar.New(nil)
	return &client{env: e, http: &http.Client{Jar: jar}}
}

func (c *client) do(method, path string, body any, out any) int {
	c.env.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req, _ := http.NewRequest(method, c.env.http.URL+path, &buf)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		c.env.t.Fatal(err)
	}
	defer resp.Body.Close()
	if out != nil {
		_ = json.NewDecoder(resp.Body).Decode(out)
	}
	return resp.StatusCode
}

func (c *client) login(email, password string) int {
	var s sessionResponse
	code := c.do("POST", "/api/v1/auth/login", loginRequest{email, password}, &s)
	if code == http.StatusOK {
		c.token = s.AccessToken
	}
	return code
}

type errBody struct {
	Error apiError `json:"error"`
}

func TestAuthFlow(t *testing.T) {
	env := newTestEnv(t)
	c := env.client()

	if code := c.login("admin@fitpn.test", "wrong-password"); code != http.StatusUnauthorized {
		t.Fatalf("login con contraseña errónea: %d", code)
	}
	if code := c.login("nobody@fitpn.test", "whatever-pass"); code != http.StatusUnauthorized {
		t.Fatalf("login de usuario inexistente: %d", code)
	}
	if code := c.login("ADMIN@fitpn.test", "admin-password"); code != http.StatusOK {
		t.Fatalf("login admin (email en mayúsculas): %d", code)
	}

	var me userResponse
	if code := c.do("GET", "/api/v1/me", nil, &me); code != 200 || me.Role != "admin" || me.Status != membership.StatusUnlimited {
		t.Fatalf("me: %d %+v", code, me)
	}

	// Refresh con la cookie httpOnly rota el token.
	var s sessionResponse
	c.token = ""
	if code := c.do("POST", "/api/v1/auth/refresh", nil, &s); code != 200 || s.AccessToken == "" {
		t.Fatalf("refresh: %d", code)
	}

	// Logout invalida la sesión.
	if code := c.do("POST", "/api/v1/auth/logout", nil, nil); code != http.StatusNoContent {
		t.Fatalf("logout: %d", code)
	}
	if code := c.do("POST", "/api/v1/auth/refresh", nil, nil); code != http.StatusUnauthorized {
		t.Fatalf("refresh tras logout: %d", code)
	}
	if code := c.do("GET", "/api/v1/me", nil, nil); code != http.StatusUnauthorized {
		t.Fatalf("me sin token: %d", code)
	}
}

func TestRefreshTokenReuseRevokesSessions(t *testing.T) {
	env := newTestEnv(t)
	c := env.client()
	c.login("admin@fitpn.test", "admin-password")
	original := c.http.Jar.Cookies(mustURL(env.http.URL + refreshCookiePath))

	if code := c.do("POST", "/api/v1/auth/refresh", nil, nil); code != 200 {
		t.Fatalf("refresh: %d", code)
	}
	// Un atacante reutiliza la cookie antigua pasado el margen de gracia.
	env.clock = env.clock.Add(time.Minute)
	attacker := env.client()
	attacker.http.Jar.SetCookies(mustURL(env.http.URL+refreshCookiePath), original)
	if code := attacker.do("POST", "/api/v1/auth/refresh", nil, nil); code != http.StatusUnauthorized {
		t.Fatalf("reutilización debería fallar: %d", code)
	}
	// Y la sesión legítima también queda revocada.
	if code := c.do("POST", "/api/v1/auth/refresh", nil, nil); code != http.StatusUnauthorized {
		t.Fatalf("la sesión legítima debería estar revocada: %d", code)
	}
}

func TestMembershipLifecycle(t *testing.T) {
	env := newTestEnv(t)
	admin := env.client()
	admin.login("admin@fitpn.test", "admin-password")

	var created userResponse
	code := admin.do("POST", "/api/v1/admin/users", createUserRequest{
		Email: "Socio@Fitpn.test", FullName: "Socio Uno", Password: "member-password",
	}, &created)
	if code != http.StatusCreated {
		t.Fatalf("crear socio: %d", code)
	}
	if created.Email != "socio@fitpn.test" || created.Role != "member" || created.ActiveUntil == nil {
		t.Fatalf("socio creado inesperado: %+v", created)
	}
	if want := membership.InitialExpiry(env.clock, 1); !created.ActiveUntil.Equal(want) {
		t.Fatalf("caducidad %v, se esperaba %v", created.ActiveUntil, want)
	}

	// Email duplicado.
	var eb errBody
	if code := admin.do("POST", "/api/v1/admin/users", createUserRequest{Email: "socio@fitpn.test", FullName: "Otro", Password: "member-password"}, &eb); code != http.StatusUnprocessableEntity || eb.Error.Fields["email"] == "" {
		t.Fatalf("email duplicado: %d %+v", code, eb)
	}

	member := env.client()
	if code := member.login("socio@fitpn.test", "member-password"); code != 200 {
		t.Fatalf("login socio: %d", code)
	}
	if code := member.do("GET", "/api/v1/admin/users", nil, nil); code != http.StatusForbidden {
		t.Fatalf("un socio no debe acceder a admin: %d", code)
	}

	// Pasa un mes y un día: el acceso se corta inmediatamente.
	env.clock = env.clock.AddDate(0, 1, 1)
	eb = errBody{}
	if code := member.do("GET", "/api/v1/me", nil, &eb); code != http.StatusForbidden || eb.Error.Code != "membership_expired" {
		t.Fatalf("socio caducado: %d %+v", code, eb)
	}
	if code := member.login("socio@fitpn.test", "member-password"); code != http.StatusForbidden {
		t.Fatalf("login caducado: %d", code)
	}
	// El admin no caduca nunca.
	if code := admin.do("GET", "/api/v1/me", nil, nil); code != 200 {
		t.Fatalf("admin tras un mes: %d", code)
	}

	// El filtro de caducados lo encuentra.
	var page Page[userResponse]
	admin.do("GET", "/api/v1/admin/users?status=expired", nil, &page)
	if page.Total != 1 || page.Items[0].ID != created.ID {
		t.Fatalf("listado de caducados: %+v", page)
	}

	// Renovación: un mes desde hoy (ya estaba caducado).
	var renewed userResponse
	path := "/api/v1/admin/users/" + strconv.FormatInt(created.ID, 10)
	if code := admin.do("POST", path+"/renew", renewRequest{Months: 1}, &renewed); code != 200 {
		t.Fatalf("renovar: %d", code)
	}
	if want := env.clock.AddDate(0, 1, 0); !renewed.ActiveUntil.Equal(want) {
		t.Fatalf("renovación %v, se esperaba %v", renewed.ActiveUntil, want)
	}
	if code := member.login("socio@fitpn.test", "member-password"); code != 200 {
		t.Fatalf("login tras renovar: %d", code)
	}
	var renewals []store.Renewal
	admin.do("GET", path+"/renewals", nil, &renewals)
	if len(renewals) != 1 || renewals[0].RenewedByName == nil {
		t.Fatalf("historial de renovaciones: %+v", renewals)
	}

	// Deshabilitar corta el acceso aunque la fecha siga vigente.
	disabled := true
	admin.do("PATCH", path, updateUserRequest{Disabled: &disabled}, nil)
	eb = errBody{}
	if code := member.do("GET", "/api/v1/me", nil, &eb); code != http.StatusForbidden || eb.Error.Code != "account_disabled" {
		t.Fatalf("socio deshabilitado: %d %+v", code, eb)
	}
}

func TestAdminProtections(t *testing.T) {
	env := newTestEnv(t)
	admin := env.client()
	admin.login("admin@fitpn.test", "admin-password")
	self := "/api/v1/admin/users/" + strconv.FormatInt(env.userID, 10)

	role := "member"
	if code := admin.do("PATCH", self, updateUserRequest{Role: &role}, nil); code != http.StatusConflict {
		t.Fatalf("auto-degradarse debería fallar: %d", code)
	}
	if code := admin.do("DELETE", self, nil, nil); code != http.StatusConflict {
		t.Fatalf("auto-eliminarse debería fallar: %d", code)
	}
	if code := admin.do("POST", self+"/renew", nil, nil); code != http.StatusConflict {
		t.Fatalf("renovar a un admin debería fallar: %d", code)
	}
}

func TestWorkoutsAndProgress(t *testing.T) {
	env := newTestEnv(t)
	admin := env.client()
	admin.login("admin@fitpn.test", "admin-password")
	for _, email := range []string{"a@fitpn.test", "b@fitpn.test"} {
		admin.do("POST", "/api/v1/admin/users", createUserRequest{Email: email, FullName: "Socio " + email, Password: "member-password"}, nil)
	}
	a, b := env.client(), env.client()
	a.login("a@fitpn.test", "member-password")
	b.login("b@fitpn.test", "member-password")

	var exercises []store.Exercise
	a.do("GET", "/api/v1/exercises", nil, &exercises)
	if len(exercises) < 10 {
		t.Fatalf("catálogo inicial demasiado pequeño: %d", len(exercises))
	}
	squat := exercises[0].ID

	today := env.clock.Format(store.DateLayout)
	effort := 8
	var wo store.Workout
	code := a.do("POST", "/api/v1/me/workouts", workoutRequest{
		PerformedOn: today, Title: "Pierna", PerceivedEffort: &effort,
		Exercises: []store.WorkoutExercise{{ExerciseID: squat, Sets: []store.WorkoutSet{{Reps: 5, WeightKg: 100}, {Reps: 3, WeightKg: 110}}}},
	}, &wo)
	if code != http.StatusCreated || wo.SetCount != 2 || wo.TotalVolumeKg != 830 {
		t.Fatalf("crear sesión: %d %+v", code, wo)
	}

	// Validación.
	var eb errBody
	if code := a.do("POST", "/api/v1/me/workouts", workoutRequest{PerformedOn: "2026-13-01", Title: ""}, &eb); code != http.StatusUnprocessableEntity || len(eb.Error.Fields) < 2 {
		t.Fatalf("validación: %d %+v", code, eb)
	}

	// Aislamiento entre socios.
	woPath := "/api/v1/me/workouts/" + strconv.FormatInt(wo.ID, 10)
	if code := b.do("GET", woPath, nil, nil); code != http.StatusNotFound {
		t.Fatalf("B no debe ver la sesión de A: %d", code)
	}
	if code := b.do("DELETE", woPath, nil, nil); code != http.StatusNotFound {
		t.Fatalf("B no debe borrar la sesión de A: %d", code)
	}

	weight := 80.5
	if code := a.do("POST", "/api/v1/me/measurements", measurementRequest{MeasuredOn: today, WeightKg: &weight}, nil); code != http.StatusCreated {
		t.Fatalf("crear medida: %d", code)
	}

	var sum store.ProgressSummary
	a.do("GET", "/api/v1/me/progress/summary?weeks=4", nil, &sum)
	if sum.TotalWorkouts != 1 || len(sum.Weekly) != 4 || sum.Weekly[3].VolumeKg != 830 || sum.CurrentStreakWeeks != 1 {
		t.Fatalf("resumen: %+v", sum)
	}
	if len(sum.PersonalRecords) != 1 || sum.PersonalRecords[0].Estimated1RMKg != 121 {
		t.Fatalf("récords: %+v", sum.PersonalRecords)
	}
	if len(sum.BodyWeight) != 1 || sum.BodyWeight[0].WeightKg != 80.5 {
		t.Fatalf("peso corporal: %+v", sum.BodyWeight)
	}

	// El admin puede ver el progreso del socio.
	var aUser Page[userResponse]
	admin.do("GET", "/api/v1/admin/users?q=a@fitpn", nil, &aUser)
	var adminView store.ProgressSummary
	if code := admin.do("GET", "/api/v1/admin/users/"+strconv.FormatInt(aUser.Items[0].ID, 10)+"/progress/summary", nil, &adminView); code != 200 || adminView.TotalWorkouts != 1 {
		t.Fatalf("vista admin del progreso: %d %+v", code, adminView)
	}

	// Plan asignado por el admin, visible para el socio.
	var plan store.Plan
	planPath := "/api/v1/admin/users/" + strconv.FormatInt(aUser.Items[0].ID, 10) + "/plans"
	code = admin.do("POST", planPath, planRequest{Title: "Fuerza 3 días", Items: []store.PlanItem{{ExerciseID: squat, DayLabel: "Día 1", Sets: 5, Reps: "5", RestSeconds: 180}}}, &plan)
	if code != http.StatusCreated || len(plan.Items) != 1 || plan.Items[0].ExerciseName == "" {
		t.Fatalf("crear plan: %d %+v", code, plan)
	}
	var plans []store.Plan
	a.do("GET", "/api/v1/me/plans", nil, &plans)
	if len(plans) != 1 {
		t.Fatalf("planes del socio: %+v", plans)
	}
	b.do("GET", "/api/v1/me/plans", nil, &plans)
	if len(plans) != 0 {
		t.Fatalf("B no debe ver planes de A: %+v", plans)
	}

	// Un ejercicio en uso no puede borrarse.
	if code := admin.do("DELETE", "/api/v1/exercises/"+strconv.FormatInt(squat, 10), nil, nil); code != http.StatusConflict {
		t.Fatalf("borrar ejercicio en uso: %d", code)
	}
}

func TestLoginRateLimit(t *testing.T) {
	env := newTestEnv(t)
	env.srv.loginLimiter = newIPRateLimiter(3)
	c := env.client()
	for i := range 3 {
		if code := c.login("admin@fitpn.test", "wrong-password"); code != http.StatusUnauthorized {
			t.Fatalf("intento %d: %d", i, code)
		}
	}
	if code := c.login("admin@fitpn.test", "admin-password"); code != http.StatusTooManyRequests {
		t.Fatalf("se esperaba 429: %d", code)
	}
	// Otra cuenta desde la misma IP no queda bloqueada.
	if code := c.login("otro@fitpn.test", "whatever-pass"); code != http.StatusUnauthorized {
		t.Fatalf("otra cuenta: %d", code)
	}
}

func mustURL(raw string) *urlT {
	u, err := parseURL(raw)
	if err != nil {
		panic(err)
	}
	return u
}
