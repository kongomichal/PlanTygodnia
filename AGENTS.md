# Notatki dla agenta – PlanTygodnia

Projekt: statyczna aplikacja (HTML/CSS/JS) publikowana na GitHub Pages
z repozytorium `git@github.com:kongomichal/PlanTygodnia.git` (gałąź `main`).

## Kroki działania po KAŻDEJ zmianie w projekcie (obowiązkowe, bez pytania)

1. Wprowadź zmiany w kodzie.
2. Sprawdź składnię zmienionych plików JS: `node --check js/<plik>.js`.
3. Przy zmianach w CSS/JS/HTML podbij wersję cache w `index.html`:
   - `const APP_VERSION = 'X.Y';`
   - wszystkie parametry `?v=X.Y` przy plikach `css/` i `js/` (muszą być spójne z `APP_VERSION`).
   - Nie ruszaj wersji bibliotek Firebase (`firebasejs/10.8.0`).
4. `git add -A`
5. `git commit -m "<krótki opis po polsku> (vX.Y)"`
6. `git push` (jeśli sandbox blokuje sieć – ponów samo `git push` poza sandboxem).
7. Na końcu odpowiedzi ZAWSZE dodaj krótką informację, np.:
   > ✅ Wysłano na GitHub (commit `abc1234`, v10.9). Publikacja na GitHub Pages trwa zwykle 1–2 minuty.

   Jeśli push się nie udał – napisz to wyraźnie, z powodem.

## Ważne miejsca w kodzie

- `js/app.js` – UI i logika (np. `renderInboxSidebar` = notatnik z mini-folderami i pogrubianiem).
- `js/store.js` – stan + scalanie (`merge`); pojedyncze pola synchronizowane przez `fieldStamps`.
- `js/sync.js` – synchronizacja z Firebase (cały stan).
- `css/style.css` – style; sekcja „NOTATNIK” na końcu pliku.
