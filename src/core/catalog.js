// Alles, was man im Shop kaufen kann. Reine Daten, damit Preise und Werte an einer Stelle stehen.

export const MATERIALS = {
  PLA: { name: 'PLA', hint: 'Einfach zu drucken – Standard für Deko und Prototypen' },
  PETG: { name: 'PETG', hint: 'Robust und schlagfest, gut für Gebrauchsteile' },
  ABS: { name: 'ABS', hint: 'Hitzebeständig, neigt aber zum Verziehen' },
  TPU: { name: 'TPU', hint: 'Flexibel und gummiartig, z. B. für Handyhüllen' },
};

// Preis pro 1-kg-Spule in €
const filament = (material, color, hex, price) => ({
  id: `${material}-${color}`.toLowerCase(),
  material,
  color,
  hex,
  price,
});

export const FILAMENTS = [
  filament('PLA', 'Weiß', '#f2f2f2', 20),
  filament('PLA', 'Schwarz', '#1c1c1c', 20),
  filament('PLA', 'Rot', '#d62f2f', 22),
  filament('PLA', 'Blau', '#2f6fd6', 22),
  filament('PLA', 'Grün', '#2fb34a', 22),
  filament('PLA', 'Gelb', '#f2c419', 22),
  filament('PLA', 'Orange', '#f2802f', 22),
  filament('PLA', 'Transparent', '#cfe6f2', 24),
  filament('PETG', 'Schwarz', '#202020', 25),
  filament('PETG', 'Weiß', '#efefef', 25),
  filament('PETG', 'Rot', '#c92a2a', 27),
  filament('PETG', 'Blau', '#2f6fd6', 27),
  filament('PETG', 'Transparent', '#cfe6f2', 27),
  filament('PETG', 'Orange', '#f2802f', 27),
  filament('ABS', 'Weiß', '#ececec', 26),
  filament('ABS', 'Schwarz', '#1a1a1a', 26),
  filament('ABS', 'Grau', '#8a8d91', 26),
  filament('TPU', 'Schwarz', '#242424', 35),
  filament('TPU', 'Weiß', '#eeeeee', 35),
];

export const filamentById = (id) => FILAMENTS.find((f) => f.id === id);
export const filamentLabel = (f) => `${f.material} ${f.color}`;

// Druckgeschwindigkeit in Prozent der Standardgeschwindigkeit. Gilt für alle Drucker gleich, mehr als 166 % geht
// nicht – außer mit turbo: true (Drucker mit turboSpeed, z. B. H2S), dann bis 200 %.
export const SPEED_MODES = [
  { id: 'silent', name: 'Leise', percent: 50 },
  { id: 'standard', name: 'Standard', percent: 100 },
  { id: 'sport', name: 'Sport', percent: 125 },
  { id: 'ludicrous', name: 'Ludicrous', percent: 166 },
  { id: 'turbo', name: 'Turbo', percent: 200, turbo: true },
];

export const speedById = (id) => SPEED_MODES.find((s) => s.id === id);
// Stufen, die dieser Drucker (Katalogeintrag) fahren kann
export const speedModesFor = (model) => SPEED_MODES.filter((s) => !s.turbo || model.turboSpeed);

// build: Bauraum in mm (Breite × Tiefe × Höhe), powerPerHour: Stromkosten in € pro Spielstunde beim Drucken
// (im Leerlauf nur ein Bruchteil, siehe economy.js), enclosed: geschlossenes Gehäuse – ohne verzieht sich ABS gern
// spoolSlots: wie viele Spulen gleichzeitig eingelegt sein können (1 = Spulenhalter, 4 = AMS)
// style wählt das 3D-Modell in printer-model.js, accent färbt die Klassen-Plakette im Shop
export const PRINTERS = [
  {
    id: 'a1-mini', name: 'Bambu Lab A1 mini', tier: 'Einsteiger', price: 180,
    build: { x: 180, y: 180, z: 180 }, materials: ['PLA', 'PETG'], powerPerHour: 0.4, enclosed: false,
    spoolSlots: 1, style: 'a1-mini', accent: '#2f7de1',
  },
  {
    id: 'a1', name: 'Bambu Lab A1', tier: 'Mittelklasse', price: 220,
    build: { x: 256, y: 256, z: 256 }, materials: ['PLA', 'PETG', 'ABS'], powerPerHour: 0.6, enclosed: false,
    spoolSlots: 1, style: 'a1', accent: '#e1572f',
  },
  {
    // A2L: aufgebaut wie der A1, aber mit großem Bauraum wie die H2-Serie und kann auch TPU
    id: 'a2l', name: 'Bambu Lab A2L', tier: 'Großformat', price: 350,
    build: { x: 325, y: 325, z: 325 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerPerHour: 0.7, enclosed: false,
    spoolSlots: 1, style: 'a2l', accent: '#e8a32f',
  },
  {
    id: 'p1p', name: 'Bambu Lab P1P', tier: 'Fortgeschritten', price: 400,
    build: { x: 256, y: 256, z: 256 }, materials: ['PLA', 'PETG', 'TPU'], powerPerHour: 0.7, enclosed: false,
    spoolSlots: 4, style: 'p1p', accent: '#5b6472',
  },
  {
    id: 'p1s', name: 'Bambu Lab P1S', tier: 'Profi', price: 550,
    build: { x: 256, y: 256, z: 256 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerPerHour: 0.8, enclosed: true,
    spoolSlots: 4, style: 'p1s', accent: '#22b573',
  },
  {
    id: 'p2s', name: 'Bambu Lab P2S', tier: 'Profi+', price: 700,
    build: { x: 256, y: 256, z: 256 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerPerHour: 0.9, enclosed: true,
    spoolSlots: 4, style: 'p2s', accent: '#9b59ff',
  },
  {
    // nozzles: 2 → jede Düse verschleißt halb so schnell, verstopft eine, druckt die andere weiter
    // aiCamera: erkennt Spaghetti und abgelöste Teile früh – die Hälfte des Filaments bleibt auf der Spule
    id: 'x2d', name: 'Bambu Lab X2D', tier: 'Dual-Nozzle', price: 950,
    build: { x: 256, y: 256, z: 260 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerPerHour: 1.0, enclosed: true,
    spoolSlots: 4, nozzles: 2, aiCamera: true, style: 'x2d', accent: '#ff7a1a',
  },
  {
    // H2D: großer Bauraum, zwei Düsen und KI-Kamera wie der X2D, rundum Fenster und ein großes Display
    id: 'h2d', name: 'Bambu Lab H2D', tier: 'Flaggschiff', price: 1400,
    build: { x: 325, y: 325, z: 325 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerPerHour: 1.2, enclosed: true,
    spoolSlots: 4, nozzles: 2, aiCamera: true, style: 'h2d', accent: '#e8c547',
  },
  {
    // H2S: so groß wie der H2D mit KI-Kamera, aber nur eine Düse. Dafür turboSpeed (bis 200 %) und
    // failureFactor: präzisere Mechanik und stärkere Bauteilkühlung – nur halb so viele Fehldrucke
    id: 'h2s', name: 'Bambu Lab H2S', tier: 'Speed', price: 1800,
    build: { x: 325, y: 325, z: 325 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerPerHour: 1.3, enclosed: true,
    spoolSlots: 4, aiCamera: true, turboSpeed: true, failureFactor: 0.5, style: 'h2s', accent: '#19c3e6',
  },
  {
    // H2C: so groß wie der H2D, mit Düsenwechsler rechts im Bauraum – 8 Düsen (eine im Kopf, sieben im Wechsler),
    // für jedes der 8 AMS-Fächer (zwei AMS übereinander) eine eigene. Der Kopf holt sich für jede Farbe ihre Düse,
    // dadurch fast kein Spülabfall (siehe two-color.js). LED-Leiste unten am Sockel, Farbe im Druckermenü wählbar.
    id: 'h2c', name: 'Bambu Lab H2C', tier: 'Düsenwechsler', price: 2500,
    build: { x: 325, y: 325, z: 325 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerPerHour: 1.3, enclosed: true,
    spoolSlots: 8, nozzles: 8, nozzleChanger: true, aiCamera: true, ledStrip: true, style: 'h2c', accent: '#b05cff',
  },
];

// Farben der LED-Leiste (H2C), wählbar im Druckermenü. Die erste ist die Werkseinstellung.
export const LED_COLORS = [
  { id: 'lila', name: 'Lila', hex: '#a347ff' },
  { id: 'blau', name: 'Blau', hex: '#2f7dff' },
  { id: 'orange', name: 'Orange', hex: '#ff7a1a' },
  { id: 'gruen', name: 'Grün', hex: '#22d36b' },
  { id: 'rot', name: 'Rot', hex: '#ff3344' },
  { id: 'weiss', name: 'Weiß', hex: '#f2f4ff' },
];
export const ledColorById = (id) => LED_COLORS.find((c) => c.id === id) ?? LED_COLORS[0];

export const formatBuildVolume = ({ x, y, z }) => `${x} × ${y} × ${z} mm`;

// Was man drucken kann. grams: Filamentverbrauch, minutes: Druckzeit bei 100 %,
// size: Abmessungen in mm (Breite × Tiefe × Höhe, muss in den Bauraum passen). Die 3D-Form steht in print-shapes.js.
export const PRINT_TEMPLATES = [
  { id: 'benchy', name: 'Benchy', grams: 12, minutes: 45, size: { x: 60, y: 31, z: 48 }, materials: ['PLA', 'PETG'] },
  { id: 'keychain', name: 'Schlüsselanhänger', grams: 8, minutes: 25, size: { x: 50, y: 30, z: 6 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'] },
  { id: 'cable-clips', name: 'Kabelclip-Set', grams: 15, minutes: 40, size: { x: 66, y: 50, z: 12 }, materials: ['PLA', 'PETG', 'ABS'] },
  { id: 'phone-stand', name: 'Handyhalter', grams: 45, minutes: 100, size: { x: 90, y: 80, z: 110 }, materials: ['PLA', 'PETG', 'ABS'] },
  { id: 'phone-case', name: 'Handyhülle', grams: 28, minutes: 110, size: { x: 80, y: 160, z: 12 }, materials: ['TPU'] },
  { id: 'gears', name: 'Zahnrad-Set', grams: 60, minutes: 150, size: { x: 125, y: 84, z: 16 }, materials: ['PETG', 'ABS'] },
  { id: 'vase', name: 'Vase', grams: 130, minutes: 260, size: { x: 140, y: 140, z: 220 }, materials: ['PLA', 'PETG'] },
  { id: 'dragon', name: 'Drachenfigur', grams: 95, minutes: 300, size: { x: 160, y: 90, z: 115 }, materials: ['PLA'] },
  { id: 'tool-holder', name: 'Werkzeughalter', grams: 160, minutes: 330, size: { x: 200, y: 120, z: 80 }, materials: ['PETG', 'ABS'] },
  // Zweifarbig (colors: 2): Grund- und Akzentfarbe, accent = Anteil der Akzentfarbe am Filament, parts = Namen der
  // beiden Teile für die Farbwahl im Druckermenü. minutes gilt
  // für Dual-Nozzle-Drucker; mit einer Düse dauert es wegen der Farbwechsel länger (siehe two-color.js).
  { id: 'name-sign', name: 'Namensschild', colors: 2, accent: 0.3, parts: ['Schild', 'Rahmen und Schrift'], grams: 22, minutes: 70, size: { x: 120, y: 35, z: 6 }, materials: ['PLA', 'PETG'] },
  { id: 'coaster', name: 'Untersetzer mit Logo', colors: 2, accent: 0.35, parts: ['Scheibe', 'Ring und Stern'], grams: 18, minutes: 55, size: { x: 90, y: 90, z: 5 }, materials: ['PLA', 'PETG'] },
  { id: 'dice', name: 'Spielwürfel-Set', colors: 2, accent: 0.15, parts: ['Würfel', 'Augen'], grams: 14, minutes: 50, size: { x: 44, y: 18, z: 18 }, materials: ['PLA', 'PETG', 'ABS'] },
  { id: 'chess-set', name: 'Schachfiguren', colors: 2, accent: 0.5, parts: ['Erste Seite', 'Zweite Seite'], grams: 85, minutes: 260, size: { x: 150, y: 80, z: 46 }, materials: ['PLA'] },
  // Mehrfarbig (colors: 3 und mehr): parts benennt die Teile der Form in Farbreihenfolge, shares ist ihr Anteil am
  // Filament (Summe 1). Jede Farbe braucht ein eigenes AMS-Fach – mit 6 oder 8 Farben geht das nur auf dem H2C.
  {
    id: 'rainbow', name: 'Regenbogen', colors: 8, grams: 70, minutes: 200, size: { x: 124, y: 62, z: 8 }, materials: ['PLA'],
    parts: ['Äußerer Bogen', '2. Bogen', '3. Bogen', '4. Bogen', '5. Bogen', '6. Bogen', '7. Bogen', 'Innerer Bogen'],
    shares: [0.16, 0.15, 0.14, 0.13, 0.12, 0.11, 0.1, 0.09],
  },
  {
    id: 'parrot', name: 'Papagei', colors: 6, grams: 110, minutes: 320, size: { x: 60, y: 60, z: 92 }, materials: ['PLA'],
    parts: ['Sockel', 'Körper', 'Kopf', 'Schnabel', 'Flügel und Schwanz', 'Augen'],
    shares: [0.3, 0.35, 0.12, 0.05, 0.15, 0.03],
  },
];

export const templateById = (id) => PRINT_TEMPLATES.find((t) => t.id === id);

export const SPOOL_GRAMS = 1000; // eine volle Spule

// Zubehör aus dem Filament-Shop. Wird einmal gekauft und steht dann im Abstellraum.
export const ACCESSORIES = [
  {
    id: 'dryer', name: 'Filament-Trockenschrank', price: 129,
    hint: 'Hält die Spulen im Regal trocken und trocknet feuchte Spulen wieder',
  },
];

export const accessoryById = (id) => ACCESSORIES.find((a) => a.id === id);

// Fehldrucke: was auf dem Druckbett passiert, wenn etwas schiefgeht
export const FAILURES = {
  spaghetti: { name: 'Spaghetti', text: 'Das Teil hat sich gelöst – jetzt liegt ein Haufen Filament-Spaghetti auf dem Bett' },
  detached: { name: 'Abgelöst', text: 'Das Teil ist vom Druckbett gerissen und umgekippt' },
  warp: { name: 'Verzogen', text: 'Die Ecken haben sich hochgebogen (Warping)' },
  clog: { name: 'Düse verstopft', text: 'Aus der Düse kommt nichts mehr – erst freistechen, dann geht es weiter' },
};

// Einrichtung für den Druckertisch: kommt als Karton in den Abstellraum und belegt aufgestellt einen Stellplatz.
// capacity: Spulen (Filament-Regal) bzw. Ersatzteile (Ersatzteilregal)
export const FURNITURE = [
  {
    id: 'filament-rack', name: 'Filament-Regal', price: 49, capacity: 8,
    hint: 'Hält 8 Spulen griffbereit direkt neben den Druckern',
  },
  {
    id: 'parts-rack', name: 'Ersatzteilregal', price: 39, capacity: 12,
    hint: 'Sortimentskasten für bis zu 12 Ersatzdüsen',
  },
];

export const furnitureById = (id) => FURNITURE.find((f) => f.id === id);

// Ersatzteile: werden direkt ins Ersatzteilregal geliefert
export const SPARE_PARTS = [
  { id: 'nozzle', name: 'Ersatzdüse 0,4 mm', price: 12, hint: 'Verschlissene oder verstopfte Düse tauschen' },
];
