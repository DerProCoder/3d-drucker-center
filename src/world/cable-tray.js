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
  WAN_TRACE, fieldAt, fieldCenter, wanPortPosition,
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
const LANE_STEP = 0.025;                  // Versatz nebeneinanderliegender Kabel im Feld (m)
const LANES = 9;                          // so viele nebeneinander, dann eine Lage höher

// Kabel als weiche Röhre entlang points, an beiden Enden ein Stecker mit Knickschutz, ausgerichtet in Richtung des
// ersten bzw. letzten Kabelstücks (Buchsen hinten am Gerät zeigen nach −z, am Wandkasten nach +x)
export function createCable(points, color, radius = 0.0028) {
  const g = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const segments = Math.min(1600, Math.max(points.length * 12, Math.ceil(curve.getLength() * 40)));
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

// Versatz eines Kabels im Feld (lane: laufende Nummer) und Höhe, auf der es liegt
function laneOf(lane) {
  const o = ((lane % LANES) - (LANES - 1) / 2) * LANE_STEP;
  const y = TRAY_HEIGHT + TRAY_CABLE_RADIUS + 0.001 + (Math.floor(lane / LANES) % 3) * 2.2 * TRAY_CABLE_RADIUS;
  return { o, y };
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

// Stück vom Port eines Geräts im Schrank bis ins Feld über dem Schrank (von unten nach oben): Stecker nach hinten,
// zur Kabelführung an der Seite, daran hoch, durch die Kabeleinführung hinten im Dach und senkrecht ins Gitter.
// port: Lage der Buchse, rack: { x, z, type } – Mitte des Schranks und sein Typ
export function rackRise(port, rack, lane) {
  const { o, y } = laneOf(lane);
  const H = rackHeight(rack.type);
  const D = rackDepth(rack.type);
  const top = clipPosition(rack.type, 1, 0).add(new THREE.Vector3(rack.x, 0, rack.z));
  const entryX = rack.x + THREE.MathUtils.clamp(o * 1.4, -0.15, 0.15);
  const entryZ = rack.z - D / 2 + 0.05;
  const v = (x, py, z) => new THREE.Vector3(x, py, z);
  const plug = v(port.x, port.y, port.z - 0.028);
  return [
    port.clone(),
    plug,
    v((plug.x + top.x) / 2, port.y - 0.01, Math.min(plug.z, top.z) - 0.01),
    v(top.x, port.y, top.z),
    v(top.x, Math.max(port.y, top.y - 0.02), top.z),
    v(entryX, H - 0.03, entryZ),
    v(entryX, H + 0.03, entryZ),
    v(entryX, y - 0.08, entryZ),
    v(entryX + (rack.x + o - entryX) * 0.3, y, entryZ + 0.06),
  ];
}

// Stück vom Port am Wandkasten bis ins Einstiegsfeld (WAN_FIELD): Stecker nach vorn, über den Kasten in die
// Trasse, daran hoch und oben waagerecht ins Gitter
export function wanRise(port, lane) {
  const p = wanPortPosition(port);
  const { o, y } = laneOf(lane);
  const front = WAN_BOX.x + WAN_BOX.depth / 2;
  const z = WAN_TRACE.z + o;
  const v = (x, py, pz) => new THREE.Vector3(x, py, pz);
  return [
    v(front + 0.006, p.y, p.z),
    v(front + 0.034, p.y, p.z),
    v(front + 0.05, p.y + 0.04, (p.z * 2 + z) / 3),
    v(front + 0.03, WAN_TRACE.y0 + 0.03, (p.z + z * 2) / 3),
    v(WAN_TRACE.x, WAN_TRACE.y0 + 0.12, z),
    v(WAN_TRACE.x, WAN_TRACE.y1 - 0.08, z),
    v(WAN_TRACE.x + 0.08, y, z),
  ];
}

// Ganzer Verlauf: Anfangsstück (von unten nach oben), Felder, Endstück (wird umgedreht); doppelte Punkte raus
export function trayCablePoints(startRise, fields, endRise, lane) {
  const end = endRise ? [...endRise].reverse() : [];
  const all = [...startRise, ...fieldPoints(fields, lane, startRise[startRise.length - 1], end[0] ?? null), ...end];
  return all.filter((p, i) => i === 0 || p.distanceToSquared(all[i - 1]) > 1e-6);
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
