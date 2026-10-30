// Kellerausbau (#50): Der Keller (Stufe 1 = 20 × 20 m, so groß wie die Halle) wächst in Stufen bis 120 × 120 m. Er ist
// in Felder zu 20 × 20 m geteilt; je Feld legt der Spieler fest, ob es „Lager“ oder „Daten-Bunker“ ist.
// Treppenhaus und Fahrstuhl bleiben in der Nordwest-Ecke, jede Stufe legt einen L-förmigen Ring nach Osten (+x) und
// Süden (+z) an. Feld 0 ist der bisherige Keller (x und z von −10 bis +10, wie die Halle) und bleibt immer Lager.
//
// Felder sind fest in einem 6 × 6-Raster nummeriert: Index = Reihe × 6 + Spalte (Reihe 0 im Norden, Spalte 0 im
// Westen). So behält jedes Feld seine Nummer, wenn der Keller wächst.
//
// Stufe und Bestellung hält core/upgrades.js (basementStage), hier liegen Feldtypen und Geometrie.
// Bewusst ohne Three.js und DOM.

export const FIELD_SIZE = 20;          // m, Kantenlänge eines Feldes
export const GRID = 6;                 // höchstens 6 × 6 Felder
export const BASEMENT_FLOOR_Y = -70;   // Kellerboden (wie world/basement.js: 20 Stockwerke × 3,5 m)
const ORIGIN = -FIELD_SIZE / 2;        // Nordwest-Ecke des Kellers (x und z), Feld 0 = heutiger Keller

// Ausbaustufen: Stufe 1 ist im Keller enthalten (core/upgrades.js: BASEMENT_PRICE), danach kostet jede Stufe extra
export const BASEMENT_STAGES = [
  { stage: 1, size: 20, fields: 1, price: 0 },
  { stage: 2, size: 40, fields: 4, price: 10000 },
  { stage: 3, size: 60, fields: 9, price: 25000 },
  { stage: 4, size: 80, fields: 16, price: 50000 },
  { stage: 5, size: 100, fields: 25, price: 90000 },
  { stage: 6, size: 120, fields: 36, price: 150000 },
];
export const MAX_BASEMENT_STAGE = BASEMENT_STAGES.length;

export const FIELD_TYPES = ['storage', 'bunker'];
export const FIELD_TYPE_LABELS = { storage: 'Lager', bunker: 'Daten-Bunker' };

export function stageInfo(stage) {
  return BASEMENT_STAGES[stage - 1] ?? null;
}

// Grenzen eines Feldes in Weltkoordinaten (unabhängig davon, ob es schon gebaut ist)
export function fieldBounds(i) {
  const col = i % GRID;
  const row = Math.floor(i / GRID);
  const minX = ORIGIN + col * FIELD_SIZE;
  const minZ = ORIGIN + row * FIELD_SIZE;
  return { minX, maxX: minX + FIELD_SIZE, minZ, maxZ: minZ + FIELD_SIZE, y: BASEMENT_FLOOR_Y, col, row };
}

// stage(): gebaute Stufe (0 = kein Keller, 1…6), kommt von core/upgrades.js
export class BasementLayout {
  constructor(stage) {
    this.stageOf = stage;
    this.types = Array(GRID * GRID).fill(null); // 'storage' | 'bunker' | null (noch nicht festgelegt)
    this.types[0] = 'storage';
    this.checks = new Set();   // (i, from, to) => Grund-Text, false oder null – z. B. Bunker (#52), Lager (#53)
    this.listeners = new Set();
  }

  get stage() { return this.stageOf(); }
  // Kantenlänge des gebauten Kellers in m (0 ohne Keller)
  get size() { return this.stage * FIELD_SIZE; }
  // Felder je Richtung
  get span() { return this.stage; }

  isBuilt(i) {
    if (!Number.isInteger(i) || i < 0 || i >= GRID * GRID) return false;
    return i % GRID < this.span && Math.floor(i / GRID) < this.span;
  }

  // Alle gebauten Felder (Feld 0 zuerst, zeilenweise von Nord nach Süd)
  fields() {
    const list = [];
    for (let i = 0; i < GRID * GRID; i++) {
      if (this.isBuilt(i)) list.push({ index: i, type: this.fieldType(i), bounds: fieldBounds(i) });
    }
    return list;
  }

  // Gebautes Feld an der Stelle (x, z) im Keller oder null; die Außenkante im Osten/Süden zählt noch zum Feld
  fieldAt(x, z) {
    const size = this.size;
    if (!size) return null;
    const dx = x - ORIGIN;
    const dz = z - ORIGIN;
    if (dx < 0 || dz < 0 || dx > size || dz > size) return null;
    const col = Math.min(this.span - 1, Math.floor(dx / FIELD_SIZE));
    const row = Math.min(this.span - 1, Math.floor(dz / FIELD_SIZE));
    return row * GRID + col;
  }

  fieldBounds(i) { return fieldBounds(i); }

  fieldType(i) {
    if (i === 0) return 'storage';
    return this.types[i] ?? null;
  }

  // Rückruf, ob ein Feld umgestellt werden darf: check(i, from, to) gibt einen Grund-Text (z. B. „Im Feld stehen noch
  // 3 Serverschränke“), false (ohne Grund) oder null/true (leer) zurück. Mehrere Systeme können je einen eintragen.
  // Gibt eine Funktion zum Austragen zurück.
  addFieldCheck(check) {
    this.checks.add(check);
    return () => this.checks.delete(check);
  }

  // Grund, warum Feld i gerade nicht auf type umgestellt werden kann, oder null
  fieldProblem(i, type) {
    if (!this.isBuilt(i)) return 'Feld ist noch nicht ausgebaut';
    if (i === 0) return 'Das Feld am Treppenhaus bleibt Lager';
    if (type !== null && !FIELD_TYPES.includes(type)) return 'Unbekannte Feldart';
    const from = this.fieldType(i);
    if (from === type) return null;
    if (from !== null) {
      for (const check of this.checks) {
        const result = check(i, from, type);
        if (typeof result === 'string' && result) return result;
        if (result === false) return 'Das Feld ist nicht leer';
      }
    }
    return null;
  }

  // Feld i auf type ('storage' | 'bunker' | null) stellen. Gibt null zurück, wenn es geklappt hat, sonst den Grund.
  setFieldType(i, type) {
    const problem = this.fieldProblem(i, type);
    if (problem) return problem;
    if (this.fieldType(i) === type) return null;
    const from = this.fieldType(i);
    this.types[i] = type;
    this.emit({ type: 'field', index: i, from, to: type });
    return null;
  }

  // Nächste Wahl für einen Klick auf der Kellerkarte: nicht festgelegt → Lager → Bunker → Lager …
  nextType(i) {
    return this.fieldType(i) === 'storage' ? 'bunker' : 'storage';
  }

  // Änderungen: { type: 'stage', stage } (Stufe fertig), { type: 'field', index, from, to }, { type: 'load' }.
  // Der Hörer wird beim Eintragen nicht sofort aufgerufen. Gibt eine Funktion zum Austragen zurück.
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(change) {
    for (const listener of this.listeners) listener(change, this);
  }

  // Spielstand
  save() {
    return [...this.types];
  }

  load(types) {
    this.types = Array(GRID * GRID).fill(null);
    if (Array.isArray(types)) {
      for (let i = 0; i < GRID * GRID; i++) this.types[i] = FIELD_TYPES.includes(types[i]) ? types[i] : null;
    }
    this.types[0] = 'storage';
    this.emit({ type: 'load' });
  }
}
