// Zweite Etage über der Halle (Ausbau, core/upgrades.js): gleich groß wie die Halle, erstmal leer. Hinauf geht es über
// eine Treppe an der Ostwand (rechts hinten), später auch mit dem Fahrstuhl daneben an der Nordwand.
// Gebaut wird erst, wenn die Etage geliefert ist: Dann ersetzt eine Zwischendecke mit Treppenloch die Hallendecke,
// das Hallendach verschwindet und das Gebäude bekommt von außen ein zweites Stockwerk.
// Die Spielfigur läuft auf Stockwerken (level 0 = Halle, 1 = zweite Etage): footing() sagt, wie hoch der Boden unter
// ihr ist und auf welchem Stockwerk sie danach steht; Hindernisse gelten je Stockwerk (world/collision.js).
import * as THREE from 'three';
import {
  ROOM_HEIGHT, ROOM_SIZE, WALL_THICKNESS, ceilingMaterial, createCeilingLight, createHallWall, floorMaterial,
} from './room.js';
import { PARAPET, ROOF, facade, facadeMaterials, roof } from './outdoor.js';

const HALF = ROOM_SIZE / 2;
const T = WALL_THICKNESS;
export const FLOOR_Y = ROOM_HEIGHT + ROOF; // Fußboden der zweiten Etage (Oberkante der Zwischendecke)
// Treppe an der Ostwand: unten im Süden (zLow), oben im Norden (zHigh), darüber das Treppenloch
export const STAIRS = { x0: HALF - 1.25, x1: HALF - 0.05, zLow: -2.0, zHigh: -7.6 };
// Fahrstuhlschacht an der Nordwand links neben dem Treppenabsatz, Tür nach Süden
export const ELEVATOR = { x0: 7.1, x1: STAIRS.x0 - 0.05, z0: -HALF, z1: -8.6 };
const STEPS = 20;
const RAIL = 0.05;          // Dicke der Geländer (als Hindernis)
const RAIL_HEIGHT = 1.0;
const LIGHT_ON = 22;        // Helligkeit der Deckenspots oben, sobald die Etage steht
const LIGHTS_X = [-6, 0, 6];

const box = (w, h, d, material, x, y, z) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

// Rechteck (Halle) mit Loch (Treppe) als Fläche; flip: Unterseite (Decke der Halle) statt Oberseite
function slabSurface(material, y, flip) {
  const s = flip ? 1 : -1; // ShapeGeometry liegt in x/y – nach dem Kippen wird y zu ∓z
  const shape = new THREE.Shape([
    new THREE.Vector2(-HALF, -HALF), new THREE.Vector2(HALF, -HALF), new THREE.Vector2(HALF, HALF), new THREE.Vector2(-HALF, HALF),
  ]);
  const { x0, x1, zLow, zHigh } = STAIRS;
  shape.holes.push(new THREE.Path([
    new THREE.Vector2(x0, s * zHigh), new THREE.Vector2(x1, s * zHigh), new THREE.Vector2(x1, s * zLow), new THREE.Vector2(x0, s * zLow),
  ]));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.rotation.x = flip ? Math.PI / 2 : -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

// Geländer entlang einer Strecke (a → b, je { x, y, z } am Fuß): Handlauf oben, Pfosten etwa alle 1,2 m
function railing(material, a, b) {
  const g = new THREE.Group();
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const posts = Math.max(2, Math.ceil(len / 1.2) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    g.add(box(0.04, RAIL_HEIGHT, 0.04, material, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + RAIL_HEIGHT / 2, a.z + (b.z - a.z) * t));
  }
  const handrail = box(0.06, 0.05, len, material, (a.x + b.x) / 2, (a.y + b.y) / 2 + RAIL_HEIGHT, (a.z + b.z) / 2);
  handrail.lookAt(b.x, b.y + RAIL_HEIGHT, b.z);
  g.add(handrail);
  return g;
}

function createStairs() {
  const g = new THREE.Group();
  const { x0, x1, zLow, zHigh } = STAIRS;
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.85 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x9b6a3c, roughness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.4, metalness: 0.6 });
  const rise = FLOOR_Y / STEPS;
  const tread = (zLow - zHigh) / STEPS;
  const width = x1 - x0;
  for (let i = 0; i < STEPS; i++) {
    const top = (i + 1) * rise;
    const z = zLow - (i + 0.5) * tread;
    g.add(box(width, top - 0.02, tread, concrete, (x0 + x1) / 2, (top - 0.02) / 2, z));
    g.add(box(width, 0.03, tread + 0.02, wood, (x0 + x1) / 2, top - 0.015, z)); // Holzauflage mit kleiner Kante
  }
  // Treppengeländer auf der offenen Seite
  g.add(railing(metal, { x: x0 + 0.03, y: 0, z: zLow }, { x: x0 + 0.03, y: FLOOR_Y, z: zHigh }));
  return g;
}

// Ebenso hoch wie die Halle, mit Fenstern wie unten
function createUpperRoom() {
  const g = new THREE.Group();
  g.add(slabSurface(floorMaterial(1 / 1.6), FLOOR_Y, false));
  g.add(slabSurface(ceilingMaterial(8 / ROOM_SIZE), ROOM_HEIGHT, true));
  // Kanten des Treppenlochs
  const { x0, x1, zLow, zHigh } = STAIRS;
  const edge = new THREE.MeshStandardMaterial({ color: 0xe9e3d8, roughness: 0.9 });
  const h = FLOOR_Y - ROOM_HEIGHT;
  const y = ROOM_HEIGHT + h / 2;
  g.add(box(0.02, h, zLow - zHigh, edge, x0, y, (zLow + zHigh) / 2), box(x1 - x0, h, 0.02, edge, (x0 + x1) / 2, y, zLow));
  // Zwischen Hallenwand (bis ROOM_HEIGHT) und Wand oben (ab FLOOR_Y) bliebe am Treppenloch ein Spalt nach draußen
  g.add(box(0.04, h + 0.1, zLow - zHigh, edge, HALF - 0.02, y, (zLow + zHigh) / 2));

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), ceilingMaterial());
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = FLOOR_Y + ROOM_HEIGHT;
  g.add(ceiling);
  const walls = [
    { pos: [0, FLOOR_Y, -HALF], rotY: 0, windows: [-6, 0, 6] },
    { pos: [0, FLOOR_Y, HALF], rotY: Math.PI, windows: [-6, 0, 6] },
    { pos: [-HALF, FLOOR_Y, 0], rotY: Math.PI / 2, windows: [-4, 4] },
    { pos: [HALF, FLOOR_Y, 0], rotY: -Math.PI / 2, windows: [-4, 4] },
  ];
  for (const w of walls) {
    const wall = createHallWall(ROOM_SIZE, w.windows);
    wall.position.set(...w.pos);
    wall.rotation.y = w.rotY;
    // Fensterrahmen werfen sonst Sonnenschatten durch die Wände (die selbst keinen werfen) – als schräge Streifen
    // unten an den Hallenwänden
    wall.traverse((o) => { o.castShadow = false; });
    g.add(wall);
  }
  // Leuchten wie unten, aber ohne eigenes Licht – das kommt von den fest angelegten Spots (siehe createUpperFloor)
  for (const x of [-6, 0, 6]) {
    for (const z of [-4, 4]) {
      const lamp = createCeilingLight();
      for (const light of lamp.children.filter((o) => o.isLight)) lamp.remove(light, light.target);
      lamp.position.set(x, FLOOR_Y + ROOM_HEIGHT, z);
      g.add(lamp);
    }
  }
  // Geländer um das Treppenloch: an der offenen Seite und am Südende
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.4, metalness: 0.6 });
  g.add(railing(metal, { x: x0 - 0.02, y: FLOOR_Y, z: zHigh }, { x: x0 - 0.02, y: FLOOR_Y, z: zLow }));
  g.add(railing(metal, { x: x0 - 0.02, y: FLOOR_Y, z: zLow + 0.02 }, { x: x1, y: FLOOR_Y, z: zLow + 0.02 }));
  return g;
}

// Zweites Stockwerk von außen: Fassaden ab der Oberkante der Halle und ein neues Dach
function createExterior() {
  const g = new THREE.Group();
  const m = facadeMaterials();
  const base = ROOM_HEIGHT + ROOF + PARAPET;
  const height = FLOOR_Y + ROOM_HEIGHT + ROOF + PARAPET - base;
  const N = (x, z) => new THREE.Vector3(x, 0, z);
  const P = (x, z) => ({ x, z });
  const facades = new THREE.Group();
  // Fenster auf derselben Höhe wie innen (1,7 m über dem Boden oben) – sonst schauen die dunklen Scheiben
  // oberhalb der Innenfenster durch die Wand
  const windowY = FLOOR_Y + 1.7 - base;
  facades.add(
    facade(m, P(-HALF, -HALF), P(HALF, -HALF), N(0, -1), height, { windows: [HALF - 6, HALF, HALF + 6], windowY }),
    facade(m, P(-HALF, HALF), P(HALF, HALF), N(0, 1), height, { windows: [HALF - 6, HALF, HALF + 6], windowY }),
    facade(m, P(-HALF, -HALF), P(-HALF, HALF), N(-1, 0), height, { windows: [HALF - 4, HALF + 4], windowY }),
    facade(m, P(HALF, -HALF), P(HALF, HALF), N(1, 0), height, { windows: [HALF - 4, HALF + 4], windowY }),
  );
  facades.position.y = base;
  g.add(facades, roof(m, -HALF, HALF, -HALF, HALF, FLOOR_Y + ROOM_HEIGHT + ROOF));
  // Keine Schatten werfen: Rahmen, Bänke und Leisten des oberen Stockwerks fielen sonst als schräge Streifen innen an
  // die Hallenwände (die Außenwelt ist durch die Eingangstür oft sichtbar und zählt dann zur Schattenkarte)
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = true;
  });
  return g;
}

// Fahrstuhlschacht über beide Stockwerke, an jeder Haltestelle Tür und Ruftaster. onRide(level): Fahrt auf das
// andere Stockwerk (main.js blendet ab und versetzt die Spielfigur)
function createElevator(onRide) {
  const g = new THREE.Group();
  const { x0, x1, z0, z1 } = ELEVATOR;
  const cx = (x0 + x1) / 2;
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.8 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.5, metalness: 0.5 });
  const top = FLOOR_Y + ROOM_HEIGHT;
  g.add(box(x1 - x0, top, z1 - z0, shaftMat, cx, top / 2, (z0 + z1) / 2));
  for (const level of [0, 1]) {
    const y = level * FLOOR_Y;
    const stop = new THREE.Group();
    stop.add(
      box(1.1, 2.25, 0.04, frame, cx, y + 1.125, z1 + 0.02),
      box(0.48, 2.1, 0.03, steel, cx - 0.245, y + 1.05, z1 + 0.05),
      box(0.48, 2.1, 0.03, steel, cx + 0.245, y + 1.05, z1 + 0.05),
    );
    // Ruftaster rechts neben der Tür: Pfeil leuchtet in Fahrtrichtung
    const panel = box(0.1, 0.18, 0.03, frame, cx + 0.68, y + 1.2, z1 + 0.03);
    const arrow = new THREE.Mesh(new THREE.CircleGeometry(0.03, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7cc4ff).multiplyScalar(2) }));
    arrow.rotation.z = level ? -Math.PI / 2 : Math.PI / 2; // Dreieck nach oben bzw. unten
    arrow.position.set(cx + 0.68, y + 1.2, z1 + 0.046);
    stop.add(panel, arrow);
    const target = 1 - level;
    stop.userData.interaction = {
      hint: () => `Linksklick: mit dem Fahrstuhl ${target ? 'nach oben' : 'nach unten'}`,
      action: () => onRide(target),
    };
    g.add(stop);
  }
  return g;
}

// upgrades: Ausbau-Stand · collision: Kollision der Spielfigur · room: Halle (Decke) · outdoor: Außenbereich (Dach,
// Fassaden) · onRide(level): Fahrstuhl wurde gerufen
export function createUpperFloor({ upgrades, collision, room, outdoor, onRide }) {
  const group = new THREE.Group();
  // Licht oben: von Anfang an da (nur ohne Helligkeit), damit sich die Zahl der Lichter nie ändert – sonst übersetzt
  // three.js beim Kauf alle Shader neu (siehe world/hall-lights.js)
  const lights = LIGHTS_X.map((x) => {
    const light = new THREE.SpotLight(0xfff1dc, 0, 14, Math.PI * 0.45, 0.8, 2);
    light.position.set(x, FLOOR_Y + ROOM_HEIGHT - 0.1, 0);
    light.target.position.set(x, 0, 0);
    group.add(light, light.target);
    return light;
  });
  let built = false;
  let elevatorBuilt = false;

  function colliders() {
    const { x0, x1, zLow, zHigh } = STAIRS;
    const h = HALF;
    const boxes = [
      // Erdgeschoss: Treppe nur von vorn (Süden) betreten – Geländer an der offenen Seite, hinten zu
      { minX: x0 - RAIL, maxX: x0, minZ: zHigh - RAIL, maxZ: zLow, level: 0 },
      { minX: x0, maxX: x1, minZ: zHigh - RAIL, maxZ: zHigh, level: 0 },
      // Zweite Etage: Außenwände ohne Türen, Geländer um das Treppenloch (oben offen, dort kommt die Treppe an)
      { minX: -h - T, maxX: h + T, minZ: -h - T, maxZ: -h, level: 1 },
      { minX: -h - T, maxX: h + T, minZ: h, maxZ: h + T, level: 1 },
      { minX: -h - T, maxX: -h, minZ: -h, maxZ: h, level: 1 },
      { minX: h, maxX: h + T, minZ: -h, maxZ: h, level: 1 },
      { minX: x0 - RAIL, maxX: x0, minZ: zHigh, maxZ: zLow + RAIL, level: 1 },
      { minX: x0, maxX: x1, minZ: zLow, maxZ: zLow + RAIL, level: 1 },
    ];
    if (elevatorBuilt) {
      const { x0: ex0, x1: ex1, z0, z1 } = ELEVATOR;
      for (const level of [0, 1]) boxes.push({ minX: ex0, maxX: ex1, minZ: z0, maxZ: z1, level });
    }
    return boxes;
  }

  // Ausbau-Stand übernehmen: Etage bzw. Fahrstuhl bauen, sobald sie geliefert sind (auch beim Laden eines Spielstands)
  function sync() {
    if (upgrades.upperFloor && !built) {
      built = true;
      group.add(createUpperRoom(), createStairs());
      outdoor.group.add(createExterior());
      room.userData.ceiling.visible = false;
      if (room.userData.stairWindow) room.userData.stairWindow.visible = false; // läge hinter der Treppe
      outdoor.hallRoof.visible = false;
      for (const light of lights) light.intensity = LIGHT_ON;
    }
    if (upgrades.elevator && built && !elevatorBuilt) {
      elevatorBuilt = true;
      group.add(createElevator(onRide));
    }
    if (built) collision.setDynamic('upper-floor', colliders());
  }
  upgrades.subscribe(sync);

  // Boden unter der Figur bei (x, z), wenn sie bisher auf Stockwerk level stand: { y, level }. Auf der Treppe steigt
  // der Boden gleichmäßig an; ab halber Höhe zählt sie zur zweiten Etage.
  function footing(x, z, level) {
    if (!built) return { y: 0, level: 0 };
    const { x0, x1, zLow, zHigh } = STAIRS;
    if (x > x0 && x < x1 && z < zLow && z > zHigh) {
      const y = THREE.MathUtils.clamp((zLow - z) / (zLow - zHigh), 0, 1) * FLOOR_Y;
      return { y, level: y > FLOOR_Y / 2 ? 1 : 0 };
    }
    return { y: level * FLOOR_Y, level };
  }

  // Wo man nach der Fahrt aus dem Fahrstuhl tritt (vor der Tür, Blick in die Halle)
  const elevatorExit = (level) => ({ x: (ELEVATOR.x0 + ELEVATOR.x1) / 2, y: level * FLOOR_Y, z: ELEVATOR.z1 + 0.7 });

  return { group, footing, elevatorExit, get built() { return built; } };
}
