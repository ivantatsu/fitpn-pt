# Atajos de desarrollo. Ejecuta `make help` para ver los comandos.

DEV_DB_URL  ?= postgres://fitpn:fitpn@localhost:5432/fitpn?sslmode=disable
TEST_DB_URL ?= postgres://fitpn:fitpn@localhost:5432/fitpn_test?sslmode=disable
DEV_JWT     ?= dev-only-secret-change-me-0123456789abcdef

.PHONY: help db db-stop api web test test-backend test-frontend lint build up down logs

help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

db: ## Arranca PostgreSQL de desarrollo (puerto 5432)
	docker compose -f docker-compose.dev.yml up -d

db-stop: ## Para PostgreSQL de desarrollo
	docker compose -f docker-compose.dev.yml down

api: ## Arranca el backend en modo desarrollo (admin: admin@fitpn.local / admin12345)
	cd backend && APP_ENV=development DATABASE_URL="$(DEV_DB_URL)" JWT_SECRET="$(DEV_JWT)" \
		ADMIN_EMAIL=admin@fitpn.local ADMIN_PASSWORD=admin12345 go run ./cmd/api

web: ## Arranca el frontend con recarga en caliente (http://localhost:4200)
	cd frontend && npm start

test: test-backend test-frontend ## Ejecuta todos los tests

test-backend: ## Tests del backend (incluye integración con PostgreSQL)
	cd backend && TEST_DATABASE_URL="$(TEST_DB_URL)" go test -race -count=1 ./...

test-frontend: ## Tests unitarios del frontend
	cd frontend && npx ng test --watch=false

lint: ## Comprobaciones estáticas y de formato
	cd backend && test -z "$$(gofmt -l .)" && go vet ./...
	cd frontend && npm run format:check

build: ## Compila backend y frontend
	cd backend && go build -o bin/fitpn-api ./cmd/api
	cd frontend && npx ng build

up: ## Despliegue completo con Docker (requiere .env)
	docker compose up -d --build

down: ## Para el despliegue
	docker compose down

logs: ## Logs del despliegue
	docker compose logs -f --tail=100
