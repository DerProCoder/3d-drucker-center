// Daten-Bunker im Keller (#52): Einrichtung der Bunker-Felder, die nicht zu einem einzelnen Schrank gehört –
//   - Kabelgitter unter der Decke je Bunker-Feld (Lage und Lücken aus core/cable-tray.js, Modell models/cable-tray.js),
//     zwischen zwei Bunker-Feldern läuft es durch,
//   - grüne Bodenmarkierungen der 16 Stellplätze je Feld (core/server-zones.js), sichtbar, solange man einen
//     Schrankkarton trägt und der Platz frei ist,
//   - Glasfaser-Säule mit Wandkasten „INTERNET / WAN“ (Keller-Anschluss, 32 Ports) und Trasse ins Gitter im ersten
//     Bunker-Feld (core/cable-tray.js basementWan).
// Schränke, Kabel und der Ablauf beim Verlegen liegen in world/server-room.js (wie oben); Klicks auf Gitter, Ports
// am Kasten und Markierungen reicht dieses Modul dorthin weiter.
//
// Koordinaten: Alles hängt in Gruppen auf Höhe des Kellerbodens (y = 0 dort), x/z sind Welt-x/z des Kellers – wie
// die Gruppe der zweiten Etage in world/server-room.js („Bodenkoordinaten“ je Bereich). Gitter und Markierungen
// liegen je Feld in basement.fields.contentGroup(Feld) und werden so mit dem Feld ausgeblendet (weiter als 60 m weg);
// Säule, Kasten und Kabel in frame (in basement.fields.group, sichtbar, solange man im Keller ist).
import * as THREE from 'three';
import { BASEMENT_FLOOR_Y, fieldBounds } from '../core/basement-layout.js';
import {
  BASEMENT_WALL_PORTS, BASEMENT_WAN_COLUMN, BASEMENT_WAN_PORT0, CEILING_HEIGHT, TRAY_HEIGHT, basementCellOf, basementFieldAt,
  basementTraySkips, basementWan, wanPortPosition,
} from '../core/cable-tray.js';
import { bunkerFields, bunkerSpotsIn, spotPosition } from '../core/server-zones.js';
import { createCableTray, createWallBox, createWallRiser } from '../models/cable-tray.js';
import { box } from '../models/mesh-helpers.js';
import { canvasTexture } from '../models/canvas-texture.js';
import { RACK_FOOTPRINT } from '../models/server-hardware.js';

const LEVEL = -2;                 // Stockwerk des Kellers für die Kollision (world/basement.js LEVEL.BASEMENT)
const CELLS = 20;                 // Gitterfelder je Kellerfeld und Richtung
const HIT_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

// Deckenleuchten eines Kellerfeldes (world/basement-fields.js: 3 × 3 ohne Mitte, 6,5 m Abstand) und die zwei Stangen
// des Schilds in der Mitte – dort hängt keine Gewindestange des Gitters
function lampsOf(b) {
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const list = [];
  for (const dx of [-6.5, 0, 6.5]) {
    for (const dz of [-6.5, 0, 6.5]) if (dx || dz) list.push({ x: cx + dx, z: cz + dz, w: 1.24, d: 0.34 });
  }
  list.push({ x: cx, z: cz, w: 2, d: 2 });
  return list;
}

// Gestrichelte grüne Bodenmarkierung für einen freien Stellplatz (wie im Serverraum, eine Textur für alle)
function createMarkerMaterial() {
  const texture = canvasTexture(128, 170, (ctx) => {
    ctx.fillStyle = 'rgba(75, 224, 138, 0.18)';
    ctx.fillRect(6, 6, 116, 158);
    ctx.strokeStyle = 'rgba(75, 224, 138, 0.95)';
    ctx.lineWidth = 6;
    ctx.setLineDash([16, 10]);
    ctx.strokeRect(6, 6, 116, 158);
  }, 1, 1, { wrap: false });
  return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
}

// Schild an der Säule: „GLASFASER · Keller-Anschluss“
function columnSignMaterial() {
  const texture = canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#1f6a46';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px "Segoe UI", Arial, sans-serif';
    ctx.fillText('GLASFASER', w / 2, h * 0.4);
    ctx.font = '600 18px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Internet-Anschluss Bunker', w / 2, h * 0.76);
  }, 1, 1, { wrap: false });
  return new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.5 });
}

function dispose(object) {
  object.traverse((o) => {
    if (o.geometry && o.geometry !== MARKER_GEOMETRY) o.geometry.dispose();
  });
}
const MARKER_GEOMETRY = new THREE.PlaneGeometry(RACK_FOOTPRINT.w + 0.06, RACK_FOOTPRINT.d + 0.06);

// layout: core/basement-layout.js (Feldarten, Stufe) · fields: world/basement-fields.js (basement.fields)
// fieldInteraction: { hint(field), hover(field), unhover(), action(field) } für angezielte Gitterfelder (Feld-Index aus
// core/cable-tray.js) · wanPortInteraction(port) → userData.interaction je Port am Kasten
// spotInteraction(spot) → userData.interaction je Bodenmarkierung
export function createBunker({ layout, fields, collision, fieldInteraction, wanPortInteraction, spotInteraction }) {
  const frame = new THREE.Group();
  frame.name = 'bunker';
  frame.position.y = BASEMENT_FLOOR_Y;
  fields.group.add(frame);
  const markerMaterial = createMarkerMaterial();
  const columnMaterial = new THREE.MeshStandardMaterial({ color: 0x6d737b, roughness: 0.7, metalness: 0.3 });
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0x2f8f5b, roughness: 0.6 });
  const signMaterial = columnSignMaterial();

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

  // ---------- Kabelgitter je Feld ----------

  const trays = new Map();    // Feld → { key, tray }
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

  function buildTray(area, skip) {
    const b = fieldBounds(area);
    const tray = createCableTray({
      x0: b.minX, z0: b.minZ, cols: CELLS, rows: CELLS, cell: 1, height: TRAY_HEIGHT, ceiling: CEILING_HEIGHT,
      hangerEvery: 2, avoid: lampsOf(b), skip,
    });
    tray.name = `bunker-tray-${area}`;
    tray.userData.hitArea.userData.interaction = trayInteraction;
    tray.traverse((o) => { o.castShadow = false; });
    return tray;
  }

  // ---------- Bodenmarkierungen der Stellplätze ----------

  const markers = new Map();  // Platz → Markierung
  const markerFields = new Map(); // Feld → Gruppe mit den 16 Markierungen
  function buildMarkers(area) {
    const g = new THREE.Group();
    g.name = `bunker-spots-${area}`;
    for (const spot of bunkerSpotsIn(area)) {
      const { x, z } = spotPosition(spot);
      const marker = new THREE.Mesh(MARKER_GEOMETRY, markerMaterial);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(x, 0.006, z);
      marker.visible = false;
      marker.userData.interaction = spotInteraction(spot);
      g.add(marker);
      markers.set(spot, marker);
    }
    return g;
  }

  // ---------- Glasfaser-Säule mit Wandkasten ----------

  let wanView = null;         // { field, group, ports: Map(port → Vector3) }
  function buildWan(wan) {
    const g = new THREE.Group();
    g.name = 'bunker-wan';
    const { column, box: wb, trace } = wan;
    const cx = (column.minX + column.maxX) / 2;
    const cz = (column.minZ + column.maxZ) / 2;
    const w = column.maxX - column.minX;
    const d = column.maxZ - column.minZ;
    g.add(box(w, CEILING_HEIGHT, d, columnMaterial, cx, CEILING_HEIGHT / 2, cz));
    // Grüner Streifen unten, Schild unter dem Kasten (darüber laufen die Kabel hoch) vorn und hinten
    g.add(box(w + 0.01, 0.12, d + 0.01, stripeMaterial, cx, 0.06, cz));
    for (const [sz, rot] of [[d / 2 + 0.003, 0], [-d / 2 - 0.003, Math.PI]]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, 0.21), signMaterial);
      sign.position.set(cx, 0.9, cz + sz);
      sign.rotation.y = rot;
      g.add(sign);
    }
    // Kasten: Ports genau dort, wo core/cable-tray.js sie annimmt; Vorderseite nach Süden (+z), Kasten-x = Welt-x
    const bottom = wb.y - wb.height / 2;
    const ports = Array.from({ length: BASEMENT_WALL_PORTS }, (_, k) => BASEMENT_WAN_PORT0 + k);
    const boxMesh = createWallBox({
      ports: ports.length, width: wb.width, height: wb.height, depth: wb.z + wb.depth / 2 - wb.wallZ,
      headerBelow: true,
      positions: ports.map((port) => {
        const p = wanPortPosition(port);
        return { x: p.x - wb.x, y: p.y - bottom };
      }),
    });
    boxMesh.position.set(wb.x, bottom, wb.wallZ);
    const { w: pw, h: ph, d: pd } = boxMesh.userData.portSize;
    const portHit = new THREE.BoxGeometry(pw, ph, pd);
    boxMesh.userData.ports.forEach((p, k) => {
      const hitbox = new THREE.Mesh(portHit, HIT_MATERIAL);
      hitbox.position.set(p.x, p.y, p.z);
      hitbox.name = `port:wan:${ports[k]}`;
      hitbox.userData.interaction = wanPortInteraction(ports[k]);
      boxMesh.add(hitbox);
    });
    g.add(boxMesh);
    // Trasse an der Säule hoch und oben waagerecht bis an den Rand des Einstiegsfeldes
    const back = 0.012;
    // Gitterfelder liegen auf ganzen Metern; die Säule steht im Feld nördlich des Einstiegsfeldes
    const entryEdge = Math.floor(wb.wallZ) + 1;
    const riser = createWallRiser({
      height: trace.y1 - trace.y0, width: 0.3, reach: Math.max(0, entryEdge - wb.wallZ),
      depth: Math.max(0.03, 2 * (trace.z - wb.wallZ - back)),
    });
    riser.position.set(trace.x, trace.y0, wb.wallZ);
    g.add(riser);
    g.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true;
    });
    const portPos = new Map(ports.map((port) => {
      const p = wanPortPosition(port);
      return [port, new THREE.Vector3(p.x, p.y, p.z + 0.006)];
    }));
    return { field: wan.field, key: `${wan.field}`, group: g, ports: portPos };
  }

  // ---------- Abgleich mit den Kellerfeldern ----------

  let signature = null;
  // Gitter, Markierungen und Anschluss an die Feldarten anpassen – billig, solange sich nichts geändert hat.
  // Gibt true zurück, wenn sich etwas geändert hat (Ports am Kasten neu).
  function sync() {
    const wan = basementWan();
    const sig = `${layout.stage}:${layout.save().join(',')}:${wan?.field ?? '-'}`;
    if (sig === signature) return false;
    signature = sig;
    const list = new Set(bunkerFields());
    for (const [area, t] of trays) {
      if (list.has(area)) continue;
      t.tray.removeFromParent();
      dispose(t.tray);
      trays.delete(area);
    }
    for (const [area, g] of markerFields) {
      if (list.has(area)) continue;
      g.removeFromParent();
      for (const spot of bunkerSpotsIn(area)) markers.delete(spot);
      markerFields.delete(area);
    }
    for (const area of list) {
      const skip = basementTraySkips(area);
      const key = skip.map((s) => `${s.x},${s.z}`).join(';');
      if (trays.get(area)?.key !== key) {
        const old = trays.get(area);
        if (old) {
          old.tray.removeFromParent();
          dispose(old.tray);
        }
        const tray = buildTray(area, skip);
        holder(area).add(tray);
        trays.set(area, { key, tray });
      }
      if (!markerFields.has(area)) {
        const g = buildMarkers(area);
        holder(area).add(g);
        markerFields.set(area, g);
      }
    }
    if (wanView && wanView.field !== wan?.field) {
      wanView.group.removeFromParent();
      dispose(wanView.group);
      wanView = null;
    }
    if (wan && !wanView) {
      wanView = buildWan(wan);
      frame.add(wanView.group);
    }
    collision.setDynamic('bunker-wan', wan ? [{ ...wan.column, level: LEVEL }] : []);
    return true;
  }

  // Felder markieren wie im Serverraum: picked hell, path gedämpft – Feld-Indizes aus core/cable-tray.js (nur Keller)
  function markFields(picked = [], path = []) {
    const byArea = new Map();
    const put = (list, key) => {
      for (const f of list) {
        const c = basementCellOf(f);
        if (!c || !trays.has(c.area)) continue;
        if (!byArea.has(c.area)) byArea.set(c.area, { picked: [], path: [] });
        byArea.get(c.area)[key].push({ x: c.lx, z: c.lz });
      }
    };
    put(picked, 'picked');
    put(path, 'path');
    for (const [area, t] of trays) {
      const m = byArea.get(area);
      if (m || t.marked) t.tray.userData.markFields(m?.picked ?? [], m?.path ?? []);
      t.marked = !!m;
    }
  }

  // Sichtbarkeit der Bodenmarkierungen: show(spot) → ob die Markierung zu sehen sein soll
  function showMarkers(show) {
    for (const [spot, marker] of markers) marker.visible = show(spot);
  }

  return {
    frame, holder, sync, markFields, showMarkers,
    // Lage einer Buchse am Keller-Anschluss in Bodenkoordinaten des Kellers (für Markierung und Vorschaukabel)
    wanPortPos: (port) => wanView?.ports.get(port) ?? null,
    // Alle Ports am Keller-Anschluss mit Lage (leer ohne Bunker-Feld)
    get wanPorts() { return wanView ? [...wanView.ports.entries()] : []; },
    get column() { return BASEMENT_WAN_COLUMN; },
  };
}
