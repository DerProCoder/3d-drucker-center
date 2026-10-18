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

// Druckgeschwindigkeit in Prozent der Standardgeschwindigkeit. Gilt für alle Drucker gleich;
// mehr als 166 % geht nicht.
export const SPEED_MODES = [
  { id: 'silent', name: 'Leise', percent: 50 },
  { id: 'standard', name: 'Standard', percent: 100 },
  { id: 'sport', name: 'Sport', percent: 125 },
  { id: 'ludicrous', name: 'Ludicrous', percent: 166 },
];

export const speedById = (id) => SPEED_MODES.find((s) => s.id === id);

// build: Bauraum in mm (Breite × Tiefe × Höhe), powerCostPerMonth: Stromkosten in € pro Monat
// style wählt das 3D-Modell in printer-model.js, accent färbt die Klassen-Plakette im Shop
// (bei den Platzhaltern auch das Modell, size in Metern)
export const PRINTERS = [
  {
    id: 'a1-mini', name: 'Bambu Lab A1 mini', tier: 'Einsteiger', price: 180,
    build: { x: 180, y: 180, z: 180 }, materials: ['PLA', 'PETG'], powerCostPerMonth: 25,
    style: 'a1-mini', accent: '#2f7de1',
  },
  {
    id: 'a1', name: 'Bambu Lab A1', tier: 'Mittelklasse', price: 220,
    build: { x: 256, y: 256, z: 256 }, materials: ['PLA', 'PETG', 'ABS'], powerCostPerMonth: 35,
    style: 'a1', accent: '#e1572f',
  },
  {
    id: 'forgecube-x1', name: 'ForgeCube X1', tier: 'Profi', price: 2490,
    build: { x: 300, y: 300, z: 300 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerCostPerMonth: 50,
    style: 'enclosed', size: { w: 0.5, h: 0.6, d: 0.5 }, accent: '#22b573',
  },
  {
    id: 'forgecube-industrial', name: 'ForgeCube Industrial', tier: 'Industrie', price: 6900,
    build: { x: 400, y: 400, z: 450 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'], powerCostPerMonth: 90,
    style: 'enclosed', size: { w: 0.6, h: 0.78, d: 0.6 }, accent: '#9b59ff',
  },
];

export const formatBuildVolume = ({ x, y, z }) => `${x} × ${y} × ${z} mm`;

// Was man drucken kann. grams: Filamentverbrauch, minutes: Druckzeit bei 100 %,
// size: Abmessungen in mm (Breite × Tiefe × Höhe, muss in den Bauraum passen). Die 3D-Form steht in print-shapes.js.
export const PRINT_TEMPLATES = [
  { id: 'keychain', name: 'Schlüsselanhänger', grams: 8, minutes: 25, size: { x: 50, y: 30, z: 6 }, materials: ['PLA', 'PETG', 'ABS', 'TPU'] },
  { id: 'cable-clips', name: 'Kabelclip-Set', grams: 15, minutes: 40, size: { x: 66, y: 50, z: 12 }, materials: ['PLA', 'PETG', 'ABS'] },
  { id: 'phone-stand', name: 'Handyhalter', grams: 45, minutes: 100, size: { x: 90, y: 80, z: 110 }, materials: ['PLA', 'PETG', 'ABS'] },
  { id: 'phone-case', name: 'Handyhülle', grams: 28, minutes: 110, size: { x: 80, y: 160, z: 12 }, materials: ['TPU'] },
  { id: 'gears', name: 'Zahnrad-Set', grams: 60, minutes: 150, size: { x: 125, y: 84, z: 16 }, materials: ['PETG', 'ABS'] },
  { id: 'vase', name: 'Vase', grams: 130, minutes: 260, size: { x: 140, y: 140, z: 220 }, materials: ['PLA', 'PETG'] },
  { id: 'dragon', name: 'Drachenfigur', grams: 95, minutes: 300, size: { x: 160, y: 90, z: 115 }, materials: ['PLA'] },
  { id: 'tool-holder', name: 'Werkzeughalter', grams: 160, minutes: 330, size: { x: 200, y: 120, z: 80 }, materials: ['PETG', 'ABS'] },
];

export const templateById = (id) => PRINT_TEMPLATES.find((t) => t.id === id);

export const SPOOL_GRAMS = 1000; // eine volle Spule
