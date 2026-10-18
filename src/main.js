// Grundgerüst: Szene, FPV-Steuerung, Render-Loop.
// Spiellogik (Wirtschaft, Drucker, Aufträge) kommt in eigene Module unter src/.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createKeyboard, createMouse, createMousePad, createCable } from './models/peripherals.js';
import { CollisionWorld } from './world/collision.js';
import { Economy, GAME_MINUTES_PER_SECOND } from './core/economy.js';
import { Orders, REGULAR_STARS } from './core/orders.js';
import { Progress } from './core/progress.js';
import { Upgrades } from './core/upgrades.js';
import { GameClock } from './core/game-clock.js';
import { createHall } from './world/hall.js';
import { Achievements } from './core/achievements.js';
import { hasSave, loadGame, deleteSave, startAutosave } from './core/save.js';
import { createTitleScreen } from './ui/title-screen.js';
import { createHud } from './ui/hud.js';
import { createRoom, roomColliders } from './world/room.js';
import { createDesktopScreen } from './ui/desktop.js';
import { createShop } from './ui/shop.js';
import { createStorageRoom } from './world/storage-room.js';
import { createWorkshop } from './world/workshop.js';
import { Carry } from './world/carry.js';
import { createCat } from './world/cat.js';
import { createSound } from './audio/sound.js';
import { Interaction } from './world/interaction.js';
import { createPrinterCam } from './ui/printer-cam.js';
import { enableShadows } from './world/util.js';
import { PRINTERS, speedById } from './core/catalog.js';
import { setupGraphics, loadQuality, saveQuality, gpuInfo } from './world/graphics.js';

const WALK_SPEED = 4;          // m/s
const EYE_HEIGHT = 1.7;        // m
const PLAYER_RADIUS = 0.3;     // m, Abstand des Körpers zu Hindernissen
const INTERACT_DISTANCE = 2.5; // m

const collision = new CollisionWorld();
const economy = new Economy();
const progress = new Progress();
const orders = new Orders(economy, progress);
const achievements = new Achievements();
const upgrades = new Upgrades(economy);
const gameClock = new GameClock();
const game = { economy, orders, progress, achievements, upgrades, clock: gameClock };
const saveFound = hasSave();
if (saveFound) {
  loadGame(game);
} else {
  // Startausstattung: ein A1 mini steht schon auf dem ersten Tisch
  const starter = economy.addPrinter(PRINTERS.find((m) => m.id === 'a1-mini'));
  economy.placePrinter(starter.id, 0);
}
const hud = createHud(economy, orders, progress, gameClock);
// Zu jeder vollen Spielstunde Miete und Strom abbuchen
gameClock.onNewHour = () => economy.payHourlyBill();
const sound = createSound();
progress.onLevelUp = (level, title) => {
  hud.showLevelUp(level, title);
  sound.play('achievement');
};
achievements.onUnlock = (a) => {
  hud.showAchievement(a);
  sound.play('achievement');
};
// Getragene Spulen (carry wird weiter unten angelegt) landen beim Speichern im Regal
const autosave = startAutosave(game, hud.showSaved, () => ({
  spools: carry.spools,
  nozzles: carry.nozzle ? 1 : 0,
}));

// Spielereignisse → Meldungen, Geräusche und Erfolge
economy.onEvent = (type, d) => {
  const name = d.printer?.model.name;
  switch (type) {
    case 'print-started':
      achievements.max('maxPrinting', d.printing);
      break;
    case 'print-done':
      hud.notify(`✔ ${name}: ${d.count > 1 ? `${d.count} × ` : ''}${d.template.name} fertig`, 'good');
      sound.play('done');
      achievements.add('printsDone');
      achievements.add('grams', d.template.grams * d.count);
      if (d.template.id === 'benchy') achievements.add('benchys', d.count);
      if (d.speedId === 'ludicrous') achievements.add('ludicrousDone');
      break;
    case 'print-failed':
      hud.notify(`⚠️ ${name}: Fehldruck – ${d.info.name}! Am Drucker nachsehen.`, 'bad');
      sound.play('error');
      achievements.add('failures');
      if (d.failure === 'spaghetti') achievements.add('spaghetti');
      break;
    case 'out-of-filament':
      hud.notify(`🧵 ${name}: Filament leer – neue Spule ${d.filament.material} ${d.filament.color} einlegen`, 'bad');
      sound.play('warn');
      break;
    case 'ams-refill':
      hud.notify(`🔁 ${name}: Spule leer – das AMS lädt aus Fach ${d.slot + 1} nach`, 'info');
      achievements.add('amsRefills');
      break;
    case 'print-resumed':
      hud.notify(`▶ ${name} druckt weiter`, 'info');
      break;
    case 'nozzle-poke':
      sound.play('poke');
      break;
    case 'bed-cleared':
    case 'part-collected':
    case 'part-picked':
      sound.play('pop');
      break;
    case 'nozzle-worn':
      hud.notify(`🔧 ${name}: Düse ist abgenutzt – Fehldrucke werden häufiger. Ersatzdüse bereitlegen!`, 'bad');
      sound.play('warn');
      break;
    case 'nozzle-dead':
      hud.notify(`🔧 ${name}: Düse verschlissen – ohne Ersatzdüse startet kein neuer Druck`, 'bad');
      sound.play('error');
      break;
    case 'nozzle-replaced':
      hud.notify(`🔩 ${name}: neue Düse eingebaut`, 'good');
      sound.play('pop');
      achievements.add('nozzlesReplaced');
      break;
    case 'nozzle-cleared':
      hud.notify(`🪡 ${name}: Düse wieder frei`, 'good');
      sound.play('pop');
      achievements.add('nozzlesCleared');
      break;
    case 'bill':
      sound.play('bill');
      if (economy.money < 0) achievements.max('overdraft', 1);
      break;
  }
};

orders.onEvent = (type, d) => {
  const { order } = d;
  if (type === 'delivered') {
    sound.play('cash');
    achievements.add('deliveries');
    if (order.rush) achievements.add('rushDeliveries');
    if (order.special && order.customer === 'Jonas (12)') achievements.add('jonas');
    if (d.stars >= REGULAR_STARS) achievements.max('regulars', 1);
  } else if (type === 'expired') {
    hud.notify(`⌛ Auftrag von ${order.customer} verfallen – Kunde verärgert (−1 Stern)`, 'bad');
    sound.play('error');
  } else if (type === 'new-order') {
    hud.notify(`📋 Neuer Auftrag von ${order.customer}${order.rush ? ' – EILT!' : ''}`, 'info');
  }
};

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

// Licht: Grundhelligkeit + gerichtetes Licht für Schatten; die Deckenleuchten kommen aus room.js,
// Spiegelungen aus der Umgebung in graphics.js
scene.add(new THREE.HemisphereLight(0xfff8ee, 0x5a4a3a, 0.3));
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

// Drucktische: der erste steht von Anfang an, weitere kauft man (hall.js)
const hall = createHall({ createTable, collision, upgrades });
scene.add(hall.group);

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
  new THREE.MeshStandardMaterial({ color: 0x00ff66, emissive: 0x00ff66, emissiveIntensity: 4 })
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
const workshop = createWorkshop({ tables: hall.tables, tableHeight: TABLE_HEIGHT, economy, carry, upgrades });
scene.add(workshop.group);
const storage = createStorageRoom({ economy, carry, collision, upgrades });
scene.add(storage.group);

// Kater Düsentrieb streunt durch die Halle
const cat = createCat({
  economy,
  tableHeight: TABLE_HEIGHT,
  onEvent: (type) => {
    if (type === 'pet') {
      sound.play('purr');
      achievements.add('catPets');
    } else if (type === 'meow') {
      sound.play('meow');
    } else if (type === 'knock') {
      hud.notify('😼 Kater Düsentrieb hat ein fertiges Teil vom Tisch geworfen! Es liegt vor dem Drucker.', 'bad');
      sound.play('clunk');
      achievements.add('knocked');
    }
  },
});
scene.add(cat.group);
economy.subscribe(() => {
  workshop.sync();
  storage.sync();
});

// FPV-Steuerung
const controls = new PointerLockControls(camera, document.body);
const overlay = document.getElementById('start-overlay');
const quality = loadQuality();
const title = createTitleScreen({
  overlay,
  hasSave: saveFound,
  quality,
  gpu: gpuInfo(renderer),
  onPlay: () => controls.lock(),
  onNewGame: () => {
    autosave.disable();
    deleteSave();
    location.reload();
  },
  onQuality: (q) => {
    autosave.save();
    saveQuality(q);
    location.reload();
  },
});
controls.addEventListener('lock', () => {
  title.hide();
  sound.unlock(); // Browser erlauben Ton erst nach einer Nutzeraktion
});
controls.addEventListener('unlock', () => {
  if (!shop.isOpen()) {
    title.show(true);
    autosave.save(); // beim Pausieren gleich sichern
  }
});

// Shop: Linksklick auf den PC öffnet ihn, Schließen kehrt ins Spiel zurück
// Live-Bild der Drucker für die PC-App
const printerCam = createPrinterCam({ renderer, scene, economy, workshop });

const shop = createShop(economy, {
  orders,
  achievements,
  cam: printerCam,
  upgrades,
  // Platz ist für so viele Drucker, wie der Tisch Stellplätze hat – egal ob schon aufgestellt
  // Platz ist für so viele Drucker, wie die gekauften Tische Stellplätze haben – egal ob schon aufgestellt
  freePrinterSlots: () => upgrades.printerSlots - economy.printers.length,
  freeShelfSpace: () => upgrades.shelfCapacity - economy.spoolsInStorage - carry.spools.length,
  onClose: () => {
    if (gameOver) return; // Pleite: Maus nicht wieder einfangen
    title.show(true); // falls das erneute Sperren der Maus scheitert
    controls.lock();
  },
});

const pcInteraction = {
  hint: () => 'Linksklick: PC benutzen (Shop, Aufträge, Ausbau & Druckermenü)',
  action: () => {
    shop.open();
    controls.unlock();
  },
};
for (const part of [monitor, pc, keyboard, mouse]) part.userData.interaction = pcInteraction;

const hintEl = document.getElementById('interact-hint');
const crosshair = document.getElementById('crosshair');

// Alles, was der Klickstrahl treffen kann – Wände und Möbel verdecken, was dahinter liegt
const interaction = new Interaction({
  camera,
  distance: INTERACT_DISTANCE,
  hintEl,
  targets: [room, storage.group, hall.group, computerDesk, workshop.group, cat.group],
});

document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && controls.isLocked) interaction.click();
});

// Mausrad: welche Spule aus der Hand als Nächstes eingelegt wird
document.addEventListener('wheel', (e) => {
  if (controls.isLocked) carry.cycle(Math.sign(e.deltaY));
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && shop.isOpen()) shop.close();
  if (e.code === 'KeyQ' && controls.isLocked) carry.returnToStorage();
  if (e.code === 'KeyM' && !e.repeat && !shop.isOpen()) {
    sound.toggleMute();
    hud.notify(sound.muted ? '🔇 Ton aus' : '🔊 Ton an', 'info');
  }
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

const graphics = setupGraphics(renderer, scene, camera, quality);

// Shader vorab im Hintergrund übersetzen. Sonst übersetzt three.js sie erst, wenn ein Objekt zum ersten Mal
// ins Bild kommt – unter Windows (ANGLE → Direct3D) dauert das spürbar, das Spiel steht so lange und
// Tastendrücke kommen erst Sekunden später an. Mehrere Aufrufe kurz hintereinander werden zusammengefasst.
let compileQueued = false;
function precompileShaders() {
  if (compileQueued) return;
  compileQueued = true;
  setTimeout(() => {
    compileQueued = false;
    renderer.compileAsync(scene, camera).catch(() => { /* dann eben beim ersten Zeichnen */ });
  }, 50);
}
economy.subscribe(precompileShaders); // sofort und wenn neue Drucker, Teile, Spaghetti … dazukommen

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  graphics.setSize(window.innerWidth, window.innerHeight); // passt auch Renderer und Pixeldichte an
});

// Geräusche der druckenden Drucker: lauter, je näher man steht
const printerPos = new THREE.Vector3();
function printerSounds(dt) {
  sound.updatePrinters(economy.printers.filter((p) => p.location === 'table').map((p) => {
    const pos = workshop.printerPosition(p.id);
    if (pos) printerPos.copy(pos).setY(TABLE_HEIGHT);
    return {
      id: p.id,
      printing: p.job?.status === 'printing' && !!pos,
      speed: speedById(p.speedId).percent / 100,
      distance: pos ? camera.position.distanceTo(printerPos) : 99,
    };
  }), dt);
}

// Pleite: Spielstand löschen, nur noch „Neues Spiel“
let gameOver = false;
function checkBankrupt() {
  if (gameOver || !economy.bankrupt) return;
  gameOver = true;
  autosave.disable();
  deleteSave();
  shop.close();
  controls.unlock();
  title.showGameOver({ day: gameClock.day, ...achievements.stats });
}

const frameClock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(frameClock.getDelta(), 0.1);
  // Zeit, Drucke und Auftragsfristen laufen auch bei offenem PC-Fenster weiter – nur die Pause hält sie an
  const paused = !controls.isLocked && !shop.isOpen();
  if (!gameOver && !paused) {
    const gameMinutes = dt * GAME_MINUTES_PER_SECOND;
    economy.advanceTime(gameMinutes);
    economy.advancePrints(gameMinutes);
    orders.advance(gameMinutes);
    gameClock.advance(gameMinutes);
    checkBankrupt();
  }
  workshop.animate(dt);
  cat.update(dt);
  hud.update();
  printerSounds(dt);
  updateMovement(dt);
  interaction.update(controls.isLocked);
  crosshair.classList.toggle('active', !hintEl.classList.contains('hidden'));
  graphics.render(dt);
  printerCam.update(dt);
});
