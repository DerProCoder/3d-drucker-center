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
| Mausrad | Zoomen von 0,5× bis 10× (die Stufe blendet sich dabei kurz neben dem Fadenkreuz ein) – praktisch für die Ports hinten im Serverschrank. Bei mehreren Spulen in der Hand bzw. am Ausstellungsregal wählt das Rad stattdessen die Spule bzw. das Teil; mit gedrückter Umschalttaste zoomt es immer |
| Mittlere Maustaste | Zoom zurück auf 1× |
| E | Aufgestellten Drucker hochheben (nicht während er druckt) |
| F | Getragenen Drucker oder Druckerkarton werfen |
| Q | Alles in der Hand zurück ins Lager legen |
| M | Ton an/aus |
| F3 | Leistungsanzeige: Bilder pro Sekunde, Bildzeit, Draw Calls, Auflösung |
| Esc | Pause / PC verlassen (danach einmal klicken, um weiterzuspielen) |

Unter dem Fadenkreuz steht immer, was ein Linksklick gerade bewirkt.

**Festplatten der NAS tauschen:** Glastür des Schranks öffnen und mit leeren Händen vorn auf einen Schacht der NAS zielen. Ein grüner Rahmen heißt: Klick setzt die größte Platte aus dem Teilelager ein. Ein gelber Rahmen heißt: Klick nimmt die Platte heraus (heil zurück ins Teilelager, defekt wird entsorgt). Ein roter Rahmen nennt den Grund, z. B. keine Platte im Lager oder vermietete Daten. Defekte Platten leuchten rot. RAM tauscht man an der Werkbank.

### Tablet

| Geste / Knopf | Aktion |
|---|---|
| Linke Bildschirmhälfte: Daumen aufsetzen und ziehen | Laufen – der Joystick erscheint dort, wo du aufsetzt; halb gezogen ist halbes Tempo |
| Rechte Bildschirmhälfte: wischen | Umschauen |
| Antippen | Das angetippte Objekt benutzen – wie ein Linksklick darauf: Spule nehmen, in Drucker oder AMS legen, Holzplatte nehmen, Drucker abstellen, PC öffnen … |
| ✋ Aufheben | Den Drucker im Fadenkreuz vom Tisch hochheben (erscheint nur, wenn du auf einen zielst) |
| 🤾 Werfen | Getragenen Drucker oder Karton werfen (erscheint nur, wenn du einen trägst) |
| ↩ Ins Lager | Alles in der Hand zurück ins Lager legen |
| 🔄 Spule | Bei mehreren Spulen in der Hand: nächste wählen · am Ausstellungsregal: anderes Teil wählen |
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
3. **Abholen:** Alles wird in den **Abstellraum** geliefert – die Tür mit dem Schild „LAGER“ liegt hinter dir, wenn das Spiel startet. Drucker stehen als Karton in der gelben Lieferzone, Spulen liegen im Regal. Die Lieferzone hat 4 Plätze; weitere Kartons werden darauf gestapelt (5–8 auf die ersten vier und so weiter), bis die Stapel an die Decke stoßen. Hast du einen Keller, landen weitere Lieferungen dann automatisch im **Keller-Lager** („📦 Abstellraum voll – Lieferung liegt im Keller-Lager“, siehe unten); sind beide voll (oder gibt es noch keinen Keller), zeigt der Shop „Abstellraum voll“ bzw. „Abstellraum und Keller-Lager voll“. Hohe Kartons wie der große 42-HE-Schrank passen nur auf den Boden, davon gehen also höchstens 4 hinein. Du kannst bis zu **5 Spulen** auf einmal tragen; unten in der Mitte steht, wie viele du in der Hand hast und wie viele noch passen.
4. **Aufstellen:** Karton anklicken, zum Druckertisch tragen, auf den Tisch schauen (eine grüne Vorschau zeigt den Platz) und klicken.
5. **Filament einlegen:** Spule im Regal nehmen und auf den Drucker klicken (mit mehreren Spulen in der Hand wählt das Mausrad aus, welche) – so füllst du ein AMS in einem Gang. A1, A1 mini und A2L haben einen Spulenhalter für eine Spule, P1P, P1S, P2S, X1 Carbon, X2D und H2D ein **AMS** auf dem Dach mit 4 Fächern – so kannst du vier Farben gleichzeitig bereithalten. Der H2C hat zwei AMS übereinander, also 8 Fächer. Nicht jeder Drucker kann jedes Material drucken – der Hinweis unter dem Fadenkreuz sagt es dir.
6. **Drucken:** Am PC die App **Druckermenü** öffnen. Links stehen alle Drucker mit Status, Fortschritt und Restzeit (in echter Zeit); ein Klick zeigt rechts die Details. Dort die Druckvorlage aus der Bildergalerie und die Geschwindigkeit wählen – bei AMS-Druckern auch das Fach, aus dem gedruckt wird – und den Druck starten. Das Teil entsteht Schicht für Schicht auf dem Drucker: In jeder Schicht fährt die Düse erst die Außenwände ab und füllt dann das Innere mit einem **schrägen Gitter** (Rauten unter 45°, 10 mm Linienabstand). Unterseite und Oberseite – auch Absätze mitten im Teil, etwa der Sockel des Handyhalters – druckt sie geschlossen: dichte schräge Bahnen hin und her, Lage für Lage abwechselnd nach links und rechts. Alles Linie für Linie, immer zur nächstgelegenen, mit schnellen Leerfahrten dazwischen. Schaust du von oben in das halbfertige Teil, siehst du die Gitterwände im Inneren Schicht für Schicht mitwachsen; ist das Teil fertig, ist es außen geschlossen. Unter **Anzahl auf der Platte** druckst du mehrere Teile auf einmal – so viele, wie mit etwas Abstand auf die Druckplatte passen (z. B. 15 Schlüsselanhänger auf dem A1 mini). Jedes weitere Teil braucht nur 90 % der Zeit, aber ein Fehldruck ruiniert die ganze Platte.
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
- **Feuchtes Filament** (💧): Spulen im Regal ziehen mit der Zeit Feuchtigkeit, im AMS langsamer. Der **Filament-Trockenschrank** aus dem Filament-Shop hält das Regal trocken und trocknet feuchte Spulen wieder. In Filament-Regalen im **Keller-Lager** ziehen Spulen gar keine Feuchtigkeit (schon feuchte werden dort aber nicht wieder trocken – das kann nur der Trockenschrank).

### Regale am Druckertisch

Im **Drucker-Shop** unter **Einrichtung** gibt es drei Regale. Sie kommen wie Drucker als Karton in den Abstellraum und werden **in die Lücken zwischen den Druckern** gestellt (3 Regalplätze pro Drucktisch) – die Druckerplätze bleiben frei.

- **Filament-Regal** (8 Spulen): Spulen in der Hand aufs Regal klicken legt sie ab, auf eine Spule zielen nimmt genau diese. So hast du die nächsten Farben direkt neben den Druckern.
- **Ersatzteilregal** (12 Ersatzdüsen): Gekaufte Ersatzdüsen landen hier. Klick nimmt eine Düse in die Hand.
- **Holzregal** (10 Holzplatten): Ein Plattenständer, in dem die Platten hochkant stehen – praktisch direkt neben dem Laser R1. Mit einer Platte in der Hand aufs Regal klicken stellt sie hinein, ein Klick auf eine Platte nimmt genau diese.
- Ein **leeres** Regal kannst du wieder aufheben und woanders hinstellen.

### Ausstellungsregal und Licht aus

- **Ausstellungsregal** (79 €, ebenfalls unter **Einrichtung**): Es kommt als Karton in den Abstellraum. Trägst du es in die Halle, zeigen grüne Vorschauen die **4 Plätze an der Südwand** (rechts neben der Lagertür). Klick auf eine Vorschau stellt es auf.
- **Ausstellen:** Ziel auf ein freies Fach. Der Hinweis zeigt, welches deiner fertigen Teile hineinkommt, das **Mausrad** wählt ein anderes, Klick stellt es hin. Klick auf ein ausgestelltes Teil nimmt es zurück zu deinen fertigen Teilen. 12 Fächer auf 4 Ebenen; große Teile wie die Vase werden etwas verkleinert. Ein leeres Regal hebst du am Sockel oder an der Deckplatte wieder auf.
- **Licht aus:** Neben der Lagertür hängt ein **Lichtschalter**. Klick schaltet die Deckenleuchten der Halle aus – dann leuchten Drucke und Spulen aus **PLA Glow** im Dunkeln. Ein kleines oranges Licht am Schalter zeigt ihn im Dunkeln. Lager, Büro und Empfang bleiben hell.

### Laser R1 und Holzshop

Neben Druckern gibt es einen Laser: den **Bambu Lab R1** (600 €) aus der PC-App **Holzshop**. Er kommt als Karton und steht auf dem Druckertisch wie ein Drucker. Statt Filament bearbeitet er **Holzplatten** (300 × 200 mm), die es ebenfalls im Holzshop gibt: Pappel (4 €), Birke (6 €) und Walnuss (9 €). Gekaufte Platten liegen auf der **Holzpalette** an der Rückwand des Abstellraums, bis zu 30 Stück.

1. **Platten holen:** Im Abstellraum auf den Stapel der gewünschten Holzart klicken – jeder Klick nimmt eine Platte, **bis zu 5** auf einmal, auch gemischt (`Q` legt alle zurück). Ein Holzregal am Druckertisch nimmt alle mit einem Klick auf.
2. **Einlegen:** Auf den R1 klicken – die oberste Platte aus der Hand kommt hinein. Liegt schon eine Platte drin, tauschst du sie.
3. **Lasern:** Am PC im **Druckermenü** wählst du, was der Laser machen soll:
   - **Holzschild mit Gravur:** Du tippst einen **eigenen Text** ein (bis 24 Zeichen), der mit Rahmen eingraviert wird.
   - **Holzbild mit Logo:** Ein Motiv – Stern, Herz, Katze oder Zahnrad – wird groß eingraviert.
   - **Ausgeschnittene Holzfiguren:** Das Motiv wird **6-mal ausgeschnitten** – eine Platte gibt 6 Figuren.
   
   Eine Vorschau zeigt die Platte genau so, wie sie wird. Dann **Lasern starten**.
4. **Zuschauen:** Durch das orange Laserschutzfenster siehst du den blauen Strahl. Wie bei einem echten Laser fährt der Kopf erst alle **Außenkonturen** ab, dann die **Innenkonturen** (Innenkante des Rahmens, Löcher in Buchstaben) und füllt beim Gravieren zuletzt die Flächen Zeile für Zeile – nur dort, wo eingebrannt wird. Dazwischen fährt er mit ausgeschaltetem Strahl schnell hinüber. Konturen fährt er mit **15 %**, die Füllung mit **35 %** und Leerfahrten mit voller Geschwindigkeit. Beim Schneiden kommen erst alle Außenumrisse, dann die Löcher.
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
die Runde. Oben schaltest du zwischen **Survival** (selbst spielen) und **Auto** um. Im Auto-Modus spielt die Schlange von selbst: Sie holt alle Spulen, stirbt nie und hört erst auf, wenn
das ganze Feld voll ist (zählt nicht für den Rekord).

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

## Besuchergruppen

Zwischen **9 und 18 Uhr** kommen Besucher über den ganzen Tag verteilt in kleinen **Grüppchen mit 1–7 Personen** – mal kommt jemand allein, mal zu dritt, mal sieben Leute auf einmal (kleine Grüppchen sind häufiger, manchmal ist eine Familie mit Kindern dabei). Zusammen sind es etwa **40–50 Besucher in 12–15 Grüppchen** am Tag, im Abstand von etwa 10–65 Spielminuten. Es gibt keine Ankündigung; beim ersten Grüppchen des Tages kommt „🚶 Die ersten Besucher sind da“. Höchstens **15 Besucher** sind gleichzeitig unterwegs – ist die Grenze erreicht, kommt das nächste Grüppchen etwas später (Einlass bis 18 Uhr).

- **Kein Führer nötig:** Die Grüppchen gehen allein herum. Die Azubis arbeiten normal weiter, niemand wird für Besucher abgestellt – Besucher kommen auch ganz ohne Personal.
- **Eintritt:** Jedes Grüppchen zahlt am Empfang **15 € pro Person** („🎟️ Eintritt: 3 × 15 € = 45 €“, leise Meldung ohne Ton).
- **Rundgang:** Empfang → Druckhalle → Lager → **Serverraum** (nur, wenn die zweite Etage gebaut ist) → Ausgang. An jeder Station bleiben sie 2–4 Spielminuten stehen. Besucher halten dich nicht auf – sie weichen dir aus, und die Kunden am Tresen werden weiter bedient. Jedes Grüppchen bleibt beisammen und geht rechts, so kommen sich Grüppchen in Türen nicht in die Quere; auf der Treppe wartet ein Grüppchen, bis das entgegenkommende unten bzw. oben ist. Am Empfang stehen sie kurz neben dem Tresen – ist dort kein Platz, warten sie draußen vor der Haustür. Besucher sind nicht anklickbar: Drucker, Tresen und Schränke bleiben auch hinter ihnen bedienbar.
- **Bewertung:** Jedes Grüppchen bewertet beim Gehen mit 1–5 ★ („⭐ 3 Besucher: ★★★★☆ · +3 XP“). In der Druckhalle zählt, wie viele Drucker gerade drucken; Fehldrucke, verstopfte Düsen, volle Mülleimer und Teile auf dem Boden geben Abzug. Im Serverraum zählt, wie viele Server online sind; defekte, eingefrorene und heiße Geräte (über 60 °C) geben Abzug. Eine Halle ohne Drucker bzw. ein Serverraum ohne Server zählt neutral. Eine schlechte Bewertung kostet nichts. Die erste 5-Sterne-Bewertung schaltet einen Erfolg frei.
- **XP:** **+1 XP je Person bei 4 ★, +2 XP je Person bei 5 ★** – zusammen höchstens **15 XP pro Tag**.
- **Tagesschnitt:** Beim Tageswechsel gibt es eine Bilanz des Vortags („📊 Besucher an Tag 3: 46 in 14 Grüppchen · 690 € · Ø 4,2 ★“). Die KI-App (Thema Besucher) nennt die Zahlen von heute, den Tagesschnitt und wann die nächsten Besucher kommen.
- **Nie hängen bleiben:** Braucht ein Grüppchen länger als 150 Spielminuten (z. B. weil es irgendwo festhängt), geht es ohne Bewertung – die nächsten kommen trotzdem.
- **Speichern:** Der Tagesplan (wann heute noch wer kommt), die Tagesbilanz und die letzten Bewertungen werden gespeichert. Grüppchen, die beim Speichern gerade unterwegs waren, gelten beim Laden als gegangen (wer schon am Empfang war, hat den Eintritt bezahlt; wer noch auf dem Weg dorthin war, zahlt nichts); die übrigen Besucher des Tages kommen wie geplant. Alte Spielstände mit einer großen Gruppe laden ohne Fehler – die alte Gruppe entfällt, ab dann kommen Grüppchen.

## Halle ausbauen

Platz kostet Geld – Tische, Regalebenen, eine zweite Etage, einen Keller (ausbaubar bis 120 × 120 m) und zwei Fahrstühle kauft man in der PC-App **Ausbau**:

- **Drucktische:** Am Anfang hast du einen Tisch mit 4 Druckerplätzen und 3 Regalplätzen dazwischen. Weitere Tische (150 €, 400 €, 900 €) kaufst du in der App **Ausbau** oder direkt in der Halle: Wo der nächste Tisch hinkommt, ist eine gelbe Markierung auf dem Boden – anklicken und kaufen. Der Tisch wird geliefert (blaue Markierung, eine Minute); danach wird die Markierung grün und ein Klick darauf stellt den Tisch auf.
- **Regalebenen:** Im Abstellraum gibt es erst eine Ebene für 20 Spulen. Weitere Ebenen (60 €, 150 €, 300 €) gibt es ebenfalls in der App **Ausbau**; sie werden nach der Lieferung automatisch eingebaut.
- **Zweite Etage (2.000 €):** Eine ganze Etage über der Halle, genauso groß, erstmal leer. Nach dem Bau führt eine Treppe rechts hinten in der Halle (an der Ostwand) nach oben. Was du in der Hand trägst, nimmst du mit. Von oben kann man nichts werfen.
- **Serverraum (in der zweiten Etage):** In der PC-App **Server-Shop** gibt es Serverschränke (12, 24 und 42 Höheneinheiten), Server in Kategorien (Standard, die gelben **System X** und die sparsamen dunkelblauen **RISC**-Server – je S mit 1 HE und L mit 2 HE; RISC verbraucht weniger Strom, kostet aber mehr – und die grünen **KI-GPU-Server** für die eigene KI, siehe unten), Switches, Firewalls (**Firewall 4 Ports:** 1 × WAN + 3 × LAN, **Firewall 8 Ports:** 1 × WAN + 8 × LAN – daran passen z. B. alle 8 KI-GPU-Server direkt, ohne Switch), Patchpanels und die **Kabelrolle (100 m)**. Alles kommt als Karton in den Abstellraum, Kabel direkt in den Vorrat. Schrank nach oben tragen und an einer grünen Markierung aufstellen; die Schränke haben vorn eine Glastür (Klick öffnet bzw. schließt sie) und sind hinten offen – dort sitzen die Ports der Geräte und hängen die Kabel. Bei offener Tür mit einem Gerätekarton in der Hand auf den Schrank klicken baut das Gerät ein – auf der Höhe, auf die man zielt (ein grüner Rahmen zeigt vorher die Höheneinheiten). Im Schrankfenster lassen sich Geräte mit ▲ / ▼ verschieben, freie Höheneinheiten stehen dort als grüne Lücken. **Verkabeln geht hinten am Schrank:** ersten Port anvisieren und anklicken (er leuchtet gelb), dann den zweiten – ein blaues Kabel verbindet beide und hängt frei. Wer es ordentlich mag, klickt zwischen den beiden Ports einen oder mehrere **Clips** der Kabelführung links und rechts an (sie leuchten gelb, nochmal klicken nimmt einen wieder heraus); dann läuft das Kabel durch diese Clips – zwischen zwei Clips derselben Seite durch alle Clips dazwischen. Jedes Kabel verbraucht so viel von der Rolle, wie es lang ist – im Schrank ca. 0,3–2 m, über das Kabelgitter (siehe unten) deutlich mehr, etwa 5–20 m. Klick auf einen belegten Port (am Gerät oder am Wandkasten) zieht das Kabel ab, das Stück kommt zurück in den Vorrat. Mit leeren Händen öffnet ein Klick auf den Schrank das Schrankfenster mit allen Geräten und wer woran hängt. Ein Server ist **online**, wenn er am Switch (oder direkt am LAN der Firewall) hängt, der Switch am **LAN** der Firewall und der **WAN**-Port der Firewall Internet hat: entweder über ein **Patchpanel**, von dem ein beliebiger Port per Kabel am Wandanschluss hängt (dann gelten alle Ports des Patchpanels als Internet), oder **direkt** am Wandanschluss. Ohne Leitung zur Wand ist ein Server offline – das Schrankfenster nennt den Grund (z. B. „Patchpanel nicht mit dem Internet-Anschluss verbunden“). Gesteckte Kabel aus Spielständen von vor dem Wandanschluss bleiben, die Leitung zur Wand muss man nach dem Laden aber selbst legen. Alle eingebauten Geräte kosten Strom (läuft mit der Stromrechnung).
- **Internet und Kabelgitter:** Internet gibt es nur über den Internet-Anschluss (WAN) an der Westwand zwischen den Reihen A und B (28 Ports „WAN 1…28“, einer je Stellplatz). Kabel zwischen zwei Schränken oder zum Wandanschluss laufen über das Kabelgitter unter der Decke (Felder 1 m × 1 m): ersten Port anklicken (hinten am Gerät oder am Wandkasten, er leuchtet gelb), dann die Gitterfelder anklicken, durch die das Kabel laufen soll (gelber Rahmen; nochmal klicken nimmt ein Feld wieder heraus), zuletzt den Port im anderen Schrank bzw. am Wandkasten. Zwischen zwei angeklickten Feldern läuft das Kabel gerade, erst in Ost-West-, dann in Nord-Süd-Richtung; die Felder über den beiden Schränken bzw. am Wandanschluss gehören automatisch dazu. Über dem Fahrstuhl gibt es kein Gitter – dort mit einem Feld außen herum führen. Ein halb durchsichtiges Kabel zeigt den Weg vorab, der Hinweis nennt die Länge oder warum es nicht geht. Das Kabel ist so lang wie der Weg im Schrank nach oben, hoch zum Gitter, durch die Felder und am Ziel wieder hinunter. So kann z. B. eine Firewall mit Switch in einem Schrank auch Server in den Nachbarschränken versorgen. Im selben Schrank wird weiter über die Clips verkabelt. Ein angefangenes Kabel bricht man mit **Esc** ab (oder per Klick auf den gewählten Port; auch beim Verlassen der Etage).
- **Private Server und Automatik-Reihe:** Hinter der vorderen Kundenreihe stehen Richtung Nordwand zwei weitere Reihen Stellplätze: die **orange umrandete Reihe „PRIVATE SERVER“** (8 Plätze) und dahinter an der Nordwand die **grün umrandete Reihe „AUTOMATIK“** (4 Plätze). Die Markierungen sind immer zu sehen. Schränke stellt man dort genauso auf wie auf den Kundenplätzen, zwischen den Reihen ist ein Gang für Glastür und Rückseite. Private Schränke gehören dir selbst: Die Server darin laufen und kosten Strom wie alle, bringen aber kein Geld und sind **nicht vermietbar** (in der Server-Vermietung ausgegraut mit „privater Server“). Zieht ein vermieteter Server in einen privaten Schrank um, bekommen seine Kunden keinen Dienst mehr: keine Miete, und nach 3 Spielstunden kündigen sie wie bei einem Ausfall. Das Schrankfenster zeigt oben, wo der Schrank steht (z. B. „Reihe A · Platz 3“, „🔒 Privat · Platz 2 · 🤖 Vergabe-Server“ oder „🌡️ Automatik-Platz 1“). Dafür arbeiten sie für dich: Server in der orangen Reihe **vergeben die VM-Anfragen automatisch** (siehe **Automatische Vergabe** unten), Server auf den grünen Automatik-Plätzen regeln das Klima im Serverraum (siehe **Klima-Automatik** unten).
- **Server vermieten:** Geld bringen Server nur über vermietete **VMs**. Sobald die zweite Etage steht und ein Server eingebaut ist, kommen ab und zu Server-Kunden wie Druckkunden zum **Empfang** und wünschen sich eine VM, z. B. „64 GB RAM · 8 Cores“. Sie warten am Tresen, auf einem Stuhl oder auf der Terrasse; die Empfangskraft begrüßt sie, annehmen musst du aber selbst – nicht am Tresen, sondern am PC. Dort zeigt das Symbol **Server-Vermietung** mit einer Zahl, wie viele Anfragen warten. In der App stehen die Anfragen (älteste zuerst) mit Laufzeit des Vertrags und wie lange der Kunde noch wartet (etwa 6 Minuten). Darunter alle eingebauten Server mit freiem RAM, freien Cores und der Miete, die die VM **auf diesem Server** bringt – Server wählen und **Vermieten** klicken (oder die privaten Server machen das, siehe **Automatische Vergabe**). Server, die offline sind oder auf die die VM nicht mehr passt, sind ausgegraut mit Grund. Nach dem Vermieten winkt der Kunde und geht. Mit **Ablehnen** – oder wenn er zu lange wartet – geht er ohne Vertrag. Jeder Server hat **512 GB RAM und 64 Cores**; die VMs darauf dürfen zusammen nicht mehr belegen. Die Modelle unterscheiden sich nur durch den **Mietfaktor**, den Strom und die Höheneinheiten. Miete pro Spielstunde je VM: **(0,05 € × GB + 0,40 € × Cores) × Mietfaktor** – gezahlt zu jeder vollen Spielstunde, solange der Server online ist. Ein Vertrag läuft 12–72 Spielstunden (echt etwa 36 Minuten bis 3,6 Stunden), danach hat der Server wieder Platz. Ist ein Server zu lange am Stück offline (3 Spielstunden, echt etwa 9 Minuten – auch ausgebaut, defekt oder eingefroren), **kündigen** die Kunden darauf. Unten in der App siehst du je Server Balken für RAM und Cores, ob er online ist, die Miete und alle VMs darauf mit Restlaufzeit; ⚠ warnt, wenn eine Kündigung droht. Auch das Schrankfenster zeigt je Server die VMs und die Belegung. Bei jedem Server steht der Stellplatz seines Schranks (z. B. „Reihe A · Platz 3 · HE 5“). Baut man im Schrankfenster einen Server aus, auf dem noch VMs laufen, warnt das Fenster erst und baut ihn beim zweiten Klick aus.
- **Automatische Vergabe:** Baust du einen Server (jedes Modell außer dem KI-GPU-Server) in einen Schrank der **orangen Reihe „PRIVATE SERVER“** ein und bringst ihn online (wie jeden Server, mit Leitung zum Wandanschluss), nimmt er dir das Vermieten ab: Steht ein Server-Kunde am Empfang, kommt „💻 … möchte eine VM mieten – die privaten Server kümmern sich darum“, und etwa eine Spielminute später (echt 3 Sekunden) ist die VM vergeben – „🤖 VM für … automatisch auf … vergeben“, der Kunde winkt und geht. Ein privater Server reicht, mehr machen es nicht schneller; die grüne Automatik-Reihe zählt dafür nicht. Gewählt wird unter allen Servern, auf die die VM passt, zuerst der mit dem **höchsten Mietfaktor** (GPU → RISC → System X → Server → Mini), bei gleichem Faktor der **vollste**, auf den sie noch passt – so bleibt auf leeren Servern Platz für große VMs. Passt sie nirgends, bleibt die Anfrage wartend und du bekommst einmal „⚠️ … passt auf keinen Server – bitte selbst zuweisen“; die Automatik versucht es jede Spielminute weiter, bis Platz frei wird oder der Kunde geht. Selbst vergeben kannst du jederzeit, solange die Automatik noch nicht zugegriffen hat. Ist kein privater Server mehr online, meldet das Spiel „⚠️ Automatische Vergabe gestoppt“, und du vergibst wieder selbst am PC. Oben in der App **Server-Vermietung** steht, ob die Vergabe läuft („🤖 Automatische Vergabe aktiv über <Server>, <Platz>“, „aus“ oder „kein privater Server online“), mit dem Schalter **Automatische Vergabe an/aus** (Standard: an, wird gespeichert). Automatisch vergebene VMs haben in der Liste ein 🤖.
- **KI-GPU-Server und eigene KI:** Im Server-Shop gibt es unter der grünen Serie **KI** den **KI-GPU-Server** (17.000 €, 4 HE, 10 € Strom pro Spielstunde). Er sieht aus wie der GPU-Server, aber mit grüner Front, und wird **nicht vermietet** – in der Server-Vermietung taucht er nicht auf, auch die automatische Vergabe nutzt ihn nicht. Stattdessen rechnet er für deine eigene **KI**. Er braucht wie jeder Server Strom, Netz (Switch/Firewall und Leitung zum Wandanschluss) und Kühlung; wo der Schrank steht (Kunden-, private oder Automatik-Reihe), ist egal. Je mehr KI-GPU-Server **online** sind, desto schlauer ist die KI (Stufe 1–10): 1 Server = Stufe 1, 2–3 = Stufe 2, 4–5 = Stufe 3, 6–7 = Stufe 4, 8–9 = Stufe 5, 10–11 = Stufe 6, 12–13 = Stufe 7, 14–16 = Stufe 8, 17–19 = Stufe 9, ab 20 = Stufe 10 (der Serverraum hat 28 Schrank-Stellplätze, ein 42-HE-Schrank fasst 10 KI-GPU-Server). Offline, defekte, eingefrorene und überhitzte (über 75 °C, die GPUs drosseln) Server zählen nicht. Die KI verdient Geld über das **KI-Abo** der Kunden: zu jeder vollen Spielstunde **online Server × 180 € × Stufenfaktor** (Stufe 1: ×1,0 · 2: ×1,1 · 3: ×1,2 · 4: ×1,35 · 5: ×1,5 · 6: ×1,65 · 7: ×1,8 · 8: ×2,0 · 9: ×2,25 · 10: ×2,5) – z. B. 4 Server auf Stufe 3 bringen 864 € / h, 20 Server auf Stufe 10 bringen 9.000 € / h. Wer Stufe 10 erreicht, bekommt den Erfolg **Superintelligenz**. Ohne KI-GPU-Server online gibt es nichts. Steigt oder fällt die Stufe, meldet das Spiel „🧠 KI ist jetzt Stufe 3“ bzw. „⚠️ KI fällt auf Stufe 2 zurück“. Das Schrankfenster zeigt bei einem laufenden KI-GPU-Server „🧠 rechnet für die KI“, bei einem überhitzten „⚠️ überhitzt – GPUs drosseln – rechnet nicht für die KI“. Der Server-Shop zählt oben vermietbare Server und KI-GPU-Server getrennt („Online: 3 / 4 Server · 🧠 KI: Stufe 2 (2 / 2 KI-GPU-Server)“).
- **App „KI“ (Chat mit der eigenen KI):** Am PC zeigt die App **KI** oben die Stufe (Balken mit 10 Kästchen, „n / 10“), wie viele KI-GPU-Server online sind und was das KI-Abo pro Stunde bringt. Darunter ist ein Chat: Frage eintippen (Enter sendet) oder einen Vorschlag anklicken, z. B. „Wie läuft es?“, „Was soll ich als Nächstes tun?“, „Probleme?“, „Filament?“ oder „Server?“. Die KI ist simuliert – keine echte KI, keine Anfrage ins Internet: Stichwörter in der Frage (Filament, Drucker, Auftrag, Server, Temperatur, Geld, Strom, Miete, Azubi, Besucher, KI, Level, Ausbau …) wählen das Thema, auch mehrere auf einmal, die Zahlen kommen aus deinem Spielstand. Je höher die Stufe, desto genauer die Antwort: **Stufe 1** allgemeine Tipps, **2** dazu Zahlen (Kontostand, Filamentvorrat, Aufträge, Strom pro Stunde), **3** dazu konkrete Probleme („A1 mini (Platz 2) hat kein Filament“, „Server … ist offline – kein Kabel“, „Schrank Reihe A · Platz 1 ist zu heiß“), **4** dazu Empfehlungen (welcher Server zu einer wartenden Mietanfrage passt, welcher Auftrag sich lohnt, welches Filament nachgekauft werden sollte) und **5** dazu eine Prognose (z. B. Kontostand um Mitternacht) und auf Knopfdruck einen kompletten **Lagebericht**. Ab Stufe 6 merkt sich die KI jeden Spieltag (Einnahmen, gelieferte Aufträge, Strom, Kosten, KI-Abo, verdrucktes Filament, XP – wird mitgespeichert): **6** Vergleich mit gestern („Vergleich mit gestern?“), **7** Prognose über mehrere Tage („Prognose für die nächsten Tage?“: „Geld reicht noch …“, „Filament ist übermorgen leer“), **8** Weg zum nächsten Level und zur nächsten KI-Stufe („Wie erreiche ich die nächste Stufe?“ – wie viele KI-GPU-Server fehlen, was sie kosten und bringen), **9** die KI warnt von selbst per Meldung („🧠 KI-Warnung: …“ bei leerem Filament, zu heißen Servern, knappem Geld oder knapper Frist; dieselbe Warnung höchstens alle 2 Spielstunden, „Warnungen?“ zeigt alle aktuellen) und **10** ein ausführlicher Lagebericht mit **Rangliste** der wichtigsten nächsten Schritte („Rangliste?“). Fragt man nach einer Fähigkeit, die erst eine höhere Stufe kann, sagt die KI, ab welcher Stufe und wie viele KI-GPU-Server dafür nötig sind. Versteht sie eine Frage nicht, sagt sie es – mit mehr KI-GPU-Servern wird sie schlauer. Während die KI nachdenkt, steht „KI denkt …“ im Chat, auf hohen Stufen kürzer. Ohne KI-GPU-Server online steht dort „KI offline – kaufe einen KI-GPU-Server im Server-Shop“, und der Chat ist gesperrt. Beim Tippen im Chat bewegt sich die Spielfigur nicht. Der Verlauf bleibt erhalten, solange das Spiel läuft, wird aber nicht gespeichert – nach dem Laden begrüßt dich die KI neu.
- **Temperatur im Serverraum:** Im Schrankfenster stehen oben die Luft im Schrank und zwei Regler für die Schranklüfter: **Zuluft unten** holt kalte Luft von der Klimaanlage (je mehr, desto kälter der ganze Schrank), **Abluft oben** zieht die Abwärme ab. Oben im Schrank wird es am wärmsten. Jedes Gerät (außer Patchpanels) zeigt seine Temperatur und hat einen eigenen Lüfterregler. Gut sind **20–60 °C**. Über 75 °C nimmt ein Gerät Schaden und ist irgendwann **defekt** (bei Servern ein bestimmtes Teil – selbst tauschen oder den Techniker für 30 % vom Kaufpreis rufen). Unter 10 °C **friert es ein** – erst Lüfter herunterdrehen, warten, bis es wieder warm ist, dann neu starten. Defekte oder eingefrorene Geräte arbeiten nicht: Server sind offline, Switches und Firewalls leiten nichts weiter. Viele Server oder der GPU-Server brauchen mehr Lüfter, ein fast leerer Schrank mit allen Lüftern auf 100 % wird zu kalt. Lüfter kosten Strom – auf hoher Stufe überproportional: Ab etwa 75 % kühlen sie deutlich stärker, verbrauchen aber auch deutlich mehr (bei 100 % viermal so viel wie früher, ein Schranklüfter 0,60 € / h, ein Gerätelüfter 0,16 € / h). Dafür bleibt selbst ein 42-HE-Schrank voller GPU-Server mit allen Lüftern auf 100 % unter 45 °C. Alle Lüfter drehen sich sichtbar so schnell, wie sie eingestellt sind – vorn am GPU-Server, hinten an Netzteilen, Switches und Firewalls, im Schrankdach und unten auf dem Sockel; defekte Geräte stehen still.
- **Server aus Bauteilen:** Jeder Server besteht aus Mainboard, Netzteil, 2 CPU-Sockeln, 16 RAM-Steckplätzen (8 je CPU) und 2 Lüftern. Beim Kauf hat er 2 × CPU 32 Cores und 8 × RAM 64 GB (4 je CPU) = **64 Cores / 512 GB**. Mit Teilen aus dem **Teilelager** rüstest du bis **128 Cores / 1024 GB** auf (CPU 10/20/32/64 Cores für 250/450/700/1.300 €, RAM 32/64/128 GB für 90/170/320 €, Mainboard 400 €, Netzteil 150 €, Lüfter 25 €) oder rüstest ab. Abrüsten geht nur so weit, wie die VMs darauf noch Platz haben („Belegt: VMs brauchen 48 Cores“). Ausgebaute Teile kommen ins Teilelager, bestellte Teile kommen gesammelt als ein Paket direkt dorthin. Fehlt ein Pflichtteil (Mainboard, Netzteil, mindestens eine CPU und ein RAM-Riegel, beide Lüfter), ist der Server „unvollständig“ und offline. Der Strom steigt mit den Cores: Strom des Modells × Cores / 64, mindestens die Hälfte. Aufgerüstete Server nehmen größere VMs an (Anfragen dann auch über 64 Cores) und bringen entsprechend mehr Miete. GPU- und KI-GPU-Server lassen sich nicht auf- oder abrüsten, nur defekte Teile tauschen. Überhitzt ein Server, geht ein **bestimmtes Teil** kaputt (meist ein Lüfter, seltener Netzteil, Mainboard, CPU oder RAM; das Schrankfenster zeigt z. B. „Lüfter defekt“). Tauschst du es gegen ein neues, läuft er wieder; das defekte Teil wird entsorgt. Bequemer, aber teurer: **Techniker rufen** im Schrankfenster für 30 % des Kaufpreises.
- **Teile-Shop:** Am PC gibt es die App **Teile-Shop** (erst mit der zweiten Etage). Dort kaufst du CPUs, RAM-Riegel, Mainboards, Netzteile und Lüfter, je Karte mit Menge (− / +). Alles kommt gesammelt als ein Paket nach der Lieferzeit (eine Minute) direkt ins Teilelager, nichts zu tragen. Oben stehen das Teilelager, ein Paket unterwegs und alle Server mit defektem Teil, z. B. ‚Mini-Server Reihe A · Platz 3 · HE 5 – Lüfter defekt‘ mit Knopf ‚Lüfter kaufen‘, und Server, denen ein Pflichtteil fehlt (‚Netzteil fehlt‘ → ‚Netzteil kaufen‘). Liegt das Teil schon im Lager, steht dort ‚✓ im Lager – an der Werkbank tauschen‘.
- **Werkbank:** An der Südwand des Serverraums steht eine **Werkbank** (fest da, sobald die zweite Etage steht). Server im Schrankfenster ausbauen, den Karton aus dem Abstellraum tragen und mit **Linksklick auf die Werkbank legen**. Der Server liegt dort offen: Mainboard, CPUs mit Kühler, RAM-Riegel, Lüfter und Netzteil, ein **defektes Teil leuchtet rot**. Klick auf Werkbank oder Server öffnet das **Werkbank-Menü**: Steckplatz antippen, dann ausbauen (heile Teile ins Teilelager, defekte werden entsorgt) oder ein Teil aus dem Teilelager einbauen bzw. tauschen. Oben stehen die neuen Werte (z. B. **128 Cores / 1024 GB**) und Warnungen („Läuft nicht: unvollständig – Netzteil fehlt“); geht etwas nicht, steht der Grund daneben. Klick auf den **Deckel** neben dem Server (oder „Server als Karton aufnehmen“ im Menü) nimmt ihn wieder auf – dann wie gewohnt in einen Schrank einbauen. Esc schließt das Menü.
- **NAS (Netzwerkspeicher):** Im Server-Shop unter „NAS“ (helles Orange) gibt es NAS S (2 HE, 4 Festplatten-Schächte, 3.000 €) und NAS L (4 HE, 12 Schächte, 7.500 €). Jede NAS hat immer 32 Cores und kommt mit 256 GB RAM und einer 512-GB-Platte. Festplatten (512 GB, 2, 4 oder 8 TB) kauft man im Teile-Shop und setzt sie direkt im Schrank ein (siehe **Festplatten der NAS tauschen** unter Steuerung). RAM rüstet man an der Werkbank auf (NAS S bis 512 GB, NAS L bis 1 TB). Die CPU lässt sich nur tauschen, wenn sie defekt ist. Strom: 1,5 bzw. 3 €/h plus 0,05 € je Platte. Auf eine NAS lassen sich auch VMs legen (Mietfaktor 1,2).
- **Speicher vermieten:** Steht eine NAS außerhalb des privaten Bereichs, kommen neben den VM-Kunden auch **Speicher-Kunden** zum Empfang (etwa 30 % aller Server-Anfragen), z. B. „💾 2 TB“ für ein Fotoarchiv oder ein Backup. Meist wollen sie wenig: 64 GB bis 512 GB (ca. 70 %), 1 oder 2 TB (ca. 25 %), selten 4 TB (ca. 5 %). Angenommen wird wie bei VMs in der App **Server-Vermietung**: Die Anfrage steht mit 💾 und Größe bei den anderen, zur Auswahl stehen nur NAS, die online sind und genug freien Speicher haben (Summe der Platten minus schon vermieteter Speicher). Miete: **0,002 € je GB und Spielstunde × Mietfaktor der NAS** (2 TB auf einer NAS ≈ 4,92 € / h), zu jeder vollen Spielstunde, solange die NAS online ist. Laufzeit, Wartezeit am Empfang und Kündigung nach 3 Spielstunden offline wie bei VMs; am Empfang warten VM- und Speicher-Kunden zusammen höchstens so viele, wie Plätze da sind. Die **automatische Vergabe** der privaten Server vergibt auch Speicher – auf die **vollste NAS**, auf die die Anfrage noch passt. In der App hat jede NAS einen Balken „Speicher 1,1 TB / 2,5 TB belegt“ und darunter die Speicher-Verträge (scrollt bei vielen). Eine Platte lässt sich nur herausnehmen, wenn der vermietete Speicher danach noch auf die übrigen Platten passt, sonst steht der Grund da, z. B. „Belegt: 2,3 TB vermietet“.
- **Defekte Festplatte:** Überhitzt eine NAS und trifft es eine Festplatte, bleibt die NAS **online** – VMs laufen weiter, nur ihr Speicher sinkt um die defekte Platte (im Schrank leuchtet sie rot). Passen die vermieteten Daten nicht mehr auf die heilen Platten, laufen die gerade laufenden Speicher-Verträge (**ältere zuerst**) weiter, solange sie noch in den heilen Speicher passen; nur die übrigen sind offline und kommen – ebenfalls ältere zuerst – zurück, sobald wieder Platz frei ist (ein laufender Vertrag geht dafür nie offline). Offline-Verträge zahlen keine Miete und kündigen nach 3 Spielstunden am Stück, alle anderen Verträge laufen normal. Defekte Platte herausnehmen (wird entsorgt) und eine neue einsetzen – oder den Techniker rufen (bei nur defekten Platten kostet er deren Preis + 30 %, sonst wie immer 30 % des Kaufpreises) –, dann sind alle Verträge wieder online. Andere defekte Teile (Lüfter, Netzteil, Mainboard, CPU, RAM) legen die NAS wie jeden Server lahm.
- **Eigene Website:** Im Server-Shop gibt es unter „Web“ (himmelblau) den **Website-Server** (1 HE, 2 Ports, 0,8 €/h, 1.500 €). Er wird nicht an Kunden vermietet, sondern betreibt deine Firmen-Website. Kaufen, einbauen und verkabeln wie jeden Server – in einem privaten Schrank läuft keine Website. Geht er online, **fährt die Website hoch** (ein paar Spielminuten), danach steht sie auf „Nicht eingerichtet“. In der App **Website** richtest du sie ein und veröffentlichst sie – dann ist sie **live**. Beim ersten Mal führt ein Assistent in sechs Schritten durch Name und Logo (Emoji), Farben (Farbwähler oder fertige Farbschemata), Schrift (6 Stück), Texte (Willkommensnachricht, Slogan, Über uns) und Angebote (VMs, Speicher nur mit NAS); rechts (am Handy darunter) zeigt eine **Live-Vorschau** im kleinen Browser sofort, wie die Seite aussieht. Danach ist alles im Reiter **Gestaltung** jederzeit änderbar, dazu Layout (zentriert/links/Karten), Hintergrundmuster, Ecken, Knopf-Stil und Dunkelmodus. Ein Balken zeigt, wie viel Bonus die Gestaltung bringt; bei schlechtem Kontrast steht dort „Text schlecht lesbar – weniger Kunden“. Der Reiter **Statistik** zeigt Besucher, Online-Anfragen, angenommene Anfragen, Einnahmen über die Website und die Auslastung der Website-Server, auch für die letzten Tage. Solange sie live ist, kommen zusätzlich zu den Kunden am Empfang **Online-Anfragen** (VMs und, mit NAS, Speicher) direkt in die App **Server-Vermietung**, gekennzeichnet mit **🌐 Website**. Dafür läuft niemand zum Empfang, und sie nehmen dort keinen Platz weg. Pro Website-Server und Spieltag sind es etwa **6 Anfragen**, höchstens 4 Website-Server zählen. Eine **gut gestaltete** Website (alle Felder ausgefüllt, Text gut lesbar) bringt **bis zu 20 %** mehr. Online-Anfragen warten etwa 4 Spielstunden auf Antwort, die automatische Vergabe der privaten Server nimmt sie auch an. Ist kein Website-Server online (oder er ist defekt), ist die Website offline: Es kommen keine neuen Online-Anfragen, laufende Verträge laufen weiter. Kommt ein Server zurück, fährt die Website neu hoch und ist ohne neues Einrichten wieder live. Die KI weist auf eine Website hin, die offline oder noch nicht eingerichtet ist.
- **Klima-Automatik:** Baust du einen Server (jedes Modell) in einen Schrank auf einem der **grünen Automatik-Plätze** ein und bringst ihn online (Switch/Firewall/Patchpanel und Leitung zum Wandanschluss wie bei jedem Server), stellt er die Lüfter selbst ein: Zuluft, Abluft und die Gerätelüfter. Ziel ist etwa 40 °C für das wärmste Gerät, das kälteste nicht unter 25 °C – mit möglichst wenig Lüfterstrom. Jeder Automatik-Server regelt **bis zu 8 Schränke**: seinen eigenen und die nächstgelegenen; mehrere Automatik-Server teilen sich den Raum, mit allen 4 grünen Plätzen ist der ganze Serverraum abgedeckt. Die Automatik schaut jede Spielminute nach (bei Gefahr sofort) und greift früh ein: ab etwa 50 °C dreht sie kräftig hoch, ab 60 °C laufen Gerätelüfter und Abluft sofort auf 100 %, erst unter 45 °C wird wieder gespart. Bei Kälte genauso andersherum (unter 22 °C Zuluft runter, unter 15 °C aus). Das Schrankfenster zeigt oben „🌡️ Automatik (über …)“ mit dem regelnden Server, die Regler bewegen sich dann von selbst. Ziehst du einen Regler, holt die Automatik ihn in der nächsten Spielminute zurück – mit dem Schalter **Automatik aus** regelst du den Schrank wieder selbst (er zählt dann nicht mehr zu den 8, ein anderer Schrank rückt nach). Fällt ein Automatik-Server aus (offline, defekt, eingefroren, ausgebaut), bleiben die Lüfter so stehen und du bekommst eine Meldung; ist er wieder online, regelt er weiter.
- **Fahrstuhl (3.000 €, erst nach der Etage):** Kommt neben die Treppe. Am Ruftaster rechts neben der Tür klicken – der Fahrstuhl bringt dich samt allem, was du trägst, aufs andere Stockwerk.
- **Keller mit Treppe (5.000 €):** Ein leerer Raum so groß wie die Halle, **70 m** unter ihr. Nach dem Bau führt links hinten in der Halle (Nordwestecke, hinter einem Geländer) ein Treppenhaus hinunter: 20 Stockwerke à 3,5 m, je zwei Läufe im Zickzack mit Zwischenpodest, an jedem Podest eine Tiefenanzeige (z. B. „−35 m“). Man läuft Stufe für Stufe – hinunter und wieder hinauf. Was du trägst, nimmst du mit; unten kann man nichts werfen. Das Hallenlicht schaltet den Keller nicht mit aus.
- **Keller-Lager (gratis):** Jedes Kellerfeld, das auf **Lager** steht (auch das erste am Treppenhaus), hat **4 Stapelplätze** für Kartons (gelb umrandet, je zwei links und rechts des Mittelgangs, je 4 Stapel bis knapp unter die Decke) und **8 Regalplätze** (blau umrandet, beiderseits des Mittelgangs in der Feldmitte). Ist der Abstellraum voll, kommen neue Lieferungen von selbst auf den ersten freien Stapelplatz im Keller-Lager. Kartons nimmst du dort wie im Abstellraum per Klick und trägst sie über Treppe oder Keller-Fahrstuhl nach oben; mit einem Karton in der Hand stellt ein Klick auf einen Stapelplatz (oder einen Karton darauf) ihn dort ab. Q legt Getragenes wie immer in den Abstellraum – ist der voll, ins Keller-Lager. Ein leeres **Filament-Regal** (Drucker-Shop, Einrichtung) kannst du auf einen blauen Regalplatz stellen; es steht dort auf einem Stahlgestell. Spulen darin ziehen **keine Feuchtigkeit**; im Filament-Shop steht bei der Sorte „📍 Keller-Lager (trocken): 2“, im Druckermenü bei „Filament leer“ ebenso. Filament-Regale im Keller belegen keinen Regalplatz am Druckertisch. Ein Lager-Feld lässt sich nur umstellen, wenn darin kein Karton (auch keiner, der gerade dorthin unterwegs ist) und kein Regal mehr steht.
- **Daten-Bunker (Serverschränke im Keller):** In jedem Kellerfeld, das in der Kellerkarte auf **Daten-Bunker** steht, gibt es **120 Schrank-Stellplätze** dicht wie im Rechenzentrum: 6 Reihen (3 Reihenpaare), jede Reihe zwei Blöcke à 10 Schränke lückenlos nebeneinander, dazwischen ein 1,5 m breiter Quergang (genau vor den Stahltüren). Die zwei Reihen eines Paares stehen Rücken an Rücken mit 1,0 m **warmem Gang** (dort kommen die Kabel aus den Schränken), zwischen den Paaren liegt ein 1,2 m **kalter Gang** mit Lochplatten im Boden; die Glastüren zeigen immer in den kalten Gang bzw. nach außen. Rundherum bleiben gut 3 m Laufweg. Die grünen Markierungen liegen beim Tragen eines Schranks als Streifen mit dünnen Trennlinien auf den freien Plätzen; die Plätze heißen „Bunker 1 · Reihe 3 · Platz 7“ (Reihen von Nord nach Süd, Plätze von West nach Ost). Schrankkarton die Treppe oder mit dem Keller-Fahrstuhl hinuntertragen und an einer **grünen Markierung** aufstellen – Geräte einbauen, Kühlung, Defekte, automatische Vergabe, KI-GPU- und Website-Server funktionieren wie im Serverraum oben. Eigene Automatik-Plätze gibt es im Bunker nicht: Die Klima-Automatik regelt Bunker-Schränke mit, sobald ein Automatik-Server oben weniger als 8 Schränke zu regeln hat (Schränke oben gehen vor) – sonst die Lüfter im Schrankfenster selbst einstellen. **Alle VMs und aller Speicher (NAS) auf Servern im Bunker bringen ×1,5 Miete** (zusätzlich zum Mietfaktor des Modells) – Kunden zahlen für die Sicherheit 70 m unter der Erde mehr. In der App **Server-Vermietung** steht am Server „🛡️ Bunker ×1,5“, im Schrankfenster „🛡️ Daten-Bunker ×1,5“; die Plätze heißen „Bunker 1 · Platz 5“ (Nummer wie auf dem Schild des Feldes). **Internet im Keller:** Kabel kommen nicht 70 m von oben herunter. Sobald es ein Bunker-Feld gibt, steht im ersten Bunker-Feld (in der Nordwest-Ecke, gratis) eine **Glasfaser-Säule** mit eigenem Wandkasten „INTERNET / WAN“ (32 Ports „Keller-WAN 1…32“); er bleibt in diesem Feld, solange es Bunker ist. Kabel laufen über **Kabeltrassen unter der Decke** (Leitern): über jedem warmen Gang eine Längstrasse mit einem Trassenfeld über jedem Schrank, dazu drei Quertrassen West, Mitte (über dem Quergang) und Ost, oben verbunden mit der Trasse vom Glasfaser-Anschluss. Wie oben klickt man die Trassenfelder an, durch die das Kabel laufen soll; zwischen zwei Feldern läuft es gerade (erst Ost-West, dann Nord-Süd) – quer über eine Schrankreihe geht es nur über eine Quertrasse. Zu einem Nachbarfeld, das auch Bunker ist, laufen die Trassen durch. Gezählt wird die echte Länge des Weges. **Kabel zwischen Serverraum oben und Bunker gibt es nicht** – jeder Bereich braucht seine eigene Firewall und seinen eigenen Anschluss. Ein Bunker-Feld lässt sich nur umstellen, wenn dort kein Schrank mehr steht, kein Kabel über seine Trassen läuft und am Glasfaser-Anschluss darin nichts steckt – sonst nennt das Spiel den Grund (z. B. „Im Feld stehen noch 3 Serverschränke“). Ein angefangenes Kabel bricht ab, wenn du den Bereich verlässt. Aus älteren Spielständen ziehen Bunker-Schränke samt Geräten auf den nächstgelegenen freien Platz im selben Feld; ihre Kabel werden über die Trassen neu verlegt (der Längenunterschied geht mit dem Kabelvorrat auf, geht es nicht, kommt das Kabel vollständig in den Vorrat zurück).
- **Keller-Fahrstuhl (4.000 €, erst nach dem Keller):** Kommt direkt neben den Treppenabgang an die Westwand. Am Ruftaster rechts neben der Tür klicken – er fährt zwischen Halle und Keller, ohne die 70 m Treppe. Der Fahrstuhl zur zweiten Etage bleibt, wie er ist.
- **Kellerausbau (10.000 € bis 150.000 €, erst nach dem Keller):** Der Keller wächst in Stufen um je 20 m nach Osten und Süden – das Treppenhaus bleibt in der Nordwest-Ecke: Stufe 2 = 40 × 40 m (10.000 €), 3 = 60 × 60 m (25.000 €), 4 = 80 × 80 m (50.000 €), 5 = 100 × 100 m (90.000 €), 6 = 120 × 120 m (150.000 €), zusammen 325.000 €. Jeder Ausbau dauert zwei Minuten (doppelte Lieferzeit), die nächste Stufe gibt es erst, wenn die vorige fertig ist; dann kommt „⛏️ Keller ausgebaut auf 60 × 60 m“. Der Keller ist in **Felder zu 20 × 20 m** geteilt. Unter den Karten zeigt die **Kellerkarte** (6 × 6 Felder, Norden oben, Treppenhaus 🪜 links oben) die gebauten Felder: 📦 blau = **Lager**, 💾 grün = **Daten-Bunker**, ? gestrichelt = noch nicht festgelegt. Ein Klick auf ein Feld stellt es um (nicht festgelegt → Lager → Daten-Bunker → Lager …), das kostet nichts. Das erste Feld am Treppenhaus ist immer Lager. Umstellen geht nur, solange das Feld leer ist – sonst nennt das Spiel den Grund (z. B. „Im Feld stehen noch 3 Serverschränke“). Im Keller sieht man die Felder: **Lager** haben Betonboden mit gelben Bodenlinien, **Daten-Bunker** einen dunklen Stahlboden und zu jedem Nachbarfeld, das kein Bunker ist, eine Wand mit schwerer Stahl-Schiebetür – sie öffnet sich von selbst, wenn du davorstehst (zwischen zwei Bunkern bleibt es offen). Alle 20 m stehen Betonstützen, in der Mitte jedes Feldes hängt ein Schild („LAGER 2“, „DATEN-BUNKER 1“, darunter die Feldnummer der Kellerkarte); noch nicht festgelegte Felder sind leer („Feld noch nicht festgelegt – im Ausbau-Menü wählen“). Im **Daten-Bunker** stehen Serverschränke (siehe unten).
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
index.html          Einstieg, Import-Map für Three.js, lädt die CSS-Dateien in fester Reihenfolge
css/                Gestaltung, je Bereich eine Datei, in fester Reihenfolge geladen (wie hier und in index.html);
                    screen-fade.css und rack-panel.css folgen nach touch.css wie im alten style.css
  style.css           Grundlagen: Farb-Variablen, Seite, Fadenkreuz
  hud.css             HUD im Spiel: Anzeigen, Zoom, Leistungsanzeige, Speichern-Symbol, Level-Up
  desktop.css         PC-Desktop: Fenster, Mauszeiger, Shop-Karten, Notizen, Rechner
  printer-menu.css    Druckermenü
  title.css           Titel- und Pausenbildschirm
  apps.css            Meldungen, Erfolge und Apps (Snake, Drucker-Cam, Ausbau, Entwicklermenü, Personal, Server-Vermietung, KI)
  parts-shop.css      PC-App Teile-Shop: Übersicht Teilelager und defekte Server, Karten mit Mengenwahl
  workbench.css       Werkbank-Menü: Werte, Warnungen, Steckplatz-Kacheln, Auswahl zum Ein-/Ausbauen
  storage-rental.css  Server-Vermietung: Speicher-Balken je NAS, Speicher-Anfragen (#47) und Kennzeichen „🌐 Website“ (#54)
  website-app.css     PC-App Website (#55): Assistent, Gestaltung, Statistik und Live-Vorschau (vor touch.css)
  touch.css           Tablet-Steuerung, Anpassungen für Touch/Tablet/Handy (steht nach hud.css … apps.css,
                      damit sie deren Regeln überschreibt; neue Bereichsdateien davor einbinden, wenn sie für sie gelten soll)
  screen-fade.css     Abblenden des Bildschirms (z. B. Fahrstuhl)
  rack-panel.css      Schrankfenster mit Klima
serve.ps1           Lokaler Webserver für Windows
assets/people/      Menschenfiguren als GLB (Quaternius), auf die nötigen Animationen gekürzt
.github/workflows/  pages.yml: veröffentlicht main automatisch auf GitHub Pages
src/
  main.js           Verdrahtet alles: Szene, Steuerung, Ereignisse, Spielschleife; baut derzeit auch Computertisch und
                    Spielerbewegung (soll später ausgelagert werden)
  core/             Spiellogik, ohne Three.js und ohne DOM
    format.js         Gemeinsame Anzeige-Formatierer: Euro (euro, euroRound), Kabellänge (meters), Zeiten (formatMinutes, realTime)
    catalog.js        Sammelstelle: reicht die Teilkataloge weiter (Import bleibt ../core/catalog.js)
    filament-catalog.js  Filamentsorten und -farben, Holzplatten für den Laser
    printer-catalog.js   Drucker und Laser mit technischen Daten, Geschwindigkeitsstufen, LED-Farben
    print-templates.js   Druck- und Laservorlagen, Lasermotive, Fehldruckarten
    furniture-catalog.js Einrichtung, Zubehör und Ersatzteile
    economy.js        Geld, Kosten, Besitz, Drucke, Pannen, Feuchte, Düsenverschleiß, Holz und Laser,
                      Einrichtung und Regale, Lieferung und Abstellraum, Ersatzteile
    orders.js         Kundenaufträge: Farben, Eilaufträge, Sterne, Fristen, Stufen (am Empfang, angenommen, im Regal)
    reception.js      Empfang: annehmen, ins Abholregal packen (feste Fächer), abholen und bezahlen
    two-color.js      Zwei- und mehrfarbige Drucke: Farbfächer, Dual-Nozzle gegen Farbwechsel mit einer Düse;
                      außerdem Farbbeschriftung (colorsLabel) und Filamente eines Teils (partFilaments)
    laser.js          Laser R1: Holzplatte im Gerät, Laseraufträge (Text, Logo, Ausschneiden)
    progress.js       Level, XP und Titel
    achievements.js   Erfolge und Statistik
    upgrades.js       Ausbau: Drucktische, Regalebenen, zweite Etage, Keller, Fahrstühle, Kellerausbau-Stufe
    basement-layout.js Kellerausbau: Stufen (20…120 m), Felder 20 × 20 m als Lager oder Daten-Bunker, Feldgrenzen
    staff.js          Personal: Einstellen, Lohn, welche Aufgaben es gibt und was sie bewirken
    visitors.js       Besucher: Tagesplan mit Grüppchen (1–7 Pers.), Ablauf je Grüppchen, Eintritt, Bewertung, XP, Tagesschnitt
    game-clock.js     Spieluhr mit Tagen und Stunden, meldet jede volle Stunde für die Abrechnung
    snake.js          Mini-Spiel Snake: Raster, Schlange, Spulen als Futter, Tempo
    snake-autopilot.js  Auto-Modus für Snake: Rundweg über alle Felder mit sicheren Abkürzungen
    server-catalog.js Server-Hardware: Schränke, Server, Switches, Firewall, Patchpanels, Kabelrolle
    servers.js        Serverraum: Schränke aufstellen, Geräte einbauen, Kabel, wer online ist (Geld über server-rentals.js)
    server-climate.js Serverklima: Lüfter je Schrank und Gerät, Temperaturen, Überhitzen und Einfrieren
    server-parts.js   Server aus Bauteilen: Teilekatalog, Steckplätze je Modell, Auf-/Abrüsten, Defekte, Teilelager
    nas.js            NAS: Speicher aus den heilen Festplatten, Schächte, Platten im Schrank einsetzen und herausnehmen (Hot-Swap), Rückrufe für vermieteten und wegen defekter Platten offline Speicher
    workbench.js      Werkbank im Serverraum: Server ablegen (Lage 'bench'), aufnehmen, Übersicht für das Menü
    climate-automation.js Klima-Automatik: Server auf den grünen Plätzen regeln Zu-/Abluft und Gerätelüfter von bis zu 8 Schränken
    server-rentals.js VM-Vermietung: Anfragen der Kunden, VMs auf Servern (RAM und Cores je Server aus den Bauteilen), Miete, Laufzeit, Kündigung
    rental-automation.js Automatische Vergabe: Server der orangen Reihe vergeben VM-Anfragen (höchster Mietfaktor, dann Best Fit) und Speicher-Anfragen (vollste passende NAS)
    storage-rentals.js Speicher-Vermietung auf NAS: Speicher-Anfragen, Verträge je NAS, Miete, Kündigung, gemeinsame Empfangs-Sicht mit den VMs
    website.js        Eigene Website (#54): Status (aus/fährt hoch/nicht eingerichtet/live), Einstellungen mit Prüfung, Lesbarkeit (Kontrast) und Gestaltungs-Bonus, Online-Anfragen an VM- und Speicher-Vermietung, Tagesstatistik
    ai-service.js     Eigene KI auf den KI-GPU-Servern: Stufe 1–10 nach Anzahl online, KI-Abo zu jeder vollen Stunde, Stufenwechsel
    ai-day-log.js     Tagesverlauf der KI: Einnahmen, Aufträge, Strom, Kosten, Filament, XP je Spieltag (Vergleich mit gestern, Prognose)
    ai-advisor.js     Antworten der App „KI“: Thema aus Stichwörtern, Text je Stufe aus dem Spielstand (Zahlen, Probleme, Empfehlungen, Prognose, Lagebericht, ab 6 Vergleich, Tagesprognose, Ziele, Warnungen, Rangliste)
    server-zones.js   Stellplätze im Serverraum und im Daten-Bunker (120 je Bunker-Feld in Reihen wie im Rechenzentrum, Miete ×1,5): Lage, Blickrichtung, Zonen (Kunden, privat, Automatik, Bunker), Platzname, Keller-Anschluss-Feld
    cable-tray.js     Kabelgitter unter der Decke (Felder 1 m, Weg aus Wegpunkten, Kabellänge) und Internet-Anschluss an der Wand (28 Ports) – oben und im Daten-Bunker (Trassen über den Reihen, Glasfaser-Anschluss mit 32 Ports, keine Kabel zwischen den Bereichen)
    display-shelf.js  Ausstellungsregal: Wandplätze, Teile ausstellen und zurücknehmen
    storage-stack.js  Kartons im Abstellraum stapeln: 4 Stapel bis unter die Decke, ob ein neuer Karton noch passt
    basement-storage.js Keller-Lager: Stapelzonen und Regalplätze je Lager-Feld, Lieferziel bei vollem Abstellraum, trockene Filament-Regale, Feld-Prüfung
    save.js           Spielstand in localStorage, Autospeichern, Umwandlung alter Stände
  world/            3D-Szene und Spielfigur
    room.js           Halle mit Boden, Wänden, Fenstern, Licht
    hall.js           Kaufbare Drucktische mit Bodenmarkierung
    hall-layout.js    Hallen-Maße: Drucktisch-Reihen und Drucker-/Regalplätze
    upper-floor.js    Zweite Etage: Zwischendecke, Treppe, Fahrstuhl, Stockwerk der Spielfigur, Fassade oben
    basement.js       Keller in 70 m Tiefe: Treppenhaus mit Höhenfunktion (footing), Hallenboden mit Loch, Keller-Fahrstuhl, nur in der Nähe zeichnen
    basement-fields.js Kellerfelder je Ausbaustufe: Boden, Außenwände, Stützen, Schilder, Bunkerwände mit Stahltüren; Gruppe je Feld für Einrichtung
    basement-storage.js Keller-Lager: Markierungen, Kartonstapel (instanziert), Filament-Regale auf Gestellen, Klicks zum Aufnehmen und Abstellen
    server-room.js    Serverraum oben: Stellplätze, Bodenmarkierung der privaten Reihen, Schränke mit Geräten und Kabeln, Verkabeln Port für Port – auch für die Schränke im Daten-Bunker
    bunker.js         Daten-Bunker im Keller: Kabeltrassen je Bunker-Feld, grüne Stellplatz-Markierungen, Lochplatten, einfache Schränke für die Ferne, Glasfaser-Säule mit Wandkasten
    cable-tray.js     Gitter und Wandanschluss im Serverraum, Kabel über das Gitter
    workbench.js      Werkbank an der Südwand des Serverraums: Karton ablegen, offener Server mit Teilen, Deckel zum Aufnehmen
    hall-lights.js    Lichtschalter der Halle: Deckenleuchten aus, Raum dunkel, Glow-Filament leuchtet
    display-wall.js   Ausstellungsregale an der Südwand: Aufstellen, Teile ausstellen (Mausrad wählt), zurücknehmen
    zoom.js           Zoom mit dem Mausrad (Blickfeld der Kamera, langsamere Maus beim Reinzoomen)
    workshop.js       Drucktische: Aufstellen, Einlegen, Druck-Animation, Pannen, Statussymbole
    tool-changer.js   Düsenwechsel des H2C: Kopf fährt zum Wechsler, legt Düse ab, holt die nächste
    purge.js          Farbwechsel mit einer Düse: Kopf fährt zum Spültrichter, spült aus, streift ab, druckt weiter
    laser.js          Laser R1: Holzplatte mit Gravur bzw. Schnittlinien, Laserkopf und Strahl
    storage-room.js   Abstellraum mit Regal, Holzpalette und Lieferzone (Kartons gestapelt)
    entrance.js       Eingangsbereich hinter der Westwand mit automatischer Glas-Schiebetür
    outdoor.js        Fassaden und Dach, Garten, Straße mit Gehwegen, Häuser, Autos, Himmel
    pedestrians.js    Passanten auf den Gehwegen
    reception.js      Einrichtung des Empfangs: Tresen, Wartestühle, Abholregal mit Paketen, Klick-Aktionen
    customers.js      Kunden als Figuren: kommen zum Tresen, warten, holen Pakete ab und zahlen
    visitors.js       Besucher-Grüppchen als Figuren: mehrere gleichzeitig, Wegenetz, Empfang, Stationen, Treppe, Ausweichen, Ausgang
    office.js         Büro der Azubis: Werkbank, Couch, Fernseher mit Konsole
    carry.js          Was der Spieler trägt: ein Karton, bis zu 5 Spulen, eine Düse oder bis zu 5 Holzplatten
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
    mesh-helpers.js   Grundformen für Modelle: box, shadowBox, rbox, cylinder und Standardmaterial mat
    canvas-texture.js Prozedurale Canvas-Texturen (canvasTexture) und Zeichenhelfer rand/speckle
    printer-model.js  Weiche für die Druckermodelle, Abmessungen, Schläuche zum Druckkopf
    printer-a1.js     Bettschubser A1 mini, A1 und A2L
    printer-cube.js   Würfeldrucker P1P bis H2C mit Spülrutsche
    printer-model-helpers.js  Gemeinsame Teile der Druckermodelle (Schriftzug, Schläuche, Kamera)
    printer-parts.js  Einzelteile der Drucker: Druckkopf, Druckplatte, Motoren, Schienen, Touchscreen
    printed-part.js   Materialien gedruckter Teile (ein- und mehrfarbig) und Fehldruck-Spaghetti
    nozzle-changer.js Düsenwechsler des H2C: Wechselkopf, Düsenhalter, LED-Leiste
    laser-model.js    Laser R1: Gehäuse mit Laserschutzfenster, Wabenbett, Laserkopf
    laser-art.js      Was der Laser auf die Platte bringt: Motive, Text, Gravurzeilen, Schnittbahn
    printer-box.js    Lieferkarton
    print-shapes.js   Formen der Druckvorlagen und Düsenbahn je Schicht
    infill.js         Füllung: Gitter innen, geschlossene Ober-/Unterseiten, kürzester Weg der Düse, Füllwände im Inneren
    spool.js          Filamentspule, Aussehen je Sorte (matt, Seidenglanz, leuchtend – im Dunkeln heller –, durchscheinend), ganze Regale als Instanzen
    furniture.js      Regale am Drucktisch, Ausstellungsregal und Ersatzdüse; auch Karton-/Vorschaumodelle der
                      Server-Hardware
    server-hardware.js  Serverschrank und Geräte (Server, Switch, Firewall, Patchpanel) mit Ports
    server-fans.js    Drehende Lüfter (Rotor mit Schutzgitter) für Server-Geräte und Schränke
    server-textures.js  Gezeichnete Texturen der Geräte: Frontblenden, Rückwände, Gehäuseblech
    server-parts.js   Server-Bauteile (CPU, RAM, Mainboard, Netzteil, Lüfter, Festplatte), Produktbilder, offener Server, Defekt-Markierung
    nas-front.js      Festplatten vorn in der NAS
    workbench.js      Werkbank: Stahlgestell, ESD-Matte, Lochwand mit Schild „WERKBANK“
    cable-tray.js     Kabelgitter, Kabelleitern im Bunker, Wandkasten „INTERNET / WAN“, Wandtrasse
    peripherals.js    Tastatur, Maus, Mauspad, Kabel
    office-furniture.js  Büromöbel: Werkbank, Bürostuhl, Couch, Lowboard, Fernseher, Konsole, Controller, Pflanze
    merge-static.js   Unbewegliche Einzelteile pro Material zu einem Mesh verschmelzen (weniger Draw Calls)
    steel-door.js     Stahl-Schiebetür der Daten-Bunker: Warnzarge, Laufschiene, bewegliches Türblatt
    people.js         Menschenfiguren laden, Animationen abspielen, Sitzen/Tragen/Controller über die Knochen, sparsame Figuren für Menschenmengen
    name-tag.js       Namensschild über dem Kopf von Figuren (Azubis, Empfang)
    reception-furniture.js  Tresen, Wartestuhl, Abholregal, Paket mit Etikett
    outdoor-props.js  Auto, Wohnhaus, Bank, Laternen, Briefkasten, Himmel; Bäume, Büsche und Blumen als Instanzen
  ui/               HTML-Overlays und PC-Apps
    hud.js            HUD, Level-Up-Banner, Meldungen, Erfolge
    screen-fade.js    Bildschirm kurz abblenden (Fahrstuhlfahrt)
    server-shop.js    PC-App Server-Shop
    parts-shop.js     PC-App Teile-Shop: Server-Bauteile mit Menge kaufen, Teilelager und defekte Server oben
    server-rental-app.js  PC-App Server-Vermietung: VM- und Speicher-Anfragen, Serverwahl, Auslastung und laufende Verträge
    ai-app.js         PC-App KI: Kopf mit Stufe, Server online und KI-Abo, Chat mit Vorschlägen (Antworten aus core/ai-advisor.js)
    website-app.js    PC-App Website (#55): Einrichtungs-Assistent, Gestaltung, Statistik und Live-Vorschau (Einstellungen und Logik in core/website.js)
    rack-panel.js     Schrankfenster: Geräte, Ports, Kabel stecken, VM-Belegung je Server
    workbench-panel.js  Werkbank-Menü: Steckplätze des Servers, Ein-/Ausbauen und Tauschen mit Gründen, Server aufnehmen
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
