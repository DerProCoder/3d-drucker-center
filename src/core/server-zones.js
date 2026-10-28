// Stellplätze für Serverschränke in der zweiten Etage und ihre Zonen. Ohne Three.js und DOM.
//   0–15  Kundenbereich: zwei Reihen à 8 (z = −4 und 2), wie von Anfang an – gespeicherte slot-Werte bleiben gültig
//   16–23 Private Server (orange umrandet): eine Reihe à 8 hinter der Kundenreihe z = −4
//   24–27 Automatik (grün umrandet): eine Reihe à 4 dahinter an der Nordwand – ebenfalls privat
// Private Schränke gehören einem selbst: Ihre Server laufen und kosten Strom, sind aber nicht an Kunden vermietbar.
// Lage der Plätze auf dem Boden (Meter, Raum x/z −10…10) steht hier statt in world/, damit auch core/-Module
// Abstände zwischen Schränken rechnen können (spotDistance). Alle Schränke schauen nach Süden (+z): vorn die
// Glastür, hinten die Ports. Alle Reihen beginnen links bündig bei FIRST_X, 1 m Abstand in der Reihe.
// Reihen hinter z = −4 liegen 2 m auseinander: 0,8 m Schranktiefe + 1,2 m Gang. Ein Gang bedient die Rückseiten der
// vorderen und die Glastüren der hinteren Reihe zugleich. Hinter der Automatik-Reihe (Rückseite z = −8,4) bleiben
// bis zur Nordwand (z = −10) 1,6 m zum Verkabeln. Treppe (x ab 8,75) und Aufzug (x 7,1–8,7) liegen weit im Osten.

export const CUSTOMER_SPOTS = 16;
export const PRIVATE_SPOTS = 8;
export const AUTOMATION_SPOTS = 4;
export const FIRST_PRIVATE_SPOT = CUSTOMER_SPOTS;                  // 16
export const FIRST_AUTOMATION_SPOT = FIRST_PRIVATE_SPOT + PRIVATE_SPOTS; // 24
export const SERVER_SPOTS = FIRST_AUTOMATION_SPOT + AUTOMATION_SPOTS;   // 28

const FIRST_X = -8;
const SPACING = 1.0;

// Feste Reihen: Zone, erster Platz, Anzahl, Welt-z der Schrankmitte, Name für die Anzeige (Kundenreihen)
export const SPOT_ROWS = Object.freeze([
  { zone: 'customer', first: 0, count: 8, z: -4, name: 'A' },
  { zone: 'customer', first: 8, count: 8, z: 2, name: 'B' },
  { zone: 'private', first: FIRST_PRIVATE_SPOT, count: PRIVATE_SPOTS, z: -6 },
  { zone: 'automation', first: FIRST_AUTOMATION_SPOT, count: AUTOMATION_SPOTS, z: -8 },
].map((row) => Object.freeze(row)));

const validSpot = (spot) => Number.isInteger(spot) && spot >= 0 && spot < SERVER_SPOTS;

// Reihe eines Stellplatzes (Eintrag aus SPOT_ROWS) oder null
export function spotRow(spot) {
  if (!validSpot(spot)) return null;
  return SPOT_ROWS.find((r) => spot >= r.first && spot < r.first + r.count) ?? null;
}

// Zone eines Stellplatzes: 'customer' | 'private' | 'automation' (oder null, wenn es den Platz nicht gibt)
export const spotZone = (spot) => spotRow(spot)?.zone ?? null;

export const isPrivateSpot = (spot) => ['private', 'automation'].includes(spotZone(spot));
export const isAutomationSpot = (spot) => spotZone(spot) === 'automation';

// Aufgestellter Schrank (economy.furniture, location 'server') auf einem privaten Platz – auch Automatik-Plätze
export const isPrivateRack = (rack) => rack?.location === 'server' && isPrivateSpot(rack.slot);
// Aufgestellter Schrank auf einem der grünen Automatik-Plätze
export const isAutomationRack = (rack) => rack?.location === 'server' && isAutomationSpot(rack.slot);

// Mitte des Stellplatzes auf dem Boden: { x, z } in Metern (Welt-x/z der zweiten Etage)
export function spotPosition(spot) {
  const row = spotRow(spot);
  if (!row) return null;
  return { x: FIRST_X + (spot - row.first) * SPACING, z: row.z };
}

// Abstand zweier Stellplätze in Metern (Mitte zu Mitte)
export function spotDistance(a, b) {
  const p = spotPosition(a);
  const q = spotPosition(b);
  return Math.hypot(p.x - q.x, p.z - q.z);
}

// Stellplatz für die Anzeige (Schrankfenster, Server-App): „Reihe A · Platz 3“, „🔒 Privat · Platz 3“,
// „🌡️ Automatik-Platz 2“ – Platz von West nach Ost gezählt, ab 1
export function spotLabel(spot) {
  const row = spotRow(spot);
  if (!row) return 'kein Stellplatz';
  const n = spot - row.first + 1;
  if (row.zone === 'private') return `🔒 Privat · Platz ${n}`;
  if (row.zone === 'automation') return `🌡️ Automatik-Platz ${n}`;
  return `Reihe ${row.name} · Platz ${n}`;
}

// Alle Plätze einer Zone (für Markierungen und Tests)
export const spotsInZone = (zone) => Array.from({ length: SERVER_SPOTS }, (_, i) => i).filter((s) => spotZone(s) === zone);
