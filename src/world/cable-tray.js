// Kabelgitter unter der Decke des Serverraums und Internet-Anschluss (WAN) an der Westwand (Issue #29). Lage und
// Regeln stehen in core/cable-tray.js, die Modelle in models/cable-tray.js. Hier: Gitter, Wandkasten und Wandtrasse
// in den Serverraum setzen, Klicks auf Gitterfelder und Wandports an world/server-room.js weiterreichen (dort liegt
// der Ablauf beim Verlegen) und Kabel über das Gitter als Röhre zeichnen: vom Port im offenen Schrankrücken an der
// Kabelführung hoch, durch die Kabeleinführung im Dach senkrecht ins Feld über dem Schrank, entlang der Feldmitten
// und am Ziel wieder runter – bzw. am Wandanschluss über die Trasse zum Kasten.
// Koordinaten: wie die Gruppe des Serverraums (Fußboden der zweiten Etage = y 0, x/z wie core/server-zones.js).
import * as THREE from 'three';
import {
  BLOCKED, CEILING_HEIGHT, FIELD_SIZE, TRAY_BOUNDS, TRAY_COLS, TRAY_HEIGHT, TRAY_ROWS, WALL_PORTS, WAN_BOX, WAN_FIELD,
  BASEMENT_WAN_COLS, BASEMENT_WAN_PITCH, WAN_TRACE, basementWanBoxOf, basementWanPortInfo, fieldAt, fieldCenter,
  isBasementWanPort, wanPortPosition,
} from '../core/cable-tray.js';
import { createCableTray, createWallBox, createWallRiser } from '../models/cable-tray.js';
import { clipPosition, rackDepth, rackHeight } from '../models/server-hardware.js';

// Deckenleuchten und Spots der zweiten Etage (world/upper-floor.js: Leuchten bei x −6/0/6, z ±4, Spots bei z 0) –
// dort hängt keine Gewindestange
const LAMPS = [-6, 0, 6].flatMap((x) => [
  { x, z: -4, w: 1.24, d: 0.34 }, { x, z: 4, w: 1.24, d: 0.34 }, { x, z: 0, w: 0.3, d: 0.3 },
]);

// Stecker (durchsichtig-hell) und Knickschutz (in Kabelfarbe) an den Kabelenden
const PLUG_GEOMETRY = new THREE.BoxGeometry(0.0115, 0.0085, 0.012);
const PLUG_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.3, transparent: true, opacity: 0.85 });
const BOOT_GEOMETRY = new THREE.BoxGeometry(0.009, 0.007, 0.014);
export const SHARED_CABLE_GEOMETRY = new Set([PLUG_GEOMETRY, BOOT_GEOMETRY]); // beim Neuaufbau nicht freigeben
const HIT_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export const TRAY_CABLE_RADIUS = 0.0035;  // im Gitter etwas dicker als im Schrank, damit man es von unten sieht
const LANE_STEP = 0.017;                  // Versatz nebeneinanderliegender Kabel im Feld (m)
const LANES = 13;                         // so viele nebeneinander (±10 cm), dann eine Lage höher – beliebig viele Lagen
const SEGMENT_LENGTH = 0.05;              // Röhre: etwa alle 5 cm ein Ring (nach Länge, nicht nach Zahl der Stützpunkte) …
const MAX_SEGMENTS = 300;                 // … aber höchstens so viele je Kabel
const WAN_GAP = 0.015;                  // halber Port-Abstand am Wandkasten: Kabel laufen zwischen den Nummern hoch

// Ein Material je Kabelfarbe für alle Kabel (wird nie freigegeben, nur die Röhren)
const cableMaterials = new Map();
function cableMaterial(color) {
  if (!cableMaterials.has(color)) cableMaterials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
  return cableMaterials.get(color);
}

// Kabel als weiche Röhre entlang points, an beiden Enden ein Stecker mit Knickschutz, ausgerichtet in Richtung des
// ersten bzw. letzten Kabelstücks (Buchsen hinten am Gerät zeigen nach −z, am Wandkasten nach +x). Material und
// Stecker-Geometrie sind geteilt – beim Entfernen nur die Röhre freigeben.
export function createCable(points, color, radius = 0.0028) {
  const g = new THREE.Group();
  const material = cableMaterial(color);
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const segments = Math.min(MAX_SEGMENTS, Math.max(8, Math.ceil(curve.getLength() / SEGMENT_LENGTH)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 6, false), material));
  for (const [p, q] of [[points[0], points[1]], [points[points.length - 1], points[points.length - 2]]]) {
    const dir = q.clone().sub(p).normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, dir);
    const plug = new THREE.Mesh(PLUG_GEOMETRY, PLUG_MATERIAL);
    plug.position.copy(p).addScaledVector(dir, 0.004);
    plug.quaternion.copy(turn);
    const boot = new THREE.Mesh(BOOT_GEOMETRY, material);
    boot.position.copy(p).addScaledVector(dir, 0.016);
    boot.quaternion.copy(turn);
    g.add(plug, boot);
  }
  // Kabel sind kein Klickziel: der Strahl geht hindurch zum Port bzw. Schrank dahinter (Stecker sitzen vor der Buchse)
  g.traverse((o) => { o.castShadow = false; o.raycast = () => {}; });
  return g;
}

// Feld-Index (core) ↔ Feld { x, z } des Modells (Spalte/Reihe ab der Nordwestecke)
const toCell = (field) => ({ x: field % TRAY_COLS, z: Math.floor(field / TRAY_COLS) });

// Versatz eines Kabels im Feld (lane: Nummer, je steckendem Gitterkabel eine eigene) und Höhe, auf der es liegt.
// Jede Nummer ergibt eine eigene Kombination aus Versatz und Lage – Kabel mit gleichem Weg liegen nie übereinander.
export function laneOf(lane) {
  const o = ((lane % LANES) - (LANES - 1) / 2) * LANE_STEP;
  const layer = Math.floor(lane / LANES);
  const y = TRAY_HEIGHT + TRAY_CABLE_RADIUS + 0.001 + layer * 2.2 * TRAY_CABLE_RADIUS;
  return { o, y, layer };
}

// Stützpunkte durch die Felder (Mitten, um den Versatz verschoben). An Ecken je ein Punkt kurz davor und danach,
// damit das Kabel eng um die Ecke läuft und nicht quer über das Feld schwingt oder über das Gitter hinausschießt –
// auch am Übergang zu den Stücken davor (before) und danach (after), die vom Port bzw. von der Trasse kommen.
function fieldPoints(fields, lane, before = null, after = null) {
  const { o, y } = laneOf(lane);
  const centers = fields.map((f) => {
    const c = fieldCenter(f);
    return new THREE.Vector3(c.x + o, y, c.z + o);
  });
  const list = [before, ...centers, after];
  const out = [];
  centers.forEach((p, i) => {
    const prev = list[i];
    const next = list[i + 2];
    if (prev && next) {
      const a = p.clone().sub(prev);
      const b = next.clone().sub(p);
      const la = a.length();
      const lb = b.length();
      if (la > 1e-6 && lb > 1e-6 && a.dot(b) / (la * lb) < 0.99) {
        out.push(p.clone().addScaledVector(a, -Math.min(0.12, la * 0.45) / la), p, p.clone().addScaledVector(b, Math.min(0.12, lb * 0.45) / lb));
        return;
      }
    }
    out.push(p);
  });
  return out;
}

// Ecken einer Polylinie runden (Issue #30). Eine Catmull-Rom-Kurve durch wenige Stützpunkte schießt an einer Ecke
// über den Stützpunkt hinaus, wenn auf ein kurzes ein langes Stück folgt (z. B. erst 4 cm zur Kabelführung, dann
// 1,8 m hoch) – das Kabel beult dann seitlich aus dem Schrank oder in die Wand. Deshalb wird jede Ecke durch einen
// kleinen Bogen ersetzt (quadratische Bézierkurve im Dreieck davor–Ecke–danach, bleibt also innen) und davor und
// danach je ein Punkt auf die Gerade gesetzt, damit die langen Stücke gerade ankommen. radius: Bogen beginnt höchstens
// so weit vor der Ecke (bei kurzen Stücken entsprechend früher).
const ARC_STEPS = 3;
function roundCorners(points, radius = 0.05) {
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const a = p.clone().sub(points[i - 1]);
    const b = points[i + 1].clone().sub(p);
    const la = a.length();
    const lb = b.length();
    if (la < 1e-6 || lb < 1e-6 || a.dot(b) / (la * lb) > 0.999) {
      out.push(p);
      continue;
    }
    a.divideScalar(la);
    b.divideScalar(lb);
    const d = Math.min(radius, la * 0.22, lb * 0.22);
    const s = p.clone().addScaledVector(a, -d);
    const e = p.clone().addScaledVector(b, d);
    out.push(p.clone().addScaledVector(a, -2 * d));
    for (let k = 0; k <= ARC_STEPS; k++) {
      const t = k / ARC_STEPS;
      out.push(s.clone().multiplyScalar((1 - t) ** 2).addScaledVector(p, 2 * t * (1 - t)).addScaledVector(e, t * t));
    }
    out.push(p.clone().addScaledVector(b, 2 * d));
  }
  out.push(points[points.length - 1]);
  return out;
}

// Stück vom Port eines Geräts im Schrank bis ins Feld über dem Schrank (von unten nach oben): Stecker nach hinten,
// weiter gerade nach hinten bis auf die Höhe der Clips (hinter der hinteren Montageschiene vorbei), auf Porthöhe zur
// Kabelführung an der näheren Seite, darin senkrecht durch die Clips hoch bis unters Dach, hinter der Schiene zur Mitte,
// unter dem hinteren Querträger nach vorn zur Kabeleinführung und durch sie senkrecht ins Gitter. Ecken rundet
// trayCablePoints (roundCorners) – so bleibt das Kabel in der Schrankkontur.
// port: Lage der Buchse, rack: { x, z, type } – Mitte des Schranks und sein Typ
export function rackRise(port, rack, lane) {
  const { o, y } = laneOf(lane);
  const H = rackHeight(rack.type);
  const D = rackDepth(rack.type);
  const side = port.x >= rack.x ? 1 : -1;
  const clip = clipPosition(rack.type, side, 0).add(new THREE.Vector3(rack.x, 0, rack.z));
  // Lage im Clip wie bei den Kabeln im Schrank (3 × 3 nebeneinander), damit nicht alle an derselben Stelle laufen
  const cx = clip.x + side * ((lane % 3) - 1) * 0.005;
  const cz = clip.z + ((Math.floor(lane / 3) % 3) - 1) * 0.005;
  const entryX = rack.x + THREE.MathUtils.clamp(o * 1.4, -0.15, 0.15);
  const entryZ = rack.z - D / 2 + 0.05;
  const under = Math.max(port.y + 0.01, H - 0.09); // unter dem hinteren Querträger (Unterkante H − 0,07)
  const v = (x, py, z) => new THREE.Vector3(x, py, z);
  return [
    port.clone(),
    v(port.x, port.y, port.z - 0.028),
    v(port.x, port.y, Math.min(cz, port.z - 0.028)),
    v(cx, port.y, cz),
    v(cx, under, cz),
    v(entryX, under, cz),
    v(entryX, under, entryZ),
    v(entryX, y, entryZ),
  ];
}

// Stück vom Port am Wandkasten bis ins Einstiegsfeld (WAN_FIELD): Stecker gerade nach vorn, kurz zur Seite in die
// Lücke zwischen zwei Port-Nummern, senkrecht vor dem Kasten hoch (Schild sitzt unten, models/cable-tray.js
// headerBelow), über dem Kasten nach hinten in die Trasse, darin hoch und oben waagerecht ins Gitter.
// Die Lage in der Trasse folgt der Lage des Ports (gleiche Reihenfolge in z, die untere Reihe weiter vorn wie vor dem
// Kasten) – so kreuzen sich die Kabel über dem Kasten nicht. Erst im Gitter gehen sie auf ihre Spur (lane).
export function wanRise(port, lane) {
  if (isBasementWanPort(port)) return basementWanRise(port, lane);
  const p = wanPortPosition(port);
  const { y } = laneOf(lane);
  const front = WAN_BOX.x + WAN_BOX.depth / 2;
  const top = WAN_BOX.y + WAN_BOX.height / 2;
  const lower = p.y < WAN_BOX.y;
  const fx = front + (lower ? 0.046 : 0.034);
  const zc = p.z + WAN_GAP;
  const z = WAN_TRACE.z + (zc - WAN_BOX.z) * 0.6; // Ports (±0,2 m) auf die Trasse (±0,15 m) zusammengerückt
  const tx = WAN_TRACE.x - 0.012 + (lower ? 0.01 : 0);
  const v = (x, py, pz) => new THREE.Vector3(x, py, pz);
  return [
    v(front + 0.006, p.y, p.z),
    v(fx, p.y, p.z),
    v(fx, p.y + 0.012, zc),
    v(fx, top + 0.05, zc),
    v(tx, top + 0.2, z),
    v(tx, y, z),
  ];
}

// Dasselbe an einem Internet-Kasten im Daten-Bunker (#61): Kasten an einer Säule an der Nord- bzw. Südkante, Ports ins
// Feld (facing +1: nach Süden, −1: nach Norden), Trasse an der Säule hoch. Je Port-Reihe (3) stehen die Kabel vor dem
// Kasten etwas weiter vorn, in der Trasse liegen sie in derselben Reihenfolge – so kreuzen sie sich nicht.
// Koordinaten über dem Kellerboden (Welt-x/z), oder null, wenn es den Kasten nicht (mehr) gibt.
function basementWanRise(port, lane) {
  const wan = basementWanBoxOf(port);
  const p = wanPortPosition(port);
  if (!wan || !p) return null;
  const { y } = laneOf(lane);
  const { box, trace, facing: f } = wan;
  const row = Math.floor(basementWanPortInfo(port).n / BASEMENT_WAN_COLS);
  const top = box.y + box.height / 2;
  const fz = box.frontZ + f * (0.03 + row * 0.009);
  const xc = p.x + f * BASEMENT_WAN_PITCH / 2;
  const x = trace.x + (xc - box.x) * 0.6;
  const tz = trace.z + f * (row - 1) * 0.009;
  const v = (px, py, pz) => new THREE.Vector3(px, py, pz);
  return [
    v(p.x, p.y, box.frontZ + f * 0.006),
    v(p.x, p.y, fz),
    v(xc, p.y + 0.012, fz),
    v(xc, top + 0.05, fz),
    v(x, top + 0.2, tz),
    v(x, y, tz),
  ];
}

// Ganzer Verlauf: Anfangsstück (von unten nach oben), Felder, Endstück (wird umgedreht); doppelte Punkte raus, Ecken
// gerundet
export function trayCablePoints(startRise, fields, endRise, lane) {
  const end = endRise ? [...endRise].reverse() : [];
  const all = [...startRise, ...fieldPoints(fields, lane, startRise[startRise.length - 1], end[0] ?? null), ...end];
  return roundCorners(all.filter((p, i) => i === 0 || p.distanceToSquared(all[i - 1]) > 1e-6));
}

// Gitter, Wandkasten und Trasse. fieldInteraction: { hint(field), hover(field), unhover(), action(field) } für das
// angezielte Feld (Feld-Index aus core/cable-tray.js); wanPortInteraction(port) liefert userData.interaction je Port.
export function createCableTrayRoom({ fieldInteraction, wanPortInteraction }) {
  const group = new THREE.Group();
  group.name = 'cable-tray-room';

  const tray = createCableTray({
    x0: TRAY_BOUNDS.minX, z0: TRAY_BOUNDS.minZ, cols: TRAY_COLS, rows: TRAY_ROWS, cell: FIELD_SIZE,
    height: TRAY_HEIGHT, ceiling: CEILING_HEIGHT, hangerEvery: 2, avoid: LAMPS, skip: BLOCKED.map(toCell),
  });
  group.add(tray);
  const local = new THREE.Vector3();
  const fieldOf = (hit) => {
    if (!hit) return null;
    group.worldToLocal(local.copy(hit.point));
    return fieldAt(local.x, local.z);
  };
  tray.userData.hitArea.userData.interaction = {
    hint: (hit) => {
      const field = fieldOf(hit);
      return field === null ? null : fieldInteraction.hint(field);
    },
    hover: (hit) => fieldInteraction.hover?.(fieldOf(hit)),
    unhover: () => fieldInteraction.unhover?.(),
    action: (hit) => {
      const field = fieldOf(hit);
      if (field !== null) fieldInteraction.action(field);
    },
  };

  // Wandkasten: Ports genau dort, wo core/cable-tray.js sie annimmt (Kastenmitte z = WAN_BOX.z). Mit rotation.y = π/2
  // zeigt die Vorderseite nach +x, Kasten-x läuft nach −z, Kasten-y ab der Unterkante.
  const bottom = WAN_BOX.y - WAN_BOX.height / 2;
  const box = createWallBox({
    ports: WALL_PORTS, width: WAN_BOX.width, height: WAN_BOX.height, depth: WAN_BOX.x + WAN_BOX.depth / 2 - WAN_BOX.wallX,
    headerBelow: true, // Kabel laufen vor dem Kasten nach oben – Schild unten bleibt frei
    positions: Array.from({ length: WALL_PORTS }, (_, port) => {
      const p = wanPortPosition(port);
      return { x: WAN_BOX.z - p.z, y: p.y - bottom };
    }),
  });
  box.rotation.y = Math.PI / 2;
  box.position.set(WAN_BOX.wallX, bottom, WAN_BOX.z);
  const { w, h, d } = box.userData.portSize;
  const portHit = new THREE.BoxGeometry(w, h, d);
  box.userData.ports.forEach((p, port) => {
    const hitbox = new THREE.Mesh(portHit, HIT_MATERIAL);
    hitbox.position.set(p.x, p.y, p.z);
    hitbox.name = `port:wan:${port}`;
    hitbox.userData.interaction = wanPortInteraction(port);
    box.add(hitbox);
  });
  group.add(box);

  // Trasse vom Kasten senkrecht hoch und oben waagerecht bis an den Rand des Gitters; die Kabel liegen auf WAN_TRACE.x
  const back = 0.012; // Abstand des Trassenrückens zur Wand (models/cable-tray.js)
  const riser = createWallRiser({
    height: WAN_TRACE.y1 - WAN_TRACE.y0, width: 0.3, reach: TRAY_BOUNDS.minX - WAN_BOX.wallX,
    depth: Math.max(0.03, 2 * (WAN_TRACE.x - WAN_BOX.wallX - back)),
  });
  riser.rotation.y = Math.PI / 2;
  riser.position.set(WAN_BOX.wallX, WAN_TRACE.y0, WAN_TRACE.z);
  group.add(riser);

  // Lage einer Buchse am Wandkasten (für Markierung und Vorschaukabel)
  const wanPortPos = (port) => {
    const p = wanPortPosition(port);
    return p ? new THREE.Vector3(p.x + 0.006, p.y, p.z) : null;
  };

  // Felder markieren: picked (angeklickte Wegpunkte) hell, path (Weg dazwischen) gedämpft – Feld-Indizes
  const markFields = (picked = [], path = []) => tray.userData.markFields(picked.map(toCell), path.map(toCell));

  return { group, tray, box, riser, wanPortPos, markFields, startField: WAN_FIELD };
}
