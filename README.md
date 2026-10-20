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

Beim ersten Start fragt das Spiel: **Über welches Gerät spielst du?** – **PC** (Maus und Tastatur) oder **Tablet**
(Touch). Die Wahl wird im Browser gespeichert; umstellen kannst du sie jederzeit im Start- bzw. Pausenbildschirm unter
„Gerät“.

### PC

| Taste | Aktion |
|---|---|
| Maus | Umschauen |
| W A S D | Laufen |
| C (gedrückt halten) | Schleichen: geduckt und langsamer, solange C gedrückt ist |
| Linksklick | Benutzen, aufheben, abstellen, einlegen, Teil entnehmen, Kater streicheln |
| Mausrad | Bei mehreren Spulen in der Hand: wählen, welche als Nächstes eingelegt wird |
| E | Aufgestellten Drucker hochheben (nicht während er druckt) |
| F | Getragenen Drucker oder Druckerkarton werfen |
| Q | Alles in der Hand zurück ins Lager legen |
| M | Ton an/aus |
| F3 | Leistungsanzeige: Bilder pro Sekunde, Bildzeit, Draw Calls, Auflösung |
| Esc | Pause / PC verlassen (danach einmal klicken, um weiterzuspielen) |

Unter dem Fadenkreuz steht immer, was ein Linksklick gerade bewirkt.

### Tablet

| Geste / Knopf | Aktion |
|---|---|
| Linke Bildschirmhälfte: Daumen aufsetzen und ziehen | Laufen – der Joystick erscheint dort, wo du aufsetzt; halb gezogen ist halbes Tempo |
| Rechte Bildschirmhälfte: wischen | Umschauen |
| Antippen | Das angetippte Objekt benutzen – wie ein Linksklick darauf: Spule nehmen, in Drucker oder AMS legen, Holzplatte nehmen, Drucker abstellen, PC öffnen … |
| ✋ Aufheben | Den Drucker im Fadenkreuz vom Tisch hochheben (erscheint nur, wenn du auf einen zielst) |
| 🤾 Werfen | Getragenen Drucker oder Karton werfen (erscheint nur, wenn du einen trägst) |
| ↩ Ins Lager | Alles in der Hand zurück ins Lager legen |
| 🔄 Spule | Bei mehreren Spulen in der Hand: nächste wählen |
| 🧎 Schleichen | Schleichen an/aus |
| ⏸ (oben rechts) | Pause |

Laufen und Umschauen bzw. Antippen gehen gleichzeitig mit zwei Fingern. Das Spiel schaltet beim Start in den
Vollbildmodus, sofern der Browser das erlaubt.

Auch auf dem **Handy** spielbar, quer und hochkant: Das HUD wird dort zur schmalen Leiste (Level, Kontostand, Uhrzeit,
Aufträge), die Knöpfe stehen als kleines Raster unten rechts, und die PC-Apps öffnen sich bildschirmfüllend. Die
Taskleiste lässt sich waagrecht wischen, wenn nicht alle Apps hineinpassen.

## So läuft eine Runde

Dein Ziel: Kundenaufträge erfüllen und damit Geld verdienen.

1. **Auftrag annehmen:** Kunden kommen über den Gartenweg zum **Empfang** (Tür „EMPFANG“ in der Westwand) und stellen sich an den Tresen; wer warten muss, setzt sich auf die Stühle. Zielst du auf den Tresen oder den Kunden davor, siehst du, was er will (Teil, Anzahl, Material und meist Farbe) und was er zahlt – Linksklick nimmt den Auftrag an, dann läuft die Frist. Wer zu lange wartet (etwa 6 Minuten), geht wieder, ohne dass es Ärger gibt. Am PC rechts neben dem Druckertisch zeigt die App **Aufträge** alle Aufträge mit Frist; dort kannst du auch ablehnen. Auf dem Desktop öffnet ein Klick eine App, **PC verlassen** unten links (oder `Esc`) bringt dich zurück ins Spiel.
2. **Einkaufen:** Im **Filament-Shop** kaufst du Spulen und Zubehör, im **Drucker-Shop** einen Bambu Lab A1 mini, A1, den **A2L** (350 €, wie der A1, aber mit großem Bauraum 325 × 325 × 325 mm und kann auch TPU), P1P, P1S, P2S, den **X1 Carbon** (850 €), den Klassiker mit einer Düse, AMS, KI-Kamera und Micro-Lidar, das die erste Schicht prüft (20 % weniger Fehldrucke), den **X2D** (950 €) mit zwei Düsen und KI-Kamera das Flaggschiff **H2D** (1.400 €) – ebenfalls mit zwei Düsen und KI-Kamera, dazu ein großer Bauraum (325 × 325 × 325 mm, mehr Teile pro Platte), Fenster vorne, an der Seite und im Dach und ein großes Touch-Display –, den **H2S** (1.800 €), ebenso groß und mit KI-Kamera, aber mit nur einer Düse, dafür mit **Turbo-Stufe bis 200 %** sowie präziserer Mechanik und starker Bauteilkühlung (nur halb so viele Fehldrucke), den **X1E** (2.200 €), so groß wie der X2D mit zwei Düsen, AMS und KI-Kamera, dazu der schnellste Drucker mit der **Hyper-Stufe bis 300 %** und 25 % weniger Fehldrucken, den **H2D Pro** (2.000 €), einen H2D mit zwei Düsen und KI-Kamera, dazu mit der **Turbo-Stufe bis 200 %**, oder den **H2C** (2.500 €): so groß wie der H2D, mit **Düsenwechsler** (8 Düsen), zwei AMS übereinander und einer LED-Leiste am Sockel. Unter **Technische Daten** klappst du bei jedem Gerät das echte Datenblatt auf (Bauraum, Temperaturen, Geschwindigkeit, Maße, Gewicht, Leistung, Startpreis …). Du startest klein: mit **150 €**, einem **A1 mini**, der schon auf dem ersten Drucktisch steht, und **einer Rolle weißem PLA**, die schon im Drucker eingelegt ist – erfüll die ersten Aufträge und spar auf Filament in weiteren Farben und bessere Drucker.
3. **Abholen:** Alles wird in den **Abstellraum** geliefert – die Tür mit dem Schild „LAGER“ liegt hinter dir, wenn das Spiel startet. Drucker stehen als Karton in der gelben Lieferzone, Spulen liegen im Regal. Du kannst bis zu **5 Spulen** auf einmal tragen; unten in der Mitte steht, wie viele du in der Hand hast und wie viele noch passen.
4. **Aufstellen:** Karton anklicken, zum Druckertisch tragen, auf den Tisch schauen (eine grüne Vorschau zeigt den Platz) und klicken.
5. **Filament einlegen:** Spule im Regal nehmen und auf den Drucker klicken (mit mehreren Spulen in der Hand wählt das Mausrad aus, welche) – so füllst du ein AMS in einem Gang. A1, A1 mini und A2L haben einen Spulenhalter für eine Spule, P1P, P1S, P2S, X1 Carbon, X2D und H2D ein **AMS** auf dem Dach mit 4 Fächern – so kannst du vier Farben gleichzeitig bereithalten. Der H2C hat zwei AMS übereinander, also 8 Fächer. Nicht jeder Drucker kann jedes Material drucken – der Hinweis unter dem Fadenkreuz sagt es dir.
6. **Drucken:** Am PC die App **Druckermenü** öffnen, Druckvorlage und Geschwindigkeit wählen – bei AMS-Druckern auch das Fach, aus dem gedruckt wird – und den Druck starten. Das Teil entsteht Schicht für Schicht auf dem Drucker. Unter **Anzahl auf der Platte** druckst du mehrere Teile auf einmal – so viele, wie mit etwas Abstand auf die Druckplatte passen (z. B. 15 Schlüsselanhänger auf dem A1 mini). Jedes weitere Teil braucht nur 90 % der Zeit, aber ein Fehldruck ruiniert die ganze Platte.
7. **Entnehmen:** Ist der Druck fertig (grüner Haken über dem Drucker), auf den Drucker klicken oder im Druckermenü auf **Teil entnehmen**.
8. **Ins Abholregal legen:** Hast du alle bestellten Teile in der richtigen Farbe, geh zum Empfang und klick auf das **Abholregal** – der Auftrag wird verpackt und liegt mit dem Kundennamen im nächsten freien Fach (8 Fächer). Damit ist die Frist geschafft. Kurz darauf kommt der Kunde, nimmt sein Paket, **bezahlt am Tresen** und trägt es nach Hause. Läuft die Frist vorher ab, ist der Auftrag weg. Neue Kunden kommen etwa alle 30 Spielminuten.

### Filament-Sorten

Im **Filament-Shop** gibt es echte Bambu-Lab-Sorten mit ihren Originalfarben, sortiert nach Sorte:

| Sorte | Preis je kg | Besonderheit |
|---|---|---|
| PLA Basic | 19,99 € | 12 Farben, der Allrounder |
| PLA Matte | 19,99 € | samtig matt – Teile glänzen nicht |
| PLA Silk+ | 22,99 € | seidiger Metallic-Glanz |
| PLA Glow | 27,99 € | leuchtet im Dunkeln nach |
| PLA Translucent | 22,99 € | durchscheinend |
| PETG Basic / Translucent | 18,99 € / 19,99 € | robust, Translucent durchscheinend |
| ABS | 19,99 € | hitzebeständig, braucht ein geschlossenes Gehäuse |
| TPU 95A HF | 34,99 € | flexibel |

Für Drucker und Aufträge zählt nur das Material (PLA, PETG, ABS, TPU) – PLA Glow druckt also überall, wo PLA geht. Wie die Teile aussehen, hängt aber von der Sorte ab. Kunden bestellen meist Basic-Farben, ab und zu aber eine **Effektsorte** und zahlen dafür mehr: Matte +15 %, Translucent +25 %, Silk+ +30 %, Glow +50 %.

### Kunden

- **Eilaufträge** (⚡) haben eine knappe Frist, zahlen aber fast das Doppelte.
- **Sterne:** Jeder pünktlich ins Abholregal gelegte Auftrag bringt beim Abholen einen Stern, ein verfallener Auftrag kostet einen. Zufriedene Kunden zahlen mehr und melden sich öfter, ab 3 Sternen sind sie **Stammkunden**. Ablehnen kostet keinen Stern.
- **Sonderwünsche** (🤪): Ab und zu kommen absurde Bestellungen – Jonas (12) braucht ein Dutzend Benchys für seine ganze Klasse, eine Influencerin will transparente Vasen für ihren Livestream …
- **Zweifarbige Teile** (🎨): Ab Level 3 bestellen Kunden auch Namensschilder, Untersetzer mit Logo, Spielwürfel und Schachfiguren in **zwei verschiedenen Farben** – sie zahlen 40 % mehr. Dafür brauchst du zwei Spulen im gleichen Material, aber in unterschiedlichen Farben, also ein AMS. Im Druckermenü wählst du unter **Farben** für jedes Teil (z. B. beim Spielwürfel für Würfel und Augen) eine der eingelegten Spulen – die gewählte Farbe ist grün, die anderen grau. Daneben zeigt eine **Vorschau**, wie das Teil in diesen Farben aussieht. Wählst du für ein Teil die Farbe eines anderen, tauschen die beiden. Zweimal dieselbe Farbe geht nicht. Ob Grund- und Akzentfarbe vertauscht sind, ist dem Kunden egal.
  - **Dual-Nozzle (X2D, X1E, H2D, H2D Pro):** Jede Farbe hat ihre eigene Düse – kaum langsamer als einfarbig (+10 %) und fast ohne Abfall. Am Druckkopf siehst du, welche gerade druckt: die linke Düse (Grundfarbe) oder die rechte (zweite Farbe) ist ausgefahren, die andere eingefahren. Beim Farbwechsel tauschen sie die Plätze.
  - **Düsenwechsler (H2C):** Rechts im Bauraum hängen die Düsen im Wechsler, eine für jedes der 8 AMS-Fächer (die farbige Socke zeigt, welche Farbe dazugehört) – eine steckt im Kopf, sieben warten im Wechsler. Braucht der Druck eine andere Farbe, fährt der Kopf nach rechts, hängt seine Düse ein, holt die Düse der neuen Farbe und druckt weiter. Nur **6 % langsamer** als einfarbig und fast ohne Spülabfall.
  - **Eine Düse mit AMS (P1P, P1S, P2S, H2S):** Der Drucker muss in jeder Schicht die Farbe wechseln und die alte ausspülen. Das dauert **80 % länger** und braucht **50 % mehr Filament**. Du siehst es auch: Der Kopf fährt zum großen Spülfeld hinten links, drückt erst die alte und dann langsam die neue Farbe heraus, streift die Düse mit einem Ruck nach rechts ab und druckt weiter. Der Strang knüllt sich zusammen, rutscht die Rutsche hinunter und bleibt im Mülleimer hinten am Drucker liegen. Der Eimer fasst **100 g** Spülabfall – das Druckermenü zeigt, wie voll er ist. Ist er voll, hält der Drucker an, bis jemand ihn leert: du per Linksklick auf den Drucker (ab 70 g) oder im Druckermenü, oder ein Azubi. Eilaufträge schaffst du so kaum.
  - **A1, A1 mini und A2L** (nur ein Spulenhalter) können nicht zweifarbig drucken.
- **Mehrfarbige Teile** (🌈): Ab Level 6 bestellen Kunden auch den **Regenbogen** (8 Farben) und den **Papagei** (6 Farben) in PLA – sie zahlen 80 % mehr. Jede Farbe braucht ein eigenes AMS-Fach, deshalb geht das nur auf dem **H2C** mit seinen 8 Fächern. Wie bei den zweifarbigen Teilen wählst du im Druckermenü unter **Farben** für jedes Teil die Farbe (beim Papagei Sockel, Körper, Kopf, Schnabel, Flügel und Augen) und siehst die Vorschau. Teile ohne eigene Wahl bekommen die nächsten freien PLA-Farben im AMS. Welche Farben du nimmst, ist dem Kunden egal, sie müssen nur alle verschieden sein. Der Düsenwechsler holt sich für jede Farbe ihre eigene Düse.

### Laufende Kosten

Zu jeder vollen Spielstunde werden **Miete** (3 €) und **Strom** abgebucht. Drucker verbrauchen beim Drucken viel Strom, im Leerlauf nur wenig. Oben links stehen Uhrzeit und Kosten pro Stunde. Rutscht das Konto unter 0 €, warnt das HUD – ab **−500 €** macht die Bank die Halle dicht und das Spiel ist vorbei. In der Pause (`Esc`) steht die Zeit still, am PC läuft sie weiter.

### Pannen

3D-Drucken geht nicht immer gut. Über dem Drucker erscheint dann ein Symbol, rechts oben eine Meldung:

- **Fehldruck** (⚠️): Spaghetti, abgelöstes oder verzogenes Teil. Hingehen und auf den Drucker klicken, um das Bett freizuräumen – das Filament ist verloren. Das Risiko steht vor dem Start im Druckermenü: Höhere Geschwindigkeit, **ABS ohne Gehäuse** (A1, A1 mini) und **feuchtes Filament** machen Fehldrucke wahrscheinlicher, „Leise“ halbiert das Risiko.
- **Verstopfte Düse** (🪡): Fünfmal auf den Drucker klicken, um sie freizustechen.
- **Filament leer** (🧵): Der Drucker hält an, bis du eine Spule in derselben Sorte und Farbe einlegst – dann druckt er von selbst weiter. Das **AMS** wechselt automatisch auf ein anderes Fach mit derselben Spule.
- **Düsenverschleiß** (🔧): Jede Düse hält rund 48 Druckstunden, schnelle Stufen nutzen sie stärker ab. Den Zustand zeigt das Druckermenü. Ab 75 % gibt es mehr Fehldrucke, bei 100 % startet kein neuer Druck. **Ersatzdüsen** gibt es im Filament-Shop, sie landen direkt im Ersatzteilregal. Düse aus dem Regal nehmen und auf den Drucker klicken – das hilft auch bei einer verstopften Düse.
- **X2D, X1E, H2D und H2D Pro mit zwei Düsen** (🔀): Die beiden Düsen teilen sich die Arbeit und verschleißen nur halb so schnell. Verstopft eine mitten im Druck, druckt die zweite weiter (ein zweifarbiger Druck dann mit Farbwechsel, also langsamer) – vor dem nächsten Druck musst du sie trotzdem freistechen. Ihre **KI-Kamera** erkennt Spaghetti und abgelöste Teile früh und stoppt sofort, so bleibt die Hälfte des Filaments auf der Spule. In der **Drucker-Cam** ist ihr Bild gestochen scharf.
- **H2C mit Düsenwechsler** (🔀): Verstopft eine Düse, holt sich der Kopf einfach eine andere aus dem Wechsler und druckt weiter – auch beim zweiten Mal. Freistechen musst du trotzdem. Die 8 Düsen teilen sich den Verschleiß. KI-Kamera wie beim X2D und H2D.
- **LED-Leiste (H2C):** Unten am Sockel leuchtet eine LED-Leiste, ab Werk lila. Im **Druckermenü** stellst du die Farbe um: Lila, Blau, Orange, Grün, Rot oder Weiß.
- **Feuchtes Filament** (💧): Spulen im Regal ziehen mit der Zeit Feuchtigkeit, im AMS langsamer. Der **Filament-Trockenschrank** aus dem Filament-Shop hält das Regal trocken und trocknet feuchte Spulen wieder.

### Regale am Druckertisch

Im **Drucker-Shop** unter **Einrichtung** gibt es zwei Regale. Sie kommen wie Drucker als Karton in den Abstellraum und werden **in die Lücken zwischen den Druckern** gestellt (3 Regalplätze pro Drucktisch) – die Druckerplätze bleiben frei.

- **Filament-Regal** (8 Spulen): Spulen in der Hand aufs Regal klicken legt sie ab, auf eine Spule zielen nimmt genau diese. So hast du die nächsten Farben direkt neben den Druckern.
- **Ersatzteilregal** (12 Ersatzdüsen): Gekaufte Ersatzdüsen landen hier. Klick nimmt eine Düse in die Hand.
- Ein **leeres** Regal kannst du wieder aufheben und woanders hinstellen.

### Ausstellungsregal und Licht aus

- **Ausstellungsregal** (79 €, ebenfalls unter **Einrichtung**): Es kommt als Karton in den Abstellraum. Trägst du es in die Halle, zeigen grüne Vorschauen die **4 Plätze an der Südwand** (rechts neben der Lagertür). Klick auf eine Vorschau stellt es auf.
- **Ausstellen:** Ziel auf ein freies Fach. Der Hinweis zeigt, welches deiner fertigen Teile hineinkommt, das **Mausrad** wählt ein anderes, Klick stellt es hin. Klick auf ein ausgestelltes Teil nimmt es zurück zu deinen fertigen Teilen. 12 Fächer auf 4 Ebenen; große Teile wie die Vase werden etwas verkleinert. Ein leeres Regal hebst du am Sockel oder an der Deckplatte wieder auf.
- **Licht aus:** Neben der Lagertür hängt ein **Lichtschalter**. Klick schaltet die Deckenleuchten der Halle aus – dann leuchten Drucke und Spulen aus **PLA Glow** im Dunkeln. Ein kleines oranges Licht am Schalter zeigt ihn im Dunkeln. Lager, Büro und Empfang bleiben hell.

### Laser R1 und Holzshop

Neben Druckern gibt es einen Laser: den **Bambu Lab R1** (600 €) aus der PC-App **Holzshop**. Er kommt als Karton und steht auf dem Druckertisch wie ein Drucker. Statt Filament bearbeitet er **Holzplatten** (300 × 200 mm), die es ebenfalls im Holzshop gibt: Pappel (4 €), Birke (6 €) und Walnuss (9 €). Gekaufte Platten liegen auf der **Holzpalette** an der Rückwand des Abstellraums, bis zu 30 Stück.

1. **Platte holen:** Im Abstellraum auf den Stapel der gewünschten Holzart klicken – du hast die Platte in der Hand (`Q` legt sie zurück).
2. **Einlegen:** Auf den R1 klicken. Liegt schon eine Platte drin, tauschst du sie.
3. **Lasern:** Am PC im **Druckermenü** wählst du, was der Laser machen soll:
   - **Holzschild mit Gravur:** Du tippst einen **eigenen Text** ein (bis 24 Zeichen), der mit Rahmen eingraviert wird.
   - **Holzbild mit Logo:** Ein Motiv – Stern, Herz, Katze oder Zahnrad – wird groß eingraviert.
   - **Ausgeschnittene Holzfiguren:** Das Motiv wird **6-mal ausgeschnitten** – eine Platte gibt 6 Figuren.
   
   Eine Vorschau zeigt die Platte genau so, wie sie wird. Dann **Lasern starten**.
4. **Zuschauen:** Durch das orange Laserschutzfenster siehst du den blauen Strahl. Wie bei einem echten Laser fährt der Kopf erst alle **Außenkonturen** ab, dann die **Innenkonturen** (Innenkante des Rahmens, Löcher in Buchstaben) und füllt beim Gravieren zuletzt die Flächen Zeile für Zeile – nur dort, wo eingebrannt wird. Dazwischen fährt er mit ausgeschaltetem Strahl schnell hinüber. Beim Schneiden kommen erst alle Außenumrisse, dann die Löcher.
5. **Entnehmen:** Fertige Teile per Klick auf den R1 oder im Druckermenü entnehmen – das machen auch die Azubis.

Ab **Level 4** bestellen Kunden auch gelaserte Holzteile (🔥) – Schilder, Holzbilder oder ganze Sätze ausgeschnittener Figuren, in einer bestimmten Holzart oder egal welcher. Der Laser hat keine Pannen und keine Düse.

### Kater Düsentrieb

Der Hallenkater streunt herum, macht Nickerchen und springt gern auf den Druckertisch. Fertige Teile, die zu lange auf dem Drucker liegen, schubst er dabei auch mal auf den Boden – dann einfach aufheben. Streicheln mit Linksklick.

Wer gemein ist: Drucker mit `E` vom Tisch heben und mit `F` werfen. Trifft er den Kater, kippt der um und landet als kleiner Geist im Katzenhimmel 👻 – nach 20 Sekunden läuft ein neuer Kater zu. Der geworfene Drucker bleibt auf dem Boden liegen und lässt sich mit Linksklick wieder aufheben (Spulen und fertige Teile sind noch drin).

Mit der App **Drucker-Cam** schaust du deinen Druckern live beim Drucken zu – wie mit der Kamera im echten Gerät. Außerdem gibt es am PC **Notizen** (z. B. für die Einkaufsliste) und einen **Rechner**.

Für die Pause zwischendurch: **Snake** (Filament-Snake). Die Schlange frisst Filamentspulen, jedes neue Stück hat die
Farbe der gefressenen Spule, und mit jeder Spule wird sie etwas schneller. Steuern mit **Pfeiltasten** oder **WASD**,
**Leertaste** startet und pausiert. Auf Tablet und Handy übers Spielfeld **wischen** oder das Steuerkreuz darunter
nutzen, Antippen startet und pausiert. Der Rekord bleibt im Browser gespeichert; schließt du das Fenster, pausiert
die Runde.

Oben links siehst du dein Level mit XP-Balken, deinen Kontostand, die Spieluhr, Miete + Strom pro Stunde und wie viele Aufträge offen sind. Spielzeit: 1 echte Sekunde entspricht 20 Sekunden im Spiel.

## Draußen

In der Westwand der Halle führt die Tür **EMPFANG** in den hellen Eingangsbereich. Von dort öffnet sich die gläserne Schiebetür von selbst, sobald du davorstehst, und du kommst nach draußen:

- **Garten:** Terrasse, Kiesweg mit Blumenbeeten und Gartenleuchten, Bäume, Büsche entlang der Fassade und eine Bank. Über der Tür hängt das Firmenschild.
- **Straße:** Auf dem Gehweg vor der Hecke gehen Passanten spazieren, einer joggt. Steht man im Weg, weichen sie aus, manche winken. Auf der Fahrbahn fahren Autos in beide Richtungen, gegenüber stehen Wohnhäuser.
- Auf die Fahrbahn kommst du nicht, und die Nachbargrundstücke sind durch Hecken getrennt.

## Personal

In der PC-App **Personal** stellst du Azubis ein (50 € einmalig, dann 2 € Lohn pro Spielstunde, höchstens 2). Sie kommen durch die Lagertür, laufen über den Gang neben den Drucktischen und kümmern sich selbst um:

1. Fehldrucke wegräumen und denselben Druck (Teil, Anzahl, Farben) gleich neu starten – ist die Düse verstopft, erst nach dem Freistechen. Geht der Neustart gar nicht (z. B. Düse verschlissen, Filament reicht nicht), gibt es eine Meldung.
2. Verstopfte Düsen freistechen
3. Fertige Teile abnehmen
4. Neues Filament aus dem Lager holen, wenn ein Drucker darauf wartet
5. Teile aufheben, die der Kater vom Tisch geworfen hat
6. Den Mülleimer mit dem Spülabfall leeren (ab 70 g – ist er voll und der Drucker wartet, zuerst)
7. Fertige Aufträge verpacken und ins Abholregal am Empfang bringen (sie tragen das Paket sichtbar durch die Halle)

Ohne Arbeit gehen sie in ihr **Büro** hinter der Ostwand (Tür mit dem Schild „BÜRO“ – sie geht auf, sobald du den ersten Azubi einstellst). Dort sitzen sie abwechselnd an der Werkbank mit Übungsdruckern, Ersatzteilen und Filament oder auf der Couch und zocken Kart-Rennen auf der Konsole. Fällt Arbeit an, springen sie sofort auf. Zielst du auf einen Azubi, siehst du, was er gerade tut. Entlassen geht in derselben App.

**Empfangskraft:** In derselben App stellst du auch jemanden für den Empfang ein (80 € einmalig, dann 3 € Lohn pro Spielstunde, eine Stelle). Nina oder Jan steht dann hinter dem Tresen am Bildschirm, winkt jedem Kunden zu, der zum Abgeben kommt, tippt den Auftrag kurz ein und nimmt ihn an – du musst nicht mehr selbst zum Tresen laufen (schneller geht es trotzdem per Linksklick). Holt ein Kunde sein Paket ab, dreht sie sich zu ihm und kassiert.

Die Azubis sind echte animierte Menschen: Lea, Sophie und Aylin sind Frauen, Kevin, Mehmet und Finn Männer, und jeder sieht anders aus. Sie laufen in ihrem eigenen Tempo, drehen sich weich um, hantieren mit den Händen am Drucker, tragen Spulen vor dem Bauch, sitzen auf Stuhl und Couch und halten beim Zocken den Controller.

## Halle ausbauen

Platz kostet Geld – Tische und Regalebenen kauft man in der PC-App **Ausbau**:

- **Drucktische:** Am Anfang hast du einen Tisch mit 4 Druckerplätzen und 3 Regalplätzen dazwischen. Weitere Tische (150 €, 400 €, 900 €) kaufst du in der App **Ausbau** oder direkt in der Halle: Wo der nächste Tisch hinkommt, ist eine gelbe Markierung auf dem Boden – anklicken und kaufen. Der Tisch wird geliefert (blaue Markierung, eine Minute); danach wird die Markierung grün und ein Klick darauf stellt den Tisch auf.
- **Regalebenen:** Im Abstellraum gibt es erst eine Ebene für 20 Spulen. Weitere Ebenen (60 €, 150 €, 300 €) gibt es ebenfalls in der App **Ausbau**; sie werden nach der Lieferung automatisch eingebaut.
- **Lieferzeit:** Alles, was als Paket kommt – Drucker, Regale, Tische, Regalebenen – ist nach dem Kauf **eine Minute** unterwegs. Im Druckermenü und in der App **Ausbau** siehst du die Restzeit, bei Ankunft gibt es eine Meldung.

## Speichern, Level und Grafik

- **Speichern:** Das Spiel speichert automatisch alle 10 Sekunden, beim Pausieren und beim Schließen des Tabs (unten rechts blinkt „💾 Gespeichert“). Beim nächsten Start steht im Titelbildschirm **Weiterspielen**. **Neues Spiel** löscht den Spielstand.
- **Erfolge:** Die App **Erfolge** am PC zeigt freigeschaltete Erfolge (erstes Benchy, erste Spaghetti, Katzenmensch …) und Statistiken.
- **Ton:** Drucker surren je nach Tempo ihres Druckkopfs – tief beim langsamen Drucken, höher bei schnellen Stufen, Leerfahrten und Düsenwechseln –, piepen bei fertig oder Fehler, der Kater miaut und schnurrt. `M` schaltet den Ton aus.
- **Level:** Jeder gelieferte Auftrag bringt XP (1 XP pro Euro). Mit jedem Level gibt es einen neuen Titel – vom *Bastler* bis zur *Legende des Filaments* –, 10 % mehr Lohn pro Auftrag und nach und nach mehr Aufträge gleichzeitig.
- **Grafik:** Im Titelbildschirm zwischen **Hoch** (mit Umgebungsverdeckung und Schatten der Deckenlampen), **Mittel** und **Niedrig** wählen. „Niedrig“ rechnet mit weniger Pixeln, ohne Nachbearbeitung und mit einfacheren Schatten – für Laptops und schwächere Rechner. Schafft der Rechner keine flüssigen 45 Bilder pro Sekunde, senkt das Spiel die Auflösung von selbst ein Stück (und hebt sie wieder, wenn Luft ist). `F3` zeigt, wie schnell es gerade läuft.
- **Alte Spielstände** werden übernommen. Fertige Teile von früher bekommen dabei Weiß als Farbe, weil die Farbe damals nicht gespeichert wurde.

## Probleme?

| Problem | Lösung |
|---|---|
| Schwarzes Bild oder leere Seite | Seite über `http://localhost:8080` öffnen, nicht per Doppelklick. Browser-Konsole (F12) auf Fehler prüfen. |
| `serve.ps1` startet nicht („Ausführung von Skripts ist deaktiviert“) | Den Befehl genau wie oben mit `-ExecutionPolicy Bypass` aufrufen. |
| „Port bereits belegt“ | Anderen Port nehmen: `.\serve.ps1 -Port 8090` und dann `http://localhost:8090` öffnen. |
| Maus lässt sich nicht einfangen | Einmal ins Bild klicken. Nach `Esc` lässt der Browser die Maus manchmal erst nach einem weiteren Klick wieder einfangen. |
| Spielstand ist nach Neuladen weg | Gespeichert wird im Browser (localStorage). Im privaten Fenster oder nach dem Löschen der Browserdaten ist er weg. |
| Spiel ruckelt | Im Titelbildschirm die Grafik auf **Mittel** oder **Niedrig** stellen. Mit `F3` sieht man Bilder pro Sekunde und Draw Calls. |
| Starkes Ruckeln, Bewegung kommt Sekunden später | Der Browser rendert vermutlich ohne Grafikkarte (der Titelbildschirm warnt dann rot). In den Browser-Einstellungen unter System **„Grafikbeschleunigung verwenden, wenn verfügbar“** einschalten und den Browser neu starten. Prüfen lässt es sich unter `chrome://gpu` bzw. `edge://gpu` (WebGL: „Hardware accelerated“). Bei Laptops mit zwei Grafikkarten in Windows unter Einstellungen → System → Anzeige → Grafik den Browser auf **Hohe Leistung** stellen. |

## Projektaufbau

```
index.html          Einstieg, Import-Map für Three.js
css/style.css       HUD, Shop- und Menüfenster
serve.ps1           Lokaler Webserver für Windows
assets/people/      Menschenfiguren als GLB (Quaternius), auf die nötigen Animationen gekürzt
.github/workflows/  pages.yml: veröffentlicht main automatisch auf GitHub Pages
src/
  main.js           Verdrahtet alles: Szene, Steuerung, Spielschleife
  core/             Spiellogik, ohne Three.js und ohne DOM
    catalog.js        Drucker (mit technischen Daten), Bambu-Filamentsorten und -farben, Druckvorlagen mit Preisen und Werten
    economy.js        Geld, Kosten, Besitz, Drucke, Pannen, Feuchte, Düsenverschleiß
    orders.js         Kundenaufträge: Farben, Eilaufträge, Sterne, Fristen, Stufen (am Empfang, angenommen, im Regal)
    reception.js      Empfang: annehmen, ins Abholregal packen (feste Fächer), abholen und bezahlen
    two-color.js      Zwei- und mehrfarbige Drucke: Farbfächer, Dual-Nozzle gegen Farbwechsel mit einer Düse
    laser.js          Laser R1: Holzplatte im Gerät, Laseraufträge (Text, Logo, Ausschneiden)
    progress.js       Level, XP und Titel
    achievements.js   Erfolge und Statistik
    upgrades.js       Ausbau: Drucktische, Regalebenen
    staff.js          Personal: Einstellen, Lohn, welche Aufgaben es gibt und was sie bewirken
    game-clock.js     Spieluhr mit Tagen und Stunden, meldet jede volle Stunde für die Abrechnung
    snake.js          Mini-Spiel Snake: Raster, Schlange, Spulen als Futter, Tempo
    display-shelf.js  Ausstellungsregal: Wandplätze, Teile ausstellen und zurücknehmen
    save.js           Spielstand in localStorage, Autospeichern, Umwandlung alter Stände
  world/            3D-Szene und Spielfigur
    room.js           Halle mit Boden, Wänden, Fenstern, Licht
    hall.js           Kaufbare Drucktische mit Bodenmarkierung
    hall-lights.js    Lichtschalter der Halle: Deckenleuchten aus, Raum dunkel, Glow-Filament leuchtet
    display-wall.js   Ausstellungsregale an der Südwand: Aufstellen, Teile ausstellen (Mausrad wählt), zurücknehmen
    workshop.js       Drucktische: Aufstellen, Einlegen, Druck-Animation, Pannen, Statussymbole
    tool-changer.js   Düsenwechsel des H2C: Kopf fährt zum Wechsler, legt Düse ab, holt die nächste
    purge.js          Farbwechsel mit einer Düse: Kopf fährt zum Spültrichter, spült aus, streift ab, druckt weiter
    laser.js          Laser R1: Holzplatte mit Gravur bzw. Schnittlinien, Laserkopf und Strahl
    storage-room.js   Abstellraum mit Regal, Holzpalette und Lieferzone
    entrance.js       Eingangsbereich hinter der Westwand mit automatischer Glas-Schiebetür
    outdoor.js        Fassaden und Dach, Garten, Straße mit Gehwegen, Häuser, Autos, Himmel
    pedestrians.js    Passanten auf den Gehwegen
    reception.js      Einrichtung des Empfangs: Tresen, Wartestühle, Abholregal mit Paketen, Klick-Aktionen
    customers.js      Kunden als Figuren: kommen zum Tresen, warten, holen Pakete ab und zahlen
    office.js         Büro der Azubis: Werkbank, Couch, Fernseher mit Konsole
    carry.js          Was der Spieler trägt: ein Karton, bis zu 5 Spulen, eine Düse oder eine Holzplatte
    cat.js            Kater Düsentrieb
    throwing.js       Drucker werfen: Flugbahn, Aufprall, Treffer, Drucker auf dem Boden
    receptionist.js   Empfangskraft hinter dem Tresen: begrüßt Kunden, nimmt Aufträge an, kassiert
    workers.js        Azubis als Figuren: Laufwege durch Halle, Lager und Büro, Arbeiten, Spule tragen, Sitzen, Zocken
    interaction.js    Linksklick-Interaktion per Strahl aus der Bildmitte
    room-culling.js   Halle, Anbauten und Außenbereich nur zeichnen, wenn man hineinsehen kann
    collision.js      Kollision der Spielfigur
    graphics.js       Tone-Mapping, Spiegelungen, Bloom, Umgebungsverdeckung, Staub, Schatten, automatische Auflösung
    util.js           Kleine 3D-Helfer (Schatten)
  models/           Reine 3D-Modelle, ohne Spiellogik
    printer-model.js, printer-parts.js   Drucker
    nozzle-changer.js Düsenwechsler des H2C: Wechselkopf, Düsenhalter, LED-Leiste
    laser-model.js    Laser R1: Gehäuse mit Laserschutzfenster, Wabenbett, Laserkopf
    laser-art.js      Was der Laser auf die Platte bringt: Motive, Text, Gravurzeilen, Schnittbahn
    printer-box.js    Lieferkarton
    print-shapes.js   Formen der Druckvorlagen
    spool.js          Filamentspule, Aussehen je Sorte (matt, Seidenglanz, leuchtend – im Dunkeln heller –, durchscheinend), ganze Regale als Instanzen
    furniture.js      Regale am Drucktisch, Ausstellungsregal und Ersatzdüse
    peripherals.js    Tastatur, Maus, Mauspad, Kabel
    office-furniture.js  Büromöbel: Werkbank, Bürostuhl, Couch, Lowboard, Fernseher, Konsole, Controller, Pflanze
    merge-static.js   Unbewegliche Einzelteile pro Material zu einem Mesh verschmelzen (weniger Draw Calls)
    people.js         Menschenfiguren laden, Animationen abspielen, Sitzen/Tragen/Controller über die Knochen
    reception-furniture.js  Tresen, Wartestuhl, Abholregal, Paket mit Etikett
    outdoor-props.js  Auto, Wohnhaus, Bank, Laternen, Briefkasten, Himmel; Bäume, Büsche und Blumen als Instanzen
  ui/               HTML-Overlays und PC-Apps
    hud.js            HUD, Level-Up-Banner, Meldungen, Erfolge
    touch-controls.js Tablet-Steuerung: Joystick, Umschauen per Wischen, Antippen, Knöpfe; gewähltes Gerät
    title-screen.js   Titel-, Pausen- und Game-Over-Bildschirm, Geräteabfrage (PC oder Tablet)
    shop.js           PC-Desktop mit Apps (Shops inkl. Holzshop), Taskleiste und Mauszeiger
    desktop.js        Bildschirm und App-Symbole
    printer-menu.js · orders-menu.js · upgrades-menu.js · staff-menu.js   Apps Druckermenü, Aufträge, Ausbau, Personal
    printer-cam.js    App Drucker-Cam
    printer-preview.js  Produktbilder der Drucker für den Shop
    pc-apps.js        Notizen und Rechner
    snake-app.js      PC-App Snake: Spielfeld zeichnen, Tasten, Wischen, Steuerkreuz, Rekord
    perf-overlay.js   Leistungsanzeige (F3); mit ?perf in der Adresse offen und mit Ausgabe in der Konsole
  audio/
    sound.js          Geräusche per WebAudio (ohne Audiodateien)
```

Technik: [Three.js](https://threejs.org/) 0.169 als ES-Module direkt im Browser, ohne npm und ohne Build-Tools.

Menschenfiguren: [Quaternius](https://quaternius.com) – „Ultimate Modular Men Pack“ und „Ultimate Modular Women Pack“ über [Poly Pizza](https://poly.pizza), CC0. Ausnahmen mit Namensnennung (CC-BY 3.0): „Worker“ (`worker-woman.glb`, https://poly.pizza/m/E8079Ahx7k) und „Suit“ (`suit-woman.glb`, https://poly.pizza/m/sOUciDsoVV) von Quaternius.

Filament-Farbwerte: [Open Filament Database](https://github.com/OpenFilamentCollective/open-filament-database) (© 2025 OpenFilamentCollective, MIT-Lizenz). Preise: Stand Oktober 2026 bei 3DJake.de, Silk+, Translucent und die ABS-Spule geschätzt.
