# syntax=docker/dockerfile:1

# ---- Compilación ----
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/fitpn-api ./cmd/api

# ---- Imagen final: binario estático sobre distroless (sin shell, usuario no root) ----
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/fitpn-api /fitpn-api
EXPOSE 8080
USER nonroot:nonroot
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["/fitpn-api", "healthcheck"]
ENTRYPOINT ["/fitpn-api"]
