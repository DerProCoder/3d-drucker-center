// Keller-Lager (#53, Raster #72): Felder vom Typ „Lager“ (core/basement-layout.js) sind voller Lagerplätze in Reihen
// mit Gängen dazwischen (STORAGE_PLACES). Auf jedem Platz steht entweder ein Kartonstapel oder ein Filament-Regal.
//   - Kartons: ein Stapel je Platz bis unter die Decke (core/storage-stack.js). Ist der Abstellraum voll, landen
//     Lieferungen hier (economy.overflow) – vom Treppenhaus aus der nächste Platz mit Luft zuerst (fillOrder). Man kann
//     Kartons auch selbst auf einen Platz stellen. Karton: location 'basement', basement = { field, place, order } –
//     order ist die Reihenfolge, in der die Kartons dort abgestellt wurden. Unterwegs reserviert ein Karton seinen
//     Platz schon (location 'shipping' mit basement), damit zwei Bestellungen nicht denselben Platz bekommen.
//   - Filament-Regale (Möbel 'filament-rack'): location 'basement-rack', basement = { field, place }. Spulen darin
//     ziehen keine Feuchtigkeit (economy.updateMoisture), trocknen aber auch nicht – das kann nur der Trockenschrank.
//   Ein Platz mit Regal nimmt keine Kartons an und umgekehrt (auch keine für eine Lieferung reservierten).
// Ältere Stände (#53: vier Zonen zu je vier Stapeln und acht Regalplätze je Feld) wandelt load() um: alles kommt auf
// freie Plätze im neuen Raster im selben Feld (siehe settle).
// Bewusst ohne Three.js und DOM. Die Kartonhöhen kennt nur die 3D-Seite (world/basement-storage.js): sie setzt heightOf.
import { stackBoxes } from './storage-stack.js';
import { FIELD_SIZE, fieldBounds } from './basement-layout.js';

export const BASEMENT_STACK_CEILING = 3.1; // m – Kellerdecke bei 3,5 m, Leuchten und Schild hängen tiefer
export const DRY_RACK_LABEL = '📍 Keller-Lager (trocken)';

// ---------- Platzraster eines Lager-Feldes ----------
// Lage relativ zur Feldmitte (m), x nach Osten, z nach Süden. Reihen laufen von Nord nach Süd, je zwei Plätze
// Rücken an Rücken (Doppelreihe), damit jeder Platz an einem Gang liegt:
//   x: | Rand | Gang 1,5 | Doppelreihe 2,4 | Gang 1,5 | Doppelreihe 2,4 | Mittelgang 2,8 | … gespiegelt …
//   z: je Feldhälfte sechs Plätze hintereinander, dazwischen der Hauptgang (Ost–West, 2,8 m)
// Mittelgang und Hauptgang sind so breit wie die Türbereiche in der Mitte jeder Feldseite (Tür 1,8 m + 2 × 0,5 m,
// world/basement-fields.js fieldInfo). Die Stützen an den Feldecken stehen weit außerhalb der Reihen.
export const PLACE = { w: 1.2, d: 1.15 };      // Platz: Breite (x) und Tiefe (z, Stapel-Abstand wie früher)
export const AISLE = 1.5;                       // Gang zwischen den Doppelreihen (Entscheidung des Nutzers)
export const MAIN_AISLE = 2.8;                  // Mittelgang (Nord–Süd) und Hauptgang (Ost–West)
const ROW_PLACES = 6;                           // Plätze je Reihe und Feldhälfte
const BLOCKS = [MAIN_AISLE / 2, MAIN_AISLE / 2 + 2 * PLACE.w + AISLE]; // Innenkante der Doppelreihen (Abstand zur Mitte)

// facing: Vorderseite eines Regals nach Osten (+1) oder Westen (−1) – immer zum nächsten Gang
export const STORAGE_PLACES = (() => {
  const list = [];
  for (const sx of [-1, 1]) {
    for (const inner of BLOCKS) {
      for (const [col, facing] of [[0, -sx], [1, sx]]) {
        const x = sx * (inner + (col + 0.5) * PLACE.w);
        for (const sz of [-1, 1]) {
          for (let k = 0; k < ROW_PLACES; k++) {
            list.push({ x: +x.toFixed(3), z: +(sz * (MAIN_AISLE / 2 + (k + 0.5) * PLACE.d)).toFixed(3), facing });
          }
        }
      }
    }
  }
  return list;
})();
export const PLACES_PER_FIELD = STORAGE_PLACES.length;

// Feld 0: Treppenhaus (Ausgang nach Osten bei x −4,8), Keller-Fahrstuhl samt Ausstieg an der Westwand
// (world/basement.js STAIRWELL, BASEMENT_ELEVATOR) – dort bleibt die Nordwest-Ecke frei, vor dem Ausgang des
// Treppenhauses zusätzlich die nördlichsten Plätze bis zum Mittelgang
export const FIELD0_FREE = [
  { minX: -FIELD_SIZE / 2, maxX: -3.8, minZ: -FIELD_SIZE / 2, maxZ: -4.9 },
  { minX: -FIELD_SIZE / 2, maxX: -MAIN_AISLE / 2, minZ: -FIELD_SIZE / 2, maxZ: -7.15 },
];
// Ausgang des Treppenhauses (relativ zur Mitte von Feld 0): von hier aus füllen Lieferungen die Plätze
export const STAIRS_EXIT = { x: -4.3, z: -8.7 };

const EPS = 1e-6; // Rundung: Plätze, die eine Sperrfläche nur berühren, bleiben
const overlapsRect = (p, r) => p.x + PLACE.w / 2 > r.minX + EPS && p.x - PLACE.w / 2 < r.maxX - EPS
  && p.z + PLACE.d / 2 > r.minZ + EPS && p.z - PLACE.d / 2 < r.maxZ - EPS;
const FIELD0_BLOCKED = new Set(STORAGE_PLACES.map((p, k) => (FIELD0_FREE.some((r) => overlapsRect(p, r)) ? k : -1)).filter((k) => k >= 0));

// Plätze (Nummern in STORAGE_PLACES), die es in Feld i gibt
export function placesOf(field) {
  return STORAGE_PLACES.map((_, k) => k).filter((k) => field !== 0 || !FIELD0_BLOCKED.has(k));
}

export function isPlaceOf(field, place) {
  return Number.isInteger(place) && place >= 0 && place < PLACES_PER_FIELD && !(field === 0 && FIELD0_BLOCKED.has(place));
}

// Lage eines Platzes in Weltkoordinaten (x, z) samt Ausrichtung
export function placeCenter(field, place) {
  const b = fieldBounds(field);
  const p = STORAGE_PLACES[place];
  return { x: (b.minX + b.maxX) / 2 + p.x, z: (b.minZ + b.maxZ) / 2 + p.z, facing: p.facing };
}

// Alte Aufteilung (#53, Spielstand-Version 27 … 32) – nur zum Umwandeln: Mitte jeder Zone bzw. jedes Regalplatzes
const LEGACY_ZONES = [[-2.45, -6.275], [2.45, -6.275], [-2.45, 6.275], [2.45, 6.275]];
const LEGACY_SPOTS = [-1.75, 1.75].flatMap((x) => [-1.5, -0.5, 0.5, 1.5].map((z) => [x, z]));

const DEFAULT_HEIGHT = 0.6; // ohne 3D (z. B. Tests ohne heightOf): angenommene Kartonhöhe
const keyOf = (field, place) => `${field}:${place}`;

export class BasementStorage {
  // economy: core/economy.js · layout: core/basement-layout.js (upgrades.basementLayout)
  constructor(economy, layout) {
    this.economy = economy;
    this.layout = layout;
    this.heightFn = null;
    this.pending = [];         // nach dem Laden noch einzusortieren (alte Plätze, Konflikte) – siehe settle
    this.orderCache = { key: null, list: [] };
    economy.overflow = this;   // Lieferziel, wenn der Abstellraum voll ist
    // Lager-Feld nur umstellbar, wenn dort nichts liegt oder steht (auch keine reservierte Lieferung)
    this.removeCheck = layout.addFieldCheck((i, from) => (from === 'storage' ? this.fieldProblem(i) : null));
  }

  // (entry: { model } | { type }) => Kartonhöhe in m, setzt world/basement-storage.js. Erst dann stimmen die
  // Stapelhöhen – was beim Laden noch einzusortieren war, kommt jetzt auf seinen Platz.
  get heightOf() { return this.heightFn; }
  set heightOf(fn) {
    this.heightFn = fn;
    if (fn) this.settle();
  }

  get items() {
    return [...this.economy.printers, ...this.economy.furniture];
  }

  // Gebaute Lager-Felder (Feld 0 zuerst)
  storageFields() {
    return this.layout.fields().filter((f) => f.type === 'storage').map((f) => f.index);
  }

  isStorageField(i) {
    return this.layout.isBuilt(i) && this.layout.fieldType(i) === 'storage';
  }

  isPlace(field, place) {
    return this.isStorageField(field) && isPlaceOf(field, place);
  }

  // Alle Lager-Plätze in der Reihenfolge, in der Lieferungen sie füllen: vom Ausgang des Treppenhauses aus der
  // nächste zuerst (Weg über die Gänge, daher Abstand in x plus Abstand in z)
  fillOrder() {
    const fields = this.storageFields();
    const key = fields.join(',');
    if (this.orderCache.key === key) return this.orderCache.list;
    const b0 = fieldBounds(0);
    const sx = (b0.minX + b0.maxX) / 2 + STAIRS_EXIT.x;
    const sz = (b0.minZ + b0.maxZ) / 2 + STAIRS_EXIT.z;
    const list = fields.flatMap((field) => placesOf(field).map((place) => {
      const c = placeCenter(field, place);
      return { field, place, d: Math.abs(c.x - sx) + Math.abs(c.z - sz) };
    }));
    list.sort((a, b) => a.d - b.d || a.field - b.field || a.place - b.place);
    this.orderCache = { key, list };
    return list;
  }

  // ---------- Belegung ----------

  // Belegung aller Plätze in einem Durchgang: Map „Feld:Platz“ → { boxes: [in Abstell-Reihenfolge], rack }.
  // boxes enthält auch Kartons, die dorthin unterwegs sind.
  index() {
    const map = new Map();
    const at = (b) => {
      const k = keyOf(b.field, b.place);
      let e = map.get(k);
      if (!e) map.set(k, (e = { boxes: [], rack: null }));
      return e;
    };
    for (const x of this.items) {
      const b = x.basement;
      if (!b || !Number.isInteger(b.place)) continue;
      if (x.location === 'basement' || x.location === 'shipping') at(b).boxes.push(x);
      else if (x.location === 'basement-rack') at(b).rack = x;
    }
    for (const e of map.values()) e.boxes.sort((a, b) => a.basement.order - b.basement.order);
    return map;
  }

  // Kartons, die auf Platz (field, place) stehen oder dorthin unterwegs sind, in Abstell-Reihenfolge
  boxesIn(field, place, idx = this.index()) {
    return idx.get(keyOf(field, place))?.boxes ?? [];
  }

  // Kartons, die im Keller stehen (ohne die, die noch unterwegs sind)
  get boxes() {
    return this.items.filter((x) => x.location === 'basement' && x.basement);
  }

  height(entry) {
    return this.heightFn?.(entry) ?? DEFAULT_HEIGHT;
  }

  // Stapel eines Platzes: { placed: [{ box: { entry, h }, column, y }], overflow }
  stack(field, place, extra = [], idx = this.index()) {
    const entries = [...this.boxesIn(field, place, idx), ...extra];
    return stackBoxes(entries.map((entry) => ({ entry, h: this.height(entry) })), BASEMENT_STACK_CEILING, 1);
  }

  // Grund, warum der Karton nicht auf den Platz passt, oder null
  boxProblem(field, place, entry, idx = this.index()) {
    if (!this.isPlace(field, place)) return 'Hier ist kein Lagerplatz';
    if (idx.get(keyOf(field, place))?.rack) return 'Hier steht ein Filament-Regal – Kartons nur auf freie Plätze oder Kartonstapel';
    if (this.stack(field, place, [entry], idx).overflow) return 'Stapel voll – die Kartons reichen bis unter die Decke';
    return null;
  }

  placeFits(field, place, entry, idx = this.index()) {
    return !this.boxProblem(field, place, entry, idx);
  }

  // Wie viele der Kartons (der Reihe nach, z. B. ein getragener Stapel von oben nach unten) passen nacheinander noch
  // auf den Platz? Für „Alles tragen“ (#63): auf einem Platz wird alles abgestellt, was dort Platz hat.
  fittingCount(field, place, entries) {
    const idx = this.index();
    if (!this.isPlace(field, place) || idx.get(keyOf(field, place))?.rack) return 0;
    let n = 0;
    while (n < entries.length && this.stack(field, place, entries.slice(0, n + 1), idx).overflow === 0) n++;
    return n;
  }

  // Erster Platz vom Treppenhaus aus, auf den der Karton ({ model } | { type } oder ein Drucker/Möbel) passt:
  // { field, place } oder null
  findPlace(entry, idx = this.index()) {
    for (const { field, place } of this.fillOrder()) {
      if (this.placeFits(field, place, entry, idx)) return { field, place };
    }
    return null;
  }

  // Hat das Keller-Lager noch Platz für diesen Karton?
  hasRoom(entry) {
    return !!this.findPlace(entry);
  }

  nextOrder() {
    let max = 0;
    for (const x of this.items) if (x.basement?.order > max) max = x.basement.order;
    return max + 1;
  }

  // Platz für eine Lieferung reservieren (economy.ship, putAway): setzt item.basement und gibt es zurück, oder null
  reserve(item) {
    const place = this.findPlace(item);
    if (!place) return null;
    item.basement = { ...place, order: this.nextOrder() };
    return item.basement;
  }

  // Karton aus der Hand auf einen Platz stellen. Gibt null zurück, wenn es geklappt hat, sonst den Grund.
  putBox(item, field, place) {
    if (!item) return 'Kein Karton in der Hand';
    const problem = this.boxProblem(field, place, item);
    if (problem) return problem;
    item.location = 'basement';
    item.slot = null;
    item.storageSpot = null;
    item.basement = { field, place, order: this.nextOrder() };
    this.economy.notify();
    return null;
  }

  // Karton aus dem Keller in die Hand nehmen (der Aufrufer legt ihn in carry)
  takeBox(item) {
    if (item?.location !== 'basement') return false;
    item.location = 'carried';
    delete item.basement;
    this.economy.notify();
    return true;
  }

  // ---------- Filament-Regale ----------

  racksIn(field) {
    return this.economy.furniture.filter((f) => f.location === 'basement-rack' && f.basement?.field === field);
  }

  get racks() {
    return this.economy.furniture.filter((f) => f.location === 'basement-rack');
  }

  rackAt(field, place, idx = this.index()) {
    return idx.get(keyOf(field, place))?.rack ?? null;
  }

  // Grund, warum das Regal nicht auf den Platz kann, oder null
  rackProblem(item, field, place, idx = this.index()) {
    if (item?.type?.id !== 'filament-rack') return 'Hier passen nur Filament-Regale hin';
    if (!this.isPlace(field, place)) return 'Hier ist kein Lagerplatz';
    const e = idx.get(keyOf(field, place));
    if (e?.rack) return 'Hier steht schon ein Regal';
    if (e?.boxes.some((x) => x.location === 'shipping')) return 'Platz ist für eine Lieferung reserviert – ein Regal braucht einen leeren Platz';
    if (e?.boxes.length) return 'Hier stehen Kartons – ein Regal braucht einen leeren Platz';
    return null;
  }

  // Leeres Filament-Regal aus der Hand auf einen Platz stellen. null = geklappt, sonst Grund.
  placeRack(item, field, place) {
    const problem = this.rackProblem(item, field, place);
    if (problem) return problem;
    item.location = 'basement-rack';
    item.slot = null;
    item.storageSpot = null;
    item.basement = { field, place };
    this.economy.notify();
    return null;
  }

  // Leeres Regal wieder aufheben (der Aufrufer legt es in carry)
  pickUpRack(item) {
    if (item?.location !== 'basement-rack' || !this.economy.isFurnitureEmpty(item)) return false;
    item.location = 'carried';
    delete item.basement;
    this.economy.notify();
    return true;
  }

  // Spulen dieser Sorte in den Keller-Regalen (trocken gelagert)
  dryStock(filamentId) {
    let n = 0;
    for (const rack of this.racks) for (const s of rack.spools ?? []) if (s?.filamentId === filamentId) n++;
    return n;
  }

  // ---------- Felder ----------

  // Grund, warum Lager-Feld i nicht umgestellt werden kann, oder null
  fieldProblem(i) {
    const boxes = this.items.filter((x) => (x.location === 'basement' || x.location === 'shipping') && x.basement?.field === i).length;
    const racks = this.racksIn(i).length;
    if (!boxes && !racks) return null;
    const parts = [];
    if (boxes) parts.push(`${boxes} ${boxes === 1 ? 'Karton' : 'Kartons'}`);
    if (racks) parts.push(`${racks} Filament-${racks === 1 ? 'Regal' : 'Regale'}`);
    return `Im Lager-Feld steht noch etwas: ${parts.join(' und ')} – erst wegräumen`;
  }

  // ---------- Laden ----------

  // Nach dem Laden: Kartons und Regale auf ungültigen Plätzen (Feld kein Lager mehr) zurück in den Abstellraum,
  // Lieferungen ohne gültigen Platz gehen in den Abstellraum. Alte Plätze (#53: basement.zone bzw. basement.spot) und
  // Kartons auf einem Regalplatz merkt sich pending – settle() verteilt sie auf freie Plätze, sobald die Kartonhöhen
  // bekannt sind (sofort, wenn heightOf schon gesetzt ist).
  load() {
    this.pending = [];
    const rackKeys = new Set();
    const legacy = (b, field) => b && b[field] != null && !Number.isInteger(b.place);
    // Erst die Regale (sie brauchen einen leeren Platz), dann die Kartons
    for (const item of this.economy.furniture) {
      if (item.location !== 'basement-rack') continue;
      const b = item.basement;
      if (!b || !this.isStorageField(b.field) || item.type?.id !== 'filament-rack') {
        this.toStorageRoom(item);
      } else if (legacy(b, 'spot')) {
        this.pending.push({ item, field: b.field, from: LEGACY_SPOTS[b.spot] ?? [0, 0], order: 0 });
      } else if (!isPlaceOf(b.field, b.place) || rackKeys.has(keyOf(b.field, b.place))) {
        // Doppelt belegt oder ungültiger Platz: neu einsortieren
        this.pending.push({ item, field: b.field, from: [0, 0], order: 0 });
      } else {
        rackKeys.add(keyOf(b.field, b.place));
      }
    }
    for (const item of this.items) {
      const b = item.basement;
      if (item.location === 'basement' || (item.location === 'shipping' && b)) {
        if (!b || !this.isStorageField(b.field)) {
          if (item.location === 'basement') this.toStorageRoom(item);
          else delete item.basement;
          continue;
        }
        if (!Number.isFinite(b.order)) b.order = this.nextOrder();
        if (legacy(b, 'zone')) {
          this.pending.push({ item, field: b.field, from: LEGACY_ZONES[b.zone] ?? [0, 0], order: b.order });
        } else if (!isPlaceOf(b.field, b.place)) {
          this.pending.push({ item, field: b.field, from: [0, 0], order: b.order });
        } else if (rackKeys.has(keyOf(b.field, b.place))) {
          // Karton auf einem Platz mit Regal: daneben stellen
          const p = STORAGE_PLACES[b.place];
          this.pending.push({ item, field: b.field, from: [p.x, p.z], order: b.order });
        }
      } else if (item.location !== 'basement-rack' && b) {
        delete item.basement;
      }
    }
    // Einzusortierende nehmen bis dahin keinen Platz ein
    for (const p of this.pending) p.item.basement = { field: p.field, pendingPlace: true, order: p.order };
    if (this.heightFn) this.settle();
  }

  // Einsortieren, was load() übrig gelassen hat, und Stapel, die (mit den echten Kartonhöhen) über die Decke ragen,
  // abbauen. Jeder Gegenstand kommt auf den freien Platz im selben Feld, der seinem alten am nächsten liegt; ist das
  // Feld voll, auf den nächsten freien Platz vom Treppenhaus aus, sonst in den Abstellraum – es geht nichts verloren.
  // Gibt zurück, wie viele Gegenstände umgestellt wurden.
  settle() {
    const work = this.pending;
    this.pending = [];
    let idx = this.index();
    // Zu hohe Stapel: die zuletzt abgestellten Kartons wegnehmen, bis der Rest unter die Decke passt
    for (const [k, e] of idx) {
      if (!e.boxes.length) continue;
      const [field, place] = k.split(':').map(Number);
      const keep = [...e.boxes];
      while (keep.length > 1 && this.stack(field, place, [], new Map([[k, { boxes: keep }]])).overflow) {
        const item = keep.pop();
        const p = STORAGE_PLACES[place];
        work.push({ item, field, from: [p.x, p.z], order: item.basement.order });
        item.basement = { field, pendingPlace: true, order: item.basement.order };
      }
    }
    if (!work.length) return 0;
    idx = this.index();
    const racks = work.filter((w) => w.item.location === 'basement-rack');
    const boxes = work.filter((w) => w.item.location !== 'basement-rack').sort((a, b) => a.order - b.order);
    const near = (w) => placesOf(w.field)
      .map((place) => ({ place, d: Math.hypot(STORAGE_PLACES[place].x - w.from[0], STORAGE_PLACES[place].z - w.from[1]) }))
      .sort((a, b) => a.d - b.d || a.place - b.place);
    const add = (field, place) => {
      const k = keyOf(field, place);
      if (!idx.has(k)) idx.set(k, { boxes: [], rack: null });
      return idx.get(k);
    };
    for (const w of racks) {
      const free = (field, place) => !idx.get(keyOf(field, place))?.rack && !idx.get(keyOf(field, place))?.boxes.length;
      let spot = near(w).find(({ place }) => free(w.field, place));
      let field = w.field;
      if (!spot) {
        const other = this.fillOrder().find((o) => free(o.field, o.place));
        if (other) { spot = other; field = other.field; }
      }
      if (!spot) {
        this.toStorageRoom(w.item);
        continue;
      }
      w.item.basement = { field, place: spot.place };
      add(field, spot.place).rack = w.item;
    }
    for (const w of boxes) {
      const item = w.item;
      const fits = (field, place) => this.placeFits(field, place, item, idx);
      let field = w.field;
      let spot = near(w).find(({ place }) => fits(field, place));
      if (!spot) {
        spot = this.fillOrder().find((o) => fits(o.field, o.place)) ?? null;
        field = spot?.field;
      }
      if (!spot) {
        if (item.location === 'shipping') delete item.basement; // kommt dann in den Abstellraum
        else this.toStorageRoom(item);
        continue;
      }
      item.basement = { field, place: spot.place, order: w.order };
      add(field, spot.place).boxes.push(item);
    }
    this.economy.notify();
    return work.length;
  }

  toStorageRoom(item) {
    delete item.basement;
    item.location = 'storage';
    item.slot = null;
    item.storageSpot = this.economy.freeStorageSpot();
  }
}
