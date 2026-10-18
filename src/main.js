// Grundgerüst: Szene, FPV-Steuerung, Render-Loop.
// Spiellogik (Wirtschaft, Drucker, Aufträge) kommt in eigene Module unter src/.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createKeyboard, createMouse, createMousePad, createCable } from './peripherals.js';
import { CollisionWorld } from './collision.js';
import { Economy, GAME_MINUTES_PER_SECOND } from './economy.js';
import { createHud } from './hud.js';
import { createRoom, roomColliders } from './room.js';
import { createDesktopScreen } from './desktop.js';
import { createShop } from './shop.js';
import { createStorageRoom, SHELF_CAPACITY } from './storage-room.js';
import { createWorkshop, PRINTER_SLOTS_X } from './workshop.js';
import { Carry } from './carry.js';
import { Interaction } from './interaction.js';
import { enableShadows } from './util.js';

const WALK_SPEED = 4;          // m/s
const EYE_HEIGHT = 1.7;        // m
const PLAYER_RADIUS = 0.3;     // m, Abstand des Körpers zu Hindernissen
const INTERACT_DISTANCE = 2.5; // m

const collision = new CollisionWorld();
const economy = new Economy();
createHud(economy);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true; // Druckteile werden per Schnittebene Schicht für Schicht sichtbar
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1d22);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(0, EYE_HEIGHT, 6);
scene.add(camera); // getragene Gegenstände hängen an der Kamera

// Licht: Grundhelligkeit + gerichtetes Licht für Schatten; die Deckenleuchten kommen aus room.js
scene.add(new THREE.HemisphereLight(0xfff8ee, 0x5a4a3a, 0.45));
const sun = new THREE.DirectionalLight(0xfff4e0, 0.8);
sun.position.set(5, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// Schattenbereich deckt Halle und Abstellraum ab
sun.shadow.camera.left = -17;
sun.shadow.camera.right = 17;
sun.shadow.camera.top = 17;
sun.shadow.camera.bottom = -17;
sun.shadow.bias = -0.0005;
scene.add(sun);

// Raum: Boden, Wände, Fenster, Decke mit Leuchten
const room = createRoom();
scene.add(room);
for (const b of roomColliders()) collision.addBox(b);

const TABLE_HEIGHT = 0.8;
const TOP_THICKNESS = 0.05;
const LEG_SIZE = 0.06;
const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6a4a });

// Tisch: Platte + vier Beine (je zwei pro Seite), Ursprung mittig am Boden
function createTable(width, depth) {
  const table = new THREE.Group();

  const top = new THREE.Mesh(new THREE.BoxGeometry(width, TOP_THICKNESS, depth), tableMaterial);
  top.position.y = TABLE_HEIGHT - TOP_THICKNESS / 2;
  table.add(top);

  const legHeight = TABLE_HEIGHT - TOP_THICKNESS;
  const legGeometry = new THREE.BoxGeometry(LEG_SIZE, legHeight, LEG_SIZE);
  const legX = width / 2 - LEG_SIZE;
  const legZ = depth / 2 - LEG_SIZE;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeometry, tableMaterial);
      leg.position.set(sx * legX, legHeight / 2, sz * legZ);
      table.add(leg);
    }
  }
  return table;
}

// Großer Druckertisch
const printerTable = createTable(5.6, 0.8);
enableShadows(printerTable);
scene.add(printerTable);
collision.addObject(printerTable);

// Computertisch rechts neben dem Druckertisch, mit Bildschirm oben und PC darunter
const computerDesk = createTable(1.4, 0.7);
computerDesk.position.set(4.2, 0, 0);

const caseMaterial = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.6 });

const monitor = new THREE.Group();
const monitorFoot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.16), caseMaterial);
monitorFoot.position.y = 0.01;
const monitorNeck = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), caseMaterial);
monitorNeck.position.set(0, 0.1, -0.03);
const monitorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.36, 0.04), caseMaterial);
monitorHousing.position.set(0, 0.36, -0.03);
// Bildschirm leuchtet selbst, daher unbeleuchtetes Material mit Desktop-Textur
const desktop = createDesktopScreen();
const monitorScreen = new THREE.Mesh(
  new THREE.PlaneGeometry(0.56, 0.32),
  new THREE.MeshBasicMaterial({ map: desktop.texture })
);
monitorScreen.position.set(0, 0.36, -0.009);
monitor.add(monitorFoot, monitorNeck, monitorHousing, monitorScreen);
// Bildschirm schaut zur Hallenmitte (+z), wo der Spieler startet
monitor.position.set(0, TABLE_HEIGHT, -0.1);
computerDesk.add(monitor);

const pc = new THREE.Group();
const pcCase = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.42), caseMaterial);
pcCase.position.y = 0.21;
const pcPowerLed = new THREE.Mesh(
  new THREE.CircleGeometry(0.008, 12),
  new THREE.MeshStandardMaterial({ color: 0x00ff66, emissive: 0x00ff66, emissiveIntensity: 1.5 })
);
pcPowerLed.position.set(0, 0.38, 0.211);
pc.add(pcCase, pcPowerLed);
pc.position.set(0.4, 0, 0);
computerDesk.add(pc);

// Tastatur vor dem Bildschirm, hinten leicht angehoben
const keyboard = createKeyboard();
keyboard.position.set(-0.05, TABLE_HEIGHT + 0.004, 0.15);
keyboard.rotation.x = 0.05;
computerDesk.add(keyboard);

// Mauspad mit Maus rechts daneben, Maus zeigt mit den Tasten zum Bildschirm
const mousePad = createMousePad();
mousePad.position.set(0.36, TABLE_HEIGHT, 0.15);
computerDesk.add(mousePad);

const mouse = createMouse();
mouse.position.set(0.36, TABLE_HEIGHT + mousePad.userData.height, 0.17);
mouse.rotation.y = Math.PI;
computerDesk.add(mouse);

// Kabel: über die hintere Tischkante nach unten zum PC
const keyboardBackZ = 0.15 - keyboard.userData.size.depth / 2;
computerDesk.add(createCable([
  [-0.05, TABLE_HEIGHT + 0.012, keyboardBackZ + 0.004],
  [-0.1, TABLE_HEIGHT + 0.003, keyboardBackZ - 0.04],
  [-0.18, TABLE_HEIGHT + 0.003, -0.1],   // links am Monitorfuß vorbei
  [-0.08, TABLE_HEIGHT + 0.003, -0.3],
  [0.08, TABLE_HEIGHT - 0.01, -0.36],
  [0.25, 0.5, -0.32],
  [0.38, 0.3, -0.215],
]));

const mouseFrontZ = 0.17 - mouse.userData.cableExit.z;
computerDesk.add(createCable([
  [0.36, TABLE_HEIGHT + mousePad.userData.height + mouse.userData.cableExit.y, mouseFrontZ],
  [0.36, TABLE_HEIGHT + 0.005, mouseFrontZ - 0.03],
  [0.3, TABLE_HEIGHT + 0.003, -0.12],
  [0.25, TABLE_HEIGHT + 0.003, -0.3],
  [0.2, TABLE_HEIGHT - 0.01, -0.36],
  [0.32, 0.5, -0.3],
  [0.42, 0.3, -0.215],
]));

enableShadows(computerDesk);
scene.add(computerDesk);
collision.addObject(computerDesk); // inkl. PC darunter und Kabel dahinter

// Getragener Gegenstand, Druckertisch (Aufstellen, Filament einlegen), Abstellraum (Lieferungen)
const carry = new Carry(camera, economy, document.getElementById('carry-info'));
const workshop = createWorkshop({ table: printerTable, tableHeight: TABLE_HEIGHT, economy, carry });
scene.add(workshop.group);
const storage = createStorageRoom({ economy, carry, collision });
scene.add(storage.group);
economy.subscribe(() => {
  workshop.sync();
  storage.sync();
});

// FPV-Steuerung
const controls = new PointerLockControls(camera, document.body);
const overlay = document.getElementById('start-overlay');
overlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => overlay.classList.add('hidden'));
controls.addEventListener('unlock', () => {
  if (!shop.isOpen()) overlay.classList.remove('hidden');
});

// Shop: Linksklick auf den PC öffnet ihn, Schließen kehrt ins Spiel zurück
const shop = createShop(economy, {
  // Platz ist für so viele Drucker, wie der Tisch Stellplätze hat – egal ob schon aufgestellt
  freePrinterSlots: () => PRINTER_SLOTS_X.length - economy.printers.length,
  freeShelfSpace: () => SHELF_CAPACITY - economy.spoolsInStorage,
  onClose: () => {
    overlay.classList.remove('hidden'); // falls das erneute Sperren der Maus scheitert
    controls.lock();
  },
});

const pcInteraction = {
  hint: () => 'Linksklick: PC benutzen (Shop & Druckermenü)',
  action: () => {
    shop.open();
    controls.unlock();
  },
};
for (const part of [monitor, pc, keyboard, mouse]) part.userData.interaction = pcInteraction;

// Alles, was der Klickstrahl treffen kann – Wände und Möbel verdecken, was dahinter liegt
const interaction = new Interaction({
  camera,
  distance: INTERACT_DISTANCE,
  hintEl: document.getElementById('interact-hint'),
  targets: [room, storage.group, printerTable, computerDesk, workshop.group],
});

document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && controls.isLocked) interaction.click();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && shop.isOpen()) shop.close();
  if (e.code === 'KeyQ' && controls.isLocked) carry.returnToStorage();
});

const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));

function updateMovement(dt) {
  if (!controls.isLocked) return;
  const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  if (forward === 0 && right === 0) return;

  const len = Math.hypot(forward, right);
  controls.moveForward((forward / len) * WALK_SPEED * dt);
  controls.moveRight((right / len) * WALK_SPEED * dt);

  collision.resolve(camera.position, PLAYER_RADIUS);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  economy.advancePrints(dt * GAME_MINUTES_PER_SECOND); // Drucke laufen auch bei offenem PC-Fenster weiter
  workshop.animate(dt);
  updateMovement(dt);
  interaction.update(controls.isLocked);
  renderer.render(scene, camera);
});
