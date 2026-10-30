// Daten-Bunker im Keller (#52, Reihen wie im Rechenzentrum #60): Einrichtung der Bunker-Felder, die nicht zu einem
// einzelnen Schrank gehört –
//   - Kabeltrassen (Leitern) über den warmen Gängen und drei Quertrassen je Feld (Lage aus core/cable-tray.js
//     basementTraySegments, Modell models/cable-tray.js createLadderTrays), zu Bunker-Nachbarn laufen sie durch,
//   - grüne Bodenmarkierungen der 120 Stellplätze je Feld: lückenlos als Streifen mit dünnen Trennlinien, sichtbar,
//     solange man einen Schrankkarton trägt und der Platz frei ist (ein InstancedMesh je Feld = ein Draw Call),
//   - Lochplatten (Kaltluft) in den kalten Gängen vor den Fronten,
//   - einfache Schrank-Kästen für alle Bunker-Schränke außerhalb von LOD_NEAR um die Spielfigur (ein InstancedMesh je
//     Feld – volle Schränke mit Geräten zeichnet world/server-room.js nur in der Nähe, setFarRacks),
//   - je Feld 4 Internet-Kästen à 33 Ports an Glasfaser-Säulen an Nord- und Südkante mit Nummernschild „WAN B2-3“ und
//     Trasse in die Nord- bzw. Südtrasse (#61, Lage aus core/cable-tray.js basementWanBoxes, Modell
//     models/wan-cabinet.js). Ports sind keine eigenen Objekte: je Kasten eine unsichtbare Klickfläche vor der
//     Vorderseite, der Port nahe am Treffpunkt zählt (ein gelber Rahmen zeigt ihn).
// Schränke, Kabel und der Ablauf beim Verlegen liegen in world/server-room.js (wie oben); Klicks auf Trassen, Ports
// am Kasten und Markierungen reicht dieses Modul dorthin weiter.
//
// Koordinaten: Alles hängt in Gruppen auf Höhe des Kellerbodens (y = 0 dort), x/z sind Welt-x/z des Kellers – wie
// die Gruppe der zweiten Etage in world/server-room.js („Bodenkoordinaten“ je Bereich). Trassen, Markierungen,
// Lochplatten und Schrank-Kästen liegen je Feld in basement.fields.contentGroup(Feld) und werden so mit dem Feld
// ausgeblendet (weiter als 60 m weg), ebenso die Internet-Kästen und die je Feld zusammengefassten Kabel
// (world/server-room.js); der Rahmen am angezielten Port und Hilfsobjekte beim Verlegen in frame (in
// basement.fields.group, sichtbar, solange man im Keller ist).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BASEMENT_FLOOR_Y, fieldBounds } from '../core/basement-layout.js';
import {
  BASEMENT_WAN_COLS, BASEMENT_WAN_PITCH, BASEMENT_WAN_ROW_PITCH, BASEMENT_WAN_ROWS, CEILING_HEIGHT, TRAY_HEIGHT,
  basementCellOf, basementFieldAt, basementTraySegments, basementWanBoxPorts, basementWanBoxes, basementWanPortInfo,
  fieldCenter, wanPortPosition,
} from '../core/cable-tray.js';
import {
  BUNKER_COLD_AISLE, BUNKER_RACK_DEPTH, BUNKER_RACK_PITCH, BUNKER_ROW_Z, BUNKER_ROWS_BOUNDS, bunkerFields, bunkerSpotsIn,
  spotFacing, spotPosition,
} from '../core/server-zones.js';
import { createLadderTrays } from '../models/cable-tray.js';
import { createWanCabinets } from '../models/wan-cabinet.js';
import { canvasTexture } from '../models/canvas-texture.js';

const LEVEL = -2;                 // Stockwerk des Kellers für die Kollision (world/basement.js LEVEL.BASEMENT)
const TRAY_WIDTH = 0.5;           // Breite der Kabelleitern
const HIT_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
const HIT_SIDE_MATERIAL = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
const MARK_PICK = new THREE.Color(0xffd84a).multiplyScalar(2);
const MARK_PATH = new THREE.Color(0xffd84a).multiplyScalar(0.9);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

// Bodenmarkierung eines Platzes: grün, mit dünnem dunklem Rand – nebeneinander ergibt das einen Streifen mit
// Trennlinien zwischen den Plätzen
function createMarkerMaterial() {
  const texture = canvasTexture(96, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(75, 224, 138, 0.32)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(75, 224, 138, 0.95)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.strokeStyle = 'rgba(10, 40, 20, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }, 1, 1, { wrap: false });
  return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

// Lochplatten im kalten Gang: helle Bodenplatten 0,6 m mit Lochfeld
function createPerforatedMaterial() {
  const texture = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#9aa3ad';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5d656e';
    for (let y = 14; y < h - 10; y += 8) for (let x = 14; x < w - 10; x += 8) ctx.fillRect(x, y, 3, 3);
    ctx.strokeStyle = '#3d434a';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  }, 1, 1);
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
}

// Schrank von weitem: dunkler Kasten, vorn eine getönte Glastür mit dunklem Innenraum – undurchsichtig, damit man
// nicht auf die Rückwand blickt (#62); die Geräte liegen als Frontplatten knapp davor (createFarDeviceMaterial), ein
// leerer Schrank sieht so leer und dunkel aus. Hinten offen mit Kabeln. Seiten, Dach und Rücken auch von innen sichtbar.
function createFarRackMaterials() {
  const front = canvasTexture(64, 192, (ctx, w, h) => {
    const glass = ctx.createLinearGradient(0, 0, w, h);
    glass.addColorStop(0, '#1d242c');
    glass.addColorStop(0.55, '#10141a');
    glass.addColorStop(1, '#171d24');
    ctx.fillStyle = glass;
    ctx.fillRect(0, 0, w, h);
    // Montageschienen links und rechts im Innenraum
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(7, 6, 3, h - 12);
    ctx.fillRect(w - 10, 6, 3, h - 12);
    ctx.fillStyle = '#1b1e23';
    ctx.fillRect(0, 0, w, 6);
    ctx.fillRect(0, h - 6, w, 6);
    ctx.fillRect(0, 0, 4, h);
    ctx.fillRect(w - 4, 0, 4, h);
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(w - 9, h * 0.45, 2, h * 0.1); // Griff
  }, 1, 1, { wrap: false });
  const back = canvasTexture(64, 192, (ctx, w, h) => {
    ctx.fillStyle = '#15181c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2f6fd6';
    ctx.lineWidth = 2;
    for (let x = 14; x < w - 10; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x, h - 8);
      ctx.stroke();
    }
  }, 1, 1, { wrap: false });
  const side = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
  const top = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide });
  return [
    side, side, top, top,
    new THREE.MeshStandardMaterial({ map: front, roughness: 0.2, metalness: 0.3 }),
    new THREE.MeshStandardMaterial({ map: back, roughness: 0.8, side: THREE.DoubleSide }),
  ];
}

// Gerät von weitem: Frontplatte mit Lüftungsschlitzen, Laufwerken und LEDs, hell – die Farbe der Baureihe kommt je
// Platte über instanceColor dazu; die Status-LEDs leuchten (emissiveMap, #62)
function createFarDeviceMaterial() {
  const leds = canvasTexture(128, 32, (ctx, w, h) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3ddc6e';
    ctx.fillRect(108, 10, 4, 4);
    ctx.fillStyle = '#2a8fd6';
    ctx.fillRect(116, 10, 4, 4);
  }, 1, 1, { wrap: false });
  const texture = canvasTexture(128, 32, (ctx, w, h) => {
    ctx.fillStyle = '#c9ced4';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7d848c';
    for (let x = 8; x < 46; x += 4) ctx.fillRect(x, 6, 2, h - 12);
    for (let x = 52; x < 100; x += 12) ctx.fillRect(x, 8, 10, h - 16);
    ctx.fillStyle = '#3ddc6e';
    ctx.fillRect(108, 10, 4, 4);
    ctx.fillStyle = '#2a8fd6';
    ctx.fillRect(116, 10, 4, 4);
    ctx.strokeStyle = '#4a5058';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }, 1, 1, { wrap: false });
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5, metalness: 0.3, emissiveMap: leds, emissive: 0xffffff, emissiveIntensity: 1.2 });
}

function dispose(object, keep) {
  object.traverse((o) => {
    if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose();
  });
}

// Höhe eines Schranks mit units HE (wie rackHeight in models/server-hardware.js: Sockel + HE + Dach)
const rackHeightOf = (units) => 0.1 + units * 0.0445 + 0.08;

// layout: core/basement-layout.js (Feldarten, Stufe) · fields: world/basement-fields.js (basement.fields)
// fieldInteraction: { hint(field), hover(field), unhover(), action(field) } für angezielte Trassenfelder (Feld-Index
// aus core/cable-tray.js) · wanPortInteraction(port) → Interaktion je Port an den Internet-Kästen
// spotInteraction(spot) → { hint(), action() } je Stellplatz (Bodenmarkierung)
export function createBunker({ layout, fields, collision, fieldInteraction, wanPortInteraction, spotInteraction }) {
  const frame = new THREE.Group();
  frame.name = 'bunker';
  frame.position.y = BASEMENT_FLOOR_Y;
  fields.group.add(frame);
  const markerMaterial = createMarkerMaterial();
  const perforated = createPerforatedMaterial();
  const farMaterials = createFarRackMaterials();
  const deviceMaterial = createFarDeviceMaterial();
  const highlight = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  // Geteilte Geometrien (nicht freigeben)
  const markerGeometry = new THREE.PlaneGeometry(BUNKER_RACK_PITCH, BUNKER_RACK_DEPTH).rotateX(-Math.PI / 2);
  const highlightGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const farGeometry = new THREE.BoxGeometry(BUNKER_RACK_PITCH - 0.004, 1, BUNKER_RACK_DEPTH).translate(0, 0.5, 0);
  // Frontplatte eines Geräts: 19 Zoll breit, 1 m hoch (skaliert auf die HE), Vorderseite bei z 0, 0,5 m tief
  const slabGeometry = new THREE.BoxGeometry(0.483, 1, 0.5).translate(0, 0, -0.25);
  const shared = new Set([markerGeometry, highlightGeometry, farGeometry, slabGeometry]);

  // Je Bunker-Feld eine Gruppe auf Bodenhöhe im Inhalt des Feldes
  const holders = new Map();
  function holder(area) {
    let h = holders.get(area);
    if (!h) {
      h = new THREE.Group();
      h.name = `bunker-field-${area}`;
      h.position.y = BASEMENT_FLOOR_Y;
      fields.contentGroup(area)?.add(h);
      holders.set(area, h);
    }
    return h;
  }

  // ---------- Je Feld: Trassen, Markierungen, Lochplatten, Schrank-Kästen ----------

  const views = new Map();    // Feld → { key, group, trays, hit, marks, markers, spots, far }
  const fieldOf = (hit) => (hit ? basementFieldAt(hit.point.x, hit.point.z) : null);
  const trayInteraction = {
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

  function buildField(area) {
    const b = fieldBounds(area);
    const g = new THREE.Group();
    g.name = `bunker-view-${area}`;
    // Trassen: Leitern und eine gemeinsame unsichtbare Klickfläche (ein Objekt im Klickstrahl)
    const segments = basementTraySegments(area).map((s) => (s.alongX
      ? { x0: b.minX + s.from, z0: b.minZ + s.at, x1: b.minX + s.to, z1: b.minZ + s.at }
      : { x0: b.minX + s.at, z0: b.minZ + s.from, x1: b.minX + s.at, z1: b.minZ + s.to }));
    const trays = createLadderTrays(segments, { height: TRAY_HEIGHT, ceiling: CEILING_HEIGHT, width: TRAY_WIDTH });
    trays.traverse((o) => { o.castShadow = false; });
    g.add(trays);
    const hitGeos = segments.map((s) => {
      const len = Math.abs(s.x1 - s.x0) + Math.abs(s.z1 - s.z0);
      const alongX = s.z0 === s.z1;
      const geo = new THREE.PlaneGeometry(alongX ? len + 0.2 : TRAY_WIDTH + 0.4, alongX ? TRAY_WIDTH + 0.4 : len + 0.2).rotateX(-Math.PI / 2);
      return geo.translate((s.x0 + s.x1) / 2, TRAY_HEIGHT, (s.z0 + s.z1) / 2);
    });
    let hit = null;
    if (hitGeos.length) {
      hit = new THREE.Mesh(mergeFlat(hitGeos), HIT_SIDE_MATERIAL);
      hit.name = 'bunker-tray-hit';
      hit.userData.interaction = trayInteraction;
      g.add(hit);
    }
    // Markierte Trassenfelder (beim Verlegen): flache gelbe Rechtecke knapp unter der Leiter
    const marks = new THREE.InstancedMesh(highlightGeometry, highlight, 256);
    marks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
    marks.count = 0;
    marks.frustumCulled = false;
    marks.raycast = () => {};
    marks.renderOrder = 1;
    g.add(marks);
    // Lochplatten vor allen Fronten (kalte Gänge und die Gänge vor den äußeren Reihen)
    const r = BUNKER_ROWS_BOUNDS;
    const coldStrips = [r.minZ - BUNKER_COLD_AISLE / 2, ...[1, 3].map((k) => (BUNKER_ROW_Z[k] + BUNKER_ROW_Z[k + 1]) / 2), r.maxZ + BUNKER_COLD_AISLE / 2];
    const plateGeos = coldStrips.map((z) => {
      const w = r.maxX - r.minX;
      const geo = new THREE.PlaneGeometry(w, BUNKER_COLD_AISLE).rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 0.6), uv.getY(k) * (BUNKER_COLD_AISLE / 0.6));
      return geo.translate(b.minX + (r.minX + r.maxX) / 2, 0.003, b.minZ + z);
    });
    const plates = new THREE.Mesh(mergeFlat(plateGeos), perforated);
    plates.receiveShadow = true;
    plates.raycast = () => {};
    plates.name = 'bunker-cold-aisles';
    g.add(plates);
    // Bodenmarkierungen der Plätze (nur sichtbar beim Tragen eines Schranks)
    const spots = bunkerSpotsIn(area);
    const markers = new THREE.InstancedMesh(markerGeometry, markerMaterial, spots.length);
    markers.count = 0;
    markers.frustumCulled = false;
    markers.renderOrder = 1;
    markers.visible = false;
    markers.name = 'bunker-spots';
    markers.userData.shown = [];
    const spotAt = (h) => (h?.instanceId != null ? markers.userData.shown[h.instanceId] ?? null : null);
    markers.userData.interaction = {
      hint: (h) => {
        const spot = spotAt(h);
        return spot === null ? null : spotInteraction(spot).hint();
      },
      action: (h) => {
        const spot = spotAt(h);
        if (spot !== null) spotInteraction(spot).action();
      },
    };
    g.add(markers);
    // Schränke von weitem
    const far = new THREE.InstancedMesh(farGeometry, farMaterials, spots.length);
    far.count = 0;
    far.raycast = () => {};
    far.castShadow = false;
    far.receiveShadow = true;
    far.name = 'bunker-far-racks';
    g.add(far);
    const wan = buildWan(area, b);
    g.add(wan.group);
    return { group: g, trays, hit, marks, markers, spots, far, marked: false, wan };
  }

  // ---------- Internet-Kästen eines Feldes (#61) ----------

  // Gelber Rahmen um den angezielten Port (beim Zielen auf einen Kasten)
  const aim = new THREE.Mesh(new THREE.BoxGeometry(BASEMENT_WAN_PITCH * 0.95, BASEMENT_WAN_ROW_PITCH * 0.42, 0.004),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd84a).multiplyScalar(1.6), transparent: true, opacity: 0.55, depthWrite: false }));
  aim.raycast = () => {};
  aim.visible = false;
  aim.renderOrder = 2;
  frame.add(aim);
  let wanHit = null;          // geteilte Klickfläche vor der Vorderseite eines Kastens (alle Kästen gleich groß)

  // Port eines Kastens nahe am Treffpunkt (Bodenkoordinaten) oder null – nur, wenn der Strahl die Buchse ungefähr trifft
  function portNear(box, ports, hit) {
    if (!hit) return null;
    const x = hit.point.x;
    const y = hit.point.y - BASEMENT_FLOOR_Y;
    const first = wanPortPosition(ports[0]);
    const col = Math.round(((x - first.x) * box.facing) / BASEMENT_WAN_PITCH);
    const row = Math.round((first.y - y) / BASEMENT_WAN_ROW_PITCH);
    if (col < 0 || col >= BASEMENT_WAN_COLS || row < 0 || row >= BASEMENT_WAN_ROWS) return null;
    const port = ports[row * BASEMENT_WAN_COLS + col];
    const p = wanPortPosition(port);
    return Math.abs(p.x - x) < BASEMENT_WAN_PITCH * 0.6 && Math.abs(p.y - y) < BASEMENT_WAN_ROW_PITCH * 0.5 ? port : null;
  }

  function showAim(port, facing) {
    aim.visible = port !== null;
    if (!aim.visible) return;
    const p = wanPortPosition(port);
    aim.position.set(p.x, p.y, p.z + facing * 0.01);
  }

  // Klick auf einen Kasten: der Port am Treffpunkt verhält sich wie eine eigene Klickfläche (wanPortInteraction)
  function boxInteraction(box, ports) {
    const byPort = new Map();
    const of = (port) => {
      if (!byPort.has(port)) byPort.set(port, wanPortInteraction(port));
      return byPort.get(port);
    };
    let last = null;
    const leave = () => {
      if (last !== null) of(last).unhover?.();
      last = null;
    };
    return {
      hint: (hit) => {
        const port = portNear(box, ports, hit);
        return port === null ? `${box.name} · 33 Ports – auf eine Buchse zielen` : of(port).hint(hit);
      },
      hover: (hit) => {
        const port = portNear(box, ports, hit);
        if (port !== last) leave();
        last = port;
        if (port !== null) of(port).hover?.(hit);
        showAim(port, box.facing);
      },
      unhover: () => {
        leave();
        showAim(null);
      },
      action: (hit) => {
        const port = portNear(box, ports, hit);
        if (port !== null) of(port).action(hit);
      },
    };
  }

  // Kästen, Säulen und Trassen eines Bunker-Feldes; ports: Lage jeder Buchse (Bodenkoordinaten, knapp davor) für
  // Markierung und Kabel in world/server-room.js
  function buildWan(area, b) {
    const boxes = basementWanBoxes(area);
    const group = createWanCabinets(boxes.map((w) => {
      const bottom = w.box.y - w.box.height / 2;
      const entry = fieldCenter(w.entryField);
      return {
        name: w.name, x: w.box.x, backZ: w.box.backZ, facing: w.facing, edgeZ: w.facing > 0 ? b.minZ : b.maxZ,
        column: { w: w.column.maxX - w.column.minX }, box: w.box,
        // Lage der Ports in Kastenkoordinaten (x nach rechts von vorn gesehen, y ab Unterkante)
        ports: basementWanBoxPorts(area, w.index).map((port) => {
          const p = wanPortPosition(port);
          return { x: (p.x - w.box.x) * w.facing, y: p.y - bottom };
        }),
        riser: {
          y0: w.trace.y0, height: w.trace.y1 - w.trace.y0,
          reach: entry ? Math.max(0, Math.abs(entry.z - w.box.backZ) - TRAY_WIDTH / 2) : 0,
          depth: Math.max(0.03, 2 * (Math.abs(w.trace.z - w.box.backZ) - 0.012)),
        },
      };
    }), { ceiling: CEILING_HEIGHT });
    const ports = new Map();
    for (const w of boxes) {
      wanHit ??= new THREE.BoxGeometry(w.box.width, w.box.height, 0.04);
      shared.add(wanHit);
      const list = basementWanBoxPorts(area, w.index);
      const hit = new THREE.Mesh(wanHit, HIT_MATERIAL);
      hit.position.set(w.box.x, w.box.y, w.box.frontZ + w.facing * 0.012);
      hit.name = `wan-box:${area}:${w.index}`;
      hit.userData.interaction = boxInteraction(w, list);
      group.add(hit);
      for (const port of list) {
        const p = wanPortPosition(port);
        ports.set(port, new THREE.Vector3(p.x, p.y, p.z + w.facing * 0.006));
      }
    }
    // Kollision: Säule samt Kasten davor
    const blocks = boxes.map((w) => ({
      minX: w.column.minX, maxX: w.column.maxX,
      minZ: Math.min(w.column.minZ, w.box.frontZ), maxZ: Math.max(w.column.maxZ, w.box.frontZ), level: LEVEL,
    }));
    return { group, ports, blocks };
  }

  // ---------- Abgleich mit den Kellerfeldern ----------

  let signature = null;
  // Trassen, Markierungen und Internet-Kästen an die Feldarten anpassen – billig, solange sich nichts geändert hat.
  // Gibt true zurück, wenn sich etwas geändert hat (Ports an den Kästen neu).
  function sync() {
    const sig = `${layout.stage}:${layout.save().join(',')}`;
    if (sig === signature) return false;
    signature = sig;
    const list = new Set(bunkerFields());
    for (const [area, v] of views) {
      // Feld kein Bunker mehr oder Nachbarn bzw. Nummern geändert (Trassen laufen durch, Schilder): neu bauen
      v.group.removeFromParent();
      v.wan.group.userData.dispose?.();
      dispose(v.group, shared);
      views.delete(area);
    }
    for (const area of list) {
      const v = buildField(area);
      holder(area).add(v.group);
      views.set(area, v);
    }
    aim.visible = false;
    collision.setDynamic('bunker-wan', [...views.values()].flatMap((v) => v.wan.blocks));
    farKey = '';
    return true;
  }

  // Trassenfelder markieren wie im Serverraum: picked hell, path gedämpft – Feld-Indizes aus core/cable-tray.js
  // (nur Keller). Größe je Feld: so lang wie der Abstand zum Nachbarfeld (über Schränken 0,6 m), so breit wie die Leiter.
  function markFields(picked = [], path = []) {
    const byArea = new Map();
    const pickedSet = new Set(picked);
    for (const f of [...new Set([...path, ...picked])]) {
      const c = basementCellOf(f);
      if (!c || !views.has(c.area)) continue;
      if (!byArea.has(c.area)) byArea.set(c.area, []);
      byArea.get(c.area).push({ f, pick: pickedSet.has(f) });
    }
    for (const [area, v] of views) {
      const list = byArea.get(area) ?? [];
      if (!list.length && !v.marked) continue;
      v.marked = list.length > 0;
      let n = 0;
      for (const { f, pick } of list.slice(0, 256)) {
        const c = fieldCenter(f);
        const left = basementFieldAt(c.x - 0.6, c.z) !== null || basementFieldAt(c.x + 0.6, c.z) !== null;
        const wide = left ? 0.56 : TRAY_WIDTH;
        const deep = left ? TRAY_WIDTH : 0.56;
        _m.compose(_p.set(c.x, TRAY_HEIGHT - 0.03, c.z), _q.identity(), _s.set(wide, 1, deep));
        v.marks.setMatrixAt(n, _m);
        v.marks.setColorAt(n, pick ? MARK_PICK : MARK_PATH);
        n++;
      }
      v.marks.count = n;
      v.marks.instanceMatrix.needsUpdate = true;
      v.marks.instanceColor.needsUpdate = true;
    }
  }

  // Bodenmarkierungen: show(spot) → ob die Markierung zu sehen sein soll (nur die freien, beim Tragen eines Schranks)
  function showMarkers(show) {
    for (const v of views.values()) {
      const shown = v.spots.filter(show);
      v.markers.userData.shown = shown;
      shown.forEach((spot, n) => {
        const { x, z } = spotPosition(spot);
        _m.makeTranslation(x, 0.006, z);
        v.markers.setMatrixAt(n, _m);
      });
      v.markers.count = shown.length;
      v.markers.visible = shown.length > 0;
      v.markers.instanceMatrix.needsUpdate = true;
      v.markers.computeBoundingSphere();
    }
  }

  // Schränke, die gerade nicht im Detail gezeichnet werden: [{ slot, units, devices: [{ x, y, z, h, color }] }] – je
  // Feld als einfache Kästen, die Geräte darin als Frontplatten (Mitte der Frontplatte in Bodenkoordinaten, Höhe h)
  // in einem InstancedMesh je Feld. key: ändert sich, wenn sich an Schränken oder Geräten etwas ändert.
  let farKey = '';
  function setFarRacks(list, key) {
    if (key === farKey) return;
    farKey = key;
    const byArea = new Map();
    for (const r of list) {
      const p = spotPosition(r.slot);
      if (!p || p.field == null) continue;
      if (!byArea.has(p.field)) byArea.set(p.field, []);
      byArea.get(p.field).push({ ...r, p });
    }
    for (const [area, v] of views) {
      const racks = byArea.get(area) ?? [];
      racks.forEach((r, n) => {
        _q.setFromAxisAngle(UP, spotFacing(r.slot) < 0 ? Math.PI : 0);
        _m.compose(_p.set(r.p.x, 0, r.p.z), _q, _s.set(1, rackHeightOf(r.units), 1));
        v.far.setMatrixAt(n, _m);
      });
      v.far.count = racks.length;
      v.far.instanceMatrix.needsUpdate = true;
      v.far.computeBoundingSphere();
      // Geräte als Frontplatten (Kapazität wächst bei Bedarf)
      const slabs = racks.flatMap((r) => r.devices.map((d) => ({ ...d, angle: spotFacing(r.slot) < 0 ? Math.PI : 0 })));
      if (!v.farDevices || v.farDevices.instanceMatrix.count < slabs.length) {
        if (v.farDevices) {
          v.farDevices.removeFromParent();
          v.farDevices.dispose();
        }
        const capacity = Math.max(64, Math.ceil(slabs.length * 1.5));
        v.farDevices = new THREE.InstancedMesh(slabGeometry, deviceMaterial, capacity);
        v.farDevices.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        v.farDevices.raycast = () => {};
        v.farDevices.name = 'bunker-far-devices';
        v.group.add(v.farDevices);
      }
      slabs.forEach((d, n) => {
        _q.setFromAxisAngle(UP, d.angle);
        _m.compose(_p.set(d.x, d.y, d.z), _q, _s.set(1, d.h, 1));
        v.farDevices.setMatrixAt(n, _m);
        v.farDevices.setColorAt(n, _c.setHex(d.color));
      });
      v.farDevices.count = slabs.length;
      v.farDevices.instanceMatrix.needsUpdate = true;
      v.farDevices.instanceColor.needsUpdate = true;
      v.farDevices.computeBoundingSphere();
    }
  }

  return {
    frame, holder, sync, markFields, showMarkers, setFarRacks,
    // Nach einem Neubau der Felder müssen die einfachen Schrank-Kästen neu gesetzt werden
    get farStale() { return farKey === ''; },
    // Lage einer Buchse an einem Internet-Kasten in Bodenkoordinaten des Kellers (für Markierung und Vorschaukabel)
    wanPortPos: (port) => views.get(basementWanPortInfo(port)?.field)?.wan.ports.get(port) ?? null,
    // Alle Ports an den Internet-Kästen mit Lage (leer ohne Bunker-Feld)
    get wanPorts() { return [...views.values()].flatMap((v) => [...v.wan.ports.entries()]); },
  };
}

// Mehrere Geometrien (gleiche Attribute) zu einer zusammenfassen
function mergeFlat(geos) {
  const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
  geos.forEach((g) => g.dispose());
  return merged;
}
