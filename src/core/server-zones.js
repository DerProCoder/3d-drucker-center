// Stellplätze für Serverschränke in der zweiten Etage und im Daten-Bunker im Keller und ihre Zonen. Ohne Three.js und DOM.
//   0–15  Kundenbereich: zwei Reihen à 8 (z = −4 und 2), wie von Anfang an – gespeicherte slot-Werte bleiben gültig
//   16–23 Private Server (orange umrandet): eine Reihe à 8 hinter der Kundenreihe z = −4
//   24–27 Automatik (grün umrandet): eine Reihe à 4 dahinter an der Nordwand – ebenfalls privat
//   ab 28 Daten-Bunker (#52): je Kellerfeld 16 Plätze (Platz = 28 + Feldnummer × 16 + n), nur nutzbar, solange das
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
// Bunker-Plätze liegen in Kellerkoordinaten (Welt-x/z, Boden y = −70, core/basement-layout.js): je Feld zwei Reihen
// (Feld-z 6,5 und 12,5 ab der Nordkante), jede Reihe aus zwei Vierergruppen (Feld-x 5,5–8,5 und 11,5–14,5) mit 3 m
// Gang in der Mitte – dort, wo die Stahltüren in der Mitte der Feldseiten liegen (world/basement-fields.js). Die
// Schrankmitten liegen auf den Mitten der 1-m-Gitterfelder im Keller (core/cable-tray.js).
import { GRID, FIELD_SIZE as BASEMENT_FIELD_SIZE, fieldBounds } from './basement-layout.js';

export const CUSTOMER_SPOTS = 16;
export const PRIVATE_SPOTS = 8;
export const AUTOMATION_SPOTS = 4;
export const FIRST_PRIVATE_SPOT = CUSTOMER_SPOTS;                  // 16
export const FIRST_AUTOMATION_SPOT = FIRST_PRIVATE_SPOT + PRIVATE_SPOTS; // 24
export const SERVER_SPOTS = FIRST_AUTOMATION_SPOT + AUTOMATION_SPOTS;   // 28 Plätze in der zweiten Etage

// Daten-Bunker (#52)
export const BUNKER_SPOTS_PER_FIELD = 16;
export const FIRST_BUNKER_SPOT = SERVER_SPOTS;                                  // 28
export const ALL_SPOTS = FIRST_BUNKER_SPOT + GRID * GRID * BUNKER_SPOTS_PER_FIELD; // 604 (Feld 0 bleibt immer Lager)
export const BUNKER_RENT_FACTOR = 1.5;  // Miet-Aufschlag für VMs und Speicher auf Servern bzw. NAS im Bunker
// Lage im Feld (Meter ab der Nordwest-Ecke des Feldes): Schrankmitten in x je Reihe, z der beiden Reihen
export const BUNKER_ROW_X = Object.freeze([5.5, 6.5, 7.5, 8.5, 11.5, 12.5, 13.5, 14.5]);
export const BUNKER_ROW_Z = Object.freeze([6.5, 12.5]);

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

// Mitte des Stellplatzes auf dem Boden: { x, z } in Metern – in der zweiten Etage Welt-x/z der Etage, im Bunker
// Welt-x/z des Kellers (dort zusätzlich field: Kellerfeld). Die Höhe ergibt sich aus spotArea.
export function spotPosition(spot) {
  if (isBunkerSpot(spot)) {
    const field = bunkerFieldOf(spot);
    const n = spot - bunkerSpot(field, 0);
    const b = fieldBounds(field);
    const row = Math.floor(n / BUNKER_ROW_X.length);
    return { x: b.minX + BUNKER_ROW_X[n % BUNKER_ROW_X.length], z: b.minZ + BUNKER_ROW_Z[row], field };
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
// „🌡️ Automatik-Platz 2“, „Bunker 2 · Platz 5“ – Platz von West nach Ost gezählt, ab 1 (im Bunker erst die
// nördliche, dann die südliche Reihe)
export function spotLabel(spot) {
  if (isBunkerSpot(spot)) {
    const field = bunkerFieldOf(spot);
    return `Bunker ${bunkerNumber(field)} · Platz ${spot - bunkerSpot(field, 0) + 1}`;
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
