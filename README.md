# Druckercenter

Ein 3D-Browserspiel aus der Ich-Perspektive: Du betreibst eine eigene 3D-Druckerhalle. Kauf Drucker und Filament, stell die Drucker auf, leg Spulen ein und lass Teile drucken – von der Vase bis zur Drachenfigur.

Das Spiel läuft komplett im Browser. Es gibt keinen Build-Schritt und nichts zu installieren außer einem Browser.

## Getting Started

### Voraussetzungen

- Ein aktueller Desktop-Browser (Chrome, Edge oder Firefox) mit Maus und Tastatur
- Eine Internetverbindung beim ersten Laden (Three.js wird vom CDN jsDelivr geladen)
- Ein kleiner lokaler Webserver – unter Windows ist einer dabei (`serve.ps1`), siehe unten

> Einfach `index.html` per Doppelklick öffnen funktioniert **nicht**: Browser blockieren JavaScript-Module, die über `file://` geladen werden. Das Spiel muss über `http://localhost` laufen.

### 1. Repository holen

```bash
git clone https://github.com/DerProCoder/3d-drucker-center.git
cd 3d-drucker-center
```

Ohne Git: Auf GitHub **Code → Download ZIP** wählen und entpacken.

### 2. Server starten

**Windows (PowerShell):**

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Der Server läuft auf Port 8080. Ein anderer Port geht mit `-Port 8090`. Beenden mit `Strg+C`.

**macOS / Linux oder mit anderen Werkzeugen** – jeder statische Webserver im Projektordner reicht, zum Beispiel:

```bash
python3 -m http.server 8080
# oder
npx serve -l 8080
```

In VS Code geht auch die Erweiterung „Live Server“.

### 3. Spielen

Im Browser **http://localhost:8080** öffnen und ins Bild klicken.

## Steuerung

| Taste | Aktion |
|---|---|
| Maus | Umschauen |
| W A S D | Laufen |
| Linksklick | Benutzen, aufheben, abstellen, einlegen |
| Q | Getragenen Gegenstand zurück ins Lager legen |
| Esc | Pause / PC verlassen |

Unter dem Fadenkreuz steht immer, was ein Linksklick gerade bewirkt.

## So läuft eine Runde

Dein Ziel: Kundenaufträge erfüllen und damit Geld verdienen.

1. **Auftrag aussuchen:** Geh zum PC rechts neben dem Druckertisch und klick ihn an. Auf dem Desktop siehst du die Apps – ein Klick öffnet sie, **PC verlassen** unten links (oder `Esc`) bringt dich zurück ins Spiel. In der App **Aufträge** siehst du, wer was bestellt hat, was du dafür bekommst und wie lange du Zeit hast.
2. **Einkaufen:** Im **Filament-Shop** kaufst du Spulen, im **Drucker-Shop** einen Bambu Lab A1 mini, A1, P1P, P1S oder P2S. Du startest mit 20.000 €.
3. **Abholen:** Alles wird in den **Abstellraum** geliefert – die Tür mit dem Schild „LAGER“ liegt hinter dir, wenn das Spiel startet. Drucker stehen als Karton in der gelben Lieferzone, Spulen liegen im Regal.
4. **Aufstellen:** Karton anklicken, zum Druckertisch tragen, auf den Tisch schauen (eine grüne Vorschau zeigt den Platz) und klicken.
5. **Filament einlegen:** Spule im Regal nehmen und auf den Drucker klicken. A1 und A1 mini haben einen Spulenhalter für eine Spule, P1P, P1S und P2S ein **AMS** auf dem Dach mit 4 Fächern – so kannst du vier Farben gleichzeitig bereithalten. Nicht jeder Drucker kann jedes Material drucken – der Hinweis unter dem Fadenkreuz sagt es dir.
6. **Drucken:** Am PC die App **Druckermenü** öffnen, Druckvorlage und Geschwindigkeit wählen – bei AMS-Druckern auch das Fach, aus dem gedruckt wird – und den Druck starten. Das Teil entsteht Schicht für Schicht auf dem Drucker.
7. **Entnehmen:** Ist der Druck fertig, im Druckermenü auf **Teil entnehmen** klicken.
8. **Liefern:** Hast du alle bestellten Teile, in der App **Aufträge** auf **Liefern** klicken – das Geld kommt sofort. Läuft die Frist ab, ist der Auftrag weg. Neue Kunden melden sich etwa alle 30 Spielminuten.

Außerdem gibt es am PC **Notizen** (z. B. für die Einkaufsliste) und einen **Rechner**.

Oben links siehst du dein Level mit XP-Balken, deinen Kontostand, die monatlichen Stromkosten der aufgestellten Drucker und wie viele Aufträge offen sind. Spielzeit: 1 echte Sekunde entspricht 20 Sekunden im Spiel.

## Speichern, Level und Grafik

- **Speichern:** Das Spiel speichert automatisch alle 10 Sekunden, beim Pausieren und beim Schließen des Tabs (unten rechts blinkt „💾 Gespeichert“). Beim nächsten Start steht im Titelbildschirm **Weiterspielen**. **Neues Spiel** löscht den Spielstand.
- **Level:** Jeder gelieferte Auftrag bringt XP (1 XP pro Euro). Mit jedem Level gibt es einen neuen Titel – vom *Bastler* bis zur *Legende des Filaments* –, 10 % mehr Lohn pro Auftrag und nach und nach mehr Aufträge gleichzeitig.
- **Grafik:** Im Titelbildschirm zwischen **Hoch** (mit Umgebungsverdeckung), **Mittel** und **Niedrig** wählen.

## Probleme?

| Problem | Lösung |
|---|---|
| Schwarzes Bild oder leere Seite | Seite über `http://localhost:8080` öffnen, nicht per Doppelklick. Browser-Konsole (F12) auf Fehler prüfen. |
| `serve.ps1` startet nicht („Ausführung von Skripts ist deaktiviert“) | Den Befehl genau wie oben mit `-ExecutionPolicy Bypass` aufrufen. |
| „Port bereits belegt“ | Anderen Port nehmen: `.\serve.ps1 -Port 8090` und dann `http://localhost:8090` öffnen. |
| Maus lässt sich nicht einfangen | Einmal ins Bild klicken. Nach `Esc` lässt der Browser die Maus manchmal erst nach einem weiteren Klick wieder einfangen. |
| Spielstand ist nach Neuladen weg | Gespeichert wird im Browser (localStorage). Im privaten Fenster oder nach dem Löschen der Browserdaten ist er weg. |
| Spiel ruckelt | Im Titelbildschirm die Grafik auf **Mittel** oder **Niedrig** stellen. |

## Projektaufbau

```
index.html        Einstieg, Import-Map für Three.js
css/style.css     HUD, Shop- und Menüfenster
serve.ps1         Lokaler Webserver für Windows
src/
  main.js         Verdrahtet alles: Szene, Steuerung, Spielschleife
  economy.js      Spiellogik: Geld, Besitz, Druckaufträge (ohne 3D)
  orders.js       Kundenaufträge: Fristen, Lohn, Liefern (ohne 3D)
  progress.js     Level, XP und Titel (ohne 3D)
  save.js         Spielstand in localStorage, Autospeichern
  graphics.js     Tone-Mapping, Spiegelungen, Bloom, Umgebungsverdeckung, Staub
  hud.js          HUD, Level-Up-Banner · title-screen.js: Titel- und Pausenbildschirm
  catalog.js      Drucker, Filamente, Druckvorlagen mit Preisen und Werten
  room.js         Halle mit Boden, Wänden, Fenstern, Licht
  storage-room.js Abstellraum mit Regal und Lieferzone
  workshop.js     Druckertisch: Aufstellen, Einlegen, Druck-Animation
  shop.js         PC-Desktop mit Apps, Taskleiste und Mauszeiger · printer-menu.js: Druckermenü
                  orders-menu.js: Aufträge · pc-apps.js: Notizen und Rechner · desktop.js: Bildschirm & Symbole
  printer-model.js, printer-parts.js   3D-Modelle der Drucker
  print-shapes.js 3D-Formen der Druckvorlagen
```

Technik: [Three.js](https://threejs.org/) 0.169 als ES-Module direkt im Browser, ohne npm und ohne Build-Tools.
