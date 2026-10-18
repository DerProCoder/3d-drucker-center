# Druckercenter

Ein 3D-Browserspiel aus der Ich-Perspektive: Du betreibst eine eigene 3D-Druckerhalle. Kauf Drucker und Filament, stell die Drucker auf, leg Spulen ein und lass Teile drucken – von der Vase bis zur Drachenfigur.

Das Spiel läuft komplett im Browser. Es gibt keinen Build-Schritt und nichts zu installieren außer einem Browser.

**Direkt online spielen:** https://derprocoder.github.io/3d-drucker-center/ – wird bei jedem Push auf `main` automatisch über GitHub Pages aktualisiert (`.github/workflows/pages.yml`).

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
| Linksklick | Benutzen, aufheben, abstellen, einlegen, Teil entnehmen, Kater streicheln |
| Mausrad | Bei mehreren Spulen in der Hand: wählen, welche als Nächstes eingelegt wird |
| Q | Alles in der Hand zurück ins Lager legen |
| M | Ton an/aus |
| Esc | Pause / PC verlassen |

Unter dem Fadenkreuz steht immer, was ein Linksklick gerade bewirkt.

## So läuft eine Runde

Dein Ziel: Kundenaufträge erfüllen und damit Geld verdienen.

1. **Auftrag aussuchen:** Geh zum PC rechts neben dem Druckertisch und klick ihn an. Auf dem Desktop siehst du die Apps – ein Klick öffnet sie, **PC verlassen** unten links (oder `Esc`) bringt dich zurück ins Spiel. In der App **Aufträge** siehst du, wer was bestellt hat (Material und meist auch die Farbe), was du dafür bekommst und wie lange du Zeit hast.
2. **Einkaufen:** Im **Filament-Shop** kaufst du Spulen und Zubehör, im **Drucker-Shop** einen Bambu Lab A1 mini, A1, P1P, P1S oder P2S. Du startest mit **5.000 €** und einem **A1 mini**, der schon auf dem ersten Drucktisch steht – kauf dir also erst mal Filament und erfüll ein paar Aufträge.
3. **Abholen:** Alles wird in den **Abstellraum** geliefert – die Tür mit dem Schild „LAGER“ liegt hinter dir, wenn das Spiel startet. Drucker stehen als Karton in der gelben Lieferzone, Spulen liegen im Regal. Du kannst bis zu **5 Spulen** auf einmal tragen; unten in der Mitte steht, wie viele du in der Hand hast und wie viele noch passen.
4. **Aufstellen:** Karton anklicken, zum Druckertisch tragen, auf den Tisch schauen (eine grüne Vorschau zeigt den Platz) und klicken.
5. **Filament einlegen:** Spule im Regal nehmen und auf den Drucker klicken (mit mehreren Spulen in der Hand wählt das Mausrad aus, welche) – so füllst du ein AMS in einem Gang. A1 und A1 mini haben einen Spulenhalter für eine Spule, P1P, P1S und P2S ein **AMS** auf dem Dach mit 4 Fächern – so kannst du vier Farben gleichzeitig bereithalten. Nicht jeder Drucker kann jedes Material drucken – der Hinweis unter dem Fadenkreuz sagt es dir.
6. **Drucken:** Am PC die App **Druckermenü** öffnen, Druckvorlage und Geschwindigkeit wählen – bei AMS-Druckern auch das Fach, aus dem gedruckt wird – und den Druck starten. Das Teil entsteht Schicht für Schicht auf dem Drucker. Unter **Anzahl auf der Platte** druckst du mehrere Teile auf einmal – so viele, wie mit etwas Abstand auf die Druckplatte passen (z. B. 15 Schlüsselanhänger auf dem A1 mini). Jedes weitere Teil braucht nur 90 % der Zeit, aber ein Fehldruck ruiniert die ganze Platte.
7. **Entnehmen:** Ist der Druck fertig (grüner Haken über dem Drucker), auf den Drucker klicken oder im Druckermenü auf **Teil entnehmen**.
8. **Liefern:** Hast du alle bestellten Teile in der richtigen Farbe, in der App **Aufträge** auf **Liefern** klicken – das Geld kommt sofort. Läuft die Frist ab, ist der Auftrag weg. Neue Kunden melden sich etwa alle 30 Spielminuten.

### Kunden

- **Eilaufträge** (⚡) haben eine knappe Frist, zahlen aber fast das Doppelte.
- **Sterne:** Jede pünktliche Lieferung bringt einen Stern beim Kunden, ein verfallener Auftrag kostet einen. Zufriedene Kunden zahlen mehr und melden sich öfter, ab 3 Sternen sind sie **Stammkunden**. Ablehnen kostet keinen Stern.
- **Sonderwünsche** (🤪): Ab und zu kommen absurde Bestellungen – Jonas (12) braucht ein Dutzend Benchys für seine ganze Klasse, eine Influencerin will transparente Vasen für ihren Livestream …

### Laufende Kosten

Zu jeder vollen Spielstunde werden **Miete** (3 €) und **Strom** abgebucht. Drucker verbrauchen beim Drucken viel Strom, im Leerlauf nur wenig. Oben links stehen Uhrzeit und Kosten pro Stunde. Rutscht das Konto unter 0 €, warnt das HUD – ab **−500 €** macht die Bank die Halle dicht und das Spiel ist vorbei. In der Pause (`Esc`) steht die Zeit still, am PC läuft sie weiter.

### Pannen

3D-Drucken geht nicht immer gut. Über dem Drucker erscheint dann ein Symbol, rechts oben eine Meldung:

- **Fehldruck** (⚠️): Spaghetti, abgelöstes oder verzogenes Teil. Hingehen und auf den Drucker klicken, um das Bett freizuräumen – das Filament ist verloren. Das Risiko steht vor dem Start im Druckermenü: Höhere Geschwindigkeit, **ABS ohne Gehäuse** (A1, A1 mini) und **feuchtes Filament** machen Fehldrucke wahrscheinlicher, „Leise“ halbiert das Risiko.
- **Verstopfte Düse** (🪡): Fünfmal auf den Drucker klicken, um sie freizustechen.
- **Filament leer** (🧵): Der Drucker hält an, bis du eine Spule in derselben Sorte und Farbe einlegst – dann druckt er von selbst weiter. Das **AMS** wechselt automatisch auf ein anderes Fach mit derselben Spule.
- **Düsenverschleiß** (🔧): Jede Düse hält rund 48 Druckstunden, schnelle Stufen nutzen sie stärker ab. Den Zustand zeigt das Druckermenü. Ab 75 % gibt es mehr Fehldrucke, bei 100 % startet kein neuer Druck. **Ersatzdüsen** gibt es im Filament-Shop, sie landen direkt im Ersatzteilregal. Düse aus dem Regal nehmen und auf den Drucker klicken – das hilft auch bei einer verstopften Düse.
- **Feuchtes Filament** (💧): Spulen im Regal ziehen mit der Zeit Feuchtigkeit, im AMS langsamer. Der **Filament-Trockenschrank** aus dem Filament-Shop hält das Regal trocken und trocknet feuchte Spulen wieder.

### Regale am Druckertisch

Im **Drucker-Shop** unter **Einrichtung** gibt es zwei Regale. Sie kommen wie Drucker als Karton in den Abstellraum und werden **in die Lücken zwischen den Druckern** gestellt (3 Regalplätze pro Drucktisch) – die Druckerplätze bleiben frei.

- **Filament-Regal** (8 Spulen): Spulen in der Hand aufs Regal klicken legt sie ab, auf eine Spule zielen nimmt genau diese. So hast du die nächsten Farben direkt neben den Druckern.
- **Ersatzteilregal** (12 Ersatzdüsen): Gekaufte Ersatzdüsen landen hier. Klick nimmt eine Düse in die Hand.
- Ein **leeres** Regal kannst du wieder aufheben und woanders hinstellen.

### Kater Düsentrieb

Der Hallenkater streunt herum, macht Nickerchen und springt gern auf den Druckertisch. Fertige Teile, die zu lange auf dem Drucker liegen, schubst er dabei auch mal auf den Boden – dann einfach aufheben. Streicheln mit Linksklick.

Mit der App **Drucker-Cam** schaust du deinen Druckern live beim Drucken zu – wie mit der Kamera im echten Gerät. Außerdem gibt es am PC **Notizen** (z. B. für die Einkaufsliste) und einen **Rechner**.

Oben links siehst du dein Level mit XP-Balken, deinen Kontostand, die Spieluhr, Miete + Strom pro Stunde und wie viele Aufträge offen sind. Spielzeit: 1 echte Sekunde entspricht 20 Sekunden im Spiel.

## Halle ausbauen

Platz kostet Geld – Tische und Regalebenen kauft man in der PC-App **Ausbau**:

- **Drucktische:** Am Anfang hast du einen Tisch mit 4 Druckerplätzen und 3 Regalplätzen dazwischen. Weitere Tische (150 €, 400 €, 900 €) kaufst du in der App **Ausbau** oder direkt in der Halle: Wo der nächste Tisch hinkommt, ist eine gelbe Markierung auf dem Boden – anklicken und kaufen.
- **Regalebenen:** Im Abstellraum gibt es erst eine Ebene für 20 Spulen. Weitere Ebenen (60 €, 150 €, 300 €) gibt es ebenfalls in der App **Ausbau**.

## Speichern, Level und Grafik

- **Speichern:** Das Spiel speichert automatisch alle 10 Sekunden, beim Pausieren und beim Schließen des Tabs (unten rechts blinkt „💾 Gespeichert“). Beim nächsten Start steht im Titelbildschirm **Weiterspielen**. **Neues Spiel** löscht den Spielstand.
- **Erfolge:** Die App **Erfolge** am PC zeigt freigeschaltete Erfolge (erstes Benchy, erste Spaghetti, Katzenmensch …) und Statistiken.
- **Ton:** Drucker surren je nach Geschwindigkeit, piepen bei fertig oder Fehler, der Kater miaut und schnurrt. `M` schaltet den Ton aus.
- **Level:** Jeder gelieferte Auftrag bringt XP (1 XP pro Euro). Mit jedem Level gibt es einen neuen Titel – vom *Bastler* bis zur *Legende des Filaments* –, 10 % mehr Lohn pro Auftrag und nach und nach mehr Aufträge gleichzeitig.
- **Grafik:** Im Titelbildschirm zwischen **Hoch** (mit Umgebungsverdeckung), **Mittel** und **Niedrig** wählen. „Niedrig“ rechnet mit voller statt doppelter Pixeldichte und einfacheren Schatten – für schwächere Rechner.
- **Alte Spielstände** werden übernommen. Fertige Teile von früher bekommen dabei Weiß als Farbe, weil die Farbe damals nicht gespeichert wurde.

## Probleme?

| Problem | Lösung |
|---|---|
| Schwarzes Bild oder leere Seite | Seite über `http://localhost:8080` öffnen, nicht per Doppelklick. Browser-Konsole (F12) auf Fehler prüfen. |
| `serve.ps1` startet nicht („Ausführung von Skripts ist deaktiviert“) | Den Befehl genau wie oben mit `-ExecutionPolicy Bypass` aufrufen. |
| „Port bereits belegt“ | Anderen Port nehmen: `.\serve.ps1 -Port 8090` und dann `http://localhost:8090` öffnen. |
| Maus lässt sich nicht einfangen | Einmal ins Bild klicken. Nach `Esc` lässt der Browser die Maus manchmal erst nach einem weiteren Klick wieder einfangen. |
| Spielstand ist nach Neuladen weg | Gespeichert wird im Browser (localStorage). Im privaten Fenster oder nach dem Löschen der Browserdaten ist er weg. |
| Spiel ruckelt | Im Titelbildschirm die Grafik auf **Mittel** oder **Niedrig** stellen. |
| Starkes Ruckeln, Bewegung kommt Sekunden später | Der Browser rendert vermutlich ohne Grafikkarte (der Titelbildschirm warnt dann rot). In den Browser-Einstellungen unter System **„Grafikbeschleunigung verwenden, wenn verfügbar“** einschalten und den Browser neu starten. Prüfen lässt es sich unter `chrome://gpu` bzw. `edge://gpu` (WebGL: „Hardware accelerated“). Bei Laptops mit zwei Grafikkarten in Windows unter Einstellungen → System → Anzeige → Grafik den Browser auf **Hohe Leistung** stellen. |

## Projektaufbau

```
index.html          Einstieg, Import-Map für Three.js
css/style.css       HUD, Shop- und Menüfenster
serve.ps1           Lokaler Webserver für Windows
.github/workflows/  pages.yml: veröffentlicht main automatisch auf GitHub Pages
src/
  main.js           Verdrahtet alles: Szene, Steuerung, Spielschleife
  core/             Spiellogik, ohne Three.js und ohne DOM
    catalog.js        Drucker, Filamente, Druckvorlagen mit Preisen und Werten
    economy.js        Geld, Kosten, Besitz, Drucke, Pannen, Feuchte, Düsenverschleiß
    orders.js         Kundenaufträge: Farben, Eilaufträge, Sterne, Fristen, Liefern
    progress.js       Level, XP und Titel
    achievements.js   Erfolge und Statistik
    upgrades.js       Ausbau: Drucktische, Regalebenen
    game-clock.js     Spieluhr mit Tagen und Stunden, meldet jede volle Stunde für die Abrechnung
    save.js           Spielstand in localStorage, Autospeichern, Umwandlung alter Stände
  world/            3D-Szene und Spielfigur
    room.js           Halle mit Boden, Wänden, Fenstern, Licht
    hall.js           Kaufbare Drucktische mit Bodenmarkierung
    workshop.js       Drucktische: Aufstellen, Einlegen, Druck-Animation, Pannen, Statussymbole
    storage-room.js   Abstellraum mit Regal und Lieferzone
    carry.js          Was der Spieler trägt: ein Karton, bis zu 5 Spulen oder eine Düse
    cat.js            Kater Düsentrieb
    interaction.js    Linksklick-Interaktion per Strahl aus der Bildmitte
    collision.js      Kollision der Spielfigur
    graphics.js       Tone-Mapping, Spiegelungen, Bloom, Umgebungsverdeckung, Staub
    util.js           Kleine 3D-Helfer (Schatten)
  models/           Reine 3D-Modelle, ohne Spiellogik
    printer-model.js, printer-parts.js   Drucker
    printer-box.js    Lieferkarton
    print-shapes.js   Formen der Druckvorlagen
    spool.js          Filamentspule
    furniture.js      Regale am Drucktisch und Ersatzdüse
    peripherals.js    Tastatur, Maus, Mauspad, Kabel
  ui/               HTML-Overlays und PC-Apps
    hud.js            HUD, Level-Up-Banner, Meldungen, Erfolge
    title-screen.js   Titel-, Pausen- und Game-Over-Bildschirm
    shop.js           PC-Desktop mit Apps, Taskleiste und Mauszeiger
    desktop.js        Bildschirm und App-Symbole
    printer-menu.js · orders-menu.js · upgrades-menu.js   Apps Druckermenü, Aufträge, Ausbau
    printer-cam.js    App Drucker-Cam
    printer-preview.js  Produktbilder der Drucker für den Shop
    pc-apps.js        Notizen und Rechner
  audio/
    sound.js          Geräusche per WebAudio (ohne Audiodateien)
```

Technik: [Three.js](https://threejs.org/) 0.169 als ES-Module direkt im Browser, ohne npm und ohne Build-Tools.
