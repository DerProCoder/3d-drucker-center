// Werkbank im Serverraum (Issue #45, Logik in core/workbench.js und core/server-parts.js): steht fest an der Südwand
// der zweiten Etage, sobald die Etage da ist. Mit einem Server-Karton in der Hand legt ein Linksklick den Server auf
// die Werkbank. Dort liegt er offen (Gehäuse ohne Deckel, models/server-parts.js createOpenServer): Mainboard, CPUs mit
// Kühler, RAM-Riegel, Lüfter und Netzteil so, wie sie gerade eingebaut sind; ein defektes Teil leuchtet rot.
// Mit leeren Händen öffnet ein Klick auf Werkbank oder Server das Werkbank-Menü (ui/workbench-panel.js), ein Klick auf
// den Deckel daneben nimmt den Server wieder als Karton auf – dann wie gewohnt in einen Schrank einbauen.
//
// Lage: Südwand (z = 10), x 2,1…3,9 – zwischen den Fenstern bei x 0 und 6 (je 1,6 m breit). Die Schrankreihen
// (x −8…−1, z −8…2,4, core/server-zones.js), Treppe und Fahrstuhl (Nordosten), der Wandanschluss an der Westwand
// (core/cable-tray.js WAN_BOX, z −1) und der Weg der Besucher (Treppe → Gang zwischen Reihe A und B) liegen weit weg.
//
// Leistung: Die Werkbank selbst ist zusammengeführt (wenige Draw Calls). Der offene Server wird nur gebaut, solange
// einer darauf liegt, und nur neu, wenn sich seine Teile ändern; danach werden auch seine Teile zu wenigen Meshes je
// Material zusammengeführt. Er ist nicht selbst anklickbar (eine unsichtbare Klickfläche liegt darüber).
import * as THREE from 'three';
import { FLOOR_Y } from './upper-floor.js';
import { ROOM_SIZE } from './room.js';
import { WORKBENCH, createWorkbench } from '../models/workbench.js';
import { createOpenServer, mountPart, pulseBroken } from '../models/server-parts.js';
import { chassisMaterial } from '../models/server-textures.js';
import { mergeStatic } from '../models/merge-static.js';
import { layoutOf } from '../core/server-parts.js';
import { isServerHardware } from '../core/server-catalog.js';

// Mitte der Werkbank auf dem Boden der zweiten Etage (Welt-x/z); die Vorderseite schaut nach Norden (−z)
export const WORKBENCH_POSITION = Object.freeze({ x: 3, z: ROOM_SIZE / 2 - 0.02 - WORKBENCH.depth / 2 });
// Lage des offenen Servers und des Deckels auf der Platte (in Werkbank-Koordinaten, vorn +z)
const SERVER_AT = { x: -0.28, z: 0.06 };
const LID_AT = { x: 0.3, z: 0.06 };
const LID = { w: 0.44, h: 0.003, d: 0.5 }; // wie das Gehäuse des offenen Servers (models/server-parts.js)
const HIT_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

// Variante eines Teils für das 3D-Modell (Cores, GB) – Mainboard, Netzteil und Lüfter haben keine
const variantOf = (part) => (part.kind === 'cpu' ? part.cores : part.kind === 'ram' ? part.ram : part.gb ?? part.size ?? undefined);

// economy, bench: core/workbench.js, parts: core/server-parts.js, carry: world/carry.js, upgrades: ob die Etage steht,
// collision: Werkbank als Hindernis oben, onOpen(deviceId): Werkbank-Menü öffnen
export function createWorkbenchStation({ economy, bench, parts, carry, upgrades, collision, onOpen }) {
  const group = new THREE.Group();
  group.name = 'workbench';
  group.position.set(WORKBENCH_POSITION.x, FLOOR_Y, WORKBENCH_POSITION.z);
  group.rotation.y = Math.PI; // Lochwand an die Südwand, Vorderseite zum Raum
  group.visible = false;
  const model = createWorkbench();
  group.add(model);

  // Getragener Server-Karton (keine Schränke, Switches …) oder null
  const carriedServer = () => {
    const item = carry.furniture;
    return item && isServerHardware(item.type) && item.type.kind !== 'rack' ? item : null;
  };

  // Werkbank (und der Server darauf): ablegen bzw. Menü öffnen
  const benchInteraction = {
    hint: () => {
      const item = carriedServer();
      if (item) return bench.placeProblem(item) ?? `Linksklick: ${item.type.name} auf die Werkbank legen und öffnen`;
      if (!carry.isEmpty) return null;
      const device = bench.device;
      if (device) return `Linksklick: ${device.type.name} bearbeiten – Teile tauschen, auf- und abrüsten`;
      return 'Werkbank – Server im Schrankfenster ausbauen, den Karton herbringen und hier ablegen';
    },
    action: () => {
      const item = carriedServer();
      if (item) {
        if (bench.place(item.id)) carry.releaseFurniture();
        return;
      }
      if (carry.isEmpty && bench.device) onOpen?.(bench.device.id);
    },
  };
  model.userData.interaction = benchInteraction;

  // Unsichtbare Klickfläche über dem offenen Server (der Server selbst prüft keinen Strahl)
  const serverHit = new THREE.Mesh(new THREE.BoxGeometry(LID.w + 0.02, 0.2, LID.d + 0.02), HIT_MATERIAL);
  serverHit.position.set(SERVER_AT.x, WORKBENCH.height + 0.1, SERVER_AT.z);
  serverHit.userData.interaction = benchInteraction;
  serverHit.visible = false;
  group.add(serverHit);

  // Deckel neben dem Server: Klick nimmt den Server als Karton auf
  const lid = new THREE.Mesh(new THREE.BoxGeometry(LID.w, LID.h, LID.d), chassisMaterial(0x8a9098, false));
  lid.position.set(LID_AT.x, WORKBENCH.height + LID.h / 2, LID_AT.z);
  lid.rotation.y = 0.08;
  lid.visible = false;
  lid.userData.interaction = {
    hint: () => {
      const device = bench.device;
      if (!device) return null;
      const problem = pickUpProblem();
      return problem ?? `Linksklick: Deckel drauf – ${device.type.name} als Karton aufnehmen`;
    },
    action: () => { pickUp(); },
  };
  group.add(lid);

  // Grund, warum man den Server gerade nicht aufnehmen kann, oder null
  function pickUpProblem() {
    if (!bench.device) return 'Kein Server auf der Werkbank';
    if (!carry.canTakeBox) return 'Erst die Hände frei machen (Q: zurück ins Lager)';
    return null;
  }

  // Server von der Werkbank als Karton in die Hand nehmen; gibt true zurück, wenn es geklappt hat
  function pickUp() {
    if (pickUpProblem()) return false;
    const device = bench.pickUp();
    if (!device) return false;
    carry.holdFurniture(device);
    return true;
  }

  // ---------- Offener Server: nur neu bauen, wenn sich etwas ändert ----------

  let server = null;          // Gruppe des offenen Servers oder null
  let ownGeometry = [];       // beim Zusammenführen neu entstandene Geometrien (beim Abbau freigeben)
  let lastKey = '';
  let dirty = true;
  let hasBroken = false;
  let time = 0;
  economy.subscribe(() => { dirty = true; });

  function removeServer() {
    if (!server) return;
    group.remove(server);
    for (const g of ownGeometry) g.dispose();
    ownGeometry = [];
    server = null;
  }

  function buildServer(device) {
    const open = createOpenServer(layoutOf(device), { units: device.type.units, bezelColor: device.type.color ?? 0x2a2d32 });
    for (const slot of parts.slotsOf(device)) {
      if (slot.kind === 'board') {
        // Mainboard sitzt schon im Gehäuse – fehlt es, wird es entfernt, ist es defekt, leuchtet es rot
        if (!slot.part) mountPart(open, 'board', null);
        else if (slot.broken) mountPart(open, 'board', { broken: true });
        continue;
      }
      if (!slot.part) continue;
      mountPart(open, slot.id, { variant: variantOf(slot.part), cooler: slot.kind === 'cpu', broken: slot.broken });
    }
    // Für das Zusammenführen: Ankerpunkte und Teile nicht mehr gesondert halten (die Gruppe wird nur angezeigt)
    const shared = new Set();
    open.traverse((o) => {
      o.userData = {};
      if (o.geometry) shared.add(o.geometry);
    });
    const holder = new THREE.Group();
    holder.add(open);
    mergeStatic(holder);
    holder.traverse((o) => {
      if (!o.isMesh) return;
      o.raycast = () => {};
      o.castShadow = false;
      if (!shared.has(o.geometry)) ownGeometry.push(o.geometry);
    });
    holder.position.set(SERVER_AT.x, WORKBENCH.height, SERVER_AT.z);
    return holder;
  }

  function sync() {
    const device = bench.device;
    const slots = device ? parts.slotsOf(device) : [];
    const key = device ? JSON.stringify([device.id, device.type.id, slots.map((s) => [s.id, s.part?.id ?? null, s.broken])]) : '';
    serverHit.visible = lid.visible = !!device;
    if (key === lastKey) return;
    lastKey = key;
    removeServer();
    hasBroken = slots.some((s) => s.broken && s.part);
    if (!device) return;
    server = buildServer(device);
    group.add(server);
  }

  // Werkbank als Hindernis oben, sobald die Etage steht
  let blocking = false;
  function syncCollision() {
    if (blocking === upgrades.upperFloor) return;
    blocking = upgrades.upperFloor;
    const { x, z } = WORKBENCH_POSITION;
    const hw = WORKBENCH.width / 2;
    const hd = WORKBENCH.depth / 2;
    collision.setDynamic('workbench', blocking ? [{ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, level: 1 }] : []);
  }

  function update(dt = 0) {
    syncCollision();
    group.visible = upgrades.upperFloor;
    if (!group.visible) return;
    if (dirty) {
      dirty = false;
      sync();
    }
    if (hasBroken) {
      time += dt;
      pulseBroken(time);
    }
  }

  return {
    group,
    update,
    pickUp,
    pickUpProblem,
    get device() { return bench.device; },
    // Für Tests und Messungen: der gerade gezeigte offene Server (oder null)
    get serverMesh() { return server; },
  };
}
