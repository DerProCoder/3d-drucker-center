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
// Kellerboden) und eigener Glasfaser-Anschluss (Ports ab BASEMENT_WAN_PORT0). Kabel verbinden nur Enden im selben
// Bereich (trayArea/AREA_PROBLEM).
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
  BASEMENT_FIELD_SIZE, SERVER_SPOTS, bunkerNumber, bunkerWanField, isBunkerField, spotArea, spotPosition,
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

// ---------- Gitter im Daten-Bunker (Keller, #52) ----------
// Eigenes 1-m-Raster über den ganzen Keller (120 × 120 Felder ab der Nordwest-Ecke x/z = −10), Feld-Index
// = BASEMENT_TRAY_BASE + ix + iz · BASEMENT_TRAY_COLS – so kommen sich die Nummern beider Bereiche nie in die Quere.
// Gitterfelder gibt es nur in fertigen Bunker-Feldern (core/server-zones.js isBunkerField), und dort nicht
//   - am Feldrand zu einer Wand (Außenwand oder Bunkerwand zu einem Nachbarn, der kein Bunker ist) – zwischen zwei
//     Bunker-Feldern läuft das Gitter durch,
//   - in den vier Feldecken (Betonstützen),
//   - in den 2 × 2 Feldern in der Mitte (dort hängt das Schild von der Decke),
//   - über der Glasfaser-Säule (BASEMENT_WAN_COLUMN, in jedem Bunker-Feld freigehalten, damit sich das Gitter nicht
//     ändert, wenn der Anschluss umzieht).
// Die Mitten liegen auf halben Metern, genau über den Bunker-Stellplätzen (core/server-zones.js BUNKER_ROW_X/Z).
// Höhe wie oben: Keller und zweite Etage sind beide 3,5 m hoch, das Gitter hängt auf TRAY_HEIGHT über dem Kellerboden.
export const BASEMENT_TRAY_BASE = 100000;
const B_FIELD = BASEMENT_FIELD_SIZE;                 // 20 Gitterfelder je Kellerfeld und Richtung
export const BASEMENT_TRAY_COLS = GRID * B_FIELD;    // 120
const B_ORIGIN = fieldBounds(0).minX;                // −10 (Nordwest-Ecke des Kellers, x und z)
const bIndex = (ix, iz) => BASEMENT_TRAY_BASE + ix + iz * BASEMENT_TRAY_COLS;
const inBasementRaster = (field) => Number.isInteger(field) && field >= BASEMENT_TRAY_BASE
  && field < BASEMENT_TRAY_BASE + BASEMENT_TRAY_COLS * BASEMENT_TRAY_COLS;
// Glasfaser-Säule (Feldkoordinaten in m ab der Nordwest-Ecke des Kellerfeldes): steht in der Nordwest-Ecke des
// Feldes, weit weg von den Türen (Mitte der Feldseiten) und den Schrankreihen; der Wandkasten hängt an ihrer
// Südseite (Ports nach Süden)
export const BASEMENT_WAN_COLUMN = Object.freeze({ x: 2.5, z: 2.3, w: 0.6, d: 0.4 });
const COLUMN_CELL = { lx: Math.floor(BASEMENT_WAN_COLUMN.x), lz: Math.floor(BASEMENT_WAN_COLUMN.z) };

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

// Kellerfeld (Feldnummer core/basement-layout.js) und Lage im Feld (lx, lz: 0…19) eines Keller-Gitterfeldes
function basementCell(field) {
  const { ix, iz } = fieldCoords(field);
  return { ix, iz, lx: ix % B_FIELD, lz: iz % B_FIELD, area: Math.floor(iz / B_FIELD) * GRID + Math.floor(ix / B_FIELD) };
}

function isBasementField(field) {
  if (!inBasementRaster(field)) return false;
  const { lx, lz, area } = basementCell(field);
  if (!isBunkerField(area)) return false;
  const last = B_FIELD - 1;
  if ((lx === 0 || lx === last) && (lz === 0 || lz === last)) return false;      // Stützen in den Ecken
  if ((lx === 9 || lx === 10) && (lz === 9 || lz === 10)) return false;          // Schild in der Mitte
  if (lx === COLUMN_CELL.lx && lz === COLUMN_CELL.lz) return false;              // Glasfaser-Säule
  const col = area % GRID;
  const row = Math.floor(area / GRID);
  if (lz === 0 && !(row > 0 && isBunkerField(area - GRID))) return false;
  if (lz === last && !(row < GRID - 1 && isBunkerField(area + GRID))) return false;
  if (lx === 0 && !(col > 0 && isBunkerField(area - 1))) return false;
  if (lx === last && !(col < GRID - 1 && isBunkerField(area + 1))) return false;
  return true;
}

// Kellerfeld (Feldnummer) eines Keller-Gitterfeldes oder null – z. B. für „durch welches Feld läuft das Kabel?“
export const basementAreaOf = (field) => (inBasementRaster(field) ? basementCell(field).area : null);
// Lage eines Keller-Gitterfeldes im Kellerfeld { area, lx, lz } oder null
export const basementCellOf = (field) => (inBasementRaster(field) ? basementCell(field) : null);

// Keller-Gitterfeld, in dem der Punkt (x, z) liegt, oder null (kein Gitter dort)
export function basementFieldAt(x, z) {
  const ix = Math.floor(x - B_ORIGIN);
  const iz = Math.floor(z - B_ORIGIN);
  if (ix < 0 || iz < 0 || ix >= BASEMENT_TRAY_COLS || iz >= BASEMENT_TRAY_COLS) return null;
  const field = bIndex(ix, iz);
  return isBasementField(field) ? field : null;
}

// Alle Gitterfelder eines Bunker-Feldes (für das 3D-Gitter) bzw. die Lücken darin als Feldkoordinaten { x, z } (0…19)
export function basementTraySkips(area) {
  const b = fieldBounds(area);
  const skip = [];
  for (let lz = 0; lz < B_FIELD; lz++) {
    for (let lx = 0; lx < B_FIELD; lx++) {
      if (!isBasementField(bIndex(Math.round(b.minX - B_ORIGIN) + lx, Math.round(b.minZ - B_ORIGIN) + lz))) skip.push({ x: lx, z: lz });
    }
  }
  return skip;
}

// ---------- Beide Bereiche ----------

// Gibt es dieses Gitterfeld (zweite Etage: gültiger Index, nicht über dem Fahrstuhl; Keller: siehe oben)?
export const isField = (field) => (inRaster(field) ? !BLOCKED_SET.has(field) : isBasementField(field));

// Mitte eines Feldes { x, z } oder null
export function fieldCenter(field) {
  if (!isField(field)) return null;
  if (inBasementRaster(field)) {
    const { ix, iz } = fieldCoords(field);
    return { x: round3(B_ORIGIN + ix + 0.5), z: round3(B_ORIGIN + iz + 0.5) };
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
  return spotArea(spot) === 'bunker' ? basementFieldAt(p.x, p.z) : fieldAt(p.x, p.z);
}

// Feld für die Anzeige: „Feld 3/7“ (Spalte von West, Reihe von Nord, ab 1; im Keller je Bunker-Feld gezählt)
export function fieldLabel(field) {
  if (!isField(field)) return 'kein Gitterfeld';
  if (inBasementRaster(field)) {
    const { lx, lz, area } = basementCell(field);
    return `Feld ${lx + 1}/${lz + 1} (Bunker ${bunkerNumber(area)})`;
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

// ---------- Internet-Anschluss im Keller (Daten-Bunker, #52) ----------
// Kabel kommen nicht 70 m von der Halle herunter: Der Keller hat einen eigenen Glasfaser-Anschluss. Er ist gratis und
// steht, sobald es ein fertiges Bunker-Feld gibt, im ersten Bunker-Feld (core/server-zones.js bunkerWanField – bleibt
// in seinem Feld, solange das Bunker ist) an einer Glasfaser-Säule (BASEMENT_WAN_COLUMN, Boden bis Decke). Der
// Wandkasten hängt an ihrer Südseite, Ports nach Süden (+z). Seine Ports haben im Spielstand dieselbe id 'wan' wie
// oben, aber eigene Nummern ab BASEMENT_WAN_PORT0 (Anzeige „Keller-WAN 1…32“). Kabel zwischen zweiter Etage und Keller
// gibt es nicht – jeder Bereich braucht seine eigene Firewall und seinen eigenen Anschluss.
export const BASEMENT_WAN_PORT0 = 1000;
export const BASEMENT_WALL_PORTS = 32;
const B_PORTS_PER_ROW = BASEMENT_WALL_PORTS / WAN_PORT_ROWS; // 16
const B_BOX = { y: 1.4, width: 0.56, height: 0.3, depth: 0.1 };

export const isBasementWanPort = (port) => Number.isInteger(port) && port >= BASEMENT_WAN_PORT0
  && port < BASEMENT_WAN_PORT0 + BASEMENT_WALL_PORTS;

// Lage des Keller-Anschlusses oder null (noch kein Bunker-Feld): field (Kellerfeld), column (Säule als Rechteck),
// box wie WAN_BOX (wallZ: Südseite der Säule, x/z: Kastenmitte, y Mitte auf Griffhöhe), trace (Trasse an der Säule:
// x/z, y0 Oberkante Kasten, y1 Gitterhöhe), entryField (Gitterfeld, in das die Trasse mündet: südlich der Säule)
export function basementWan() {
  const field = bunkerWanField();
  if (field === null) return null;
  const b = fieldBounds(field);
  const c = BASEMENT_WAN_COLUMN;
  const cx = b.minX + c.x;
  const wallZ = b.minZ + c.z + c.d / 2;
  const box = { wallZ, x: cx, y: B_BOX.y, z: round3(wallZ + B_BOX.depth / 2), width: B_BOX.width, height: B_BOX.height, depth: B_BOX.depth };
  return {
    field,
    column: { minX: cx - c.w / 2, maxX: cx + c.w / 2, minZ: b.minZ + c.z - c.d / 2, maxZ: wallZ },
    box,
    trace: { x: cx, z: round3(wallZ + 0.03), y0: round3(B_BOX.y + B_BOX.height / 2), y1: TRAY_HEIGHT },
    entryField: basementFieldAt(cx, wallZ + 1),
  };
}

export const isWanPort = (port) => (Number.isInteger(port) && port >= 0 && port < WALL_PORTS)
  || (isBasementWanPort(port) && basementWan() !== null);
export const isWanRef = (ref) => ref?.id === WAN_ID;
export const wanPortName = (port) => (isBasementWanPort(port) ? `Keller-WAN ${port - BASEMENT_WAN_PORT0 + 1}` : `WAN ${port + 1}`);
// Bereich eines Wandanschluss-Ports: 'upper' | 'basement'
export const wanArea = (port) => (isBasementWanPort(port) ? 'basement' : 'upper');

// Lage eines Ports (Mitte der Buchse) { x, y, z } oder null. Mit Blick auf den Kasten (nach Westen) von links nach
// rechts gezählt, also von Süd (+z) nach Nord: WAN 1–14 obere Reihe, WAN 15–28 untere Reihe.
// Im Keller (Blick nach Norden) von West nach Ost: Keller-WAN 1–16 oben, 17–32 unten; y über dem Kellerboden.
export function wanPortPosition(port) {
  if (isBasementWanPort(port)) {
    const wan = basementWan();
    if (!wan) return null;
    const k = port - BASEMENT_WAN_PORT0;
    const row = Math.floor(k / B_PORTS_PER_ROW);
    const col = k % B_PORTS_PER_ROW;
    return {
      x: round3(wan.box.x + (col - (B_PORTS_PER_ROW - 1) / 2) * WAN_PORT_PITCH),
      y: round3(wan.box.y + ((WAN_PORT_ROWS - 1) / 2 - row) * WAN_ROW_PITCH),
      z: round3(wan.box.z + wan.box.depth / 2),
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
    return isBasementWanPort(end.port) ? basementWan()?.entryField ?? null : WAN_FIELD;
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
      const { trace, entryField } = basementWan();
      const entry = fieldCenter(entryField);
      if (!entry) return null;
      return Math.abs(p.x - trace.x) + (TRAY_HEIGHT - p.y) + Math.abs(entry.z - trace.z);
    }
    return Math.abs(p.z - WAN_TRACE.z) + (TRAY_HEIGHT - p.y) + Math.abs(fieldCenter(WAN_FIELD).x - WAN_TRACE.x);
  }
  if (fieldAbove(end?.spot) === null) return null;
  const { rackUnits, unit, units } = end;
  if (![rackUnits, unit, units].every(Number.isFinite)) return null;
  const portHeight = RACK_BASE + (rackUnits - unit - units / 2) * UNIT_METERS;
  return TRAY_HEIGHT - portHeight + RACK_EXIT;
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
        ? 'Kabelweg im Gitter nicht verbunden (Lücke im Gitter: Schild, Stütze, Wand oder kein Bunker – mit Wegpunkten außen herum führen)'
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

// Aufschlüsselung der Kabellänge in Metern (für Tests und Hinweise) oder null, wenn der Weg nicht geht:
// { riseA, tray, riseB, slack, total } – total auf 10 cm aufgerundet wie in servers.js
export function trayLengthParts(a, b, waypoints) {
  if (trayProblem(a, b, waypoints)) return null;
  const path = trayPath(endField(a), waypoints, endField(b));
  const parts = { riseA: endRise(a), tray: path.steps * FIELD_SIZE, riseB: endRise(b), slack: CABLE_SLACK };
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
