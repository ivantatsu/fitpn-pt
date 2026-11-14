// Package auth agrupa el hashing de contraseñas y la emisión/validación de tokens.
package auth

import (
	"errors"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const (
	bcryptCost        = 12
	MinPasswordLength = 8
	// bcrypt solo usa los primeros 72 bytes.
	MaxPasswordBytes = 72
)

// ErrWeakPassword se devuelve si la contraseña no cumple la política mínima.
var ErrWeakPassword = errors.New("la contraseña debe tener entre 8 y 72 caracteres")

// ValidatePassword comprueba la política de contraseñas.
func ValidatePassword(pw string) error {
	if utf8.RuneCountInString(pw) < MinPasswordLength || len(pw) > MaxPasswordBytes {
		return ErrWeakPassword
	}
	return nil
}

// HashPassword genera un hash bcrypt.
func HashPassword(pw string) (string, error) {
	if err := ValidatePassword(pw); err != nil {
		return "", err
	}
	h, err := bcrypt.GenerateFromPassword([]byte(pw), bcryptCost)
	return string(h), err
}

// CheckPassword compara una contraseña en claro con su hash.
func CheckPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// dummyHash se usa para igualar tiempos de respuesta cuando el usuario no existe
// y así no revelar qué emails están registrados.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-password-for-timing"), bcryptCost)

// CheckDummy consume el mismo tiempo que una comprobación real.
func CheckDummy(pw string) {
	_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(pw))
}
