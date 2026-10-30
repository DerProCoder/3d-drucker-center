// Serverraum in der zweiten Etage (Logik in core/servers.js): im Westen zwei Reihen Stellplätze für Kundenschränke,
// dahinter Richtung Nordwand die Reihe „Private Server“ (orange umrandet) und die Automatik-Reihe (grün umrandet;
// Lage aller Plätze in core/server-zones.js). Trägt man
// einen Schrankkarton, zeigen grüne Markierungen die freien Plätze; ein Klick stellt ihn auf. Mit einem Gerätekarton
// in der Hand baut ein Klick auf den Schrank das Gerät ein – auf der Höhe, auf die man zielt (ein grüner Rahmen zeigt
// vorher, wo es landet). Dafür muss die Glastür vorn offen sein; ein Klick auf die Tür öffnet bzw. schließt sie.
// Mit leeren Händen öffnet ein Klick auf den Schrank das Schrankfenster (ui/rack-panel.js: Übersicht, Verschieben).
// Die Ports sitzen hinten an den Geräten. Verkabelt wird direkt dort: ersten Port anklicken (leuchtet gelb), dann den
// zweiten – ein Stück von der Kabelrolle verbindet beide. Klickt man dazwischen Clips der Kabelführung an, läuft das
// Kabel durch diese Clips (Kabelführung links und rechts im offenen Rücken), sonst hängt es frei. Klick auf einen
// belegten Port zieht das Kabel ab.
// Zwischen zwei Schränken und zum Internet-Anschluss an der Westwand laufen Kabel über das Kabelgitter unter der
// Decke (world/cable-tray.js): ersten Port anklicken, dann Gitterfelder (nochmal: wieder heraus), dann den Port im
// anderen Schrank bzw. am Wandkasten. Ein halb durchsichtiges Kabel zeigt dabei den Weg bis hierher.
// NAS (#48, Logik in core/nas.js): Festplatten stecken vorn in Schächten. Bei offener Glastür und leeren Händen setzt
// ein Klick auf einen leeren Schacht die größte Platte aus dem Teilelager ein, ein Klick auf eine Platte nimmt sie
// heraus (Hot-Swap). Ein Rahmen zeigt den angezielten Schacht (grün: einsetzen, gelb: herausnehmen, rot: geht nicht);
// geht es nicht, meldet onNotice den Grund. Die Platten einer NAS werden nur neu gebaut, wenn sie sich ändern.
// Daten-Bunker im Keller (#52): Schränke auf Bunker-Plätzen (core/server-zones.js) laufen durch denselben Ablauf.
// Jeder Bereich hat eigene „Bodenkoordinaten“ (Fußboden y = 0, x/z wie core/): oben die Gruppe group, unten
// bunker.frame bzw. je Feld bunker.holder(Feld) aus world/bunker.js (Gitter, Markierungen, Glasfaser-Anschluss).
// Markierungen beim Verlegen und Vorschauen hängen jeweils im Bereich des gewählten Ports bzw. Schranks.
import * as THREE from 'three';
import { SERVER_SPOTS } from '../core/servers.js';
import {
  basementWan, endField, fieldLabel, isBasementWanPort, isWanRef, toggleWaypoint, trayArea, trayPath, wanEnd, wanPortName,
} from '../core/cable-tray.js';
import { bunkerFieldOf, spotArea, spotFacing, spotPosition, spotUsable, spotsInZone } from '../core/server-zones.js';
import { BASEMENT_FLOOR_Y } from '../core/basement-layout.js';
import { createBunker } from './bunker.js';
import { mergeStatic } from '../models/merge-static.js';
import { canvasTexture } from '../models/canvas-texture.js';
import { meters } from '../core/format.js';
import { isServerHardware, portName } from '../core/server-catalog.js';
import { isNas, storageText } from '../core/nas.js';
import {
  CABLE_COLOR, FRONT_WIDTH, RACK_FOOTPRINT, UNIT, cableRoute, clipCount, clipPosition, createServerDevice, createServerRack, devicePlacement,
  nasBays, portPositions, setNasDisks,
  unitAtHeight,
} from '../models/server-hardware.js';
import { pulseNasDisks } from '../models/nas-front.js';
import { MAX_FAN_SPEED } from '../models/server-fans.js';
import { FLOOR_Y } from './upper-floor.js';
import {
  SHARED_CABLE_GEOMETRY, TRAY_CABLE_RADIUS, createCable, createCableTrayRoom, rackRise, trayCablePoints, wanRise,
} from './cable-tray.js';

const DOOR_OPEN_ANGLE = 1.9;     // Bogenmaß, so weit schwingt die Glastür auf
const DOOR_SPEED = 3.5;          // Bogenmaß pro Sekunde
const LOD_NEAR = 2.6;            // m – so nah um die Spielfigur werden Bunker-Schränke voll gezeichnet (Klickweite 2,5 m)
// Klickfläche eines Ports: unsichtbar, aber vom Strahl getroffen (material.visible = false)
const PORT_HIT_GEOMETRY = new THREE.BoxGeometry(0.016, 0.014, 0.012);
const PORT_HIT_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
const CLIP_HIT_GEOMETRY = new THREE.BoxGeometry(0.034, 0.03, 0.04);
// beim Neuaufbau nicht freigeben (Stecker und Knickschutz der Kabel kommen aus world/cable-tray.js)
const SHARED_GEOMETRY = new Set([PORT_HIT_GEOMETRY, CLIP_HIT_GEOMETRY, ...SHARED_CABLE_GEOMETRY]);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const AIM_MATERIAL = new THREE.MeshBasicMaterial({ visible: false, side: THREE.FrontSide });

// Lage der Stellplätze (Schränke schauen nach Süden, +z) steht in core/server-zones.js
export { spotPosition };

// Dauerhafte Bodenmarkierung der privaten Reihen (Farben, Linienstärken in Metern, Auflösung der Textur)
const ROW_MARKINGS = [
  { zone: 'private', text: 'PRIVATE SERVER', color: '#ff8a1f', fill: 'rgba(255, 138, 31, 0.07)' },
  { zone: 'automation', text: 'AUTOMATIK', color: '#3ddc6e', fill: 'rgba(61, 220, 110, 0.08)' },
];
const ROW_MARGIN = 0.15;   // Umrandung so weit um die Schränke herum (liegt im Gang, nicht unter den Schränken)
const LABEL_BAND = 0.55;   // Streifen vor der Reihe (Süden, vor den Glastüren) für den Schriftzug
const MARK_LINE = 0.08;    // Linienstärke der Umrandung
const MARK_PX = 125;       // Pixel je Meter

// Rechteck um die Schränke auf den Plätzen spots (Welt-x/z), um margin vergrößert
function spotBounds(spots, margin) {
  const xs = spots.map((s) => spotPosition(s).x);
  const zs = spots.map((s) => spotPosition(s).z);
  return {
    minX: Math.min(...xs) - RACK_FOOTPRINT.w / 2 - margin, maxX: Math.max(...xs) + RACK_FOOTPRINT.w / 2 + margin,
    minZ: Math.min(...zs) - RACK_FOOTPRINT.d / 2 - margin, maxZ: Math.max(...zs) + RACK_FOOTPRINT.d / 2 + margin,
  };
}

// Umrandung um eine Reihe mit Schriftzug davor: eine flache Fläche knapp über dem Boden mit einer Canvas-Textur
// (Kanten im Norden = oben auf dem Canvas, lesbar mit Blick nach Norden auf die Glastüren). Die Umrandung schließt
// den Streifen mit dem Schriftzug ein und endet im Gang davor, der Rest des Gangs bleibt frei.
function createRowMarking({ zone, text, color, fill }) {
  const area = spotBounds(spotsInZone(zone), ROW_MARGIN);
  area.maxZ += LABEL_BAND;
  const width = area.maxX - area.minX;
  const depth = area.maxZ - area.minZ;
  const px = (m) => Math.round(m * MARK_PX);

  const texture = canvasTexture(px(width), px(depth), (ctx) => {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, px(width), px(depth));
    ctx.strokeStyle = color;
    ctx.lineWidth = px(MARK_LINE);
    ctx.strokeRect(px(MARK_LINE / 2), px(MARK_LINE / 2), px(width - MARK_LINE), px(depth - MARK_LINE));
    // Schriftzug mittig im Streifen vor der Reihe, höchstens so breit wie die Umrandung
    let size = px(0.34);
    ctx.font = `bold ${size}px sans-serif`;
    const maxW = px(width - 0.5);
    const w = ctx.measureText(text).width;
    if (w > maxW) size = Math.floor(size * maxW / w);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, px(width / 2), px(depth - (LABEL_BAND + MARK_LINE) / 2));
  }, 1, 1, { wrap: false });

  const marking = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    // Liegt knapp über dem Boden; polygonOffset gegen Flimmern, unter den gestrichelten Platzmarkierungen
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  );
  marking.rotation.x = -Math.PI / 2;
  marking.position.set((area.minX + area.maxX) / 2, 0.003, (area.minZ + area.maxZ) / 2);
  marking.renderOrder = -1;
  marking.raycast = () => {}; // nicht anklickbar – Klicks gehen an die Platzmarkierungen und Schränke
  marking.name = `${zone}-row-marking`;
  return marking;
}

// Gestrichelte grüne Bodenmarkierung für einen freien Stellplatz
function createSpotMarker() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 170;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(75, 224, 138, 0.18)';
  ctx.fillRect(6, 6, 116, 158);
  ctx.strokeStyle = 'rgba(75, 224, 138, 0.95)';
  ctx.lineWidth = 6;
  ctx.setLineDash([16, 10]);
  ctx.strokeRect(6, 6, 116, 158);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Mesh(
    new THREE.PlaneGeometry(RACK_FOOTPRINT.w + 0.06, RACK_FOOTPRINT.d + 0.06),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  marker.rotation.x = -Math.PI / 2;
  return marker;
}

// economy, servers (core/servers.js), carry: was man trägt, upgrades: ob die Etage steht,
// collision: Schränke als Hindernis oben, onOpenRack(rackId): Schrankfenster öffnen
// climate: core/server-climate.js – wie schnell sich die Lüfter drehen
// nas: core/nas.js (Nas) – Platten in den Schächten der NAS; ohne sie sind die Schächte nicht anklickbar
// onNotice(text, tone): Meldung, wenn eine Platte nicht hinein- oder herausgeht (tone 'bad'), z. B. an hud.notify
// basement: { layout, fields } – Kellerfelder (core/basement-layout.js) und world/basement-fields.js; ohne sie gibt es
// keinen Daten-Bunker (z. B. in Testseiten)
export function createServerRoom({ economy, servers, climate, carry, upgrades, collision, onOpenRack, nas = null, onNotice = null, basement = null }) {
  const group = new THREE.Group();
  group.position.y = FLOOR_Y;
  const markers = new THREE.Group();
  const racks = new THREE.Group();
  group.add(markers, racks, ...ROW_MARKINGS.map(createRowMarking));

  const carryingRack = () => carry.furniture?.type.kind === 'rack';

  function spotInteraction(spot) {
    return {
      hint: () => (carryingRack() && spotUsable(spot) && !servers.spotUsed(spot) ? `Linksklick: ${carry.furniture.type.name} hier aufstellen` : null),
      action: () => {
        if (carryingRack() && servers.placeRack(carry.furniture.id, spot)) carry.releaseFurniture();
      },
    };
  }

  for (let spot = 0; spot < SERVER_SPOTS; spot++) {
    const marker = createSpotMarker();
    const { x, z } = spotPosition(spot);
    marker.position.set(x, 0.006, z);
    marker.userData.interaction = spotInteraction(spot);
    markers.add(marker);
  }

  // Bereich eines Schranks bzw. Ports ('upper' | 'bunker') und die Gruppe mit seinen Bodenkoordinaten
  const areaOfRack = (rack) => (spotArea(rack?.slot) === 'bunker' ? 'bunker' : 'upper');
  let bunker = null; // world/bunker.js, unten angelegt (braucht die Abläufe beim Verlegen)
  // Lage im Schrank (Schrankkoordinaten, Front nach +z) ↔ Bodenkoordinaten des Bereichs: Schränke mit Front nach
  // Norden (Bunker-Reihen 1, 3, 5, core/server-zones.js spotFacing) sind um 180° gedreht
  const rackAngle = (rack) => (rack && spotFacing(rack.slot) < 0 ? Math.PI : 0);
  const toFrame = (rack, v) => {
    const { x, z } = spotPosition(rack.slot);
    return v.clone().applyAxisAngle(Y_AXIS, rackAngle(rack)).add(new THREE.Vector3(x, 0, z));
  };
  const toRack = (rack, v) => {
    const { x, z } = spotPosition(rack.slot);
    return v.clone().sub(new THREE.Vector3(x, 0, z)).applyAxisAngle(Y_AXIS, -rackAngle(rack));
  };
  const frameOf = (area) => (area === 'bunker' && bunker ? bunker.frame : group);
  // Hilfsobjekt (Vorschau, Markierung) in den Bereich hängen, in dem es gerade gebraucht wird
  const place = (object, area) => {
    const frame = frameOf(area);
    if (object.parent !== frame) frame.add(object);
  };

  // Vorschau beim Einbauen: grüner Rahmen vor den Höheneinheiten, in die das Gerät käme. Nicht anklickbar, damit der
  // Strahl weiter den Schrank trifft.
  const preview = new THREE.Mesh(
    new THREE.BoxGeometry(FRONT_WIDTH, 1, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x4be08a, transparent: true, opacity: 0.35, depthWrite: false })
  );
  preview.raycast = () => {};
  preview.visible = false;
  group.add(preview);

  const carriedDevice = () => {
    const item = carry.furniture;
    return item && isServerHardware(item.type) && item.type.kind !== 'rack' ? item : null;
  };

  // Höheneinheit, in die das getragene Gerät beim Zielen auf hit käme: mittig um die angezielte HE, sonst die
  // nächste freie Stelle
  function targetUnit(rack, item, hit) {
    if (!hit) return servers.freeUnit(rack, item.type.units);
    // Höhe über dem Boden des Bereichs: zweite Etage bzw. Kellerboden im Daten-Bunker
    const floor = areaOfRack(rack) === 'bunker' ? BASEMENT_FLOOR_Y : FLOOR_Y;
    const aimed = unitAtHeight(rack.type, hit.point.y - floor);
    return servers.freeUnit(rack, item.type.units, aimed - Math.floor((item.type.units - 1) / 2));
  }

  const unitLabel = (unit, units) => (units > 1 ? `HE ${unit + 1}–${unit + units}` : `HE ${unit + 1}`);

  // Glastüren: rackId → { open, angle }. Nur Ansicht, wird nicht gespeichert (nach dem Laden sind alle zu).
  const doors = new Map();
  const doorState = (rackId) => {
    if (!doors.has(rackId)) doors.set(rackId, { open: false, angle: 0, mesh: null });
    return doors.get(rackId);
  };

  function doorInteraction(rack) {
    const state = doorState(rack.id);
    return {
      hint: () => `Linksklick: Glastür ${state.open ? 'schließen' : 'öffnen'}`,
      action: () => { state.open = !state.open; },
    };
  }

  function rackInteraction(rack) {
    const door = doorState(rack.id);
    return {
      hint: (hit) => {
        const item = carriedDevice();
        if (item) {
          if (!door.open) return 'Erst die Glastür vorn öffnen';
          const problem = servers.installProblem(item, rack);
          if (problem) return problem;
          return `Linksklick: ${item.type.name} in ${unitLabel(targetUnit(rack, item, hit), item.type.units)} einbauen`;
        }
        return carry.isEmpty ? `Linksklick: ${rack.type.name} öffnen – Geräte und Kabel` : null;
      },
      hover: (hit) => {
        const item = carriedDevice();
        const unit = item && door.open && !servers.installProblem(item, rack) ? targetUnit(rack, item, hit) : -1;
        preview.visible = unit !== -1;
        if (!preview.visible) return;
        place(preview, areaOfRack(rack));
        preview.position.copy(toFrame(rack, devicePlacement(rack.type, unit, item.type.units).add(new THREE.Vector3(0, 0, 0.015))));
        preview.rotation.y = rackAngle(rack);
        preview.scale.y = item.type.units * UNIT;
      },
      unhover: () => { preview.visible = false; },
      action: (hit) => {
        const item = carriedDevice();
        if (item) {
          if (door.open && servers.installDevice(item.id, rack.id, targetUnit(rack, item, hit))) carry.releaseFurniture();
          preview.visible = false;
          return;
        }
        if (carry.isEmpty) onOpenRack(rack.id);
      },
    };
  }

  // ---------- NAS: Festplatten in den Schächten einsetzen und herausnehmen ----------

  // Rahmen um den angezielten Schacht (nicht anklickbar); Farbe je nach dem, was ein Klick täte
  const BAY_COLORS = { insert: 0x4be08a, remove: 0xffd84a, blocked: 0xff5a4a };
  const bayMarker = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 0.012),
    new THREE.MeshBasicMaterial({ color: BAY_COLORS.insert, transparent: true, opacity: 0.4, depthWrite: false })
  );
  bayMarker.raycast = () => {};
  bayMarker.visible = false;
  group.add(bayMarker);
  // Unsichtbare Klickflächen je Schachtgröße (alle Schächte sind gleich groß)
  const bayHitGeometries = new Map();
  const bayHitGeometry = (b) => {
    const key = `${b.w}|${b.h}`;
    if (!bayHitGeometries.has(key)) {
      const geometry = new THREE.BoxGeometry(b.w, b.h, 0.014);
      bayHitGeometries.set(key, geometry);
      SHARED_GEOMETRY.add(geometry);
    }
    return bayHitGeometries.get(key);
  };

  // Was ein Klick auf den Schacht täte: { mode: 'insert' | 'remove' | 'blocked', text }
  function bayAction(device, index) {
    const bay = nas.baysOf(device)[index];
    const label = `Schacht ${index + 1}`;
    if (!bay) return { mode: 'blocked', text: `${label} – gibt es nicht` };
    if (bay.part) {
      const what = `${storageText(bay.gb)}${bay.broken ? ', defekt' : ''}`;
      const problem = nas.canRemoveDisk(device, index);
      if (problem) return { mode: 'blocked', text: `${label} (${what}) – ${problem}` };
      const where = bay.broken ? 'wird entsorgt' : 'zurück ins Teilelager';
      return { mode: 'remove', text: `Linksklick: Festplatte herausnehmen (${label}, ${what} – ${where})` };
    }
    const problem = nas.canInsertDisk(device, index);
    if (problem) return { mode: 'blocked', text: `${label} leer – ${problem}` };
    return { mode: 'insert', text: `Linksklick: Festplatte einsetzen (${storageText(nas.bestDisk.gb)} aus Teilelager)` };
  }

  // Klickfläche eines Schachts. Mit Karton in der Hand oder bei zu Tür gilt, was der Schrank selbst tut (Gerät einbauen
  // bzw. Schrankfenster), damit die Schächte nicht im Weg sind.
  function bayInteraction(rack, device, index, rackI, at) {
    const door = doorState(rack.id);
    const active = () => carry.isEmpty && door.open;
    return {
      hint: (hit) => (active() ? bayAction(device, index).text : rackI.hint(hit)),
      hover: (hit) => {
        if (!active()) {
          bayMarker.visible = false;
          rackI.hover(hit);
          return;
        }
        preview.visible = false;
        const b = nasBays(device.type)[index];
        place(bayMarker, areaOfRack(rack));
        bayMarker.material.color.setHex(BAY_COLORS[bayAction(device, index).mode]);
        bayMarker.position.copy(toFrame(rack, at.clone().add(new THREE.Vector3(b.x, b.y, 0.006))));
        bayMarker.rotation.y = rackAngle(rack);
        bayMarker.scale.set(b.w + 0.003, b.h + 0.003, 1);
        bayMarker.visible = true;
      },
      unhover: () => {
        bayMarker.visible = false;
        rackI.unhover();
      },
      action: (hit) => {
        if (!active()) {
          rackI.action(hit);
          return;
        }
        const bay = nas.baysOf(device)[index];
        const result = bay?.part ? nas.removeDisk(device.id, index) : nas.insertDisk(device.id, index);
        if (!result.ok) onNotice?.(`💽 ${device.type.name}, Schacht ${index + 1}: ${result.reason}`, 'bad');
      },
    };
  }

  // Platten der NAS in einem Schrank aktuell halten: nur neu bauen, wenn sich etwas geändert hat
  let disksBroken = false;
  let diskTime = 0;
  const baysKey = (bays) => bays.map((b) => (b.part ? `${b.gb}${b.broken ? '!' : ''}` : '-')).join(',');
  function syncDisks() {
    if (!nas) return;
    disksBroken = false;
    for (const cached of rackCache.values()) {
      for (const view of cached.nasViews) {
        const bays = nas.baysOf(view.device);
        const key = baysKey(bays);
        if (key !== view.key) {
          view.key = key;
          setNasDisks(view.mesh, view.device.type, bays);
        }
        disksBroken ||= view.mesh.userData.disks?.userData.hasBroken;
      }
    }
  }

  // ---------- Verkabeln: ersten Port anklicken, wahlweise Clips bzw. Gitterfelder, dann den zweiten Port ----------
  // Ports sind { id, port } – Geräte-ID oder 'wan' (Internet-Anschluss an der Wand, core/cable-tray.js)

  let picked = null;              // erster gewählter Port { id, port } oder null
  let pickedClips = [];           // danach angeklickte Clips [{ side, index }] in Reihenfolge
  let pickedTray = [];            // danach angeklickte Gitterfelder (Feld-Indizes) in Reihenfolge
  let hoverField = null;          // gerade angezieltes Gitterfeld (Vorschau des Wegs bis dorthin)
  let hoverPort = null;           // gerade angezielter zweiter Port (Vorschau des ganzen Kabels)
  let nextTrayLane = () => 0;     // Versatz, den das nächste Gitterkabel bekommt (für die Vorschau, siehe syncCables)
  let nextRackLane = () => 0;     // ebenso für das nächste Kabel im Schrank
  const portPos = new Map();      // `${id}:${port}` → Position in group (für Markierung und Vorschaukabel)
  const portKey = (ref) => `${ref.id}:${ref.port}`;
  const portLabel = (ref) => {
    if (isWanRef(ref)) return `Internet-Anschluss · ${wanPortName(ref.port)}`;
    const device = economy.furnitureById(ref.id);
    return `${device.type.name} · ${device.type.kind === 'firewall' ? '' : 'Port '}${portName(device.type, ref.port)}`;
  };
  const clipKey = (c) => `${c.side}:${c.index}`;
  // Schrank, in dem ein Port sitzt (null am Wandanschluss oder wenn das Gerät nicht mehr eingebaut ist)
  const rackOfRef = (ref) => {
    if (!ref || isWanRef(ref)) return null;
    const device = economy.furnitureById(ref.id);
    return device?.rackId != null ? economy.furnitureById(device.rackId) ?? null : null;
  };
  const pickedRack = () => rackOfRef(picked);
  const sameRack = (a, b) => !!rackOfRef(a) && rackOfRef(a) === rackOfRef(b);
  // Bereich eines Ports: Wandanschluss oben bzw. im Keller oder der Bereich seines Schranks
  const areaOfRef = (ref) => {
    if (isWanRef(ref)) return isBasementWanPort(ref.port) ? 'bunker' : 'upper';
    return areaOfRack(rackOfRef(ref));
  };
  // Gitterfeld, in dem das Kabel von diesem Port ankommt (über dem Schrank bzw. Einstieg der Wandtrasse)
  const endFieldOf = (ref) => {
    if (isWanRef(ref)) return endField(wanEnd(ref.port));
    const rack = rackOfRef(ref);
    return rack ? endField({ spot: rack.slot }) : null;
  };
  // Kabelstück vom Port hoch ins Gitter (Punkte in group) oder null
  const riseOf = (ref, lane) => {
    if (isWanRef(ref)) return wanRise(ref.port, lane);
    const rack = rackOfRef(ref);
    const at = portPos.get(portKey(ref));
    if (!rack || !at) return null;
    // In Schrankkoordinaten rechnen (Front nach +z) und an Platz und Drehung des Schranks setzen
    return rackRise(toRack(rack, at), { x: 0, z: 0, type: rack.type }, lane).map((p) => toFrame(rack, p));
  };
  // Läuft dieses Kabel über das Gitter? (zwischen zwei Schränken, zur Wand oder mit Gitterfeldern)
  const isTrayCable = (cable) => !sameRack(cable.a, cable.b);
  // Weg eines Gitterkabels durch die Felder: { fields } oder null
  const routeOf = (cable) => {
    if (servers.trayRoute) return servers.trayRoute(cable);
    const route = trayPath(endFieldOf(cable.a), cable.tray ?? [], endFieldOf(cable.b));
    return route.fields ? route : null;
  };

  // Gitter, Wandkasten und Trasse; Klicks auf Felder und Wandports landen hier (oben und im Bunker gleich)
  const fieldInteraction = {
    hint: (field) => fieldHint(field),
    hover: (field) => { hoverField = field; showPreview(); },
    unhover: () => { hoverField = null; showPreview(); },
    action: (field) => {
      if (!carry.isEmpty || !picked) return;
      pickedTray = toggleWaypoint(pickedTray, field);
      showPicked();
    },
  };
  const wanPortInteraction = (port) => portInteraction({ id: 'wan', port });
  const trayRoom = createCableTrayRoom({ fieldInteraction, wanPortInteraction });
  group.add(trayRoom.group);
  // Daten-Bunker: Gitter je Feld, Bodenmarkierungen, Glasfaser-Anschluss im Keller (world/bunker.js)
  bunker = basement?.fields ? createBunker({
    layout: basement.layout, fields: basement.fields, collision, fieldInteraction, wanPortInteraction, spotInteraction,
  }) : null;
  const bunkerCables = new THREE.Group();
  bunkerCables.name = 'bunker-cables';
  bunker?.frame.add(bunkerCables);
  const addWanPorts = () => {
    for (let port = 0; port < trayRoom.box.userData.ports.length; port++) portPos.set(`wan:${port}`, trayRoom.wanPortPos(port));
    for (const [port, pos] of bunker?.wanPorts ?? []) portPos.set(`wan:${port}`, pos);
  };
  addWanPorts();
  // Gitterfelder markieren – oben und im Keller je in ihrem Gitter
  const markFields = (pickedFields, pathFields) => {
    const upper = (list) => list.filter((f) => trayArea(f) === 'upper');
    const lower = (list) => list.filter((f) => trayArea(f) === 'basement');
    trayRoom.markFields(upper(pickedFields), upper(pathFields));
    bunker?.markFields(lower(pickedFields), lower(pathFields));
  };

  // Leuchtender Rahmen am gewählten Port und ein halb durchsichtiges Kabel zum angezielten zweiten Port
  const pickedMarker = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.015, 0.003),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd84a).multiplyScalar(2) })
  );
  pickedMarker.raycast = () => {};
  pickedMarker.visible = false;
  group.add(pickedMarker);
  // Gewählte Clips leuchten ebenfalls gelb
  const clipMarkers = new THREE.Group();
  group.add(clipMarkers);
  const CLIP_MARKER_GEOMETRY = new THREE.BoxGeometry(0.03, 0.01, 0.03);
  let pendingCable = null;
  let pendingKey = '';

  function showPicked() {
    pickedMarker.visible = !!picked && portPos.has(portKey(picked));
    if (pickedMarker.visible) {
      // Buchsen am Wandkasten zeigen nach +x (im Keller nach +z), hinten an den Geräten nach −z
      const wan = isWanRef(picked) && !isBasementWanPort(picked.port);
      const turned = !isWanRef(picked) && rackAngle(pickedRack()) !== 0; // Schrank mit Front nach Norden
      const dz = isWanRef(picked) ? (wan ? 0 : 0.002) : (turned ? 0.002 : -0.002);
      place(pickedMarker, areaOfRef(picked));
      pickedMarker.rotation.y = wan ? Math.PI / 2 : turned ? Math.PI : 0;
      pickedMarker.position.copy(portPos.get(portKey(picked))).add(new THREE.Vector3(wan ? 0.002 : 0, 0, dz));
    }
    clipMarkers.clear();
    const rack = pickedRack();
    if (rack) {
      place(clipMarkers, areaOfRack(rack));
      for (const c of pickedClips) {
        const marker = new THREE.Mesh(CLIP_MARKER_GEOMETRY, pickedMarker.material);
        marker.position.copy(toFrame(rack, clipPosition(rack.type, c.side, c.index)));
        marker.raycast = () => {};
        clipMarkers.add(marker);
      }
    }
    showPreview();
  }

  function cancelPick() {
    picked = null;
    pickedClips = [];
    pickedTray = [];
  }

  // Weg durchs Gitter vom gewählten Port über die Wegpunkte (und das angezielte Feld) bis zum letzten davon
  function partialRoute() {
    const start = endFieldOf(picked);
    const points = hoverField !== null && !pickedTray.includes(hoverField) ? [...pickedTray, hoverField] : pickedTray;
    if (start === null || !points.length) return null;
    return trayPath(start, points, points[points.length - 1]).fields ?? null;
  }

  // Vorschau: gelbe Felder (Wegpunkte hell, Weg dazwischen gedämpft) und halb durchsichtiges Kabel – zum angezielten
  // zweiten Port, wenn das geht, sonst bis zum letzten Wegpunkt bzw. angezielten Feld. hover läuft in jedem Bild –
  // das Kabel nur neu bauen, wenn sich etwas ändert.
  function showPreview() {
    const to = picked && hoverPort && !servers.connectProblem(picked, hoverPort, pickedClips, pickedTray) ? hoverPort : null;
    const inRack = to && sameRack(picked, to); // im selben Schrank zählen nur die Clips
    let fields = null;
    let ends = false;
    if (picked && !inRack) {
      if (to) {
        fields = trayPath(endFieldOf(picked), pickedTray, endFieldOf(to)).fields ?? null;
        ends = !!fields;
      }
      if (!fields) fields = partialRoute();
    }
    markFields(picked ? pickedTray : [], fields ?? []);

    const key = !picked ? '' : [
      portKey(picked), pickedClips.map(clipKey).join(','), pickedTray.join(','), inRack || ends ? portKey(to) : '',
      fields?.join(',') ?? '',
    ].join('>');
    if (key === pendingKey) return;
    pendingKey = key;
    if (pendingCable) {
      // Röhre freigeben, ebenso die eigenen (halb durchsichtigen) Materialkopien der Vorschau
      pendingCable.traverse((o) => {
        if (!SHARED_GEOMETRY.has(o.geometry)) o.geometry?.dispose();
        o.material?.dispose();
      });
      pendingCable.removeFromParent();
      pendingCable = null;
    }
    let points = null;
    if (inRack) {
      // Route in Schrankkoordinaten rechnen und an die Stelle des Schranks verschieben
      const rack = pickedRack();
      const local = (ref) => toRack(rack, portPos.get(portKey(ref)));
      points = cableRoute(rack.type, local(picked), local(to), nextRackLane(), pickedClips).map((p) => toFrame(rack, p));
    } else if (fields) {
      const lane = nextTrayLane();
      const start = riseOf(picked, lane);
      const end = ends ? riseOf(to, lane) : null;
      if (start && (end || !ends)) points = trayCablePoints(start, fields, end, lane);
    }
    if (!points || points.length < 2) return;
    pendingCable = createCable(points, CABLE_COLOR, inRack ? undefined : TRAY_CABLE_RADIUS);
    pendingCable.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.5;
      o.raycast = () => {};
    });
    frameOf(areaOfRef(picked)).add(pendingCable);
  }

  // Hinweis beim Zielen auf ein Gitterfeld (nur beim Verlegen – sonst stört er beim Blick an die Decke)
  function fieldHint(field) {
    if (!carry.isEmpty || !picked) return null;
    const label = `Kabelgitter ${fieldLabel(field)}`;
    if (pickedTray.includes(field)) return `Linksklick: ${label} wieder aus dem Kabelweg nehmen`;
    const start = endFieldOf(picked);
    const problem = start === null ? 'Kein Gitterfeld über dem Anschluss' : trayPath(start, [...pickedTray, field], field).problem;
    if (problem) return `${label} – ${problem}`;
    const n = pickedTray.length;
    return `Linksklick: Kabel durch ${label} führen${n ? ` (${n === 1 ? '1 Feld' : `${n} Felder`} gewählt)` : ''}`;
  }

  function portInteraction(ref) {
    const isPicked = () => picked && picked.id === ref.id && picked.port === ref.port;
    return {
      hint: () => {
        if (!carry.isEmpty) return null;
        const peer = servers.peerLabel(ref);
        if (isPicked()) {
          const next = isWanRef(ref) ? 'Gitterfelder, dann Port im Schrank' : 'Clips oder Gitterfelder, dann zweiten Port';
          return `${portLabel(ref)} gewählt – ${next} anklicken · Linksklick hier oder Esc: abbrechen`;
        }
        if (peer) return `${portLabel(ref)} ↔ ${peer} · Linksklick: Kabel abziehen`;
        if (servers.cableAt(ref)) return `${portLabel(ref)} – verbunden · Linksklick: Kabel abziehen`;
        if (!picked) {
          const free = isWanRef(ref) ? ' – frei' : '';
          return `${portLabel(ref)}${free} · Linksklick: Kabel anstecken (Vorrat ${meters(servers.cableMeters)})`;
        }
        const problem = servers.connectProblem(picked, ref, pickedClips, pickedTray);
        if (problem) return problem;
        const n = pickedTray.length;
        const via = !sameRack(picked, ref)
          ? `über ${n === 1 ? '1 Gitterfeld' : `${n} Gitterfelder`}`
          : pickedClips.length ? `über ${pickedClips.length === 1 ? '1 Clip' : `${pickedClips.length} Clips`}` : 'frei hängend';
        return `Linksklick: mit ${portLabel(ref)} verbinden, ${via} (${meters(servers.cableLength(picked, ref, pickedClips, pickedTray))} Kabel)`;
      },
      hover: () => {
        const target = picked && !isPicked() ? ref : null;
        if (target === hoverPort || (target && hoverPort && portKey(target) === portKey(hoverPort))) return;
        hoverPort = target;
        showPreview();
      },
      unhover: () => { hoverPort = null; showPreview(); },
      action: () => {
        if (!carry.isEmpty) return;
        if (isPicked()) cancelPick();
        else if (servers.cableAt(ref)) servers.disconnect(ref);
        else if (!picked) picked = { ...ref };
        else if (servers.connect(picked, ref, pickedClips, pickedTray)) cancelPick();
        hoverPort = null;
        showPicked();
      },
    };
  }

  // Clip der Kabelführung: nach dem ersten Port anklicken, um das Kabel hindurchzuführen (nochmal: wieder heraus)
  function clipInteraction(rack, clip) {
    const side = clip.side < 0 ? 'rechts' : 'links'; // so, wie man es von hinten sieht (−x liegt dann rechts)
    const label = `Clip ${side} bei HE ${servers.clipUnit(rack, clip.index) + 0.5}`;
    const chosen = () => pickedClips.findIndex((c) => clipKey(c) === clipKey(clip));
    return {
      hint: () => {
        if (!carry.isEmpty) return null;
        if (!picked) return `${label} – zum Einlegen erst einen Port anklicken`;
        if (isWanRef(picked)) return 'Clips nur für Kabel innerhalb eines Schranks – Gitterfelder anklicken';
        if (pickedRack() !== rack) return 'Der Clip gehört zu einem anderen Schrank';
        return chosen() === -1 ? `Linksklick: Kabel durch ${label} führen` : `Linksklick: Kabel wieder aus ${label} nehmen`;
      },
      action: () => {
        if (!carry.isEmpty || !picked || pickedRack() !== rack) return;
        const i = chosen();
        if (i === -1) pickedClips.push({ ...clip });
        else pickedClips.splice(i, 1);
        showPicked();
      },
    };
  }

  // ---------- Aufbau: nur neu bauen, was sich geändert hat ----------
  // Schränke (Gehäuse, Geräte, Klickflächen) und Kabel liegen getrennt im Zwischenspeicher. Ein Schrank wird nur neu
  // gebaut, wenn sich an ihm etwas ändert (Platz, Geräte, Höhe, Status-LED online/offline), ein Kabel nur, wenn sich
  // seine Enden, sein Weg oder die Lage seiner Ports ändern. Stecken oder Ziehen eines Kabels baut so nur dieses Kabel
  // (und Schränke, deren Server dadurch on- bzw. offline gehen) neu statt den ganzen Raum.

  const cablesGroup = new THREE.Group();
  cablesGroup.name = 'server-cables';
  group.add(cablesGroup);
  const rackCache = new Map();   // rackId → { key, group, ports: Map(`${id}:${port}` → Lage in group), fans }
  const cableCache = new Map();  // Schlüssel eines Kabels → Gruppe mit Röhre und Steckern
  // Versatz (lane) je Kabel: bleibt gleich, solange das Kabel steckt – sonst rückten beim Ziehen eines Kabels alle
  // späteren nach und müssten neu gebaut werden. Gitterkabel und Kabel im Schrank zählen getrennt.
  const lanes = { tray: new Map(), rack: new Map() };
  const cableId = (cable) => `${portKey(cable.a)}>${portKey(cable.b)}`;
  const freeLane = (pool) => {
    const used = new Set(pool.values());
    let lane = 0;
    while (used.has(lane)) lane++;
    return lane;
  };
  const laneFor = (pool, id) => {
    if (!pool.has(id)) pool.set(id, freeLane(pool));
    return pool.get(id);
  };
  nextTrayLane = () => freeLane(lanes.tray);
  nextRackLane = () => freeLane(lanes.rack);

  // Geometrie (und eigene Materialien, z. B. vom Vorschaukabel) freigeben; geteilte bleiben
  const disposeGroup = (g, materials = false) => g.traverse((o) => {
    if (o.geometry && !SHARED_GEOMETRY.has(o.geometry)) o.geometry.dispose();
    if (materials && o.material) o.material.dispose();
  });

  // Drehende Lüfter: { rotor, speed: () => Prozent }, aus den Schränken im Zwischenspeicher gesammelt
  let fans = [];

  // Ein Schrank mit Geräten, Klickflächen für Ports und Clips. Ports: Lage in group (für Kabel und Markierung)
  function buildRack(rack, reached) {
    const g = new THREE.Group();
    const { x, z } = spotPosition(rack.slot);
    g.position.set(x, 0, z);
    g.rotation.y = rackAngle(rack); // im Bunker schauen die Reihen 1, 3, 5 nach Norden
    const rackFans = [];
    const ports = new Map();
    const shell = createServerRack(rack.type);
    const door = doorState(rack.id);
    door.mesh = shell.userData.door;
    door.mesh.rotation.y = -door.angle;
    door.mesh.userData.interaction = doorInteraction(rack);
    g.add(shell);
    for (const which of ['top', 'bottom']) {
      for (const rotor of shell.userData.fans[which]) rackFans.push({ rotor, speed: () => climate.rack(rack.id)[which] });
    }
    const rackI = rackInteraction(rack);
    const nasViews = []; // NAS mit ihren Platten: { device, mesh, key } (syncDisks)
    for (const device of servers.devicesIn(rack.id)) {
      const withBays = !!nas && isNas(device);
      const bays = withBays ? nas.baysOf(device) : null;
      const mesh = createServerDevice(device.type, { online: servers.isOnline(device, reached), bays });
      const at = devicePlacement(rack.type, device.unit, device.type.units);
      mesh.position.copy(at);
      g.add(mesh);
      if (withBays) {
        nasViews.push({ device, mesh, key: baysKey(bays) });
        // Unsichtbare Klickflächen vor den Schächten (vor der Zielfläche des Schranks, damit sie zuerst getroffen werden)
        nasBays(device.type).forEach((b, index) => {
          const hitbox = new THREE.Mesh(bayHitGeometry(b), PORT_HIT_MATERIAL);
          hitbox.position.copy(at).add(new THREE.Vector3(b.x, b.y, 0.004));
          hitbox.name = `bay:${device.id}:${index}`;
          hitbox.userData.interaction = bayInteraction(rack, device, index, rackI, at);
          g.add(hitbox);
        });
      }
      // Defekte Geräte stehen still
      const speed = () => (climate.device(device.id).status === 'broken' ? 0 : climate.device(device.id).fan);
      for (const rotor of mesh.userData.fans) rackFans.push({ rotor, speed });
      // Unsichtbare Klickflächen über den Ports (etwas größer als die Buchse, damit man sie gut trifft)
      portPositions(device.type).forEach((p, port) => {
        const pos = at.clone().add(new THREE.Vector3(p.x, p.y, p.z));
        const key = `${device.id}:${port}`;
        const hitbox = new THREE.Mesh(PORT_HIT_GEOMETRY, PORT_HIT_MATERIAL);
        hitbox.position.copy(pos);
        hitbox.name = `port:${key}`;
        hitbox.userData.interaction = portInteraction({ id: device.id, port });
        g.add(hitbox);
        ports.set(key, toFrame(rack, pos));
      });
    }
    // Unsichtbare Zielfläche genau in der Front der Höheneinheiten: Zielt man zum Einbauen in einen leeren Bereich,
    // trifft der Strahl hier statt durch den offenen Rücken hindurch irgendwo dahinter – so zählt die Höhe vorn.
    // Nur von vorn treffbar (FrontSide), damit sie hinten beim Verkabeln nicht stört.
    const front = devicePlacement(rack.type, 0, rack.type.units);
    const aim = new THREE.Mesh(new THREE.PlaneGeometry(FRONT_WIDTH, rack.type.units * UNIT), AIM_MATERIAL);
    aim.position.set(front.x, front.y, front.z + 0.003);
    g.add(aim);
    // Klickflächen über den Clips der Kabelführung
    for (const side of [-1, 1]) {
      for (let index = 0; index < clipCount(rack.type); index++) {
        const hitbox = new THREE.Mesh(CLIP_HIT_GEOMETRY, PORT_HIT_MATERIAL);
        hitbox.position.copy(clipPosition(rack.type, side, index));
        hitbox.name = `clip:${rack.id}:${side}:${index}`;
        hitbox.userData.interaction = clipInteraction(rack, { side, index });
        g.add(hitbox);
      }
    }
    g.userData.interaction = rackI;
    // Im Bunker stehen bis zu 120 Schränke je Feld: unbewegliche Teile je Material zusammenfassen (Tür, Lüfter, Platten
    // und Klickflächen bleiben einzeln, models/merge-static.js) – spart etwa ein Viertel der Draw Calls je Schrank
    if (areaOfRack(rack) === 'bunker') mergeStatic(g);
    return { group: g, ports, fans: rackFans, nasViews };
  }

  function syncRacks(reached) {
    const seen = new Set();
    let changed = false;
    for (const rack of servers.racks) {
      seen.add(rack.id);
      const key = JSON.stringify([
        rack.slot, rack.type.id,
        servers.devicesIn(rack.id).map((d) => [d.id, d.unit, d.type.id, servers.isOnline(d, reached)]),
      ]);
      const cached = rackCache.get(rack.id);
      if (cached?.key === key) continue;
      if (cached) {
        cached.group.removeFromParent();
        disposeGroup(cached.group);
      }
      const built = buildRack(rack, reached);
      // Bunker-Schränke hängen im Inhalt ihres Kellerfeldes (werden mit dem Feld ausgeblendet)
      const parent = areaOfRack(rack) === 'bunker' && bunker ? bunker.holder(bunkerFieldOf(rack.slot)) : racks;
      parent.add(built.group);
      rackCache.set(rack.id, { key, rack, bunker: areaOfRack(rack) === 'bunker', ...built });
      changed = true;
    }
    for (const [id, cached] of rackCache) {
      if (seen.has(id)) continue;
      cached.group.removeFromParent();
      disposeGroup(cached.group);
      rackCache.delete(id);
      doors.delete(id);
      changed = true;
    }
    if (!changed) return;
    portPos.clear();
    for (const cached of rackCache.values()) for (const [key, pos] of cached.ports) portPos.set(key, pos);
    addWanPorts();
    fans = [...rackCache.values()].flatMap((c) => c.fans);
    // Schränke als Hindernis in der zweiten Etage bzw. im Keller (Stockwerk −2)
    const footprint = (rack, level) => {
      const { x, z } = spotPosition(rack.slot);
      return { minX: x - RACK_FOOTPRINT.w / 2, maxX: x + RACK_FOOTPRINT.w / 2, minZ: z - RACK_FOOTPRINT.d / 2, maxZ: z + RACK_FOOTPRINT.d / 2, level };
    };
    collision.setDynamic('server-racks', servers.racks.filter((r) => areaOfRack(r) === 'upper').map((r) => footprint(r, 1)));
    collision.setDynamic('bunker-racks', servers.racks.filter((r) => areaOfRack(r) === 'bunker').map((r) => footprint(r, -2)));
  }

  // Kabel im Schrank (durch die Clips) bzw. über das Gitter (vom Port hoch, durch die Felder, am Ziel runter)
  function buildCable(cable, lane, tray) {
    if (tray) {
      const route = routeOf(cable);
      const a = riseOf(cable.a, lane);
      const b = riseOf(cable.b, lane);
      return route?.fields && a && b ? createCable(trayCablePoints(a, route.fields, b, lane), CABLE_COLOR, TRAY_CABLE_RADIUS) : null;
    }
    // Route in Schrankkoordinaten rechnen und an die Stelle des Schranks verschieben
    const rack = rackOfRef(cable.a);
    const pa = portPos.get(portKey(cable.a));
    const pb = portPos.get(portKey(cable.b));
    if (!rack || !pa || !pb) return null;
    const points = cableRoute(rack.type, toRack(rack, pa), toRack(rack, pb), lane, cable.clips).map((p) => toFrame(rack, p));
    return createCable(points, CABLE_COLOR);
  }

  function syncCables() {
    const ids = new Set(servers.cables.map(cableId));
    for (const pool of Object.values(lanes)) for (const id of pool.keys()) if (!ids.has(id)) pool.delete(id);
    const wanted = new Map();
    for (const cable of servers.cables) {
      const tray = isTrayCable(cable);
      const id = cableId(cable);
      const lane = laneFor(tray ? lanes.tray : lanes.rack, id);
      // Alles, wovon die Form abhängt: Enden, Clips bzw. Wegpunkte, Versatz, Lage der Ports und Schranktypen – am
      // Keller-Anschluss auch, in welchem Feld er steht (zieht er um, liegt das Kabel anders)
      const at = (ref) => (isWanRef(ref) ? [ref.port, isBasementWanPort(ref.port) ? bunkerWan : 0] : portPos.get(portKey(ref))?.toArray().map((v) => Math.round(v * 1e4)));
      const key = JSON.stringify([id, tray, lane, cable.clips, cable.tray, at(cable.a), at(cable.b), rackOfRef(cable.a)?.type.id, rackOfRef(cable.b)?.type.id]);
      if (wanted.has(key)) continue;
      wanted.set(key, { cable, lane, tray });
    }
    for (const [key, g] of cableCache) {
      if (wanted.has(key)) continue;
      g.removeFromParent();
      disposeGroup(g);
      cableCache.delete(key);
    }
    for (const [key, { cable, lane, tray }] of wanted) {
      if (cableCache.has(key)) continue;
      const g = buildCable(cable, lane, tray) ?? new THREE.Group(); // leer merken, damit es nicht jedes Mal neu versucht
      // Kabel im Bunker liegen in dessen Bodenkoordinaten (Kabel zwischen den Bereichen gibt es nicht)
      (areaOfRef(cable.a) === 'bunker' && bunker ? bunkerCables : cablesGroup).add(g);
      cableCache.set(key, g);
    }
  }

  function buildRoom() {
    const reached = servers.reachable();
    syncRacks(reached);
    lodKey = ''; // neu gebaute Schränke sind erst einmal sichtbar – Detailstufe neu verteilen
    lodBuild++;
    syncCables();
    if (picked && !portPos.has(portKey(picked))) cancelPick();
    showPicked();
  }

  // Neu aufbauen nur, wenn sich am Serverraum etwas geändert hat (Schränke, Geräte, Kabel, wer online ist)
  let dirty = true;
  let lastKey = '';
  let lastCarrying = null;
  let bunkerWan = null;     // Kellerfeld mit dem Glasfaser-Anschluss (zieht er um, Kabel dorthin neu bauen)
  economy.subscribe(() => { dirty = true; });

  // Glastüren zur Zielstellung schwenken lassen
  function animateDoors(dt) {
    for (const door of doors.values()) {
      const target = door.open ? DOOR_OPEN_ANGLE : 0;
      if (door.angle === target || !door.mesh) continue;
      const step = DOOR_SPEED * dt;
      door.angle = Math.abs(target - door.angle) <= step ? target : door.angle + Math.sign(target - door.angle) * step;
      door.mesh.rotation.y = -door.angle;
    }
  }

  // Lüfter drehen sich so schnell, wie sie eingestellt sind
  function spinFans(dt) {
    for (const fan of fans) fan.rotor.rotation.z -= (fan.speed() / 100) * MAX_FAN_SPEED * dt;
  }

  // Daten-Bunker (#60): Bis zu 120 Schränke je Feld. Volle Schränke mit Geräten, Türen und Lüftern nur im Umkreis von
  // LOD_NEAR um die Spielfigur (und nur, wenn sie im Keller ist) – alle anderen zeichnet world/bunker.js als einfache
  // Kästen (ein Draw Call je Feld). Leere Plätze kosten nichts.
  let lodKey = '';
  let lodBuild = 0; // zählt Neuaufbauten der Schränke (dann ändern sich auch die Geräte in den einfachen Kästen)
  const KIND_COLORS = { switch: 0x4a5566, firewall: 0x9a3b3b, patch: 0x30353c };
  function updateLod(camera) {
    const p = camera.position;
    const below = p.y < BASEMENT_FLOOR_Y + 10;
    const nearOf = new Map();
    let key = `${lodBuild}|`;
    for (const cached of rackCache.values()) {
      // abgebaut, aber noch nicht aus dem Zwischenspeicher (das passiert beim nächsten Neuaufbau)
      if (!cached.bunker || cached.rack.location !== 'server' || spotArea(cached.rack.slot) !== 'bunker') continue;
      const { x, z } = spotPosition(cached.rack.slot);
      const near = below && Math.abs(p.x - x) < LOD_NEAR && Math.abs(p.z - z) < LOD_NEAR && Math.hypot(p.x - x, p.z - z) < LOD_NEAR;
      if (cached.group.visible !== near) cached.group.visible = near;
      nearOf.set(cached, near);
      key += near ? '1' : '0';
    }
    if (key === lodKey && !bunker.farStale) return;
    lodKey = key;
    const far = [];
    for (const [cached, near] of nearOf) {
      if (near) continue;
      const rack = cached.rack;
      const devices = servers.devicesIn(rack.id).map((d) => {
        const at = toFrame(rack, devicePlacement(rack.type, d.unit, d.type.units).add(new THREE.Vector3(0, 0, 0.004)));
        return { x: at.x, y: at.y, z: at.z, h: d.type.units * UNIT - 0.004, color: d.type.color ?? KIND_COLORS[d.type.kind] ?? 0x5a6068 };
      });
      far.push({ slot: rack.slot, units: rack.type.units, devices });
    }
    bunker.setFarRacks(far, key);
  }

  // camera: Spielkamera (für die Detailstufe der Bunker-Schränke; ohne sie werden alle voll gezeichnet)
  function update(dt = 0, camera = null) {
    group.visible = upgrades.upperFloor;
    if (!group.visible) return;
    // Daten-Bunker: Gitter, Markierungen und Keller-Anschluss den Kellerfeldern anpassen (billig ohne Änderung)
    if (bunker?.sync()) {
      bunkerWan = basementWan()?.field ?? null;
      addWanPorts();
      dirty = true;
      lastCarrying = null;
    }
    animateDoors(dt);
    spinFans(dt);
    if (disksBroken) pulseNasDisks((diskTime += dt));
    const carrying = carryingRack();
    if (carrying !== lastCarrying || dirty) {
      lastCarrying = carrying;
      for (const [spot, marker] of markers.children.entries()) marker.visible = carrying && !servers.spotUsed(spot);
      bunker?.showMarkers((spot) => carrying && spotUsable(spot) && !servers.spotUsed(spot));
    }
    if (bunker && camera) updateLod(camera);
    if (!dirty) return;
    dirty = false;
    const reached = servers.reachable();
    const key = JSON.stringify([
      servers.racks.map((r) => [r.id, r.slot, r.type.id]),
      servers.installed.map((d) => [d.id, d.rackId, d.unit, d.type.id, reached.has(d.id)]),
      servers.cables, bunkerWan,
    ]);
    if (key !== lastKey) {
      lastKey = key;
      buildRoom();
    }
    syncDisks(); // Platten eingesetzt oder herausgenommen: nur die Platten dieser NAS neu bauen
  }

  // Wer den Bereich des gewählten Ports verlässt (zweite Etage = Stockwerk 1, Keller = −2), bricht das Verlegen ab
  function leaveLevel(level) {
    if (!picked) return false;
    const wanted = areaOfRef(picked) === 'bunker' ? -2 : 1;
    return level !== wanted && cancelCabling();
  }

  // Angefangenes Verlegen abbrechen (Esc, Pause, Etage verlassen) – true, wenn etwas gewählt war
  function cancelCabling() {
    if (!picked) return false;
    cancelPick();
    hoverPort = null;
    hoverField = null;
    showPicked();
    return true;
  }

  return { group, bunker, update, cancelPick: cancelCabling, leaveLevel };
}
