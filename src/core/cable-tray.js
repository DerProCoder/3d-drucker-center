// Kabelgitter unter der Decke des Serverraums und Internet-Anschluss (WAN) an der Wand – nur Zahlen und Regeln,
// ohne Three.js und DOM (Issue #28, Teil 1). Wofür:
//   - Kabel zwischen zwei Schränken bzw. zwischen Schrank und Wandanschluss laufen über das Gitter. Man klickt beim
//     Verlegen Gitterfelder an (Wegpunkte in Klick-Reihenfolge, toggleWaypoint), trayPath macht daraus den Weg durch
//     alle Felder, trayCableLength die Länge für die Kabelrolle.
//   - Kunden erreichen die Server nur über den Wandanschluss: WALL_PORTS Ports „WAN 1…n“, in Kabeln { id: 'wan', port }.
// Wer es nutzt: core/servers.js (connectProblem/connect/cableLength/reachable, Speichern der Wegpunkte als `tray`),
// core/save.js (Umwandlung alter Stände), später world/ und models/cable-tray.js für das 3D-Gitter, die Klickflächen
// der Felder und den Wandkasten (Issue #29) – die Lage steht deshalb hier als reine Zahlen.
//
// Koordinaten wie in core/server-zones.js: Meter, Welt-x/z der zweiten Etage (Raum x/z −10…10), y = Höhe über dem
// Fußboden der Etage (world/ addiert FLOOR_Y).
// Daten-Bunker im Keller (#52): zweites Gitter (Indizes ab BASEMENT_TRAY_BASE, Welt-x/z des Kellers, y über dem
// Kellerboden) und eigene Internet-Kästen in jedem Bunker-Feld (#61, Ports ab BASEMENT_WAN_PORT0). Kabel verbinden
// nur Enden im selben Bereich (trayArea/AREA_PROBLEM).
//
// Raster: durchgehend über den ganzen Raum, Felder FIELD_SIZE × FIELD_SIZE (1 m). Die Feldmitten liegen genau über den
// Stellplatzmitten (spotPosition, Abstand 1,0 m), über jedem Stellplatz liegt also genau ein eigenes Feld. Feld-Index
// = ix + iz · TRAY_COLS (ix von West nach Ost, iz von Nord nach Süd). Über dem Fahrstuhlschacht (geht bis zur Decke)
// gibt es keine Felder (BLOCKED, isField = false); über dem Treppenloch schon, die Decke ist dort zu.
//
// Weg (trayPath): Kette Startfeld → Wegpunkte → Zielfeld. Start- und Zielfeld (über dem Schrank bzw. Einstiegsfeld
// des Wandanschlusses) gehören automatisch dazu. Zwischen zwei Gliedern der Kette läuft das Kabel gerade durch alle
// Felder dazwischen, erst entlang x, dann entlang z – wie bei den Clips „durch alle Clips dazwischen“.
// Was „nicht verbunden“ bei dieser Regel heißt: Weil jedes Stück erst x, dann z läuft, hängt die Kette immer
// zusammen. Unterbrochen ist der Weg nur, wenn ein Stück durch eine Lücke im Gitter (Fahrstuhlschacht) liefe – dann
// muss man mit einem Wegpunkt außen herum führen. Außerdem abgelehnt: Wegpunkt oder Start/Ziel kein Gitterfeld
// (außerhalb, ungültig) und gar kein Wegpunkt – ohne angeklicktes Feld läge das Kabel nicht im Gitter, sondern hinge
// frei durch den Raum (Fertig-Kriterium in #28: „ohne Gitterfelder → abgelehnt“).
import {
  BASEMENT_FIELD_SIZE, BUNKER_COLD_Z, BUNKER_CROSS_X, BUNKER_ROW_X, BUNKER_WARM_Z, SERVER_SPOTS, bunkerNumber,
  bunkerRowOf, isBunkerField, spotArea, spotFacing, spotPosition,
} from './server-zones.js';
import { GRID, fieldBounds } from './basement-layout.js';
import { SERVER_RACKS, UNIT_METERS } from './server-catalog.js';

const round1 = (m) => Math.round(m * 10) / 10;
const round3 = (m) => Math.round(m * 1000) / 1000;

// ---------- Raum und Schränke (Zahlen aus world/ und models/, die core/ nicht importieren darf) ----------

const ROOM_HALF = 10;                 // world/room.js ROOM_SIZE 20 m, Raum x/z −10…10
export const CEILING_HEIGHT = 3.5;    // world/room.js ROOM_HEIGHT: Decke der zweiten Etage über ihrem Fußboden
// Fahrstuhlschacht an der Nordwand (world/upper-floor.js ELEVATOR) – reicht bis zur Decke, dort kein Gitter
const ELEVATOR = { x0: 7.1, x1: 8.7, z0: -10, z1: -8.6 };

// Schrankhöhe wie rackHeight in models/server-hardware.js (Sockel + HE + Dach). models/ darf core/ nicht importieren
// und core/ nicht models/ (das braucht three), deshalb stehen Sockel und Dach hier noch einmal als Zahlen.
const RACK_BASE = 0.1;                // Sockel unter der untersten HE
const RACK_TOP = 0.08;                // Dach über der obersten HE
const RACK_DEPTH = 0.8;               // Schranktiefe (RACK_FOOTPRINT.d)
export const rackHeightOf = (units) => RACK_BASE + units * UNIT_METERS + RACK_TOP;
export const MAX_RACK_UNITS = Math.max(...SERVER_RACKS.map((r) => r.units));      // 42
export const MAX_RACK_HEIGHT = round3(rackHeightOf(MAX_RACK_UNITS));                // 2,049 m

// ---------- Gitter ----------

export const FIELD_SIZE = 1.0;
// Gitterhöhe (Unterkante der Felder): gut 0,5 m über den höchsten Schränken (Platz zum Einführen von oben) und
// knapp 0,9 m unter der Decke – die Deckenleuchten hängen nur 7 cm tief, ihr Licht fällt durch das lichte Gitter.
export const TRAY_HEIGHT = 2.6;
// Kabel je Schrank-Ende vom Gerät hinten zur Kabelführung an der Seite und durch die Kabeleinführung im Dach
// (wie CLIP_DETOUR in servers.js, etwas mehr wegen des Wegs zur Dachöffnung)
export const RACK_EXIT = 0.3;
// Spiel an den Steckern je Kabel (Schlaufe) – gilt für alle Kabel, core/servers.js nimmt den Wert von hier
export const CABLE_SLACK = 0.3;

// Feldmitten an den Stellplätzen ausrichten: vom ersten Stellplatz aus in FIELD_SIZE-Schritten bis an die Wände,
// so weit ein ganzes Feld in den Raum passt
function axis(spotCoord) {
  const first = spotCoord - Math.floor((spotCoord + ROOM_HALF - FIELD_SIZE / 2) / FIELD_SIZE) * FIELD_SIZE;
  const count = Math.floor((ROOM_HALF - FIELD_SIZE / 2 - first) / FIELD_SIZE + 1e-9) + 1;
  return { first, count };
}
const X_AXIS = axis(spotPosition(0).x);
const Z_AXIS = axis(spotPosition(0).z);
export const TRAY_COLS = X_AXIS.count;           // 19 Felder von West nach Ost (Mitten x −9…9)
export const TRAY_ROWS = Z_AXIS.count;           // 19 Felder von Nord nach Süd (Mitten z −9…9)
export const TRAY_FIELDS = TRAY_COLS * TRAY_ROWS; // 361 Plätze im Raster (davon BLOCKED ohne Feld)
// Ausdehnung des Gitters (Außenkanten) für das 3D-Modell
export const TRAY_BOUNDS = Object.freeze({
  minX: X_AXIS.first - FIELD_SIZE / 2, maxX: X_AXIS.first + (TRAY_COLS - 0.5) * FIELD_SIZE,
  minZ: Z_AXIS.first - FIELD_SIZE / 2, maxZ: Z_AXIS.first + (TRAY_ROWS - 0.5) * FIELD_SIZE,
});

const fieldIndex = (ix, iz) => ix + iz * TRAY_COLS;
const inRaster = (field) => Number.isInteger(field) && field >= 0 && field < TRAY_FIELDS;

// Mitte eines Rasterplatzes (auch für gesperrte Plätze)
function rasterCenter(field) {
  const ix = field % TRAY_COLS;
  const iz = Math.floor(field / TRAY_COLS);
  return { x: round3(X_AXIS.first + ix * FIELD_SIZE), z: round3(Z_AXIS.first + iz * FIELD_SIZE) };
}

// Rasterplätze ohne Feld: alle, deren Fläche den Fahrstuhlschacht schneidet
export const BLOCKED = Object.freeze(Array.from({ length: TRAY_FIELDS }, (_, i) => i).filter((i) => {
  const { x, z } = rasterCenter(i);
  const h = FIELD_SIZE / 2;
  return x + h > ELEVATOR.x0 && x - h < ELEVATOR.x1 && z + h > ELEVATOR.z0 && z - h < ELEVATOR.z1;
}));
const BLOCKED_SET = new Set(BLOCKED);

// ---------- Kabeltrassen im Daten-Bunker (Keller, #52, Reihen wie im Rechenzentrum #60) ----------
// Statt eines flächigen Gitters hängen im Bunker Trassen über den Reihen. Je Kellerfeld ein festes, ungleichmäßiges
// Raster aus Spalten BASEMENT_TRAY_XS und Zeilen BASEMENT_TRAY_ZS (Meter ab der Nordwest-Ecke des Feldes); jede
// Kreuzung ist ein „Trassenfeld“ (Wegpunkt), gültig nur dort, wo eine Trasse hängt:
//   - über jedem warmen Gang (Rücken an Rücken, BUNKER_WARM_Z) eine Längstrasse von der West- bis zur Ostspinne, mit
//     je einem Feld über jeder Schrankspalte (0,6 m) und dem Quergang – dort kommen die Kabel aus den Schränken an,
//   - drei Quertrassen („Spinnen“) in Nord-Süd-Richtung: West (x 2,5), Mitte über dem Quergang (x 10) und Ost (x 17,5),
//     von der Nordtrasse bis zur Südtrasse,
//   - Nordtrasse (z 3,5) und Südtrasse (z 16,5) quer über das Feld von der West- bis zur Ostspinne, mit einem Feld über
//     jeder Schrankspalte – dort münden die Trassen der Internet-Kästen an Nord- und Südkante (#61),
//   - zu einem Nachbarfeld, das auch Bunker ist, laufen die Längstrassen bzw. die Spinnen bis an den Feldrand weiter
//     (Felder x/z 0,5 bzw. 19,5) und treffen dort die Trassen des Nachbarn.
// Feld-Index = BASEMENT_TRAY_BASE + gi + gj · BASEMENT_TRAY_COLS mit gi = Kellerspalte · NX + Spalte im Feld, gj
// ebenso – alle Felder des Kellers nutzen dasselbe Raster, so laufen Wege über Feldgrenzen hinweg. Ein Weg geht wie
// oben gerade von Wegpunkt zu Wegpunkt (erst x, dann z); quert er dabei eine Stelle ohne Trasse (z. B. über eine
// Schrankreihe), ist er unterbrochen – dann einen Wegpunkt auf einer Spinne setzen. Die Länge im Bunker ist die
// echte Strecke zwischen den Feldmitten (nicht Felder × 1 m).
export const BASEMENT_TRAY_BASE = 100000;
const B_FIELD = BASEMENT_FIELD_SIZE;                 // 20 m je Kellerfeld
const B_ORIGIN = fieldBounds(0).minX;                // −10 (Nordwest-Ecke des Kellers, x und z)
export const BASEMENT_SPINE_X = Object.freeze([2.5, BUNKER_CROSS_X, 17.5]);
const NORTH_Z = 3.5;
const SOUTH_Z = 16.5;
const EDGE_LO = 0.5;
const EDGE_HI = B_FIELD - 0.5;
export const BASEMENT_TRAY_XS = Object.freeze([
  EDGE_LO, BASEMENT_SPINE_X[0], ...BUNKER_ROW_X.slice(0, BUNKER_ROW_X.length / 2), BASEMENT_SPINE_X[1],
  ...BUNKER_ROW_X.slice(BUNKER_ROW_X.length / 2), BASEMENT_SPINE_X[2], EDGE_HI,
]);
export const BASEMENT_TRAY_ZS = Object.freeze([
  EDGE_LO, NORTH_Z, BUNKER_WARM_Z[0], BUNKER_COLD_Z[0], BUNKER_WARM_Z[1], BUNKER_COLD_Z[1], BUNKER_WARM_Z[2], SOUTH_Z, EDGE_HI,
]);
export const BASEMENT_TRAY_NX = BASEMENT_TRAY_XS.length;   // 25
export const BASEMENT_TRAY_NZ = BASEMENT_TRAY_ZS.length;   // 9
export const BASEMENT_TRAY_COLS = GRID * BASEMENT_TRAY_NX; // 150
const B_ROWS = GRID * BASEMENT_TRAY_NZ;
const SPINE_I = new Set(BASEMENT_SPINE_X.map((x) => BASEMENT_TRAY_XS.indexOf(x)));
const WARM_J = new Set(BUNKER_WARM_Z.map((z) => BASEMENT_TRAY_ZS.indexOf(z)));
// Nord- und Südtrasse (Zeilen 1 und NZ − 2) laufen von der West- (Spalte 1) bis zur Ostspinne (Spalte NX − 2)
const EDGE_J = new Set([1, BASEMENT_TRAY_ZS.length - 2]);
const bIndex = (gi, gj) => BASEMENT_TRAY_BASE + gi + gj * BASEMENT_TRAY_COLS;
function inBasementRaster(field) {
  return Number.isInteger(field) && field >= BASEMENT_TRAY_BASE && field < BASEMENT_TRAY_BASE + BASEMENT_TRAY_COLS * B_ROWS;
}

// Bereich eines Feld-Index: 'upper' | 'basement' | null
export function trayArea(field) {
  if (inRaster(field)) return 'upper';
  if (inBasementRaster(field)) return 'basement';
  return null;
}

function fieldCoords(field) {
  if (inBasementRaster(field)) {
    const k = field - BASEMENT_TRAY_BASE;
    return { ix: k % BASEMENT_TRAY_COLS, iz: Math.floor(k / BASEMENT_TRAY_COLS) };
  }
  return { ix: field % TRAY_COLS, iz: Math.floor(field / TRAY_COLS) };
}

// Kellerfeld (Feldnummer core/basement-layout.js) und Lage im Trassenraster des Feldes (lx: Spalte 0…24, lz: Zeile
// 0…8) eines Trassenfeldes
function basementCell(field) {
  const { ix, iz } = fieldCoords(field);
  const lx = ix % BASEMENT_TRAY_NX;
  const lz = iz % BASEMENT_TRAY_NZ;
  return { ix, iz, lx, lz, area: Math.floor(iz / BASEMENT_TRAY_NZ) * GRID + Math.floor(ix / BASEMENT_TRAY_NX) };
}

// Trasse an Spalte lx, Zeile lz im Bunker-Feld area? (Regeln oben)
function trayAt(area, lx, lz) {
  if (!isBunkerField(area)) return false;
  const col = area % GRID;
  const row = Math.floor(area / GRID);
  const lastX = BASEMENT_TRAY_NX - 1;
  const lastZ = BASEMENT_TRAY_NZ - 1;
  if (WARM_J.has(lz)) {
    if (lx === 0) return col > 0 && isBunkerField(area - 1);
    if (lx === lastX) return col < GRID - 1 && isBunkerField(area + 1);
    return true;
  }
  if (EDGE_J.has(lz) && lx >= 1 && lx <= lastX - 1) return true;
  if (!SPINE_I.has(lx)) return false;
  if (lz === 0) return row > 0 && isBunkerField(area - GRID);
  if (lz === lastZ) return row < GRID - 1 && isBunkerField(area + GRID);
  return true;
}

function isBasementField(field) {
  if (!inBasementRaster(field)) return false;
  const { lx, lz, area } = basementCell(field);
  return trayAt(area, lx, lz);
}

// Kellerfeld (Feldnummer) eines Trassenfeldes oder null – z. B. für „durch welches Feld läuft das Kabel?“
export const basementAreaOf = (field) => (inBasementRaster(field) ? basementCell(field).area : null);
// Lage eines Trassenfeldes im Kellerfeld { area, lx, lz } oder null
export const basementCellOf = (field) => (inBasementRaster(field) ? basementCell(field) : null);

// Nächster Index in einer aufsteigenden Liste von Lagen, wenn v höchstens tol davon entfernt ist, sonst -1
function nearestIndex(list, v, tol) {
  let best = -1;
  let bestD = Infinity;
  list.forEach((p, i) => {
    const d = Math.abs(p - v);
    if (d < bestD) { bestD = d; best = i; }
  });
  return bestD <= tol ? best : -1;
}

// Trassenfeld, über dem der Punkt (x, z) liegt, oder null (keine Trasse dort). Getroffen ist das nächste Feld, wenn
// der Punkt höchstens 0,5 m quer bzw. 0,55 m längs davon entfernt ist.
export function basementFieldAt(x, z) {
  const fx = x - B_ORIGIN;
  const fz = z - B_ORIGIN;
  if (fx < 0 || fz < 0 || fx > GRID * B_FIELD || fz > GRID * B_FIELD) return null;
  const col = Math.min(GRID - 1, Math.floor(fx / B_FIELD));
  const row = Math.min(GRID - 1, Math.floor(fz / B_FIELD));
  const lx = nearestIndex(BASEMENT_TRAY_XS, fx - col * B_FIELD, 0.55);
  const lz = nearestIndex(BASEMENT_TRAY_ZS, fz - row * B_FIELD, 0.55);
  if (lx < 0 || lz < 0) return null;
  const field = bIndex(col * BASEMENT_TRAY_NX + lx, row * BASEMENT_TRAY_NZ + lz);
  return isBasementField(field) ? field : null;
}

// Alle Trassenfelder eines Bunker-Feldes mit Lage im Feld (für world/bunker.js): [{ lx, lz, x, z }] (x/z ab der
// Nordwest-Ecke des Feldes)
export function basementTrayCells(area) {
  const list = [];
  for (let lz = 0; lz < BASEMENT_TRAY_NZ; lz++) {
    for (let lx = 0; lx < BASEMENT_TRAY_NX; lx++) {
      if (trayAt(area, lx, lz)) list.push({ lx, lz, x: BASEMENT_TRAY_XS[lx], z: BASEMENT_TRAY_ZS[lz] });
    }
  }
  return list;
}

// Trassenstücke eines Bunker-Feldes zum Zeichnen: [{ alongX, from, to, at }] in Feldkoordinaten – längs x von from
// bis to auf z = at bzw. längs z auf x = at. Laufen sie an den Feldrand (Nachbar ist Bunker), reichen sie bis dorthin.
export function basementTraySegments(area) {
  const segs = [];
  const runs = (n, ok) => {
    const out = [];
    let start = -1;
    for (let k = 0; k <= n; k++) {
      if (k < n && ok(k)) { if (start < 0) start = k; } else if (start >= 0) { out.push([start, k - 1]); start = -1; }
    }
    return out;
  };
  const edge = (v) => (v === EDGE_LO ? 0 : v === EDGE_HI ? B_FIELD : v);
  for (let lz = 0; lz < BASEMENT_TRAY_NZ; lz++) {
    for (const [a, b] of runs(BASEMENT_TRAY_NX, (lx) => trayAt(area, lx, lz) && trayAt(area, Math.min(lx + 1, BASEMENT_TRAY_NX - 1), lz) && lx < BASEMENT_TRAY_NX - 1)) {
      segs.push({ alongX: true, from: edge(BASEMENT_TRAY_XS[a]), to: edge(BASEMENT_TRAY_XS[b + 1]), at: BASEMENT_TRAY_ZS[lz] });
    }
  }
  for (let lx = 0; lx < BASEMENT_TRAY_NX; lx++) {
    for (const [a, b] of runs(BASEMENT_TRAY_NZ, (lz) => trayAt(area, lx, lz) && lz < BASEMENT_TRAY_NZ - 1 && trayAt(area, lx, lz + 1))) {
      segs.push({ alongX: false, from: edge(BASEMENT_TRAY_ZS[a]), to: edge(BASEMENT_TRAY_ZS[b + 1]), at: BASEMENT_TRAY_XS[lx] });
    }
  }
  return segs;
}

// Kürzester Weg durch die Trassen von Feld a nach Feld b (Breitensuche über Nachbarfelder in x und z, nur im Keller)
// als Wegpunkte für trayPath: die Ecken des Weges (ohne Start und Ziel; mindestens ein Wegpunkt), oder null, wenn
// es keinen Weg gibt. Für die Umwandlung alter Spielstände (core/servers.js).
export function basementAutoRoute(a, b) {
  if (!isBasementField(a) || !isBasementField(b)) return null;
  const prev = new Map([[a, null]]);
  const queue = [a];
  while (queue.length && !prev.has(b)) {
    const f = queue.shift();
    const { ix, iz } = fieldCoords(f);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx;
      const nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= BASEMENT_TRAY_COLS || nz >= B_ROWS) continue;
      const n = bIndex(nx, nz);
      if (prev.has(n) || !isBasementField(n)) continue;
      prev.set(n, f);
      queue.push(n);
    }
  }
  if (!prev.has(b)) return null;
  const path = [];
  for (let f = b; f !== null; f = prev.get(f)) path.unshift(f);
  // Alle Felder dazwischen als Wegpunkte: trayPath läuft so genau diesen Weg (jedes Stück ist ein Schritt)
  const inner = path.slice(1, -1);
  return inner.length ? inner : [b];
}

// ---------- Beide Bereiche ----------

// Gibt es dieses Gitterfeld (zweite Etage: gültiger Index, nicht über dem Fahrstuhl; Keller: siehe oben)?
export const isField = (field) => (inRaster(field) ? !BLOCKED_SET.has(field) : isBasementField(field));

// Mitte eines Feldes { x, z } oder null
export function fieldCenter(field) {
  if (!isField(field)) return null;
  if (inBasementRaster(field)) {
    const { ix, iz, lx, lz } = basementCell(field);
    const col = Math.floor(ix / BASEMENT_TRAY_NX);
    const row = Math.floor(iz / BASEMENT_TRAY_NZ);
    return { x: round3(B_ORIGIN + col * B_FIELD + BASEMENT_TRAY_XS[lx]), z: round3(B_ORIGIN + row * B_FIELD + BASEMENT_TRAY_ZS[lz]) };
  }
  return rasterCenter(field);
}

// Alle Felder der zweiten Etage (für Klickflächen und das 3D-Gitter)
export const trayFields = () => Array.from({ length: TRAY_FIELDS }, (_, i) => i).filter(isField);

// Feld der zweiten Etage, in dem der Punkt (x, z) liegt, oder null (außerhalb des Gitters bzw. über dem Fahrstuhl);
// im Keller basementFieldAt
export function fieldAt(x, z) {
  const ix = Math.round((x - X_AXIS.first) / FIELD_SIZE);
  const iz = Math.round((z - Z_AXIS.first) / FIELD_SIZE);
  if (ix < 0 || ix >= TRAY_COLS || iz < 0 || iz >= TRAY_ROWS) return null;
  const field = fieldIndex(ix, iz);
  return isField(field) ? field : null;
}

// Feld über einem Stellplatz oder null (Bunker-Plätze: Keller-Gitterfeld)
export function fieldAbove(spot) {
  const p = spotPosition(spot);
  if (!p) return null;
  if (spotArea(spot) !== 'bunker') return fieldAt(p.x, p.z);
  // Im Bunker: Trassenfeld über dem warmen Gang hinter der Reihe, in der Spalte des Schranks
  const warm = BUNKER_WARM_Z[Math.floor(bunkerRowOf(spot).row / 2)];
  return basementFieldAt(p.x, fieldBounds(p.field).minZ + warm);
}

// Feld für die Anzeige: „Feld 3/7“ (Spalte von West, Reihe von Nord, ab 1; im Keller je Bunker-Feld gezählt)
export function fieldLabel(field) {
  if (!isField(field)) return 'kein Gitterfeld';
  if (inBasementRaster(field)) {
    const { lx, lz, area } = basementCell(field);
    const warm = BUNKER_WARM_Z.indexOf(BASEMENT_TRAY_ZS[lz]);
    const spine = BASEMENT_SPINE_X.indexOf(BASEMENT_TRAY_XS[lx]);
    const spineName = ['West', 'Mitte', 'Ost'][spine] ?? null;
    const slot = BUNKER_ROW_X.indexOf(BASEMENT_TRAY_XS[lx]);
    const edgeName = lz === 1 ? 'Nordtrasse' : 'Südtrasse';
    const where = EDGE_J.has(lz) && !spineName
      ? `${edgeName} · über Platz ${slot + 1}`
      : warm >= 0
      ? `Trasse über Reihe ${2 * warm + 1}/${2 * warm + 2}${spineName ? ` · Kreuzung ${spineName}` : BUNKER_ROW_X.includes(BASEMENT_TRAY_XS[lx]) ? ` · über Platz ${BUNKER_ROW_X.indexOf(BASEMENT_TRAY_XS[lx]) + 1}` : ' · Übergang'}`
      : `Quertrasse ${spineName ?? ''}${lz === 1 ? ' · Nord' : lz === BASEMENT_TRAY_NZ - 2 ? ' · Süd' : lz === 0 || lz === BASEMENT_TRAY_NZ - 1 ? ' · Übergang' : ''}`;
    return `${where} (Bunker ${bunkerNumber(area)})`;
  }
  const { ix, iz } = fieldCoords(field);
  return `Feld ${ix + 1}/${iz + 1}`;
}

// ---------- Internet-Anschluss an der Wand ----------

export const WAN_ID = 'wan';
export const WALL_PORTS = SERVER_SPOTS;   // jeder Schrank kann seine eigene Leitung haben (28)
// Wandkasten an der Westwand (Wandfläche x = −10), zwischen Reihe A (z −4) und Reihe B (z 2) im Gang vor den
// Glastüren von Reihe A und hinter Reihe B, 1,7 m westlich der ersten Schränke. Fenster der Westwand liegen bei
// z −4,8…−3,2 und 3,2…4,8 (1,0–2,4 m hoch), Treppe und Fahrstuhl weit im Osten – alles frei.
// Mitte des Kastens auf Griffhöhe; Ports zeigen nach Osten in den Raum (+x).
export const WAN_BOX = Object.freeze({
  wallX: -ROOM_HALF, x: -ROOM_HALF + 0.05, y: 1.4, z: -1, width: 0.5, height: 0.3, depth: 0.1,
});
const WAN_PORT_ROWS = 2;
const WAN_PORTS_PER_ROW = Math.ceil(WALL_PORTS / WAN_PORT_ROWS); // 14
const WAN_PORT_PITCH = 0.03;      // m zwischen zwei Ports in einer Reihe
const WAN_ROW_PITCH = 0.06;       // m zwischen den beiden Reihen
// Kabeltrasse an der Wand: vom Kasten (Mitte z) senkrecht hoch auf TRAY_HEIGHT, dann waagerecht ins Einstiegsfeld
export const WAN_TRACE = Object.freeze({ x: -ROOM_HALF + 0.03, z: WAN_BOX.z, y0: round3(WAN_BOX.y + WAN_BOX.height / 2), y1: TRAY_HEIGHT });
// Feld, an dem die Leitung vom Wandanschluss ins Gitter geht (das wandnächste Feld auf Höhe des Kastens)
export const WAN_FIELD = fieldAt(TRAY_BOUNDS.minX + FIELD_SIZE / 2, WAN_BOX.z);

// ---------- Internet-Kästen im Keller (Daten-Bunker, #52, #61) ----------
// Kabel kommen nicht 70 m von der Halle herunter: Jedes Bunker-Feld hat eigene Internet-Kästen (gratis, kommen und gehen
// mit dem Feld). Je Feld BASEMENT_WAN_BOXES = 4 Kästen mit je 33 Ports (3 Reihen à 11) = 132 Ports – einer je
// Schrankplatz (120) und 12 Reserve. Die Kästen hängen alle 10 m an Nord- und Südkante des Feldes (x 4,75 und 15,25,
// über einer Schrankspalte, weit weg von den Stahltüren in der Mitte der Feldseiten und den Spinnen) an einer
// schmalen Glasfaser-Säule (BASEMENT_WAN_COLUMN, Boden bis Decke, 0,3 m tief an der Kante – vor einer Wand wirkt sie
// wie ein Kabelkanal, an einer offenen Kante zum Nachbar-Bunker steht sie Rücken an Rücken mit dessen Säule). Die Ports
// zeigen ins Feld; von jedem Kasten läuft eine Trasse an der Säule hoch und oben waagerecht in die Nord- bzw. Südtrasse.
// Kasten k: 0 = Nordwest, 1 = Nordost, 2 = Südwest, 3 = Südost („WAN B2-3“ = Bunker 2, Kasten 3).
// Ports haben im Spielstand dieselbe id 'wan' wie oben, aber eigene Nummern:
//   BASEMENT_WAN_PORT0 + Feld × 132 + Kasten × 33 + n (n 0…32, Anzeige „Bunker 2 · WAN 3 · Port 17“).
// Weit weg von den Ports oben (0…27) und dem alten einzelnen Keller-Anschluss (1000…1031 bis Spielstand 27, siehe
// LEGACY_BASEMENT_WAN_PORT0 – core/save.js wandelt ihn um). Kabel zwischen zweiter Etage und Keller gibt es nicht.
export const BASEMENT_WAN_PORT0 = 10000;
export const BASEMENT_WAN_BOXES = 4;
export const BASEMENT_WAN_ROWS = 3;
export const BASEMENT_WAN_COLS = 11;
export const BASEMENT_WAN_BOX_PORTS = BASEMENT_WAN_ROWS * BASEMENT_WAN_COLS;               // 33
export const BASEMENT_WAN_FIELD_PORTS = BASEMENT_WAN_BOXES * BASEMENT_WAN_BOX_PORTS;       // 132
export const BASEMENT_WAN_PITCH = 0.032;     // m zwischen zwei Ports in einer Reihe
export const BASEMENT_WAN_ROW_PITCH = 0.06;  // m zwischen zwei Reihen
// Alter einzelner Keller-Anschluss (Spielstand bis Version 27): Ports 1000…1031 an einer Säule im ersten Bunker-Feld
export const LEGACY_BASEMENT_WAN_PORT0 = 1000;
export const LEGACY_BASEMENT_WALL_PORTS = 32;
// Säule: Breite (x) und Tiefe (von der Feldkante ins Feld); Kasten: Mitte auf Griffhöhe, Außenmaße
export const BASEMENT_WAN_COLUMN = Object.freeze({ w: 0.56, d: 0.3 });
const B_BOX = { y: 1.35, width: 0.46, height: 0.34, depth: 0.1 };
const B_TOP_ROW = 0.115;                     // oberste Port-Reihe so weit über der Kastenmitte (Schild unten)
// Lage der Kästen im Feld (m ab der Westkante): die Schrankspalten der Nord-/Südtrasse, die x 5 und 15 am nächsten sind
const nearestTrayX = (x) => BASEMENT_TRAY_XS.reduce((best, v) => (Math.abs(v - x) < Math.abs(best - x) ? v : best));
export const BASEMENT_WAN_BOX_X = Object.freeze([nearestTrayX(5), nearestTrayX(15)]);   // 4,75 und 15,25
const BASEMENT_ALL_PORTS = GRID * GRID * BASEMENT_WAN_FIELD_PORTS;

export const isBasementWanPort = (port) => Number.isInteger(port) && port >= BASEMENT_WAN_PORT0
  && port < BASEMENT_WAN_PORT0 + BASEMENT_ALL_PORTS;

// Port-Nummer zu Feld, Kasten (0…3) und Port im Kasten (0…32)
export const basementWanPort = (field, box, n) => BASEMENT_WAN_PORT0 + field * BASEMENT_WAN_FIELD_PORTS + box * BASEMENT_WAN_BOX_PORTS + n;
// Umgekehrt: { field, box, n } eines Keller-Ports oder null (prüft nicht, ob das Feld gerade Bunker ist)
export function basementWanPortInfo(port) {
  if (!isBasementWanPort(port)) return null;
  const k = port - BASEMENT_WAN_PORT0;
  const field = Math.floor(k / BASEMENT_WAN_FIELD_PORTS);
  const inField = k % BASEMENT_WAN_FIELD_PORTS;
  return { field, box: Math.floor(inField / BASEMENT_WAN_BOX_PORTS), n: inField % BASEMENT_WAN_BOX_PORTS };
}
// Alle Ports eines Kastens bzw. eines Feldes
export const basementWanBoxPorts = (field, box) => Array.from({ length: BASEMENT_WAN_BOX_PORTS }, (_, n) => basementWanPort(field, box, n));
export const basementWanFieldPorts = (field) => Array.from({ length: BASEMENT_WAN_FIELD_PORTS }, (_, k) => BASEMENT_WAN_PORT0 + field * BASEMENT_WAN_FIELD_PORTS + k);

// Name eines Kastens für Schild und Anzeige: „WAN B2-3“ (Bunker-Nummer wie auf den Schildern der Felder, Kasten ab 1)
export const basementWanBoxName = (field, box) => `WAN B${bunkerNumber(field)}-${box + 1}`;

// Lage von Kasten box (0…3) im Bunker-Feld field oder null (Feld ist kein Bunker): Welt-x/z des Kellers, y über dem
// Kellerboden.
//   facing   +1 = Ports zeigen nach Süden (Kasten an der Nordkante), −1 = nach Norden (Südkante)
//   column   Säule als Rechteck { minX, maxX, minZ, maxZ } (auch für die Kollision)
//   box      { x, y (Mitte), z (Mitte), backZ (Rückseite an der Säule), frontZ (Vorderseite), width, height, depth }
//   trace    Trasse an der Säule: x/z der Kabel darin, y0 Oberkante Kasten, y1 Gitterhöhe – oben waagerecht bis
//   entryField  Trassenfeld, in das sie mündet (Nord- bzw. Südtrasse über derselben Schrankspalte)
export function basementWanBox(field, box) {
  if (!isBunkerField(field) || !Number.isInteger(box) || box < 0 || box >= BASEMENT_WAN_BOXES) return null;
  const b = fieldBounds(field);
  const north = box < 2;
  const facing = north ? 1 : -1;
  const x = round3(b.minX + BASEMENT_WAN_BOX_X[box % 2]);
  const edge = north ? b.minZ : b.maxZ;
  const c = BASEMENT_WAN_COLUMN;
  const backZ = round3(edge + facing * c.d);
  const frontZ = round3(backZ + facing * B_BOX.depth);
  return {
    field, index: box, facing, name: basementWanBoxName(field, box),
    column: { minX: x - c.w / 2, maxX: x + c.w / 2, minZ: Math.min(edge, backZ), maxZ: Math.max(edge, backZ) },
    box: { x, y: B_BOX.y, z: round3((backZ + frontZ) / 2), backZ, frontZ, width: B_BOX.width, height: B_BOX.height, depth: B_BOX.depth },
    trace: { x, z: round3(backZ + facing * 0.03), y0: round3(B_BOX.y + B_BOX.height / 2), y1: TRAY_HEIGHT },
    entryField: basementFieldAt(x, b.minZ + (north ? NORTH_Z : SOUTH_Z)),
  };
}
// Alle 4 Kästen eines Bunker-Feldes (leer, wenn es keins ist)
export const basementWanBoxes = (field) => (isBunkerField(field) ? Array.from({ length: BASEMENT_WAN_BOXES }, (_, k) => basementWanBox(field, k)) : []);
// Kasten, an dem ein Keller-Port sitzt, oder null
export function basementWanBoxOf(port) {
  const info = basementWanPortInfo(port);
  return info ? basementWanBox(info.field, info.box) : null;
}

export const isWanPort = (port) => (Number.isInteger(port) && port >= 0 && port < WALL_PORTS)
  || (isBasementWanPort(port) && isBunkerField(basementWanPortInfo(port).field));
export const isWanRef = (ref) => ref?.id === WAN_ID;
export function wanPortName(port) {
  const info = basementWanPortInfo(port);
  return info ? `Bunker ${bunkerNumber(info.field)} · WAN ${info.box + 1} · Port ${info.n + 1}` : `WAN ${port + 1}`;
}
// Bereich eines Wandanschluss-Ports: 'upper' | 'basement'
export const wanArea = (port) => (isBasementWanPort(port) ? 'basement' : 'upper');

// Lage eines Ports (Mitte der Buchse) { x, y, z } oder null. Mit Blick auf den Kasten (nach Westen) von links nach
// rechts gezählt, also von Süd (+z) nach Nord: WAN 1–14 obere Reihe, WAN 15–28 untere Reihe.
// Im Keller mit Blick auf den Kasten von links nach rechts: Port 1–11 oben, 12–22 Mitte, 23–33 unten; y über dem
// Kellerboden, z an der Vorderseite des Kastens.
export function wanPortPosition(port) {
  if (isBasementWanPort(port)) {
    const wan = basementWanBoxOf(port);
    if (!wan) return null;
    const { n } = basementWanPortInfo(port);
    const row = Math.floor(n / BASEMENT_WAN_COLS);
    const col = n % BASEMENT_WAN_COLS;
    return {
      x: round3(wan.box.x + wan.facing * (col - (BASEMENT_WAN_COLS - 1) / 2) * BASEMENT_WAN_PITCH),
      y: round3(wan.box.y + B_TOP_ROW - row * BASEMENT_WAN_ROW_PITCH),
      z: wan.box.frontZ,
    };
  }
  if (!isWanPort(port)) return null;
  const row = Math.floor(port / WAN_PORTS_PER_ROW);
  const col = port % WAN_PORTS_PER_ROW;
  return {
    x: round3(WAN_BOX.x + WAN_BOX.depth / 2),
    y: round3(WAN_BOX.y + ((WAN_PORT_ROWS - 1) / 2 - row) * WAN_ROW_PITCH),
    z: round3(WAN_BOX.z + ((WAN_PORTS_PER_ROW - 1) / 2 - col) * WAN_PORT_PITCH),
  };
}

// ---------- Kabel-Enden ----------
// Ende im Schrank: { spot, rackUnits, unit, units } – Stellplatz des Schranks, seine HE, oberste belegte HE des
// Geräts (0 = oben) und dessen Höhe in HE (servers.js: rack.slot, rack.type.units, device.unit, device.type.units)
// Ende am Wandanschluss: { id: 'wan', port }
export const rackEnd = (spot, rackUnits, unit, units) => ({ spot, rackUnits, unit, units });
export const wanEnd = (port) => ({ id: WAN_ID, port });

// Gitterfeld, in dem ein Ende ankommt, oder null
export function endField(end) {
  if (isWanRef(end)) {
    if (!isWanPort(end.port)) return null;
    return isBasementWanPort(end.port) ? basementWanBoxOf(end.port)?.entryField ?? null : WAN_FIELD;
  }
  return fieldAbove(end?.spot);
}

// Senkrechter Weg (plus Anschluss) eines Endes bis zur Mitte seines Gitterfeldes in Metern, oder null.
// Schrank: Gerätemitte hinten bis zum Dach, weiter bis TRAY_HEIGHT, dazu RACK_EXIT (seitlich zur Kabelführung und
// durch die Dachöffnung). Wand: am Kasten zur Trasse, Trasse hoch bis TRAY_HEIGHT, waagerecht zur Feldmitte.
export function endRise(end) {
  if (isWanRef(end)) {
    const p = wanPortPosition(end.port);
    if (!p) return null;
    if (isBasementWanPort(end.port)) {
      const { trace, entryField } = basementWanBoxOf(end.port);
      const entry = fieldCenter(entryField);
      if (!entry) return null;
      return Math.abs(p.x - trace.x) + (TRAY_HEIGHT - p.y) + Math.abs(entry.z - trace.z);
    }
    return Math.abs(p.z - WAN_TRACE.z) + (TRAY_HEIGHT - p.y) + Math.abs(fieldCenter(WAN_FIELD).x - WAN_TRACE.x);
  }
  const above = fieldAbove(end?.spot);
  if (above === null) return null;
  const { rackUnits, unit, units } = end;
  if (![rackUnits, unit, units].every(Number.isFinite)) return null;
  const portHeight = RACK_BASE + (rackUnits - unit - units / 2) * UNIT_METERS;
  // Im Bunker hängt die Trasse über dem warmen Gang hinter dem Schrank: oben aus der Kabeleinführung (hinten im Dach)
  // waagerecht bis zur Mitte der Trasse
  let across = 0;
  if (spotArea(end.spot) === 'bunker') {
    const p = spotPosition(end.spot);
    const exitZ = p.z - spotFacing(end.spot) * (RACK_DEPTH / 2 - 0.05);
    across = Math.abs(fieldCenter(above).z - exitZ);
  }
  return TRAY_HEIGHT - portHeight + RACK_EXIT + across;
}

// ---------- Weg durch das Gitter ----------

// Felder von a nach b ohne a: erst entlang x, dann entlang z
function straight(a, b) {
  const from = fieldCoords(a);
  const to = fieldCoords(b);
  const index = trayArea(a) === 'basement' ? bIndex : fieldIndex;
  const out = [];
  let { ix, iz } = from;
  while (ix !== to.ix) { ix += Math.sign(to.ix - ix); out.push(index(ix, iz)); }
  while (iz !== to.iz) { iz += Math.sign(to.iz - iz); out.push(index(ix, iz)); }
  return out;
}

// Bereich eines Kabel-Endes: 'upper' | 'basement' | null
function endArea(end) {
  if (isWanRef(end)) return isWanPort(end.port) ? wanArea(end.port) : null;
  const area = spotArea(end?.spot);
  return area === 'bunker' ? 'basement' : area;
}

const AREA_PROBLEM ='Kabel zwischen Serverraum und Daten-Bunker gehen nicht – jeder Bereich braucht eigene Firewall und eigenen Internet-Anschluss';

// Weg Startfeld → Wegpunkte (Klick-Reihenfolge) → Zielfeld. Ergebnis:
//   { fields: [Feld-Indizes, alle durchlaufenen in Reihenfolge, Start und Ziel eingeschlossen], steps } – steps:
//     Anzahl der Schritte von Feld zu Feld (Länge im Gitter = steps · FIELD_SIZE). Umwege und doppelte Wegpunkte
//     laufen hin und zurück, Felder können dann mehrfach vorkommen.
//   { problem: 'Grund' } – kein Wegpunkt, Feld außerhalb, Weg durch eine Lücke im Gitter
export function trayPath(startField, waypoints, endField) {
  if (!isField(startField) || !isField(endField)) return { problem: 'Kein Gitterfeld über dem Anschluss' };
  if (trayArea(startField) !== trayArea(endField)) return { problem: AREA_PROBLEM };
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    return { problem: 'Kabel zwischen Schränken nur über das Kabelgitter – Gitterfelder anklicken' };
  }
  if (waypoints.some((f) => !isField(f))) return { problem: 'Wegpunkt liegt nicht im Kabelgitter' };
  if (waypoints.some((f) => trayArea(f) !== trayArea(startField))) {
    return { problem: trayArea(startField) === 'basement' ? 'Wegpunkt liegt im Serverraum oben – Kabel im Bunker nur über das Gitter im Keller' : 'Wegpunkt liegt im Keller – Kabel im Serverraum nur über das Gitter oben' };
  }
  const basement = trayArea(startField) === 'basement';
  const fields = [startField];
  for (const target of [...waypoints, endField]) {
    const part = straight(fields[fields.length - 1], target);
    if (part.some((f) => !isField(f))) {
      return { problem: basement
        ? 'Kabelweg im Gitter nicht verbunden (ohne Trasse dazwischen – über die Quertrassen West, Mitte oder Ost führen)'
        : 'Kabelweg im Gitter nicht verbunden (Fahrstuhlschacht im Weg)' };
    }
    fields.push(...part);
  }
  return { fields, steps: fields.length - 1 };
}

// Wegpunkte nach einem Klick auf field: noch nicht dabei → hinten anhängen, schon dabei → herausnehmen.
// Gibt eine neue Liste zurück (die alte bleibt unverändert); Klicks auf Nicht-Felder ändern nichts.
export function toggleWaypoint(waypoints, field) {
  if (!isField(field)) return [...waypoints];
  return waypoints.includes(field) ? waypoints.filter((f) => f !== field) : [...waypoints, field];
}

// Grund, warum zwischen den Enden a und b (rackEnd/wanEnd) kein Gitterkabel über waypoints geht, oder null.
// Prüft nur Gitter und Wandanschluss – belegte Ports, Kabelvorrat usw. prüft servers.js.
export function trayProblem(a, b, waypoints) {
  for (const end of [a, b]) {
    if (isWanRef(end) && !isWanPort(end.port)) return 'Kein Port am Internet-Anschluss';
  }
  if (isWanRef(a) && isWanRef(b)) return 'Internet-Anschluss kann man nicht mit sich selbst verbinden';
  if (!isWanRef(a) && !isWanRef(b) && a?.spot === b?.spot) return 'Im selben Schrank über die Clips verkabeln';
  if (endArea(a) && endArea(b) && endArea(a) !== endArea(b)) return AREA_PROBLEM;
  const fa = endField(a);
  const fb = endField(b);
  if (fa === null || fb === null) return 'Kein Gitterfeld über dem Anschluss';
  if (endRise(a) === null || endRise(b) === null) return 'Gerät nicht eingebaut';
  return trayPath(fa, waypoints, fb).problem ?? null;
}

// Länge eines Weges durch die Felder in Metern: Summe der Abstände der Feldmitten (oben je Schritt 1 m, im Bunker
// so weit, wie die Trassenfelder auseinanderliegen)
function pathLength(fields) {
  let sum = 0;
  for (let k = 1; k < fields.length; k++) {
    const p = fieldCenter(fields[k - 1]);
    const q = fieldCenter(fields[k]);
    sum += Math.abs(p.x - q.x) + Math.abs(p.z - q.z);
  }
  return round3(sum);
}

// Aufschlüsselung der Kabellänge in Metern (für Tests und Hinweise) oder null, wenn der Weg nicht geht:
// { riseA, tray, riseB, slack, total } – total auf 10 cm aufgerundet wie in servers.js
export function trayLengthParts(a, b, waypoints) {
  if (trayProblem(a, b, waypoints)) return null;
  const path = trayPath(endField(a), waypoints, endField(b));
  const parts = { riseA: endRise(a), tray: pathLength(path.fields), riseB: endRise(b), slack: CABLE_SLACK };
  const sum = parts.riseA + parts.tray + parts.riseB + parts.slack;
  return { ...parts, total: round1(Math.ceil(round3(sum) * 10) / 10) };
}

// Kabellänge in Metern über das Gitter, auf 10 cm aufgerundet, oder null (Weg geht nicht):
// Weg im Schrank bis oben + Höhe bis zum Gitter (bzw. Trasse am Wandanschluss) + Felder · 1 m + runter am Ziel
// + CABLE_SLACK
export const trayCableLength = (a, b, waypoints) => trayLengthParts(a, b, waypoints)?.total ?? null;

// ---------- Spielstand ----------
// Gespeichert werden die angeklickten Wegpunkte (wie die Clips), nicht der ganze Weg – der folgt aus den Regeln:
// Kabel { a, b, clips: [], tray: [Feld-Indizes], length }. Wandanschluss-Enden als { id: 'wan', port }.

// Wegpunkte zum Speichern (Kopie, nur gültige Felder)
export const trayToJSON = (waypoints) => sanitizeTray(waypoints);

// Wegpunkte aus einem Spielstand: keine Liste → []; ungültige Felder (keine ganze Zahl, außerhalb, über dem Fahrstuhl)
// und Doppelte werden verworfen, die Reihenfolge bleibt.
export function sanitizeTray(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const f of raw) if (isField(f) && !out.includes(f)) out.push(f);
  return out;
}

// Wandanschluss-Ende aus einem Spielstand gültig? (Port im Bereich 0…WALL_PORTS−1)
export const validWanRef = (ref) => isWanRef(ref) && isWanPort(ref.port);
