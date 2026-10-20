// Eingangsbereich hinter der Westwand der Halle: heller Vorraum mit Fliesen und einer gläsernen Schiebetür nach
// draußen in den Garten. Die Schiebetür öffnet sich, sobald jemand davorsteht (Spieler oder Figuren).
// Die Einrichtung des Empfangs (Tresen, Wartebank, Abholregal) kommt aus world/reception.js.
import * as THREE from 'three';
import { ROOM_SIZE, WALL_THICKNESS, ENTRANCE_DOOR, createWallGeometry, canvasTexture, speckle } from './room.js';
import { enableShadows } from './util.js';
import { mergeStatic } from '../models/merge-static.js';

// Innenmaße (Welt-Koordinaten)
export const ENTRANCE = { x0: -16.2, x1: -(ROOM_SIZE / 2 + WALL_THICKNESS), z0: -2.8, z1: 2.8, height: 3.0 };
export const FRONT_DOOR = { z: 0, w: 1.6, h: 2.3 };  // Glas-Schiebetür in der Westwand des Vorraums (Welt-z)
const SENSOR = { x: 2.0, z: 1.2 };                   // Bewegungsmelder: so nah vor/hinter bzw. neben der Tür (m)
const SLIDE_SECONDS = 0.6;

const X0 = ENTRANCE.x0;
const X1 = ENTRANCE.x1;
const Z0 = ENTRANCE.z0;
const Z1 = ENTRANCE.z1;
const H = ENTRANCE.height;
const CX = (X0 + X1) / 2;
const W = X1 - X0;
const D = Z1 - Z0;

// Wege für Figuren: vor der Hallentür, im Vorraum, vor der Haustür innen und außen
export const ENTRANCE_PATH = {
  hall: { x: -ROOM_SIZE / 2 + 0.8, z: ENTRANCE_DOOR.z }, // in der Halle vor der Tür
  inside: { x: X1 - 0.7, z: ENTRANCE_DOOR.z },
  frontInside: { x: X0 + 0.8, z: FRONT_DOOR.z },
  frontOutside: { x: X0 - 1.2, z: FRONT_DOOR.z },
};
export const inEntrance = (p) => p.x < -ROOM_SIZE / 2 && p.x > X0 - WALL_THICKNESS / 2;

// ---------- Texturen ----------

// Große helle Feinsteinzeug-Fliesen (60 × 60 cm, eine Kachel = 1,2 m)
function drawTiles(ctx, w, h) {
  ctx.fillStyle = '#d9d6cf';
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      ctx.fillStyle = `hsl(40, 8%, ${80 + Math.random() * 5}%)`;
      ctx.fillRect(x * w / 2 + 2, y * h / 2 + 2, w / 2 - 4, h / 2 - 4);
    }
  }
  speckle(ctx, w, h, 5000, 0.05);
}

function drawPlaster(ctx, w, h) {
  ctx.fillStyle = '#efece6';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 8000, 0.04);
}

function drawMat(ctx, w, h) {
  ctx.fillStyle = '#3a3633';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#5c5650';
  ctx.lineWidth = 3;
  for (let x = 10; x < w; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, h - 8);
    ctx.stroke();
  }
  ctx.fillStyle = '#c9c2b8';
  ctx.font = '700 34px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WILLKOMMEN', w / 2, h / 2);
}

// ---------- Bauteile ----------

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// Schiebetür: zwei Glasflügel in Alurahmen, fahren zur Seite auf. Lokal: Tür in der yz-Ebene, Mitte bei z = 0.
function createSlidingDoor() {
  const g = new THREE.Group();
  const alu = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.7, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xcfe6f2, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false,
  });
  const { w, h } = FRONT_DOOR;
  const leafW = w / 2;
  const leaves = [-1, 1].map((side) => {
    const leaf = new THREE.Group();
    leaf.add(box(0.03, h - 0.04, leafW - 0.04, glass, 0, h / 2, 0));
    for (const y of [0.03, h - 0.04]) leaf.add(box(0.05, 0.05, leafW, alu, 0, y, 0));
    for (const z of [-leafW / 2 + 0.025, leafW / 2 - 0.025]) leaf.add(box(0.05, h, 0.05, alu, 0, h / 2, z));
    leaf.add(box(0.06, 0.4, 0.02, alu, 0, 1.05, -side * (leafW / 2 - 0.08))); // Griffleiste
    leaf.position.z = side * leafW / 2;
    leaf.userData.closedZ = side * leafW / 2;
    leaf.userData.side = side;
    g.add(leaf);
    return leaf;
  });
  // Antriebskasten über der Tür
  g.add(box(0.18, 0.16, w + 0.3, alu, 0, h + 0.08, 0));
  g.userData.leaves = leaves;
  return g;
}

// Deckenleuchte: runde Scheibe mit Punktlicht
function createLamp() {
  const lamp = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.05, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e8).multiplyScalar(4) })
  );
  disc.position.y = -0.03;
  lamp.add(disc);
  const light = new THREE.PointLight(0xfff1dc, 6, 9, 2);
  light.position.y = -0.3;
  lamp.add(light);
  return lamp;
}

// ---------- Vorraum ----------

// collision: Kollision der Spielfigur
export function createEntrance({ collision }) {
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W + WALL_THICKNESS, D),
    new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, drawTiles, (W + WALL_THICKNESS) / 1.2, D / 1.2), roughness: 0.35 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX + WALL_THICKNESS / 2, 0.001, 0); // reicht bis unter die Hallentür
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, drawPlaster, W / 2, D / 2), roughness: 0.95 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(CX, H, 0);
  group.add(ceiling);

  // Wände: Tür zur Halle im Osten, Haustür im Westen. Bei rotY = ±π/2 entspricht lokales x der Welt ∓z.
  const wallMat = new THREE.MeshStandardMaterial({ map: canvasTexture(512, 512, drawPlaster), roughness: 0.95 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5 });
  const walls = [
    { length: D, x: X0, rotY: Math.PI / 2, door: { x: -FRONT_DOOR.z, w: FRONT_DOOR.w, h: FRONT_DOOR.h } },
    { length: D, x: X1, rotY: -Math.PI / 2, door: { x: ENTRANCE_DOOR.z, w: ENTRANCE_DOOR.w, h: ENTRANCE_DOOR.h } },
    { length: W, x: CX, z: Z0, rotY: 0 },
    { length: W, x: CX, z: Z1, rotY: Math.PI },
  ];
  for (const w of walls) {
    const wall = new THREE.Group();
    wall.add(new THREE.Mesh(createWallGeometry(w.length, H, w.door ? [w.door] : []), wallMat));
    const gaps = w.door
      ? [[-w.length / 2, w.door.x - w.door.w / 2 - 0.06], [w.door.x + w.door.w / 2 + 0.06, w.length / 2]]
      : [[-w.length / 2, w.length / 2]];
    for (const [a, b] of gaps) wall.add(box(b - a, 0.08, 0.02, trim, (a + b) / 2, 0.04, 0.01)); // Sockelleiste
    wall.position.set(w.x, 0, w.z ?? 0);
    wall.rotation.y = w.rotY;
    group.add(wall);
  }

  // Zarge der Hallentür auf der Vorraumseite
  const d = ENTRANCE_DOOR;
  for (const side of [-1, 1]) group.add(box(0.03, d.h + 0.06, 0.06, trim, X1 - 0.015, (d.h + 0.06) / 2, d.z + side * (d.w / 2 + 0.03)));
  group.add(box(0.03, 0.06, d.w + 0.12, trim, X1 - 0.015, d.h + 0.03, d.z));

  // Haustür: Schiebetür mitten in der Wand, Fußmatte davor
  const door = createSlidingDoor();
  door.position.set(X0 - WALL_THICKNESS / 2, 0, FRONT_DOOR.z);
  group.add(door);
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.9),
    new THREE.MeshStandardMaterial({ map: canvasTexture(320, 200, drawMat), roughness: 1 })
  );
  mat.rotation.x = -Math.PI / 2;
  mat.rotation.z = Math.PI / 2;
  mat.position.set(X0 + 0.7, 0.004, FRONT_DOOR.z);
  group.add(mat);

  const lamp = createLamp();
  lamp.position.set(CX, H, 0);
  group.add(lamp);

  enableShadows(group);
  floor.castShadow = false;
  mat.castShadow = false;
  door.traverse((o) => { o.castShadow = false; });
  mergeStatic(group, { cell: 4 }); // Unbewegliches pro Material zusammenfassen (die Schiebetür bleibt beweglich)

  // Kollision: Außenwände (die Wand zur Halle kommt aus room.js), Haustür solange zu
  const t = WALL_THICKNESS;
  const f = FRONT_DOOR;
  for (const b of [
    { minX: X0 - t, maxX: X1, minZ: Z0 - t, maxZ: Z0 },
    { minX: X0 - t, maxX: X1, minZ: Z1, maxZ: Z1 + t },
    { minX: X0 - t, maxX: X0, minZ: Z0, maxZ: f.z - f.w / 2 },
    { minX: X0 - t, maxX: X0, minZ: f.z + f.w / 2, maxZ: Z1 },
  ]) collision.addBox(b);

  let open = 0;
  let blocked = null;
  function setDoorCollision(closed) {
    if (blocked === closed) return;
    blocked = closed;
    collision.setDynamic('front-door', closed ? [{ minX: X0 - t, maxX: X0, minZ: f.z - f.w / 2, maxZ: f.z + f.w / 2 }] : []);
  }
  setDoorCollision(true);

  // visitors: Positionen (x, z), die die Tür öffnen sollen – Spieler, Kunden, Azubis
  function update(dt, visitors) {
    const near = visitors.some((p) => Math.abs(p.x - (X0 - t / 2)) < SENSOR.x && Math.abs(p.z - f.z) < SENSOR.z);
    open = THREE.MathUtils.clamp(open + (near ? 1 : -1) * (dt / SLIDE_SECONDS), 0, 1);
    const ease = open * open * (3 - 2 * open);
    for (const leaf of door.userData.leaves) {
      leaf.position.z = leaf.userData.closedZ + leaf.userData.side * ease * (f.w / 2 - 0.05);
    }
    setDoorCollision(open < 0.7);
  }

  return { group, update };
}
