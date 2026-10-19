// Büro der Azubis hinter der Ostwand: Werkbank mit Übungsdruckern, Ersatzteilen und Filament, dazu eine Couch mit
// Fernseher und Konsole. Ohne Arbeit sitzen die Azubis hier (world/workers.js nutzt OFFICE_SPOTS und OFFICE_PATH).
// Die Tür bleibt zu, bis jemand eingestellt ist.
import * as THREE from 'three';
import { filamentById, PRINTERS } from '../core/catalog.js';
import { createPrinterModel, printerSize } from '../models/printer-model.js';
import { createSpool } from '../models/spool.js';
import { createFurnitureModel, createNozzle } from '../models/furniture.js';
import {
  CHAIR_SEAT_HEIGHT, COUCH, DESK, LOWBOARD,
  createConsole, createController, createCouch, createDesk, createLowboard, createOfficeChair, createPlant, createTv,
} from '../models/office-furniture.js';
import { ROOM_SIZE, WALL_THICKNESS, OFFICE_DOOR, createWallGeometry, canvasTexture, speckle, rand } from './room.js';
import { enableShadows } from './util.js';

// Innenmaße (Welt-Koordinaten)
const X0 = ROOM_SIZE / 2 + WALL_THICKNESS; // Innenseite der gemeinsamen Wand
const X1 = 16.2;
const Z0 = -2.8;
const Z1 = 2.8;
const HEIGHT = 2.7;
const CX = (X0 + X1) / 2;
const W = X1 - X0;
const D = Z1 - Z0;

const DESK_POS = { x: 13.4, z: Z0 + DESK.d / 2 + 0.03 };
const CHAIRS_X = [12.5, 14.4];
const CHAIR_Z = -1.75;
const COUCH_POS = { x: 14.0, z: 0.72 };
const LOWBOARD_POS = { x: 14.0, z: Z1 - LOWBOARD.d / 2 - 0.02 };
const DOOR_OPEN_SECONDS = 0.8;

// Wege der Azubis: vor der Tür in der Halle, gleich hinter der Tür, und ein Gang im Büro, von dem aus sie
// geradeaus zu ihren Plätzen gehen
export const OFFICE_PATH = {
  hall: { x: ROOM_SIZE / 2 - 0.8, z: OFFICE_DOOR.z },
  inside: { x: X0 + 0.7, z: OFFICE_DOOR.z },
  aisleX: 12.0,
};
export const inOffice = (p) => p.x > ROOM_SIZE / 2;

// Sitzplätze: stand = wo sie aufstehen/hinsetzen, seat = Hüfte, y = Sitzhöhe, rotY = Blickrichtung
export const OFFICE_SPOTS = {
  desk: CHAIRS_X.map((x) => ({ stand: { x, z: -1.0 }, seat: { x, z: CHAIR_Z + 0.1 }, y: CHAIR_SEAT_HEIGHT, rotY: Math.PI })),
  couch: [-0.5, 0.5].map((dx) => ({
    stand: { x: COUCH_POS.x + dx, z: 1.6 }, seat: { x: COUCH_POS.x + dx, z: COUCH_POS.z - 0.05 }, y: COUCH.seatHeight, rotY: 0,
  })),
};

// ---------- Texturen ----------

function drawCarpet(ctx, w, h) {
  ctx.fillStyle = '#56616b';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 14000, 0.1);
}

function drawPlaster(ctx, w, h) {
  ctx.fillStyle = '#e4ebe6';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 9000, 0.05);
}

function drawRug(ctx, w, h) {
  ctx.fillStyle = '#b8483a';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f0d9a8';
  ctx.lineWidth = 10;
  ctx.strokeRect(22, 22, w - 44, h - 44);
  ctx.lineWidth = 4;
  ctx.strokeRect(44, 44, w - 88, h - 88);
  speckle(ctx, w, h, 6000, 0.12);
}

function drawPoster(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1f2a44');
  grad.addColorStop(1, '#0f1424');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Schichtlinien wie bei einem Druck
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `hsl(${140 + i * 6}, 70%, ${45 + i * 1.5}%)`;
    ctx.fillRect(w * 0.3 - i * 3, h * 0.62 - i * 13, w * 0.4 + i * 6, 9);
  }
  ctx.fillStyle = '#7ef0a8';
  ctx.font = '800 54px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SCHICHT', w / 2, h * 0.76);
  ctx.fillText('FÜR SCHICHT', w / 2, h * 0.86);
  ctx.fillStyle = '#c9d4e8';
  ctx.font = '500 26px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Erst drucken, dann zocken.', w / 2, h * 0.94);
}

function drawWhiteboard(ctx, w, h) {
  ctx.fillStyle = '#f7f8f8';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'left';
  ctx.font = '600 34px "Segoe Print", "Comic Sans MS", cursive';
  ctx.fillStyle = '#1d4fb8';
  ctx.fillText('Azubi-Plan', 24, 50);
  ctx.font = '500 26px "Segoe Print", "Comic Sans MS", cursive';
  ctx.fillStyle = '#222';
  ['✔ Fehldrucke weg + neu starten', '✔ Teile abnehmen', '✔ Düsen freistechen', '✔ Filament holen'].forEach((t, i) => {
    ctx.fillText(t, 30, 100 + i * 40);
  });
  ctx.fillStyle = '#c62828';
  ctx.fillText('Kart-Turnier: Freitag!', 30, 280);
}

// ---------- Fernseher ----------

// Kleines Kart-Rennen auf dem Fernseher: Straße mit Mittelstreifen läuft auf einen zu, zwei Karts wackeln
function drawRace(ctx, w, h, t) {
  const horizon = h * 0.42;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#3f8fe8');
  sky.addColorStop(1, '#bfe3ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = '#4fb34a';
  ctx.fillRect(0, horizon, w, h - horizon);
  const curve = Math.sin(t * 0.7) * w * 0.12;
  ctx.fillStyle = '#56585e';
  ctx.beginPath();
  ctx.moveTo(w / 2 + curve - 12, horizon);
  ctx.lineTo(w / 2 + curve + 12, horizon);
  ctx.lineTo(w * 0.95, h);
  ctx.lineTo(w * 0.05, h);
  ctx.closePath();
  ctx.fill();
  // Mittelstreifen: Abschnitte rücken nach unten
  ctx.fillStyle = '#f4f4f4';
  for (let i = 0; i < 8; i++) {
    const s = ((i + (t * 2.5) % 1) / 8) ** 2;
    const y = horizon + s * (h - horizon);
    const x = w / 2 + curve * (1 - s);
    const len = 2 + s * 18;
    ctx.fillRect(x - (1 + s * 4), y, 2 + s * 8, len);
  }
  for (const [i, color] of [[0, '#ff4d4d'], [1, '#ffd23f']]) {
    const x = w * (0.4 + i * 0.22) + Math.sin(t * 3 + i * 2) * 14;
    const y = h * (0.72 + i * 0.06) + Math.sin(t * 9 + i) * 2;
    ctx.fillStyle = color;
    ctx.fillRect(x - 22, y - 12, 44, 18);
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(x - 26, y + 2, 12, 9);
    ctx.fillRect(x + 14, y + 2, 12, 9);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(8, 8, 98, 26);
  ctx.fillStyle = '#fff';
  ctx.font = '700 18px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`RUNDE ${1 + (Math.floor(t / 20) % 3)}/3`, 16, 28);
}

function drawOff(ctx, w, h) {
  ctx.fillStyle = '#07080a';
  ctx.fillRect(0, 0, w, h);
  const glare = ctx.createLinearGradient(0, 0, w, h);
  glare.addColorStop(0, 'rgba(255,255,255,0.05)');
  glare.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, w, h);
}

// ---------- Bauteile ----------

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function wallPicture(width, height, pxW, pxH, draw) {
  const material = new THREE.MeshStandardMaterial({ map: canvasTexture(pxW, pxH, draw), roughness: 0.6 });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

// Holztür, Scharnier an der Nordseite der Öffnung. Geschlossen liegt sie in der Wand, offen schwenkt sie ins Büro.
function createDoorLeaf() {
  const pivot = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a6b42, roughness: 0.55 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.8, roughness: 0.3 });
  const leafW = OFFICE_DOOR.w - 0.02;
  const leafH = OFFICE_DOOR.h - 0.02;
  pivot.add(box(0.04, leafH, leafW, wood, 0, leafH / 2 + 0.01, leafW / 2));
  // Kassetten auf beiden Seiten
  for (const side of [-1, 1]) {
    for (const y of [0.55, 1.45]) pivot.add(box(0.006, 0.7, leafW - 0.24, wood, side * 0.023, y, leafW / 2));
    pivot.add(box(0.03, 0.02, 0.12, metal, side * 0.04, 1.05, leafW - 0.14)); // Drücker
  }
  pivot.position.set(ROOM_SIZE / 2 + WALL_THICKNESS / 2, 0, OFFICE_DOOR.z - OFFICE_DOOR.w / 2);
  return pivot;
}

function createCeilingPanel() {
  const lamp = new THREE.Group();
  lamp.add(box(0.9, 0.05, 0.9, new THREE.MeshStandardMaterial({ color: 0xdadada, roughness: 0.4 }), 0, -0.025, 0));
  const diffuser = new THREE.Mesh(
    new THREE.PlaneGeometry(0.84, 0.84),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e8).multiplyScalar(4) })
  );
  diffuser.rotation.x = Math.PI / 2;
  diffuser.position.y = -0.052;
  lamp.add(diffuser);
  const light = new THREE.PointLight(0xfff1dc, 6, 9, 2);
  light.position.y = -0.3;
  lamp.add(light);
  return lamp;
}

// Werkbank mit zwei Übungsdruckern, Ersatzteilkasten, Spulen und Düsen
function createWorkbench() {
  const bench = createDesk();
  const top = DESK.h;
  const backZ = -DESK.d / 2 + 0.04;
  [['a1-mini', CHAIRS_X[0]], ['p1s', CHAIRS_X[1]]].forEach(([id, worldX]) => {
    const model = PRINTERS.find((p) => p.id === id);
    const printer = createPrinterModel(model);
    printer.position.set(worldX - DESK_POS.x, top, backZ + printerSize(model).z / 2);
    bench.add(printer);
  });
  const rack = createFurnitureModel({ id: 'parts-rack' });
  rack.position.set(0.05, top, backZ + 0.13);
  rack.userData.nozzleSpots.slice(0, 7).forEach((spot) => {
    const nozzle = createNozzle(1.6);
    nozzle.position.copy(spot);
    rack.add(nozzle);
  });
  bench.add(rack);
  // Spulen: zwei liegen flach, eine steht hochkant hinten links
  [['pla-orange', -0.42, 0.12], ['petg-blau', 0.48, 0.1]].forEach(([id, x, z]) => {
    const spool = createSpool(filamentById(id));
    spool.rotation.z = Math.PI / 2;
    spool.position.set(x, top + 0.036, z);
    bench.add(spool);
  });
  const standing = createSpool(filamentById('pla-weiß'));
  standing.position.set(-1.45, top + 0.1, backZ + 0.1);
  bench.add(standing);
  // Lose Düsen und ein Pinzetten-Set vorne
  for (let i = 0; i < 3; i++) {
    const nozzle = createNozzle(1.6);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.rotation.y = rand(0, Math.PI);
    nozzle.position.set(0.25 + i * 0.05, top + 0.014, 0.25 + rand(-0.02, 0.02));
    bench.add(nozzle);
  }
  const mat = box(0.45, 0.004, 0.3, new THREE.MeshStandardMaterial({ color: 0x2f7a4c, roughness: 0.9 }), -0.25, top + 0.002, 0.2);
  bench.add(mat);
  return bench;
}

// ---------- Büro ----------

// staff: Personal (Tür öffnet sich, sobald jemand eingestellt ist) · collision: Kollision der Spielfigur
export function createOffice({ staff, collision }) {
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, drawCarpet, W / 1.5, D / 1.5), roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, 0, 0);
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, drawPlaster, W / 2, D / 2), roughness: 0.95 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(CX, HEIGHT, 0);
  group.add(ceiling);

  // Wände, Tür in der Westwand. Bei der Westwand (rotY = π/2) entspricht lokales x der Welt -z.
  const wallMat = new THREE.MeshStandardMaterial({ map: canvasTexture(512, 512, drawPlaster), roughness: 0.95 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5 });
  const walls = [
    { length: D, x: X0, z: 0, rotY: Math.PI / 2, doors: [{ ...OFFICE_DOOR, x: -OFFICE_DOOR.z }] },
    { length: D, x: X1, z: 0, rotY: -Math.PI / 2 },
    { length: W, x: CX, z: Z0, rotY: 0 },
    { length: W, x: CX, z: Z1, rotY: Math.PI },
  ];
  for (const w of walls) {
    const wall = new THREE.Group();
    wall.add(new THREE.Mesh(createWallGeometry(w.length, HEIGHT, w.doors), wallMat));
    // Sockelleiste, an der Tür unterbrochen
    const gaps = w.doors ? [[-w.length / 2, -OFFICE_DOOR.w / 2 - 0.08], [OFFICE_DOOR.w / 2 + 0.08, w.length / 2]] : [[-w.length / 2, w.length / 2]];
    for (const [a, b] of gaps) wall.add(box(b - a, 0.08, 0.02, trim, (a + b) / 2, 0.04, 0.01));
    wall.position.set(w.x, 0, w.z);
    wall.rotation.y = w.rotY;
    group.add(wall);
  }

  // Zarge auf der Büroseite
  const d = OFFICE_DOOR;
  for (const side of [-1, 1]) group.add(box(0.03, d.h + 0.06, 0.06, trim, X0 + 0.015, (d.h + 0.06) / 2, d.z + side * (d.w / 2 + 0.03)));
  group.add(box(0.03, 0.06, d.w + 0.12, trim, X0 + 0.015, d.h + 0.03, d.z));
  const door = createDoorLeaf();
  door.userData.interaction = {
    hint: () => (staff.workers.length ? null : 'Büro der Azubis – öffnet sich, sobald du jemanden einstellst (PC → Personal)'),
  };
  group.add(door);

  const lamp = createCeilingPanel();
  lamp.position.set(CX, HEIGHT, 0);
  group.add(lamp);

  // Arbeitsplätze
  const bench = createWorkbench();
  bench.position.set(DESK_POS.x, 0, DESK_POS.z);
  bench.userData.interaction = { hint: () => 'Werkbank der Azubis: Übungsdrucker, Ersatzteile und Filament' };
  group.add(bench);
  for (const x of CHAIRS_X) {
    const chair = createOfficeChair();
    chair.position.set(x, 0, CHAIR_Z);
    chair.rotation.y = Math.PI; // Sitz zeigt zur Werkbank
    group.add(chair);
  }

  // Zockecke: Teppich, Couch, Lowboard mit Konsole, Fernseher an der Wand
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.0),
    new THREE.MeshStandardMaterial({ map: canvasTexture(512, 400, drawRug), roughness: 0.95 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(COUCH_POS.x, 0.003, 1.6);
  group.add(rug);

  const couch = createCouch();
  couch.position.set(COUCH_POS.x, 0, COUCH_POS.z);
  couch.userData.interaction = { hint: () => 'Pausen-Couch der Azubis' };
  group.add(couch);

  const lowboard = createLowboard();
  lowboard.position.set(LOWBOARD_POS.x, 0, LOWBOARD_POS.z);
  lowboard.rotation.y = Math.PI;
  const konsole = createConsole();
  konsole.position.set(-0.45, LOWBOARD.h, 0);
  const spareController = createController();
  spareController.position.set(0.35, LOWBOARD.h + 0.015, 0.05);
  spareController.rotation.y = 0.4;
  lowboard.add(konsole, spareController);
  group.add(lowboard);

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 320;
  screenCanvas.height = 180;
  const screenCtx = screenCanvas.getContext('2d');
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  drawOff(screenCtx, screenCanvas.width, screenCanvas.height);
  const tv = createTv(new THREE.MeshBasicMaterial({ map: screenTexture }));
  tv.position.set(COUCH_POS.x, 1.25, Z1 - 0.03);
  tv.rotation.y = Math.PI;
  let gamingNow = false;
  tv.userData.interaction = {
    hint: () => (gamingNow
      ? 'Die Azubis zocken Kart-Rennen – sobald Arbeit anfällt, springen sie auf'
      : 'Konsole der Azubis – hier zocken sie, wenn nichts zu tun ist'),
  };
  group.add(tv);

  const poster = wallPicture(0.6, 0.85, 360, 510, drawPoster);
  poster.position.set(DESK_POS.x, 1.75, Z0 + 0.005);
  group.add(poster);
  const whiteboard = wallPicture(1.2, 0.8, 480, 320, drawWhiteboard);
  whiteboard.position.set(X1 - 0.018, 1.5, -1.2); // vor dem Rahmen
  whiteboard.rotation.y = -Math.PI / 2;
  group.add(whiteboard, box(0.02, 0.84, 1.24, trim, X1 - 0.005, 1.5, -1.2));

  const plants = [[X1 - 0.3, Z1 - 0.3], [X0 + 0.35, Z0 + 0.35]].map(([x, z]) => {
    const plant = createPlant();
    plant.position.set(x, 0, z);
    group.add(plant);
    return { x, z };
  });

  enableShadows(group);
  floor.castShadow = false;
  rug.castShadow = false;
  // Decke und Wände halten das Sonnenlicht draußen
  ceiling.castShadow = true;

  // Kollision: Außenwände (die gemeinsame Wand kommt aus room.js), Möbel
  const t = WALL_THICKNESS;
  for (const b of [
    { minX: X1, maxX: X1 + t, minZ: Z0 - t, maxZ: Z1 + t },
    { minX: X0 - t, maxX: X1 + t, minZ: Z0 - t, maxZ: Z0 },
    { minX: X0 - t, maxX: X1 + t, minZ: Z1, maxZ: Z1 + t },
    { minX: DESK_POS.x - DESK.w / 2, maxX: DESK_POS.x + DESK.w / 2, minZ: Z0, maxZ: DESK_POS.z + DESK.d / 2 },
    { minX: COUCH_POS.x - COUCH.w / 2, maxX: COUCH_POS.x + COUCH.w / 2, minZ: COUCH_POS.z - COUCH.d / 2, maxZ: COUCH_POS.z + COUCH.d / 2 },
    { minX: LOWBOARD_POS.x - LOWBOARD.w / 2, maxX: LOWBOARD_POS.x + LOWBOARD.w / 2, minZ: LOWBOARD_POS.z - LOWBOARD.d / 2, maxZ: Z1 },
    ...CHAIRS_X.map((x) => ({ minX: x - 0.25, maxX: x + 0.25, minZ: CHAIR_Z - 0.25, maxZ: CHAIR_Z + 0.25 })),
    ...plants.map(({ x, z }) => ({ minX: x - 0.17, maxX: x + 0.17, minZ: z - 0.17, maxZ: z + 0.17 })),
  ]) collision.addBox(b);

  // Tür: zu ohne Personal, sonst offen. Die Kollision folgt dem Türblatt.
  let open = 0;      // 0 = zu, 1 = offen
  let wantOpen = false;
  function updateDoorCollision() {
    const hingeX = ROOM_SIZE / 2 + WALL_THICKNESS / 2;
    const hingeZ = d.z - d.w / 2;
    collision.setDynamic('office-door', [open > 0.5
      ? { minX: hingeX, maxX: hingeX + d.w, minZ: hingeZ - 0.03, maxZ: hingeZ + 0.03 }
      : { minX: hingeX - 0.03, maxX: hingeX + 0.03, minZ: hingeZ, maxZ: hingeZ + d.w }]);
  }
  staff.subscribe(() => {
    wantOpen = staff.workers.length > 0;
  });
  open = wantOpen ? 1 : 0; // beim Laden steht sie gleich richtig
  door.rotation.y = (open * Math.PI) / 2;
  updateDoorCollision();

  let screenTime = 0;
  let redraw = 0;
  // gaming: ob gerade jemand auf der Couch zockt
  function update(dt, gaming) {
    const target = wantOpen ? 1 : 0;
    if (open !== target) {
      const before = open > 0.5;
      open = THREE.MathUtils.clamp(open + Math.sign(target - open) * (dt / DOOR_OPEN_SECONDS), 0, 1);
      const ease = open * open * (3 - 2 * open);
      door.rotation.y = (ease * Math.PI) / 2;
      if (before !== open > 0.5) updateDoorCollision();
    }

    if (gaming !== gamingNow) {
      gamingNow = gaming;
      if (!gaming) {
        drawOff(screenCtx, screenCanvas.width, screenCanvas.height);
        screenTexture.needsUpdate = true;
      }
    }
    if (gaming) {
      screenTime += dt;
      redraw -= dt;
      if (redraw <= 0) {
        redraw = 1 / 15; // 15 Bilder pro Sekunde reichen für den Fernseher
        drawRace(screenCtx, screenCanvas.width, screenCanvas.height, screenTime);
        screenTexture.needsUpdate = true;
      }
    }
  }

  return { group, update };
}
