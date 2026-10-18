# Druckercenter

FPV-Browserspiel: 3D-Druckerhalle betreiben (Filament kaufen, Stromkosten zahlen, Aufträge erfüllen).

## Stack
- Three.js 0.169.0 via Import-Map vom CDN (jsDelivr), keine Build-Tools, kein npm
- Vanilla JavaScript als native ES-Module unter `src/`
- HUD/Menüs als HTML/CSS-Overlay, Spielstand in localStorage

## Entwicklung
- Auf dem Rechner sind kein Node.js und kein Git installiert, deshalb gibt es bewusst keinen Build-Schritt.
- Lokal starten: `powershell -ExecutionPolicy Bypass -File .\serve.ps1`, danach http://localhost:8080 öffnen.
  `file://` funktioniert nicht, weil ES-Module dort blockiert werden.
- Prüfen ohne Node: Server auf einem freien Port starten, dann Chrome headless mit
  `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --enable-logging=stderr --screenshot=... --virtual-time-budget=15000`
  aufrufen. Konsolenausgaben stehen als `CONSOLE` in stderr. Für Abläufe (kaufen, tragen, aufstellen) eine temporäre
  Testseite anlegen, die die Module direkt importiert, und sie danach wieder löschen.

## Konventionen
- Spiellogik (Wirtschaft, Aufträge, Drucker-Zustände) bleibt getrennt vom Rendering, damit sie ohne 3D testbar ist.
- Pro System ein Modul: `src/<system>.js`. `main.js` verdrahtet sie nur.
- Bewegung und Simulation laufen über Delta-Zeit, nicht über Frame-Anzahl.
- Kommentare und UI-Texte auf Deutsch.
