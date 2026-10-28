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
import * as THREE from 'three';
import { SERVER_SPOTS } from '../core/servers.js';
import { WAN_FIELD, fieldAbove, fieldLabel, isWanRef, toggleWaypoint, trayPath, wanPortName } from '../core/cable-tray.js';
import { spotPosition, spotsInZone } from '../core/server-zones.js';
import { canvasTexture } from '../models/canvas-texture.js';
import { meters } from '../core/format.js';
import { isServerHardware, portName } from '../core/server-catalog.js';
import {
  CABLE_COLOR, FRONT_WIDTH, RACK_FOOTPRINT, UNIT, cableRoute, clipCount, clipPosition, createServerDevice, createServerRack, devicePlacement,
  portPositions,
  unitAtHeight,
} from '../models/server-hardware.js';
import { MAX_FAN_SPEED } from '../models/server-fans.js';
import { FLOOR_Y } from './upper-floor.js';
import {
  SHARED_CABLE_GEOMETRY, TRAY_CABLE_RADIUS, createCable, createCableTrayRoom, rackRise, trayCablePoints, wanRise,
} from './cable-tray.js';

const DOOR_OPEN_ANGLE = 1.9;     // Bogenmaß, so weit schwingt die Glastür auf
const DOOR_SPEED = 3.5;          // Bogenmaß pro Sekunde
// Klickfläche eines Ports: unsichtbar, aber vom Strahl getroffen (material.visible = false)
const PORT_HIT_GEOMETRY = new THREE.BoxGeometry(0.016, 0.014, 0.012);
const PORT_HIT_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
const CLIP_HIT_GEOMETRY = new THREE.BoxGeometry(0.034, 0.03, 0.04);
// beim Neuaufbau nicht freigeben (Stecker und Knickschutz der Kabel kommen aus world/cable-tray.js)
const SHARED_GEOMETRY = new Set([PORT_HIT_GEOMETRY, CLIP_HIT_GEOMETRY, ...SHARED_CABLE_GEOMETRY]);
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
export function createServerRoom({ economy, servers, climate, carry, upgrades, collision, onOpenRack }) {
  const group = new THREE.Group();
  group.position.y = FLOOR_Y;
  const markers = new THREE.Group();
  const racks = new THREE.Group();
  group.add(markers, racks, ...ROW_MARKINGS.map(createRowMarking));

  const carryingRack = () => carry.furniture?.type.kind === 'rack';

  for (let spot = 0; spot < SERVER_SPOTS; spot++) {
    const marker = createSpotMarker();
    const { x, z } = spotPosition(spot);
    marker.position.set(x, 0.006, z);
    marker.userData.interaction = {
      hint: () => (carryingRack() && !servers.spotUsed(spot) ? `Linksklick: ${carry.furniture.type.name} hier aufstellen` : null),
      action: () => {
        if (carryingRack() && servers.placeRack(carry.furniture.id, spot)) carry.releaseFurniture();
      },
    };
    markers.add(marker);
  }

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
    const aimed = unitAtHeight(rack.type, hit.point.y - FLOOR_Y);
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
        const { x, z } = spotPosition(rack.slot);
        preview.position.copy(devicePlacement(rack.type, unit, item.type.units)).add(new THREE.Vector3(x, 0, z + 0.015));
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

  // ---------- Verkabeln: ersten Port anklicken, wahlweise Clips bzw. Gitterfelder, dann den zweiten Port ----------
  // Ports sind { id, port } – Geräte-ID oder 'wan' (Internet-Anschluss an der Wand, core/cable-tray.js)

  let picked = null;              // erster gewählter Port { id, port } oder null
  let pickedClips = [];           // danach angeklickte Clips [{ side, index }] in Reihenfolge
  let pickedTray = [];            // danach angeklickte Gitterfelder (Feld-Indizes) in Reihenfolge
  let hoverField = null;          // gerade angezieltes Gitterfeld (Vorschau des Wegs bis dorthin)
  let hoverPort = null;           // gerade angezielter zweiter Port (Vorschau des ganzen Kabels)
  let trayLanes = 0;              // Zahl der Kabel im Gitter – das nächste bekommt diesen Versatz
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
  // Gitterfeld, in dem das Kabel von diesem Port ankommt (über dem Schrank bzw. Einstieg der Wandtrasse)
  const endFieldOf = (ref) => (isWanRef(ref) ? WAN_FIELD : (rackOfRef(ref) ? fieldAbove(rackOfRef(ref).slot) : null));
  // Kabelstück vom Port hoch ins Gitter (Punkte in group) oder null
  const riseOf = (ref, lane) => {
    if (isWanRef(ref)) return wanRise(ref.port, lane);
    const rack = rackOfRef(ref);
    const at = portPos.get(portKey(ref));
    if (!rack || !at) return null;
    const { x, z } = spotPosition(rack.slot);
    return rackRise(at, { x, z, type: rack.type }, lane);
  };
  // Läuft dieses Kabel über das Gitter? (zwischen zwei Schränken, zur Wand oder mit Gitterfeldern)
  const isTrayCable = (cable) => !sameRack(cable.a, cable.b);
  // Weg eines Gitterkabels durch die Felder: { fields } oder null
  const routeOf = (cable) => {
    if (servers.trayRoute) return servers.trayRoute(cable);
    const route = trayPath(endFieldOf(cable.a), cable.tray ?? [], endFieldOf(cable.b));
    return route.fields ? route : null;
  };

  // Gitter, Wandkasten und Trasse; Klicks auf Felder und Wandports landen hier
  const trayRoom = createCableTrayRoom({
    fieldInteraction: {
      hint: (field) => fieldHint(field),
      hover: (field) => { hoverField = field; showPreview(); },
      unhover: () => { hoverField = null; showPreview(); },
      action: (field) => {
        if (!carry.isEmpty || !picked) return;
        pickedTray = toggleWaypoint(pickedTray, field);
        showPicked();
      },
    },
    wanPortInteraction: (port) => portInteraction({ id: 'wan', port }),
  });
  group.add(trayRoom.group);
  const addWanPorts = () => {
    for (let port = 0; port < trayRoom.box.userData.ports.length; port++) portPos.set(`wan:${port}`, trayRoom.wanPortPos(port));
  };
  addWanPorts();

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
    pickedMarker.visible = !!picked;
    if (picked) {
      // Buchsen am Wandkasten zeigen nach +x, hinten an den Geräten nach −z
      const wan = isWanRef(picked);
      pickedMarker.rotation.y = wan ? Math.PI / 2 : 0;
      pickedMarker.position.copy(portPos.get(portKey(picked))).add(new THREE.Vector3(wan ? 0.002 : 0, 0, wan ? 0 : -0.002));
    }
    clipMarkers.clear();
    const rack = pickedRack();
    if (rack) {
      const { x, z } = spotPosition(rack.slot);
      for (const c of pickedClips) {
        const marker = new THREE.Mesh(CLIP_MARKER_GEOMETRY, pickedMarker.material);
        marker.position.copy(clipPosition(rack.type, c.side, c.index)).add(new THREE.Vector3(x, 0, z));
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
    trayRoom.markFields(picked ? pickedTray : [], fields ?? []);

    const key = !picked ? '' : [
      portKey(picked), pickedClips.map(clipKey).join(','), pickedTray.join(','), inRack || ends ? portKey(to) : '',
      fields?.join(',') ?? '',
    ].join('>');
    if (key === pendingKey) return;
    pendingKey = key;
    if (pendingCable) {
      pendingCable.traverse((o) => { if (!SHARED_GEOMETRY.has(o.geometry)) o.geometry?.dispose(); });
      group.remove(pendingCable);
      pendingCable = null;
    }
    let points = null;
    if (inRack) {
      // Route in Schrankkoordinaten rechnen und an die Stelle des Schranks verschieben
      const rack = pickedRack();
      const { x, z } = spotPosition(rack.slot);
      const offset = new THREE.Vector3(x, 0, z);
      const local = (ref) => portPos.get(portKey(ref)).clone().sub(offset);
      points = cableRoute(rack.type, local(picked), local(to), servers.cables.length, pickedClips).map((p) => p.add(offset));
    } else if (fields) {
      const start = riseOf(picked, trayLanes);
      const end = ends ? riseOf(to, trayLanes) : null;
      if (start && (end || !ends)) points = trayCablePoints(start, fields, end, trayLanes);
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
    group.add(pendingCable);
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
          return `${portLabel(ref)} gewählt – ${next} anklicken · Linksklick hier: abbrechen`;
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

  // Drehende Lüfter: { rotor, speed: () => Prozent }, beim Neuaufbau neu gesammelt
  let fans = [];

  function buildRacks() {
    racks.traverse((o) => { if (!SHARED_GEOMETRY.has(o.geometry)) o.geometry?.dispose(); });
    racks.clear();
    portPos.clear();
    fans = [];
    const reached = servers.reachable();
    const portWorld = new Map(); // `${id}:${port}` → Position im Schrank
    const rackGroups = new Map();
    for (const rack of servers.racks) {
      const g = new THREE.Group();
      const { x, z } = spotPosition(rack.slot);
      g.position.set(x, 0, z);
      const shell = createServerRack(rack.type);
      const door = doorState(rack.id);
      door.mesh = shell.userData.door;
      door.mesh.rotation.y = -door.angle;
      door.mesh.userData.interaction = doorInteraction(rack);
      g.add(shell);
      for (const which of ['top', 'bottom']) {
        for (const rotor of shell.userData.fans[which]) fans.push({ rotor, speed: () => climate.rack(rack.id)[which] });
      }
      for (const device of servers.devicesIn(rack.id)) {
        const mesh = createServerDevice(device.type, { online: servers.isOnline(device, reached) });
        const at = devicePlacement(rack.type, device.unit, device.type.units);
        mesh.position.copy(at);
        g.add(mesh);
        // Defekte Geräte stehen still
        const speed = () => (climate.device(device.id).status === 'broken' ? 0 : climate.device(device.id).fan);
        for (const rotor of mesh.userData.fans) fans.push({ rotor, speed });
        portPositions(device.type).forEach((p, port) => portWorld.set(`${device.id}:${port}`, at.clone().add(new THREE.Vector3(p.x, p.y, p.z))));
      }
      // Unsichtbare Zielfläche genau in der Front der Höheneinheiten: Zielt man zum Einbauen in einen leeren Bereich,
      // trifft der Strahl hier statt durch den offenen Rücken hindurch irgendwo dahinter – so zählt die Höhe vorn.
      // Nur von vorn treffbar (FrontSide), damit sie hinten beim Verkabeln nicht stört.
      const front = devicePlacement(rack.type, 0, rack.type.units);
      const aim = new THREE.Mesh(new THREE.PlaneGeometry(FRONT_WIDTH, rack.type.units * UNIT), AIM_MATERIAL);
      aim.position.set(front.x, front.y, front.z + 0.003);
      g.add(aim);
      g.userData.interaction = rackInteraction(rack);
      rackGroups.set(rack.id, g);
      racks.add(g);
    }
    servers.cables.forEach((cable, i) => {
      if (isTrayCable(cable)) return; // die über das Gitter kommen unten, wenn alle Ports ihre Lage haben
      const device = economy.furnitureById(cable.a.id);
      const g = rackGroups.get(device?.rackId);
      const a = portWorld.get(`${cable.a.id}:${cable.a.port}`);
      const b = portWorld.get(`${cable.b.id}:${cable.b.port}`);
      if (g && a && b) g.add(createCable(cableRoute(economy.furnitureById(device.rackId).type, a, b, i, cable.clips), CABLE_COLOR));
    });
    // Unsichtbare Klickflächen über den Ports (etwas größer als die Buchse, damit man sie gut trifft)
    for (const [key, pos] of portWorld) {
      const [id, port] = key.split(':').map(Number);
      const device = economy.furnitureById(id);
      const hitbox = new THREE.Mesh(PORT_HIT_GEOMETRY, PORT_HIT_MATERIAL);
      hitbox.position.copy(pos);
      hitbox.name = `port:${key}`;
      hitbox.userData.interaction = portInteraction({ id, port });
      rackGroups.get(device.rackId).add(hitbox);
      const { x, z } = spotPosition(economy.furnitureById(device.rackId).slot);
      portPos.set(key, pos.clone().add(new THREE.Vector3(x, 0, z)));
    }
    addWanPorts();
    // Kabel über das Gitter: vom Port hoch ins Feld, durch die Felder und am Ziel wieder runter; jedes Kabel liegt
    // etwas versetzt neben den anderen (lane)
    trayLanes = 0;
    for (const cable of servers.cables) {
      if (!isTrayCable(cable)) continue;
      const lane = trayLanes++;
      const route = routeOf(cable);
      const a = riseOf(cable.a, lane);
      const b = riseOf(cable.b, lane);
      if (route?.fields && a && b) racks.add(createCable(trayCablePoints(a, route.fields, b, lane), CABLE_COLOR, TRAY_CABLE_RADIUS));
    }
    // Klickflächen über den Clips der Kabelführung
    for (const rack of servers.racks) {
      for (const side of [-1, 1]) {
        for (let index = 0; index < clipCount(rack.type); index++) {
          const hitbox = new THREE.Mesh(CLIP_HIT_GEOMETRY, PORT_HIT_MATERIAL);
          hitbox.position.copy(clipPosition(rack.type, side, index));
          hitbox.name = `clip:${rack.id}:${side}:${index}`;
          hitbox.userData.interaction = clipInteraction(rack, { side, index });
          rackGroups.get(rack.id).add(hitbox);
        }
      }
    }
    if (picked && !portPos.has(portKey(picked))) cancelPick();
    showPicked();
    // Schränke als Hindernis in der zweiten Etage
    collision.setDynamic('server-racks', servers.racks.map((rack) => {
      const { x, z } = spotPosition(rack.slot);
      return { minX: x - RACK_FOOTPRINT.w / 2, maxX: x + RACK_FOOTPRINT.w / 2, minZ: z - RACK_FOOTPRINT.d / 2, maxZ: z + RACK_FOOTPRINT.d / 2, level: 1 };
    }));
  }

  // Neu aufbauen nur, wenn sich am Serverraum etwas geändert hat (Schränke, Geräte, Kabel, wer online ist)
  let dirty = true;
  let lastKey = '';
  let lastCarrying = null;
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

  function update(dt = 0) {
    group.visible = upgrades.upperFloor;
    if (!group.visible) return;
    animateDoors(dt);
    spinFans(dt);
    const carrying = carryingRack();
    if (carrying !== lastCarrying || dirty) {
      lastCarrying = carrying;
      for (const [spot, marker] of markers.children.entries()) marker.visible = carrying && !servers.spotUsed(spot);
    }
    if (!dirty) return;
    dirty = false;
    const reached = servers.reachable();
    const key = JSON.stringify([
      servers.racks.map((r) => [r.id, r.slot, r.type.id]),
      servers.installed.map((d) => [d.id, d.rackId, d.unit, d.type.id, reached.has(d.id)]),
      servers.cables,
    ]);
    if (key === lastKey) return;
    lastKey = key;
    buildRacks();
  }

  return { group, update };
}
