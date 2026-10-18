# Druckercenter

FPV-Browserspiel: 3D-Druckerhalle betreiben (Filament kaufen, Miete und Strom zahlen, Aufträge erfüllen).
Live: https://derprocoder.github.io/3d-drucker-center/

## Stack
- Three.js 0.169.0 via Import-Map vom CDN (jsDelivr), keine Build-Tools, kein npm
- Vanilla JavaScript als native ES-Module unter `src/`
- HUD/Menüs als HTML/CSS-Overlay (`css/style.css`), Spielstand in localStorage

## Struktur von `src/`
Jede Datei gehört in genau einen Ordner. Neue Module nach dieser Tabelle einsortieren:

| Ordner    | Inhalt                                          | Darf importieren                     |
|-----------|-------------------------------------------------|--------------------------------------|
| `core/`   | Spiellogik: Wirtschaft, Aufträge, Uhr, Speichern | nur `core/` – kein `three`, kein DOM (Ausnahme: `save.js` nutzt `localStorage`) |
| `models/` | Reine 3D-Modelle (Drucker, Spule, Regale …)     | `three`, `models/`                   |
| `world/`  | 3D-Szene, Spielfigur, Interaktion in der Halle  | `three`, `core/`, `models/`          |
| `ui/`     | HTML-Overlays, HUD, PC-Desktop und seine Apps   | `three`, `core/`, `models/`, `world/` (nur Einstellungen wie Grafikstufen) |
| `audio/`  | Geräusche per WebAudio                          | –                                    |

`world/` und `ui/` kennen sich nicht gegenseitig über Spiellogik – was beide brauchen, kommt aus `core/`.

- `src/main.js` ist der einzige Einstieg und verdrahtet nur: Objekte anlegen, Ereignisse an HUD/Sound/Erfolge
  weiterreichen, Spielschleife. Keine Spiellogik dort ablegen.
- Logik gehört nach `core/`, damit sie ohne 3D testbar ist. Braucht ein `core/`-Modul etwas aus der Szene,
  Rückruf (`onEvent`, `subscribe`) anbieten statt importieren.
- Imports immer relativ mit Endung (`'../core/economy.js'`). Keine absoluten Pfade (`/src/...`) – das Spiel läuft
  auf GitHub Pages unter `/3d-drucker-center/`.
- Dateinamen in kebab-case, ein System pro Datei. Neue Systeme in eine eigene Datei statt bestehende Module
  (v. a. `core/economy.js`, `world/workshop.js`) weiter aufzublähen.
- Nach dem Verschieben oder Anlegen von Modulen die Dateiübersicht in `README.md` (Projektaufbau) nachziehen.

## Konventionen
- Bewegung und Simulation laufen über Delta-Zeit (Spielminuten), nicht über Frame-Anzahl.
- Kommentare und UI-Texte auf Deutsch.
- Spieler-Anleitung steht in `README.md` – bei neuen Features Steuerung/Ablauf dort nachziehen.
- Spielstand: Ändert sich das Format, `VERSION` in `src/core/save.js` erhöhen und eine Umwandlung für alte
  Stände ergänzen, damit Spieler ihren Fortschritt behalten.

## Entwicklung
- Auf dem Entwicklungsrechner ist kein Node.js und keine `gh`-CLI installiert. Deshalb gibt es bewusst keinen
  Build-Schritt; GitHub-Infos (PRs, Actions) über die öffentliche REST-API abfragen (`Invoke-RestMethod`).
- Lokal starten: `powershell -ExecutionPolicy Bypass -File .\serve.ps1`, danach http://localhost:8080 öffnen.
  `file://` funktioniert nicht, weil ES-Module dort blockiert werden.

## Prüfen (ohne Node)
1. Server auf einem freien Port starten: `serve.ps1 -Port 8765` (im Hintergrund, danach beenden).
2. Chrome headless aufrufen:
   `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --enable-logging=stderr --virtual-time-budget=15000`
   plus `--screenshot=<pfad>` oder `--dump-dom` und ein eigenes `--user-data-dir`. Konsolenausgaben stehen als
   `CONSOLE` in stderr. Die Warnung `KHR_parallel_shader_compile` ist harmlos.
3. Für Abläufe (kaufen, tragen, aufstellen, Abrechnung) eine temporäre Testseite im Repo-Wurzelordner anlegen, die
   die Module direkt importiert und Ergebnisse per `console.log('TEST …')` ausgibt – danach wieder löschen.
   Nach Umbauten an der Struktur alle Module einmal per `import()` laden, um kaputte Pfade zu finden.

## Pull Requests und Deployment
- PRs kommen meist aus Forks. Lokal holen: `git fetch origin pull/<n>/head:pr<n>`.
- Vor dem Mergen: Konflikte und Abhängigkeiten zwischen PRs prüfen (`git log main..pr<n>`), Testmerge auf einem
  Wegwerf-Branch, dann im Browser prüfen. Bei inhaltlichen Konflikten (z. B. zwei Wirtschaftssysteme) nicht selbst
  entscheiden, sondern nachfragen.
- Mergen mit `git merge --no-ff -m "Merge pull request #<n> from <user>/<branch>"` und auf `main` pushen –
  GitHub schließt den PR dann automatisch als gemergt.
- Jeder Push auf `main` veröffentlicht das Spiel über `.github/workflows/pages.yml` auf GitHub Pages
  (kopiert nur `index.html`, `css/`, `src/`). Neue Ordner auf oberster Ebene, die der Browser braucht, dort ergänzen.
