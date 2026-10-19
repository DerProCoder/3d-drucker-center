// Alles, was man im Shop kaufen kann. Reine Daten, damit Preise und Werte an einer Stelle stehen.

// Bambu-Lab-Filamentsorten. finish bestimmt das Aussehen von Spule und Druckteil (siehe models/spool.js,
// world/workshop.js), payBonus, wie viel mehr Kunden für Aufträge in dieser Sorte zahlen. special: Effektsorte –
// Kunden bestellen sie nur ab und zu. label steht im Namen („PLA Matte Aschgrau“), bei Basic bleibt es leer.
export const FILAMENT_LINES = {
  'pla-basic': { label: '', name: 'PLA Basic', hint: 'Der Allrounder in vielen Farben' },
  'pla-matte': { label: 'Matte', name: 'PLA Matte', finish: 'matte', special: true, payBonus: 1.15, hint: 'Samtig matt, Schichtlinien fallen kaum auf' },
  'pla-silk': { label: 'Silk+', name: 'PLA Silk+', finish: 'silk', special: true, payBonus: 1.3, hint: 'Seidiger Metallic-Glanz' },
  'pla-glow': { label: 'Glow', name: 'PLA Glow', finish: 'glow', special: true, payBonus: 1.5, hint: 'Leuchtet im Dunkeln nach' },
  'pla-translucent': { label: 'Translucent', name: 'PLA Translucent', finish: 'translucent', special: true, payBonus: 1.25, hint: 'Durchscheinend wie Glas' },
  'petg-basic': { label: '', name: 'PETG Basic', hint: 'Robust und schlagfest, gut für Gebrauchsteile' },
  'petg-translucent': { label: 'Translucent', name: 'PETG Translucent', finish: 'translucent', special: true, payBonus: 1.25, hint: 'Durchscheinend und zäh' },
  abs: { label: '', name: 'ABS', hint: 'Hitzebeständig, braucht ein geschlossenes Gehäuse' },
  'tpu-95a': { label: '', name: 'TPU 95A HF', hint: 'Flexibel und gummiartig, schnell druckbar' },
};

// Preise pro 1-kg-Spule in € (Stand Oktober 2026, 3DJake.de; Silk+, Translucent und die ABS-Spule geschätzt).
// Farbwerte aus der Open Filament Database (MIT-Lizenz, siehe README).
// Die ID ergibt sich aus Material, Sorte und Farbe. Spielstände von vor den Sorten nutzen IDs wie 'pla-grün' –
// wo sich der Farbname geändert hat, steht die alte ID als letztes Argument, damit gespeicherte Spulen gültig bleiben.
const slug = (text) => text.toLowerCase().replace(/\+/g, '').replace(/\s+/g, '-');
const filament = (lineId, color, hex, price, legacyId = null) => {
  const line = FILAMENT_LINES[lineId];
  const material = line.name.split(' ')[0];
  return {
    id: legacyId ?? (line.label ? `${slug(material)}-${slug(line.label)}-${slug(color)}` : `${slug(material)}-${slug(color)}`),
    material,
    lineId,
    line,
    color,
    hex,
    price,
    finish: line.finish ?? 'basic',
    translucent: line.finish === 'translucent',
  };
};

export const FILAMENTS = [
  filament('pla-basic', 'Weiß', '#FFFFFF', 19.99), // Jade White
  filament('pla-basic', 'Schwarz', '#000000', 19.99),
  filament('pla-basic', 'Grau', '#8E9089', 19.99),
  filament('pla-basic', 'Rot', '#C12E1F', 19.99),
  filament('pla-basic', 'Blau', '#0A2989', 19.99),
  filament('pla-basic', 'Cyan', '#0086D6', 19.99),
  filament('pla-basic', 'Bambu-Grün', '#00AE42', 19.99, 'pla-grün'),
  filament('pla-basic', 'Gelb', '#F4EE2A', 19.99),
  filament('pla-basic', 'Orange', '#FF6A13', 19.99),
  filament('pla-basic', 'Pink', '#F55A74', 19.99),
  filament('pla-basic', 'Magenta', '#EC008C', 19.99),
  filament('pla-basic', 'Lila', '#5E43B7', 19.99),
  filament('pla-matte', 'Elfenbeinweiß', '#F4F1E6', 19.99), // Ivory White – in der Datenbank reinweiß
  filament('pla-matte', 'Anthrazit', '#1E1E1E', 19.99),     // Charcoal – in der Datenbank tiefschwarz
  filament('pla-matte', 'Aschgrau', '#9B9EA0', 19.99),
  filament('pla-matte', 'Scharlachrot', '#DE4343', 19.99),
  filament('pla-matte', 'Marineblau', '#0078BF', 19.99),
  filament('pla-matte', 'Grasgrün', '#61C680', 19.99),
  filament('pla-matte', 'Zitronengelb', '#F7D959', 19.99),
  filament('pla-matte', 'Mandarine', '#F99963', 19.99),
  filament('pla-matte', 'Sakura-Rosa', '#E8AFCF', 19.99),
  filament('pla-matte', 'Latte-Braun', '#D3B7A7', 19.99),
  filament('pla-matte', 'Terrakotta', '#A15636', 19.99),
  filament('pla-silk', 'Gold', '#F4A925', 22.99),
  filament('pla-silk', 'Silber', '#C8C8C8', 22.99),
  filament('pla-silk', 'Roségold', '#BA9594', 22.99),
  filament('pla-silk', 'Champagner', '#F3CFB2', 22.99),
  filament('pla-silk', 'Blau', '#008BDA', 22.99),
  filament('pla-silk', 'Candy-Rot', '#D02727', 22.99),
  filament('pla-silk', 'Mint', '#96DCB9', 22.99),
  filament('pla-silk', 'Lila', '#8671CB', 22.99),
  filament('pla-glow', 'Grün', '#A1FFAC', 27.99),
  filament('pla-glow', 'Blau', '#7AC0E9', 27.99),
  filament('pla-glow', 'Orange', '#FF9D5B', 27.99),
  filament('pla-glow', 'Pink', '#F17B8F', 27.99),
  filament('pla-glow', 'Gelb', '#F8FF80', 27.99),
  filament('pla-translucent', 'Eisblau', '#B8CDE9', 22.99, 'pla-transparent'),
  filament('pla-translucent', 'Rot', '#B50011', 22.99),
  filament('pla-translucent', 'Blau', '#0047BB', 22.99),
  filament('pla-translucent', 'Orange', '#F74E02', 22.99),
  filament('pla-translucent', 'Lavendel', '#B8ACD6', 22.99),
  filament('pla-translucent', 'Petrol', '#009FA1', 22.99),
  filament('petg-basic', 'Schwarz', '#000000', 18.99),
  filament('petg-basic', 'Weiß', '#FFFFFF', 18.99),
  filament('petg-basic', 'Grau', '#7F7E83', 18.99),
  filament('petg-basic', 'Rot', '#D6001C', 18.99),
  filament('petg-basic', 'Blau', '#0086D6', 18.99),
  filament('petg-basic', 'Orange', '#FF671F', 18.99),
  filament('petg-basic', 'Gelb', '#FCE300', 18.99),
  filament('petg-basic', 'Limettengrün', '#62AF41', 18.99),
  filament('petg-translucent', 'Klar', '#E8F2F8', 19.99, 'petg-transparent'),
  filament('petg-translucent', 'Orange', '#FF911A', 19.99),
  filament('petg-translucent', 'Hellblau', '#61B0FF', 19.99),
  filament('petg-translucent', 'Lila', '#D6ABFF', 19.99),
  filament('petg-translucent', 'Türkis', '#77EDD7', 19.99),
  filament('abs', 'Weiß', '#FFFFFF', 19.99),
  filament('abs', 'Schwarz', '#000000', 19.99),
  filament('abs', 'Silbergrau', '#87909A', 19.99, 'abs-grau'),
  filament('abs', 'Rot', '#D32941', 19.99),
  filament('abs', 'Blau', '#0A2CA5', 19.99),
  filament('abs', 'Bambu-Grün', '#00AE42', 19.99),
  filament('abs', 'Orange', '#FF6A13', 19.99),
  filament('tpu-95a', 'Schwarz', '#101820', 34.99),
  filament('tpu-95a', 'Weiß', '#FFFFFF', 34.99),
  filament('tpu-95a', 'Grau', '#898D8D', 34.99),
  filament('tpu-95a', 'Rot', '#C8102E', 34.99),
  filament('tpu-95a', 'Blau', '#0072CE', 34.99),
  filament('tpu-95a', 'Gelb', '#F3E600', 34.99),
];

export const filamentById = (id) => FILAMENTS.find((f) => f.id === id);
// Farbe mit Sorte, z. B. „Matte Aschgrau“ (bei Basic nur „Aschgrau“)
export const filamentColorName = (f) => (f.line.label ? `${f.line.label} ${f.color}` : f.color);
// Voller Name, z. B. „PLA Matte Aschgrau“
export const filamentLabel = (f) => `${f.material} ${filamentColorName(f)}`;

// Druckgeschwindigkeit in Prozent der Standardgeschwindigkeit. Gilt für alle Drucker gleich, mehr als 166 % geht
// nicht – außer der Drucker hat ein höheres maxSpeed (H2S und H2D Pro bis 200 %, X1E bis 300 %).
export const SPEED_MODES = [
  { id: 'silent', name: 'Leise', percent: 50 },
  { id: 'standard', name: 'Standard', percent: 100 },
  { id: 'sport', name: 'Sport', percent: 125 },
  { id: 'ludicrous', name: 'Ludicrous', percent: 166 },
  { id: 'turbo', name: 'Turbo', percent: 200 },
  { id: 'hyper', name: 'Hyper', percent: 300 },
];

export const speedById = (id) => SPEED_MODES.find((s) => s.id === id);
export const DEFAULT_MAX_SPEED = 166; // ohne maxSpeed im Katalogeintrag
// Stufen, die dieser Drucker (Katalogeintrag) fahren kann
export const speedModesFor = (model) => SPEED_MODES.filter((s) => s.percent <= (model.maxSpeed ?? DEFAULT_MAX_SPEED));

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
    // X1E: Bauraum wie der X2D, zwei Düsen, AMS und KI-Kamera – dazu der schnellste Drucker der Halle mit der
    // Hyper-Stufe bis 300 % und einem Fehldruckrisiko von nur 75 % (failureFactor) gegenüber dem P1S
    id: 'x1e', name: 'Bambu Lab X1E', tier: 'Hyper-Speed', price: 2200,
    build: { x: 256, y: 256, z: 256 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerPerHour: 1.1, enclosed: true,
    spoolSlots: 4, nozzles: 2, aiCamera: true, maxSpeed: 300, failureFactor: 0.75, style: 'x1e', accent: '#2ee6a8',
  },
  {
    // H2D: großer Bauraum, zwei Düsen und KI-Kamera wie der X2D, rundum Fenster und ein großes Display
    id: 'h2d', name: 'Bambu Lab H2D', tier: 'Flaggschiff', price: 1400,
    build: { x: 325, y: 325, z: 325 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerPerHour: 1.2, enclosed: true,
    spoolSlots: 4, nozzles: 2, aiCamera: true, style: 'h2d', accent: '#e8c547',
  },
  {
    // H2S: so groß wie der H2D mit KI-Kamera, aber nur eine Düse. Dafür maxSpeed 200 (Turbo-Stufe) und
    // failureFactor: präzisere Mechanik und stärkere Bauteilkühlung – nur halb so viele Fehldrucke
    id: 'h2s', name: 'Bambu Lab H2S', tier: 'Speed', price: 1800,
    build: { x: 325, y: 325, z: 325 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerPerHour: 1.3, enclosed: true,
    spoolSlots: 4, aiCamera: true, maxSpeed: 200, failureFactor: 0.5, style: 'h2s', accent: '#19c3e6',
  },
  {
    // H2D Pro: wie der H2D (großer Bauraum, zwei Düsen, KI-Kamera), dazu die Turbo-Stufe bis 200 % wie beim H2S
    id: 'h2d-pro', name: 'Bambu Lab H2D Pro', tier: 'Dual-Nozzle Pro', price: 2000,
    build: { x: 325, y: 325, z: 325 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerPerHour: 1.3, enclosed: true,
    spoolSlots: 4, nozzles: 2, aiCamera: true, maxSpeed: 200, style: 'h2d-pro', accent: '#ff4f6e',
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
