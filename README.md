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
| Esc | Pause / PC-Fenster schließen |

Unter dem Fadenkreuz steht immer, was ein Linksklick gerade bewirkt.

## So läuft eine Runde

1. **Einkaufen:** Geh zum PC rechts neben dem Druckertisch und klick ihn an. Im Reiter **Filamente** kaufst du Spulen, im Reiter **Drucker** z. B. einen Bambu Lab A1 mini. Du startest mit 20.000 €.
2. **Abholen:** Alles wird in den **Abstellraum** geliefert – die Tür mit dem Schild „LAGER“ liegt hinter dir, wenn das Spiel startet. Drucker stehen als Karton in der gelben Lieferzone, Spulen liegen im Regal.
3. **Aufstellen:** Karton anklicken, zum Druckertisch tragen, auf den Tisch schauen (eine grüne Vorschau zeigt den Platz) und klicken.
4. **Filament einlegen:** Spule im Regal nehmen und auf den Drucker klicken. Nicht jeder Drucker kann jedes Material drucken – der Hinweis unter dem Fadenkreuz sagt es dir.
5. **Drucken:** Am PC den Reiter **Druckermenü** (ganz rechts) öffnen, Druckvorlage und Geschwindigkeit wählen und den Druck starten. Das Teil entsteht Schicht für Schicht auf dem Drucker.
6. **Entnehmen:** Ist der Druck fertig, im Druckermenü auf **Teil entnehmen** klicken.

Oben links siehst du deinen Kontostand und die monatlichen Stromkosten der aufgestellten Drucker. Spielzeit: 1 echte Sekunde entspricht 20 Sekunden im Spiel.

## Probleme?

| Problem | Lösung |
|---|---|
| Schwarzes Bild oder leere Seite | Seite über `http://localhost:8080` öffnen, nicht per Doppelklick. Browser-Konsole (F12) auf Fehler prüfen. |
| `serve.ps1` startet nicht („Ausführung von Skripts ist deaktiviert“) | Den Befehl genau wie oben mit `-ExecutionPolicy Bypass` aufrufen. |
| „Port bereits belegt“ | Anderen Port nehmen: `.\serve.ps1 -Port 8090` und dann `http://localhost:8090` öffnen. |
| Maus lässt sich nicht einfangen | Einmal ins Bild klicken. Nach `Esc` lässt der Browser die Maus manchmal erst nach einem weiteren Klick wieder einfangen. |
| Spielstand ist nach Neuladen weg | Speichern ist noch nicht eingebaut. |

## Projektaufbau

```
index.html        Einstieg, Import-Map für Three.js
css/style.css     HUD, Shop- und Menüfenster
serve.ps1         Lokaler Webserver für Windows
src/
  main.js         Verdrahtet alles: Szene, Steuerung, Spielschleife
  economy.js      Spiellogik: Geld, Besitz, Druckaufträge (ohne 3D)
  catalog.js      Drucker, Filamente, Druckvorlagen mit Preisen und Werten
  room.js         Halle mit Boden, Wänden, Fenstern, Licht
  storage-room.js Abstellraum mit Regal und Lieferzone
  workshop.js     Druckertisch: Aufstellen, Einlegen, Druck-Animation
  shop.js         PC-Fenster (Shop) · printer-menu.js: Druckermenü
  printer-model.js, printer-parts.js   3D-Modelle der Drucker
  print-shapes.js 3D-Formen der Druckvorlagen
```

Technik: [Three.js](https://threejs.org/) 0.169 als ES-Module direkt im Browser, ohne npm und ohne Build-Tools.
