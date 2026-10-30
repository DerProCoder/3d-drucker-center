// Keller-Lager (#53): Felder vom Typ „Lager“ (core/basement-layout.js) nehmen Kartons und Filament-Regale auf.
//   - Kartons: je Lager-Feld ZONES_PER_FIELD Stapelzonen mit je STACKS_PER_ZONE Stapeln bis unter die Decke
//     (core/storage-stack.js). Ist der Abstellraum voll, landen Lieferungen hier (economy.overflow). Man kann Kartons
//     auch selbst auf eine Zone stellen. Karton: location 'basement', basement = { field, zone, order } – order ist
//     die Reihenfolge, in der die Kartons dort abgestellt wurden. Unterwegs reserviert ein Karton seine Zone schon
//     (location 'shipping' mit basement), damit zwei Bestellungen nicht denselben Platz bekommen.
//   - Filament-Regale (Möbel 'filament-rack') auf RACK_SPOTS_PER_FIELD markierten Plätzen: location 'basement-rack',
//     basement = { field, spot }. Spulen darin ziehen keine Feuchtigkeit (economy.updateMoisture), trocknen aber auch
//     nicht – das kann nur der Trockenschrank.
// Wo genau Zonen und Plätze im Feld liegen, weiß world/basement-storage.js (ZONE_LAYOUT, RACK_LAYOUT unten).
// Bewusst ohne Three.js und DOM. Die Kartonhöhen kennt nur die 3D-Seite: sie setzt heightOf.
import { stackBoxes } from './storage-stack.js';

export const ZONES_PER_FIELD = 4;
export const STACKS_PER_ZONE = 4;
export const RACK_SPOTS_PER_FIELD = 8;
export const BASEMENT_STACK_CEILING = 3.1; // m – Kellerdecke bei 3,5 m, Leuchten und Schild hängen tiefer
export const DRY_RACK_LABEL = '📍 Keller-Lager (trocken)';

// Lage im Feld, relativ zur Feldmitte (m). Mittelgang ±1,25 m in x (gelbe Linien, world/basement-fields.js) bleibt
// frei, ebenso die Türbereiche in der Mitte jeder Feldseite, die Stütze an der Südost-Ecke und in Feld 0 Treppenhaus
// und Fahrstuhl (Nordwest-Ecke).
// Zonen: je eine pro Viertel direkt am Mittelgang, die Stapel stehen in einer Reihe von Nord nach Süd.
export const ZONE_LAYOUT = {
  width: 1.4,                 // Breite einer Zone in x
  pitch: 1.15,                // Abstand der Stapel in z
  zones: [                    // x = Mitte der Zone, z = Mitte des nördlichsten Stapels
    { x: -2.45, z: -8.0 },    // Nordwest
    { x: 2.45, z: -8.0 },     // Nordost
    { x: -2.45, z: 4.55 },    // Südwest
    { x: 2.45, z: 4.55 },     // Südost
  ],
};
// Regalplätze: je vier an beiden Seiten des Mittelgangs zwischen den Zonen, Vorderseite zum Gang
export const RACK_LAYOUT = {
  spots: [
    ...[-1.5, -0.5, 0.5, 1.5].map((z) => ({ x: -1.75, z, facing: 1 })),  // West, Vorderseite nach Osten
    ...[-1.5, -0.5, 0.5, 1.5].map((z) => ({ x: 1.75, z, facing: -1 })),  // Ost, Vorderseite nach Westen
  ],
};

const DEFAULT_HEIGHT = 0.6; // ohne 3D (z. B. Tests ohne heightOf): angenommene Kartonhöhe

export class BasementStorage {
  // economy: core/economy.js · layout: core/basement-layout.js (upgrades.basementLayout)
  constructor(economy, layout) {
    this.economy = economy;
    this.layout = layout;
    this.heightOf = null;      // (entry: { model } | { type }) => Kartonhöhe in m, setzt world/basement-storage.js
    economy.overflow = this;   // Lieferziel, wenn der Abstellraum voll ist
    // Lager-Feld nur umstellbar, wenn dort nichts liegt oder steht (auch keine reservierte Lieferung)
    this.removeCheck = layout.addFieldCheck((i, from) => (from === 'storage' ? this.fieldProblem(i) : null));
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

  // ---------- Kartons ----------

  // Kartons, die in Zone (field, zone) stehen oder dorthin unterwegs sind, in Abstell-Reihenfolge
  boxesIn(field, zone) {
    return this.items
      .filter((x) => (x.location === 'basement' || x.location === 'shipping') && x.basement?.field === field && x.basement.zone === zone)
      .sort((a, b) => a.basement.order - b.basement.order);
  }

  // Kartons, die im Keller stehen (ohne die, die noch unterwegs sind)
  get boxes() {
    return this.items.filter((x) => x.location === 'basement' && x.basement);
  }

  height(entry) {
    return this.heightOf?.(entry) ?? DEFAULT_HEIGHT;
  }

  // Stapel einer Zone: { placed: [{ box: { entry, h }, column, y }], overflow }
  stack(field, zone, extra = []) {
    const entries = [...this.boxesIn(field, zone), ...extra];
    return stackBoxes(entries.map((entry) => ({ entry, h: this.height(entry) })), BASEMENT_STACK_CEILING, STACKS_PER_ZONE);
  }

  zoneFits(field, zone, entry) {
    return this.stack(field, zone, [entry]).overflow === 0;
  }

  // Erste Zone, in die der Karton ({ model } | { type } oder ein Drucker/Möbel) passt: { field, zone } oder null
  findZone(entry) {
    for (const field of this.storageFields()) {
      for (let zone = 0; zone < ZONES_PER_FIELD; zone++) {
        if (this.zoneFits(field, zone, entry)) return { field, zone };
      }
    }
    return null;
  }

  // Hat das Keller-Lager noch Platz für diesen Karton?
  hasRoom(entry) {
    return !!this.findZone(entry);
  }

  nextOrder() {
    return Math.max(0, ...this.items.filter((x) => x.basement?.order != null).map((x) => x.basement.order)) + 1;
  }

  // Platz für eine Lieferung reservieren (economy.ship): setzt item.basement und gibt es zurück, oder null
  reserve(item) {
    const place = this.findZone(item);
    if (!place) return null;
    item.basement = { ...place, order: this.nextOrder() };
    return item.basement;
  }

  // Karton aus der Hand auf eine Zone stellen. Gibt null zurück, wenn es geklappt hat, sonst den Grund.
  putBox(item, field, zone) {
    if (!item) return 'Kein Karton in der Hand';
    if (!this.isStorageField(field) || zone < 0 || zone >= ZONES_PER_FIELD) return 'Hier ist kein Stapelplatz';
    if (!this.zoneFits(field, zone, item)) return 'Stapelplatz voll – die Kartons reichen bis unter die Decke';
    item.location = 'basement';
    item.slot = null;
    item.storageSpot = null;
    item.basement = { field, zone, order: this.nextOrder() };
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

  rackAt(field, spot) {
    return this.racksIn(field).find((f) => f.basement.spot === spot) ?? null;
  }

  // Leeres Filament-Regal aus der Hand auf einen Regalplatz stellen. null = geklappt, sonst Grund.
  placeRack(item, field, spot) {
    if (item?.type?.id !== 'filament-rack') return 'Hier passen nur Filament-Regale hin';
    if (!this.isStorageField(field) || spot < 0 || spot >= RACK_SPOTS_PER_FIELD) return 'Hier ist kein Regalplatz';
    if (this.rackAt(field, spot)) return 'Hier steht schon ein Regal';
    item.location = 'basement-rack';
    item.slot = null;
    item.storageSpot = null;
    item.basement = { field, spot };
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

  // Nach dem Laden: Kartons und Regale auf ungültigen oder doppelt belegten Plätzen (Feld kein Lager mehr, alter
  // Zwischenstand) zurück in den Abstellraum; Lieferungen ohne gültige Zone gehen in den Abstellraum
  load() {
    const usedSpots = new Set();
    for (const item of this.items) {
      const b = item.basement;
      if (item.location === 'basement' || item.location === 'basement-rack') {
        const rack = item.location === 'basement-rack';
        const key = rack ? `${b?.field}:${b?.spot}` : null;
        const valid = b && this.isStorageField(b.field)
          && (rack
            ? item.type?.id === 'filament-rack' && Number.isInteger(b.spot) && b.spot >= 0 && b.spot < RACK_SPOTS_PER_FIELD && !usedSpots.has(key)
            : Number.isInteger(b.zone) && b.zone >= 0 && b.zone < ZONES_PER_FIELD);
        if (valid) {
          if (rack) usedSpots.add(key);
          if (!rack && !Number.isFinite(b.order)) b.order = this.nextOrder();
          continue;
        }
        delete item.basement;
        item.location = 'storage';
        item.slot = null;
        item.storageSpot = this.economy.freeStorageSpot();
      } else if (item.location === 'shipping') {
        if (b && !(this.isStorageField(b.field) && b.zone >= 0 && b.zone < ZONES_PER_FIELD)) delete item.basement;
      } else if (b) {
        delete item.basement;
      }
    }
  }
}
