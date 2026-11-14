// Comando api arranca el servidor HTTP de FitPN.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ivantatsu/fitpn-pt/backend/internal/api"
	"github.com/ivantatsu/fitpn-pt/backend/internal/auth"
	"github.com/ivantatsu/fitpn-pt/backend/internal/config"
	"github.com/ivantatsu/fitpn-pt/backend/internal/database"
	"github.com/ivantatsu/fitpn-pt/backend/internal/membership"
	"github.com/ivantatsu/fitpn-pt/backend/internal/store"
)

func main() {
	// Subcomando para el HEALTHCHECK de Docker (la imagen distroless no incluye curl).
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	if err := run(); err != nil {
		slog.Error("el servidor terminó con error", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	setupLogger(cfg)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := database.Migrate(ctx, pool); err != nil {
		return err
	}

	st := store.New(pool)
	if err := bootstrapAdmin(ctx, cfg, st); err != nil {
		return err
	}

	srv := api.NewServer(cfg, st)
	go srv.RunJanitor(ctx, time.Hour, func(ctx context.Context) error {
		n, err := st.PurgeRefreshTokens(ctx, time.Now())
		if err != nil {
			slog.Warn("limpieza de sesiones", "error", err)
		} else if n > 0 {
			slog.Info("sesiones caducadas eliminadas", "total", n)
		}
		return err
	})

	httpServer := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("servidor escuchando", "addr", cfg.HTTPAddr, "env", cfg.Env)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	slog.Info("apagando servidor…")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return httpServer.Shutdown(shutdownCtx)
}

func healthcheck() int {
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	if strings.HasPrefix(addr, ":") {
		addr = "127.0.0.1" + addr
	}
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://" + addr + "/healthz")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func setupLogger(cfg config.Config) {
	var handler slog.Handler
	if cfg.IsProduction() {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	} else {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})
	}
	slog.SetDefault(slog.New(handler))
}

// bootstrapAdmin crea el administrador inicial si no existe ninguno.
func bootstrapAdmin(ctx context.Context, cfg config.Config, st *store.Store) error {
	if cfg.BootstrapAdminEmail == "" {
		return nil
	}
	n, err := st.CountActiveAdmins(ctx)
	if err != nil || n > 0 {
		return err
	}
	hash, err := auth.HashPassword(cfg.BootstrapAdminPassword)
	if err != nil {
		return err
	}
	_, err = st.CreateUser(ctx, store.User{
		Email: cfg.BootstrapAdminEmail, FullName: cfg.BootstrapAdminName,
		Role: membership.RoleAdmin, PasswordHash: hash,
	})
	if errors.Is(err, store.ErrConflict) {
		slog.Warn("ADMIN_EMAIL ya existe como usuario no administrador; no se crea el admin inicial")
		return nil
	}
	if err == nil {
		slog.Info("administrador inicial creado", "email", cfg.BootstrapAdminEmail)
	}
	return err
}
