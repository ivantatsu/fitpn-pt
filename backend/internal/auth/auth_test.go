package auth

import (
	"testing"
	"time"
)

func TestPasswordHashing(t *testing.T) {
	hash, err := HashPassword("correct-horse")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(hash, "correct-horse") {
		t.Error("la contraseña correcta debería validar")
	}
	if CheckPassword(hash, "wrong-horse") {
		t.Error("una contraseña incorrecta no debería validar")
	}
	if _, err := HashPassword("short"); err == nil {
		t.Error("se esperaba error con contraseña corta")
	}
}

func TestTokenRoundTrip(t *testing.T) {
	issuer := NewTokenIssuer([]byte("0123456789abcdef0123456789abcdef"), time.Minute)
	tok, _, err := issuer.Issue(42, "member")
	if err != nil {
		t.Fatal(err)
	}
	id, claims, err := issuer.Parse(tok)
	if err != nil {
		t.Fatal(err)
	}
	if id != 42 || claims.Role != "member" {
		t.Errorf("claims inesperados: id=%d role=%s", id, claims.Role)
	}
}

func TestTokenExpired(t *testing.T) {
	issuer := NewTokenIssuer([]byte("0123456789abcdef0123456789abcdef"), time.Minute)
	tok, _, _ := issuer.Issue(1, "admin")
	issuer.now = func() time.Time { return time.Now().Add(2 * time.Minute) }
	if _, _, err := issuer.Parse(tok); err == nil {
		t.Error("se esperaba token caducado")
	}
}

func TestTokenWrongSecret(t *testing.T) {
	a := NewTokenIssuer([]byte("0123456789abcdef0123456789abcdef"), time.Minute)
	b := NewTokenIssuer([]byte("ffffffffffffffffffffffffffffffff"), time.Minute)
	tok, _, _ := a.Issue(1, "admin")
	if _, _, err := b.Parse(tok); err == nil {
		t.Error("se esperaba firma inválida")
	}
}

func TestRefreshTokenHash(t *testing.T) {
	tok, hash, err := NewRefreshToken()
	if err != nil {
		t.Fatal(err)
	}
	if string(HashRefreshToken(tok)) != string(hash) {
		t.Error("el hash debería ser determinista")
	}
}
