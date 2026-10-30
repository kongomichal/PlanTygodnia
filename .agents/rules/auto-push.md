# Automatyczny zapis i wypychanie zmian

- Po każdej zmianie w projekcie wykonaj automatycznie `git add -A`, `git commit` (krótki opis po polsku) i `git push` na GitHub, bez pytania o zgodę.
- Przy zmianach w CSS/JS/HTML podbij wersję cache: `APP_VERSION` oraz parametry `?v=` w `index.html` (muszą być spójne), żeby GitHub Pages i przeglądarki od razu pobrały nowe pliki.
- Po wypchnięciu poinformuj, że publikacja na GitHub Pages trwa zwykle 1–2 minuty.
