package store

import (
	"strconv"
	"strings"
	"time"
)

func itoa(n int) string { return strconv.Itoa(n) }

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// escapeLike escapa los comodines de LIKE en la entrada del usuario.
func escapeLike(s string) string { return likeEscaper.Replace(s) }

// DateLayout es el formato de fechas (sin hora) usado en la API.
const DateLayout = "2006-01-02"

// ValidDate indica si s es una fecha YYYY-MM-DD válida.
func ValidDate(s string) bool {
	_, err := time.Parse(DateLayout, s)
	return err == nil
}
