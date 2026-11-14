// Package config carga la configuración de la aplicación desde variables de entorno.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config contiene toda la configuración de ejecución del backend.
type Config struct {
	Env             string
	HTTPAddr        string
	DatabaseURL     string
	JWTSecret       []byte
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
	CookieSecure    bool
	// MembershipMonths es la duración de un alta/renovación de socio.
	MembershipMonths int
	// LoginRatePerMinute limita los intentos de login por IP.
	LoginRatePerMinute int
	// TrustProxy indica si se confía en X-Forwarded-For / X-Real-IP (detrás de nginx).
	TrustProxy bool

	// Administrador inicial: se crea al arrancar si no existe ningún administrador.
	BootstrapAdminEmail    string
	BootstrapAdminPassword string
	BootstrapAdminName     string
}

// IsProduction indica si la app corre en producción.
func (c Config) IsProduction() bool { return c.Env == "production" }

// Load lee y valida la configuración.
func Load() (Config, error) {
	var errs []error

	cfg := Config{
		Env:                    getEnv("APP_ENV", "development"),
		HTTPAddr:               getEnv("HTTP_ADDR", ":8080"),
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		JWTSecret:              []byte(os.Getenv("JWT_SECRET")),
		BootstrapAdminEmail:    strings.TrimSpace(os.Getenv("ADMIN_EMAIL")),
		BootstrapAdminPassword: os.Getenv("ADMIN_PASSWORD"),
		BootstrapAdminName:     getEnv("ADMIN_NAME", "Administrador"),
	}

	var err error
	if cfg.AccessTokenTTL, err = getDuration("ACCESS_TOKEN_TTL", 15*time.Minute); err != nil {
		errs = append(errs, err)
	}
	if cfg.RefreshTokenTTL, err = getDuration("REFRESH_TOKEN_TTL", 7*24*time.Hour); err != nil {
		errs = append(errs, err)
	}
	if cfg.CookieSecure, err = getBool("COOKIE_SECURE", cfg.Env == "production"); err != nil {
		errs = append(errs, err)
	}
	if cfg.TrustProxy, err = getBool("TRUST_PROXY", false); err != nil {
		errs = append(errs, err)
	}
	if cfg.MembershipMonths, err = getInt("MEMBERSHIP_MONTHS", 1); err != nil {
		errs = append(errs, err)
	}
	if cfg.LoginRatePerMinute, err = getInt("LOGIN_RATE_PER_MINUTE", 10); err != nil {
		errs = append(errs, err)
	}

	if cfg.DatabaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL es obligatorio"))
	}
	if len(cfg.JWTSecret) < 32 {
		errs = append(errs, errors.New("JWT_SECRET debe tener al menos 32 caracteres"))
	}
	if cfg.MembershipMonths < 1 || cfg.MembershipMonths > 24 {
		errs = append(errs, errors.New("MEMBERSHIP_MONTHS debe estar entre 1 y 24"))
	}
	if cfg.LoginRatePerMinute < 1 {
		errs = append(errs, errors.New("LOGIN_RATE_PER_MINUTE debe ser mayor que 0"))
	}
	if (cfg.BootstrapAdminEmail == "") != (cfg.BootstrapAdminPassword == "") {
		errs = append(errs, errors.New("ADMIN_EMAIL y ADMIN_PASSWORD deben definirse juntos"))
	}

	return cfg, errors.Join(errs...)
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getDuration(key string, fallback time.Duration) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("%s: duración inválida %q", key, v)
	}
	return d, nil
}

func getBool(key string, fallback bool) (bool, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return false, fmt.Errorf("%s: booleano inválido %q", key, v)
	}
	return b, nil
}

func getInt(key string, fallback int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("%s: entero inválido %q", key, v)
	}
	return n, nil
}
