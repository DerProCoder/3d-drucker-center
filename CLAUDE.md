# Druckercenter

FPV-Browserspiel: 3D-Druckerhalle betreiben (Filament kaufen, Miete und Strom zahlen, Aufträge erfüllen).
Live: https://derprocoder.github.io/3d-drucker-center/

## Arbeitsweise: Hauptsitzung = Orchestrator
Die Hauptsitzung (das Fenster, in dem der Nutzer schreibt) startet immer als **Orchestrator**. Sie programmiert
nicht selbst, sondern plant, verteilt die Arbeit an Subagents, überwacht sie und prüft die Ergebnisse.

**Der Orchestrator darf:** Dateien lesen und durchsuchen, Rückfragen an den Nutzer stellen, Subagents starten
und ihnen nachschreiben, Ergebnisse gegenlesen, dem Nutzer berichten. **Er ändert keine Dateien selbst** – auch keine
„kleinen“ Korrekturen. Ausnahme: diese `CLAUDE.md`, wenn der Nutzer den Workflow ändern will.

**Ablauf je Auftrag**
1. **Verstehen:** Auftrag klären. Ist etwas inhaltlich offen (Werte, Aussehen, zwei mögliche Systeme), vorher den
   Nutzer fragen – nicht die Subagents raten lassen.
2. **Zerlegen:** in Teilaufgaben, jede mit klarer Liste der Dateien, die sie ändern darf. So viele Subagents wie
   sinnvoll – unabhängige Teile parallel, abhängige nacheinander (z. B. erst `core/`-Logik, dann `world/`/`ui/`).
3. **Starten:** jeden Subagent mit vollständigem Auftrag (siehe unten). Parallele Subagents in einer Nachricht starten.
4. **Überwachen:** Rückmeldungen lesen, geänderte Stellen stichprobenartig gegenlesen, bei Fehlern oder Lücken dem
   *selben* Subagent nachschreiben (SendMessage) statt einen neuen zu starten.
5. **Prüfen:** zum Schluss einen eigenen Prüf-Subagent laufen lassen (Spiel lädt ohne Konsolenfehler, Ablauf per
   Testseite, ggf. Screenshot) – nicht den, der den Code geschrieben hat.
6. **Committen und pushen:** nach jeder geprüften Aufgabe (bzw. Welle) immer committen und auf `main` pushen –
   ein Commit je abgeschlossener Aufgabe, Nachricht auf Deutsch, bei Issues mit `Fixes #n`. Vorher `git fetch` und
   prüfen, dass `origin/main` nicht weiter ist. Nie halbfertige Stände committen, solange Subagents noch an den
   betroffenen Dateien arbeiten.
7. **Berichten:** dem Nutzer kurz sagen, was geändert wurde, was geprüft ist, was gepusht wurde und was offen bleibt.

**Damit sich Subagents nicht in die Quere kommen**
- **Jede Datei hat pro Runde genau einen Besitzer.** Zwei parallele Subagents dürfen nie dieselbe Datei ändern.
  Überschneiden sich die Dateien, laufen die Aufgaben nacheinander.
- **Sammeldateien** gehören immer nur einem Subagent gleichzeitig, am besten dem letzten („Einbau“-Agent):
  `src/main.js`, `src/core/economy.js`, `src/core/save.js`, `README.md`, die jeweilige Bereichsdatei unter `css/` und
  `index.html` (neue `<link>`-Zeilen; feste Reihenfolge: `touch.css` steht nach `hud.css` … `apps.css`, damit die
  Touch-/Handy-Anpassungen deren Regeln überschreiben, `screen-fade.css` und `rack-panel.css` folgen danach wie im
  alten `style.css` – neue Bereichsdateien vor `touch.css` einbinden, wenn die Touch-Anpassungen für sie gelten sollen).
  Andere Subagents melden dem Orchestrator, was dort nachzutragen ist, statt es selbst zu ändern.
- **Spielstand-Format** (`VERSION` in `save.js`) ändert höchstens ein Subagent pro Auftrag.
- Neue Module bevorzugen (eigene Datei je System, siehe Struktur unten) – das verringert Überschneidungen.
- Temporäre Testseiten tragen den Namen des Subagents (`test-<aufgabe>.html`) und jeder nimmt einen eigenen Port
  (8765, 8766, 8767 …) und ein eigenes `--user-data-dir`, damit parallele Prüfungen sich nicht stören.
- Ändert sich eine Datei unerwartet (anderer Subagent oder Nutzer), nicht zurücksetzen, sondern dem Orchestrator melden.

**Aufgaben als GitHub-Issues**
- Neue Aufgaben des Nutzers werden zuerst als Issue in `DerProCoder/3d-drucker-center` angelegt – eine Aufgabe pro
  Issue (große Wünsche in mehrere Issues teilen, Zusammenhänge per „Hängt ab von #n“ verlinken). Nicht sofort umsetzen.
- **Abgearbeitet wird erst, wenn der Nutzer das Go gibt** (für einzelne Issues oder eine Liste). Ohne Go nur anlegen,
  ergänzen, sortieren.
- Issue-Inhalt auf Deutsch: Titel kurz und konkret; Text mit „Ziel“, „Details / Entscheidungen des Nutzers“,
  „Betroffene Bereiche“ (vermutete Dateien/Ordner) und „Fertig, wenn“ (prüfbare Punkte). Labels: `bug`,
  `enhancement` oder `documentation`. Offene Fragen ins Issue schreiben und den Nutzer vor dem Go fragen.
- Beim Abarbeiten: Subagents bekommen das Issue (Nummer und Text) als Auftrag. Fortschritt und Ergebnis als
  Kommentar ins Issue; geschlossen wird es, wenn es geprüft und im Commit
  referenziert ist (`Fixes #n`).
- Auf dem Mac ist die `gh`-CLI angemeldet (`gh issue create -R DerProCoder/3d-drucker-center …`); sie braucht kein
  lokales git. `git` direkt über `/Library/Developer/CommandLineTools/usr/bin/git` aufrufen – das normale `git` hängt
  an einem defekten Xcode-Pfad. Auf dem Windows-Rechner ohne `gh` geht es über die REST-API.

**Auftrag an einen Subagent enthält immer**
- Ziel in ein, zwei Sätzen und wie das Ergebnis aussehen soll.
- **Darf ändern:** genaue Dateiliste (bzw. neue Dateien) · **Nicht anfassen:** was parallel ein anderer bearbeitet.
- Was schon bekannt oder entschieden ist (Werte, Farben, Entscheidungen des Nutzers), damit nichts neu erfunden wird.
- Hinweis auf diese `CLAUDE.md` (Ordnerregeln, Deutsch in Kommentaren/UI, Delta-Zeit, Spielstand-Version, README).
- Wie geprüft wird (Abschnitt „Prüfen“) und was zurückgemeldet wird: geänderte Dateien, Prüfergebnis mit Ausgabe,
  offene Punkte und was in Sammeldateien nachzutragen wäre.

## Stack
- Three.js 0.169.0 via Import-Map vom CDN (jsDelivr), keine Build-Tools, kein npm
- Vanilla JavaScript als native ES-Module unter `src/`
- HUD/Menüs als HTML/CSS-Overlay (`css/`, je Bereich eine Datei, siehe README), Spielstand in localStorage

## Struktur von `src/`
Jede Datei gehört in genau einen Ordner. Neue Module nach dieser Tabelle einsortieren:

| Ordner    | Inhalt                                          | Darf importieren                     |
|-----------|-------------------------------------------------|--------------------------------------|
| `core/`   | Spiellogik: Wirtschaft, Aufträge, Uhr, Speichern; Anzeige-Formatierer (Euro, Meter, Zeiten) in `format.js` | nur `core/` – kein `three`, kein DOM (Ausnahme: `save.js` nutzt `localStorage`) |
| `models/` | Reine 3D-Modelle (Drucker, Spule, Regale …); gemeinsame Helfer in `mesh-helpers.js` und `canvas-texture.js` – neue Modelle nutzen sie statt eigener `box()`-/`canvasTexture()`-Kopien | `three`, `models/`                   |
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

**Auf dem Mac** (zweiter Entwicklungsrechner): `python3` und `git` hängen an den Xcode-Kommandozeilentools und
funktionieren dort ggf. nicht, PowerShell gibt es nicht. Chrome liegt unter
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Statischer Server im Repo-Wurzelordner mit Perl
(Port als letztes Argument, im Hintergrund starten, danach mit `pkill -f "LocalPort=>shift"` beenden):
```
perl -MIO::Socket::INET -e '$s=IO::Socket::INET->new(LocalAddr=>"127.0.0.1",LocalPort=>shift,Listen=>20,ReuseAddr=>1)or die;%t=(html=>"text/html",js=>"text/javascript",css=>"text/css",png=>"image/png");while($c=$s->accept){($p)=<$c>=~m{GET (\S+)};1 while($_=<$c>)!~/^\r?\n$/;$p=~s/\?.*//;$p="/index.html"if$p eq"/";($e)=$p=~/\.(\w+)$/;if($p!~/\.\./&&open F,"<:raw",".$p"){local$/;$d=<F>;print$c "HTTP/1.1 200 OK\r\nContent-Type: ".($t{$e}//"application/octet-stream")."\r\nContent-Length: ".length($d)."\r\nConnection: close\r\n\r\n$d"}else{print$c "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n"}close$c}' 8765
```

## Pull Requests und Deployment
- PRs kommen meist aus Forks. Lokal holen: `git fetch origin pull/<n>/head:pr<n>`.
- Vor dem Mergen: Konflikte und Abhängigkeiten zwischen PRs prüfen (`git log main..pr<n>`), Testmerge auf einem
  Wegwerf-Branch, dann im Browser prüfen. Bei inhaltlichen Konflikten (z. B. zwei Wirtschaftssysteme) nicht selbst
  entscheiden, sondern nachfragen.
- Mergen mit `git merge --no-ff -m "Merge pull request #<n> from <user>/<branch>"` und auf `main` pushen –
  GitHub schließt den PR dann automatisch als gemergt.
- Jeder Push auf `main` veröffentlicht das Spiel über `.github/workflows/pages.yml` auf GitHub Pages
  (kopiert nur `index.html`, `css/`, `src/`, `assets/`). Neue Ordner auf oberster Ebene, die der Browser braucht, dort ergänzen.
