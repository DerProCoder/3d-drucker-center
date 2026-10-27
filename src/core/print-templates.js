// Was Drucker und Laser herstellen: Druckvorlagen, Laservorlagen und -motive, dazu die möglichen Fehldrucke.
// Reine Daten.

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

// Druck- und Laservorlagen
export const templateById = (id) => PRINT_TEMPLATES.find((t) => t.id === id) ?? LASER_TEMPLATES.find((t) => t.id === id);

// ---------- Laser (R1) ----------

// Was der R1 aus einer Holzplatte macht. laser: 'text' (eigener Text eingraviert), 'logo' (Motiv eingraviert),
// 'cut' (Motiv mehrfach ausgeschnitten). pieces: so viele fertige Teile gibt eine Platte, minutes: Zeit bei 100 %
export const LASER_TEMPLATES = [
  { id: 'wood-sign', name: 'Holzschild mit Gravur', laser: 'text', minutes: 35, pieces: 1 },
  { id: 'wood-logo', name: 'Holzbild mit Logo', laser: 'logo', minutes: 45, pieces: 1 },
  { id: 'wood-cutout', name: 'Ausgeschnittene Holzfiguren', laser: 'cut', minutes: 30, pieces: 6 },
];
export const isLaserTemplate = (template) => !!template?.laser;

// Motive für Logo-Gravur und Ausschneiden (Umrisse in models/laser-motifs.js)
export const LASER_MOTIFS = [
  { id: 'stern', name: 'Stern' },
  { id: 'herz', name: 'Herz' },
  { id: 'katze', name: 'Katze' },
  { id: 'zahnrad', name: 'Zahnrad' },
];
export const LASER_TEXT_MAX = 24; // so viele Zeichen passen aufs Schild

// Fehldrucke: was auf dem Druckbett passiert, wenn etwas schiefgeht
export const FAILURES = {
  spaghetti: { name: 'Spaghetti', text: 'Das Teil hat sich gelöst – jetzt liegt ein Haufen Filament-Spaghetti auf dem Bett' },
  detached: { name: 'Abgelöst', text: 'Das Teil ist vom Druckbett gerissen und umgekippt' },
  warp: { name: 'Verzogen', text: 'Die Ecken haben sich hochgebogen (Warping)' },
  clog: { name: 'Düse verstopft', text: 'Aus der Düse kommt nichts mehr – erst freistechen, dann geht es weiter' },
};
