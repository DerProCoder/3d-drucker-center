// Stellplätze für Serverschränke in der zweiten Etage und im Daten-Bunker im Keller und ihre Zonen. Ohne Three.js und DOM.
//   0–15  Kundenbereich: zwei Reihen à 8 (z = −4 und 2), wie von Anfang an – gespeicherte slot-Werte bleiben gültig
//   16–23 Private Server (orange umrandet): eine Reihe à 8 hinter der Kundenreihe z = −4
//   24–27 Automatik (grün umrandet): eine Reihe à 4 dahinter an der Nordwand – ebenfalls privat
//   ab 28 Daten-Bunker (#52, #60): je Kellerfeld 120 Plätze (Platz = 28 + Feldnummer × 120 + n), nur nutzbar, solange das
//         Feld ausgebaut und als Daten-Bunker festgelegt ist. Kundenschränke wie Reihe A/B, aber die Miete aller
//         VMs und des Speichers darauf ist BUNKER_RENT_FACTOR-mal so hoch.
// Private Schränke gehören einem selbst: Ihre Server laufen und kosten Strom, sind aber nicht an Kunden vermietbar.
// Lage der Plätze auf dem Boden (Meter, Raum x/z −10…10) steht hier statt in world/, damit auch core/-Module
// Abstände zwischen Schränken rechnen können (spotDistance). Alle Schränke schauen nach Süden (+z): vorn die
// Glastür, hinten die Ports. Alle Reihen beginnen links bündig bei FIRST_X, 1 m Abstand in der Reihe.
// Reihen hinter z = −4 liegen 2 m auseinander: 0,8 m Schranktiefe + 1,2 m Gang. Ein Gang bedient die Rückseiten der
// vorderen und die Glastüren der hinteren Reihe zugleich. Hinter der Automatik-Reihe (Rückseite z = −8,4) bleiben
// bis zur Nordwand (z = −10) 1,6 m zum Verkabeln. Treppe (x ab 8,75) und Aufzug (x 7,1–8,7) liegen weit im Osten.
//
// Bunker-Plätze liegen in Kellerkoordinaten (Welt-x/z, Boden y = −70, core/basement-layout.js) dicht wie im
// Rechenzentrum (#60): je Feld 3 Reihenpaare = 6 Reihen (Nord nach Süd), je Reihe 2 Blöcke à 10 Schränke lückenlos
// (0,6 m Mitte-Mitte = Schrankbreite) mit 1,5 m Quergang in der Mitte – genau vor den Stahltüren in der Mitte der
// Feldseiten. Zwei Reihen eines Paares stehen Rücken an Rücken (1,0 m warmer Gang, darüber die Kabeltrasse), zwischen
// den Paaren liegt ein 1,2 m kalter Gang; die Fronten zeigen in den kalten Gang bzw. nach außen (spotFacing: Reihen
// 1, 3, 5 nach Norden, 2, 4, 6 nach Süden). Der Block sitzt mittig im Feld (x 3,25–16,75, z 4,9–15,1), rundherum
// bleiben gut 3 m Laufweg zu Wänden, Türen und der Glasfaser-Säule in der Nordwest-Ecke.
import { GRID, FIELD_SIZE as BASEMENT_FIELD_SIZE, fieldBounds } from './basement-layout.js';

export const CUSTOMER_SPOTS = 16;
export const PRIVATE_SPOTS = 8;
export const AUTOMATION_SPOTS = 4;
export const FIRST_PRIVATE_SPOT = CUSTOMER_SPOTS;                  // 16
export const FIRST_AUTOMATION_SPOT = FIRST_PRIVATE_SPOT + PRIVATE_SPOTS; // 24
export const SERVER_SPOTS = FIRST_AUTOMATION_SPOT + AUTOMATION_SPOTS;   // 28 Plätze in der zweiten Etage

// Daten-Bunker (#52, Reihen wie im Rechenzentrum #60)
export const BUNKER_SPOTS_PER_FIELD = 120;
export const FIRST_BUNKER_SPOT = SERVER_SPOTS;                                  // 28
export const ALL_SPOTS = FIRST_BUNKER_SPOT + GRID * GRID * BUNKER_SPOTS_PER_FIELD; // 4348 (Feld 0 bleibt immer Lager)
export const BUNKER_RENT_FACTOR = 1.5;  // Miet-Aufschlag für VMs und Speicher auf Servern bzw. NAS im Bunker
// Lage im Feld (Meter ab der Nordwest-Ecke des Feldes)
const round3 = (m) => Math.round(m * 1000) / 1000;
export const BUNKER_RACK_PITCH = 0.6;   // Schrankbreite (models/server-hardware.js RACK_WIDTH) – Schränke lückenlos
export const BUNKER_RACK_DEPTH = 0.8;   // Schranktiefe (RACK_FOOTPRINT.d)
export const BUNKER_BLOCK = 10;         // Schränke je Block, zwei Blöcke je Reihe
export const BUNKER_CROSS_AISLE = 1.5;  // Quergang zwischen den Blöcken
export const BUNKER_WARM_AISLE = 1.0;   // Rücken an Rücken
export const BUNKER_COLD_AISLE = 1.2;   // Front an Front
const ROW_LENGTH = 2 * BUNKER_BLOCK * BUNKER_RACK_PITCH + BUNKER_CROSS_AISLE;          // 13,5 m
const PAIR_DEPTH = 2 * BUNKER_RACK_DEPTH + BUNKER_WARM_AISLE;                         // 2,6 m
const ROWS_DEPTH = 3 * PAIR_DEPTH + 2 * BUNKER_COLD_AISLE;                            // 10,2 m
export const BUNKER_ROWS_BOUNDS = Object.freeze({
  minX: round3((BASEMENT_FIELD_SIZE - ROW_LENGTH) / 2), maxX: round3((BASEMENT_FIELD_SIZE + ROW_LENGTH) / 2),
  minZ: round3((BASEMENT_FIELD_SIZE - ROWS_DEPTH) / 2), maxZ: round3((BASEMENT_FIELD_SIZE + ROWS_DEPTH) / 2),
});
// Schrankmitten in x (20 je Reihe, West nach Ost) und z der 6 Reihen (Nord nach Süd)
export const BUNKER_ROW_X = Object.freeze(Array.from({ length: 2 * BUNKER_BLOCK }, (_, k) => {
  const block = Math.floor(k / BUNKER_BLOCK);
  return round3(BUNKER_ROWS_BOUNDS.minX + block * (BUNKER_BLOCK * BUNKER_RACK_PITCH + BUNKER_CROSS_AISLE)
    + ((k % BUNKER_BLOCK) + 0.5) * BUNKER_RACK_PITCH);
}));
export const BUNKER_ROW_Z = Object.freeze(Array.from({ length: 6 }, (_, r) => {
  const pair = Math.floor(r / 2);
  const start = BUNKER_ROWS_BOUNDS.minZ + pair * (PAIR_DEPTH + BUNKER_COLD_AISLE);
  return round3(start + BUNKER_RACK_DEPTH / 2 + (r % 2) * (BUNKER_RACK_DEPTH + BUNKER_WARM_AISLE));
}));
// Mitte der drei warmen Gänge (dort hängen die Kabeltrassen) und der zwei kalten Gänge zwischen den Paaren
export const BUNKER_WARM_Z = Object.freeze([0, 1, 2].map((p) => round3((BUNKER_ROW_Z[2 * p] + BUNKER_ROW_Z[2 * p + 1]) / 2)));
export const BUNKER_COLD_Z = Object.freeze([0, 1].map((p) => round3((BUNKER_ROW_Z[2 * p + 1] + BUNKER_ROW_Z[2 * p + 2]) / 2)));
// Mitte des Quergangs (x)
export const BUNKER_CROSS_X = round3(BASEMENT_FIELD_SIZE / 2);

const FIRST_X = -8;
const SPACING = 1.0;

// Feste Reihen: Zone, erster Platz, Anzahl, Welt-z der Schrankmitte, Name für die Anzeige (Kundenreihen)
export const SPOT_ROWS = Object.freeze([
  { zone: 'customer', first: 0, count: 8, z: -4, name: 'A' },
  { zone: 'customer', first: 8, count: 8, z: 2, name: 'B' },
  { zone: 'private', first: FIRST_PRIVATE_SPOT, count: PRIVATE_SPOTS, z: -6 },
  { zone: 'automation', first: FIRST_AUTOMATION_SPOT, count: AUTOMATION_SPOTS, z: -8 },
].map((row) => Object.freeze(row)));

const validUpperSpot = (spot) => Number.isInteger(spot) && spot >= 0 && spot < SERVER_SPOTS;

// ---------- Keller: welche Felder gerade Daten-Bunker sind ----------
// core/basement-layout.js (Instanz upgrades.basementLayout) kennt die Feldarten; main.js bzw. servers.attachBasement
// trägt sie hier ein. Ohne Keller gibt es keine nutzbaren Bunker-Plätze.
let bunkerLayout = null;
export function setBunkerLayout(layout) {
  bunkerLayout = layout ?? null;
}

// Ob Kellerfeld i ausgebaut und als Daten-Bunker festgelegt ist
export const isBunkerField = (i) => !!bunkerLayout && bunkerLayout.isBuilt(i) && bunkerLayout.fieldType(i) === 'bunker';

// Alle fertigen Bunker-Felder (Feldnummern aufsteigend)
export function bunkerFields() {
  const list = [];
  for (let i = 0; i < GRID * GRID; i++) if (isBunkerField(i)) list.push(i);
  return list;
}

// Kellerfeld mit dem Glasfaser-Anschluss des Kellers (core/cable-tray.js basementWan) oder null (kein Bunker-Feld):
// das erste Bunker-Feld – und dann bleibt er dort, solange das Feld Bunker ist (sonst wanderten gesteckte Kabel mit,
// wenn später ein Feld mit kleinerer Nummer Bunker wird). Gespeichert über core/servers.js (basementWanField).
let wanField = null;
export function bunkerWanField() {
  if (wanField === null || !isBunkerField(wanField)) wanField = bunkerFields()[0] ?? null;
  return wanField;
}
export function setBunkerWanField(field) {
  wanField = Number.isInteger(field) ? field : null;
}

// Nummer des Bunkers für die Anzeige („Bunker 2“) – fortlaufend nach Feldnummer wie die Schilder im Keller
// (world/basement-fields.js); ohne Keller-Daten die Feldnummer
export function bunkerNumber(field) {
  if (!bunkerLayout) return field + 1;
  let n = 0;
  for (let k = 0; k <= field; k++) if (isBunkerField(k)) n++;
  return Math.max(1, n);
}

export const isBunkerSpot = (spot) => Number.isInteger(spot) && spot >= FIRST_BUNKER_SPOT && spot < ALL_SPOTS;
// Kellerfeld eines Bunker-Platzes oder null
export const bunkerFieldOf = (spot) => (isBunkerSpot(spot) ? Math.floor((spot - FIRST_BUNKER_SPOT) / BUNKER_SPOTS_PER_FIELD) : null);
// Platz n (0…15) im Feld field
export const bunkerSpot = (field, n) => FIRST_BUNKER_SPOT + field * BUNKER_SPOTS_PER_FIELD + n;
// Alle 16 Plätze eines Feldes
export const bunkerSpotsIn = (field) => Array.from({ length: BUNKER_SPOTS_PER_FIELD }, (_, n) => bunkerSpot(field, n));

// Bereich eines Platzes: 'upper' (zweite Etage) | 'bunker' (Keller) | null
export function spotArea(spot) {
  if (validUpperSpot(spot)) return 'upper';
  if (isBunkerSpot(spot)) return 'bunker';
  return null;
}

// Ob man auf dem Platz gerade einen Schrank aufstellen kann (Bunker-Plätze nur in fertigen Bunker-Feldern)
export function spotUsable(spot) {
  if (validUpperSpot(spot)) return true;
  return isBunkerSpot(spot) && isBunkerField(bunkerFieldOf(spot));
}

// Reihe eines Stellplatzes in der zweiten Etage (Eintrag aus SPOT_ROWS) oder null (auch für Bunker-Plätze)
export function spotRow(spot) {
  if (!validUpperSpot(spot)) return null;
  return SPOT_ROWS.find((r) => spot >= r.first && spot < r.first + r.count) ?? null;
}

// Zone eines Stellplatzes: 'customer' | 'private' | 'automation' | 'bunker' (oder null, wenn es den Platz nicht gibt)
export const spotZone = (spot) => (isBunkerSpot(spot) ? 'bunker' : spotRow(spot)?.zone ?? null);

export const isPrivateSpot = (spot) => ['private', 'automation'].includes(spotZone(spot));
export const isAutomationSpot = (spot) => spotZone(spot) === 'automation';

// Aufgestellter Schrank (economy.furniture, location 'server') auf einem privaten Platz – auch Automatik-Plätze
export const isPrivateRack = (rack) => rack?.location === 'server' && isPrivateSpot(rack.slot);
// Aufgestellter Schrank in der orangen Reihe „Private Server“ (ohne Automatik-Reihe) – vergibt VM-Anfragen
// (core/rental-automation.js)
export const isPrivateRowRack = (rack) => rack?.location === 'server' && spotZone(rack.slot) === 'private';
// Aufgestellter Schrank auf einem der grünen Automatik-Plätze
export const isAutomationRack = (rack) => rack?.location === 'server' && isAutomationSpot(rack.slot);
// Aufgestellter Schrank im Daten-Bunker (Miet-Aufschlag BUNKER_RENT_FACTOR)
export const isBunkerRack = (rack) => rack?.location === 'server' && isBunkerSpot(rack.slot);

// Reihe (0…5, Nord nach Süd) und Platz in der Reihe (0…19, West nach Ost) eines Bunker-Platzes, oder null
export function bunkerRowOf(spot) {
  if (!isBunkerSpot(spot)) return null;
  const n = spot - bunkerSpot(bunkerFieldOf(spot), 0);
  return { row: Math.floor(n / BUNKER_ROW_X.length), k: n % BUNKER_ROW_X.length };
}

// Richtung der Front (Glastür) eines Schranks auf dem Platz: +1 = nach Süden (+z), −1 = nach Norden. Oben schauen
// alle nach Süden, im Bunker die Reihen 1, 3, 5 nach Norden und 2, 4, 6 nach Süden (Fronten in den kalten Gang,
// Rücken an Rücken im warmen Gang).
export function spotFacing(spot) {
  const r = bunkerRowOf(spot);
  return r && r.row % 2 === 0 ? -1 : 1;
}

// Mitte des Stellplatzes auf dem Boden: { x, z } in Metern – in der zweiten Etage Welt-x/z der Etage, im Bunker
// Welt-x/z des Kellers (dort zusätzlich field: Kellerfeld). Die Höhe ergibt sich aus spotArea.
export function spotPosition(spot) {
  if (isBunkerSpot(spot)) {
    const field = bunkerFieldOf(spot);
    const n = spot - bunkerSpot(field, 0);
    const b = fieldBounds(field);
    const row = Math.floor(n / BUNKER_ROW_X.length);
    return { x: round3(b.minX + BUNKER_ROW_X[n % BUNKER_ROW_X.length]), z: round3(b.minZ + BUNKER_ROW_Z[row]), field };
  }
  const row = spotRow(spot);
  if (!row) return null;
  return { x: FIRST_X + (spot - row.first) * SPACING, z: row.z };
}

// Abstand zweier Stellplätze in Metern (Mitte zu Mitte). Zwischen zweiter Etage und Keller liegen 70 m Erde –
// dann ein sehr großer Wert (endlich, damit Sortieren nach Abstand stabil bleibt).
export function spotDistance(a, b) {
  const p = spotPosition(a);
  const q = spotPosition(b);
  const d = Math.hypot(p.x - q.x, p.z - q.z);
  return spotArea(a) === spotArea(b) ? d : 1e6 + d;
}

// Stellplatz für die Anzeige (Schrankfenster, Server-App): „Reihe A · Platz 3“, „🔒 Privat · Platz 3“,
// „🌡️ Automatik-Platz 2“, „Bunker 2 · Reihe 3 · Platz 7“ – Platz von West nach Ost gezählt, ab 1 (Bunker-Reihen von
// Nord nach Süd)
export function spotLabel(spot) {
  if (isBunkerSpot(spot)) {
    const field = bunkerFieldOf(spot);
    const n = spot - bunkerSpot(field, 0);
    return `Bunker ${bunkerNumber(field)} · Reihe ${Math.floor(n / BUNKER_ROW_X.length) + 1} · Platz ${(n % BUNKER_ROW_X.length) + 1}`;
  }
  const row = spotRow(spot);
  if (!row) return 'kein Stellplatz';
  const n = spot - row.first + 1;
  if (row.zone === 'private') return `🔒 Privat · Platz ${n}`;
  if (row.zone === 'automation') return `🌡️ Automatik-Platz ${n}`;
  return `Reihe ${row.name} · Platz ${n}`;
}

// Alle Plätze einer Zone in der zweiten Etage (für Markierungen und Tests); Bunker-Plätze über bunkerSpotsIn
export const spotsInZone = (zone) => Array.from({ length: SERVER_SPOTS }, (_, i) => i).filter((s) => spotZone(s) === zone);

// Kantenlänge eines Kellerfeldes (für world/ und Tests)
export { BASEMENT_FIELD_SIZE };
