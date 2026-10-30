---
trigger: always_on
---

# Automatyczny zapis i wypychanie zmian

- Po każdej zmianie w projekcie wykonaj automatycznie `git add -A`, `git commit` (krótki opis po polsku) i `git push` na GitHub, bez pytania o zgodę.
- Przy zmianach w CSS/JS/HTML podbij wersję cache: `APP_VERSION` oraz parametry `?v=` w `index.html` (muszą być spójne), żeby GitHub Pages i przeglądarki od razu pobrały nowe pliki.
- Na końcu każdej odpowiedzi dodaj krótką informację: „✅ Wysłano na GitHub (commit …, vX.Y) – publikacja na GitHub Pages trwa zwykle 1–2 minuty.” Jeśli push się nie udał, napisz to wyraźnie.
- Pełna lista kroków: `AGENTS.md` w katalogu głównym projektu.
