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
import { Staff } from './core/staff.js';
import { Reception } from './core/reception.js';
import { filamentLabel } from './core/catalog.js';
import { GameClock } from './core/game-clock.js';
import { createHall } from './world/hall.js';
import { Achievements } from './core/achievements.js';
import { hasSave, loadGame, deleteSave, startAutosave } from './core/save.js';
import { createTouchControls, loadDevice, saveDevice, suggestedDevice, tabletText } from './ui/touch-controls.js';
import { createTitleScreen } from './ui/title-screen.js';
import { createHud } from './ui/hud.js';
import { createRoom, roomColliders } from './world/room.js';
import { createDesktopScreen } from './ui/desktop.js';
import { createShop } from './ui/shop.js';
import { createStorageRoom } from './world/storage-room.js';
import { createWorkshop } from './world/workshop.js';
import { createDisplayWall } from './world/display-wall.js';
import { createHallLights } from './world/hall-lights.js';
import { Carry } from './world/carry.js';
import { createCat } from './world/cat.js';
import { createThrowing } from './world/throwing.js';
import { createWorkers } from './world/workers.js';
import { createOffice } from './world/office.js';
import { createEntrance } from './world/entrance.js';
import { createOutdoor } from './world/outdoor.js';
import { createPedestrians } from './world/pedestrians.js';
import { RECEPTION_SPOTS, createReceptionDesk } from './world/reception.js';
import { createCustomers } from './world/customers.js';
import { createRoomCulling } from './world/room-culling.js';
import { createUpperFloor } from './world/upper-floor.js';
import { createServerRoom } from './world/server-room.js';
import { createRackPanel } from './ui/rack-panel.js';
import { Servers } from './core/servers.js';
import { ServerClimate } from './core/server-climate.js';
import { ServerRentals } from './core/server-rentals.js';
import { createScreenFade } from './ui/screen-fade.js';
import { createReceptionist } from './world/receptionist.js';
import { onPersonLoaded } from './models/people.js';
import { createSound } from './audio/sound.js';
import { Interaction } from './world/interaction.js';
import { createPrinterCam } from './ui/printer-cam.js';
import { createPerfOverlay } from './ui/perf-overlay.js';
import { enableShadows } from './world/util.js';
import { createZoom } from './world/zoom.js';
import { mergeStatic } from './models/merge-static.js';
import { setupGraphics, loadQuality, saveQuality, gpuInfo, antialias } from './world/graphics.js';

const WALK_SPEED = 4;          // m/s
const EYE_HEIGHT = 1.7;        // m
const SNEAK_EYE_HEIGHT = 1.2;  // m – geduckt, solange C gedrückt ist
const SNEAK_SPEED = 0.4;       // Anteil der Laufgeschwindigkeit beim Schleichen
const CROUCH_RATE = 8;         // wie schnell man in die Hocke geht bzw. aufsteht (1/s)
const PLAYER_RADIUS = 0.3;     // m, Abstand des Körpers zu Hindernissen
const MAX_STEP = 0.1;          // m pro Kollisionsschritt – deutlich unter PLAYER_RADIUS, sonst läuft man durch Wände
const MAX_MOVE_DT = 1 / 30;    // s – länger dauernde Bilder (Ruckler) bewegen die Figur nicht weiter als das
const INTERACT_DISTANCE = 2.5; // m

const collision = new CollisionWorld();
const economy = new Economy();
const progress = new Progress();
const orders = new Orders(economy, progress);
const achievements = new Achievements();
const upgrades = new Upgrades(economy);
const gameClock = new GameClock();
const staff = new Staff(economy);
const reception = new Reception(orders);
staff.reception = reception; // Azubis packen fertige Aufträge ins Abholregal
const servers = new Servers(economy); // Serverraum in der zweiten Etage
const climate = new ServerClimate(economy, servers); // Lüfter und Temperaturen der Schränke und Geräte
// VMs an Kunden vermieten – einzige Einnahmequelle der Server
const rentals = new ServerRentals(economy, servers, upgrades);
rentals.maxWaiting = 1 + RECEPTION_SPOTS.chairs.length; // höchstens so viele Wartende, wie Tresen und Stühle Platz haben
const game = { economy, orders, progress, achievements, upgrades, clock: gameClock, staff, servers, climate, rentals };
const saveFound = hasSave();
if (saveFound) {
  loadGame(game);
} else {
  economy.giveStarterKit();
}
const hud = createHud(economy, orders, progress, gameClock);
// Zu jeder vollen Spielstunde Miete und Strom abbuchen
gameClock.onNewHour = () => {
  economy.payHourlyBill();
  rentals.payHour(); // Miete der VMs auf Online-Servern
};
const sound = createSound();
progress.onLevelUp = (level, title) => {
  hud.showLevelUp(level, title);
  sound.play('achievement');
};
achievements.onUnlock = (a) => {
  hud.showAchievement(a);
  sound.play('achievement');
};
// Getragene Spulen (carry und workers werden weiter unten angelegt) landen beim Speichern im Regal
const autosave = startAutosave(game, hud.showSaved, () => ({
  spools: [...carry.spools, ...workers.carriedSpools()],
  nozzles: carry.nozzle ? 1 : 0,
  sheets: carry.sheets,
}));

// Spielereignisse → Meldungen, Geräusche und Erfolge
economy.onEvent = (type, d) => {
  const name = d.printer?.model.name;
  switch (type) {
    case 'delivered':
      hud.notify(`📦 Lieferung angekommen: ${d.names.join(', ')} – steht im Abstellraum`, 'good');
      sound.play('pop');
      break;
    case 'print-started':
      achievements.max('maxPrinting', d.printing);
      break;
    case 'print-done':
      hud.notify(`✔ ${name}: ${d.count > 1 ? `${d.count} × ` : ''}${d.template.name} fertig`, 'good');
      sound.play('done');
      achievements.add('printsDone');
      achievements.add('grams', (d.template.grams ?? 0) * d.count); // Laser: kein Filament
      if (d.template.id === 'benchy') achievements.add('benchys', d.count);
      if (d.speedId === 'ludicrous') achievements.add('ludicrousDone');
      break;
    case 'print-failed':
      hud.notify(`⚠️ ${name}: Fehldruck – ${d.info.name}! Am Drucker nachsehen.`, 'bad');
      if (d.saved > 0) hud.notify(`📷 ${name}: KI-Kamera hat früh gestoppt – ${d.saved} g Filament gerettet`, 'info');
      sound.play('error');
      achievements.add('failures');
      if (d.failure === 'spaghetti') achievements.add('spaghetti');
      break;
    case 'nozzle-switched':
      hud.notify(d.changer
        ? `🔀 ${name}: Düse verstopft – der Kopf holt sich eine Ersatzdüse aus dem Düsenwechsler und druckt weiter. Danach freistechen!`
        : d.twoColor
        ? `🔀 ${name}: Düse verstopft – die zweite Düse druckt beide Farben weiter, mit Farbwechsel dauert es länger. Danach freistechen!`
        : `🔀 ${name}: Düse verstopft – die zweite Düse druckt weiter. Danach freistechen!`, 'bad');
      sound.play('warn');
      break;
    case 'waste-bin-full':
      hud.notify(`🗑️ ${name}: Mülleimer mit dem Spülabfall ist voll – leeren, dann druckt er weiter`, 'bad');
      sound.play('warn');
      break;
    case 'out-of-filament':
      hud.notify(`🧵 ${name}: Filament leer – neue Spule ${filamentLabel(d.filament)} einlegen`, 'bad');
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
    hud.notify(`💶 ${order.customer} hat abgeholt und bezahlt: +${order.reward.toLocaleString('de-DE')} €`, 'good');
    sound.play('cash');
    achievements.add('deliveries');
    if (order.rush) achievements.add('rushDeliveries');
    if (order.special && order.customer === 'Jonas (12)') achievements.add('jonas');
    if (d.stars >= REGULAR_STARS) achievements.max('regulars', 1);
  } else if (type === 'expired') {
    hud.notify(`⌛ Auftrag von ${order.customer} verfallen – Kunde verärgert (−1 Stern)`, 'bad');
    sound.play('error');
  } else if (type === 'new-order') {
    hud.notify(`🚶 ${order.customer} kommt mit einem Auftrag zum Empfang${order.rush ? ' – EILT!' : ''}`, 'info');
  } else if (type === 'accepted') {
    hud.notify(`📋 Auftrag von ${order.customer} angenommen`, 'good');
    sound.play('pop');
  } else if (type === 'packed') {
    hud.notify(`📦 Auftrag für ${order.customer} liegt im Abholregal – der Kunde kommt gleich`, 'good');
    sound.play('pop');
  } else if (type === 'customer-left') {
    hud.notify(`🚪 ${order.customer} hat am Empfang zu lange gewartet und ist wieder gegangen`, 'bad');
  }
};

// Mit Nachbearbeitung glättet deren Puffer die Kanten – dann wäre Kantenglättung am Bildschirm doppelt
const quality = loadQuality();
const renderer = new THREE.WebGLRenderer({ antialias: antialias(quality) });
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
// Der Schattenbereich folgt der Spielfigur (world/graphics.js)
sun.target.position.set(-7, 0, 0);
scene.add(sun.target);
sun.shadow.bias = -0.0005;
scene.add(sun);

// Raum: Boden, Wände, Fenster, Decke mit Leuchten
const room = createRoom();
scene.add(room);
for (const b of roomColliders()) collision.addBox(b);

// Eingangsbereich hinter der Westwand, dahinter Garten und Straße mit Autos und Passanten
const entrance = createEntrance({ collision });
scene.add(entrance.group);
const outdoor = createOutdoor({ collision, scene });
scene.add(outdoor.group, outdoor.sky);
const pedestrians = createPedestrians();
outdoor.group.add(pedestrians.group); // nur sichtbar, wenn man nach draußen schauen kann

// Empfang: Kunden geben Aufträge am Tresen ab und holen sie am Abholregal wieder ab
const customers = createCustomers({
  reception,
  rentals, // Server-Kunden (VM-Anfragen) kommen ebenfalls zum Empfang
  orders,
  onEvent: (type, d) => {
    if (type === 'arrived' && d.request) {
      // Server-Kunde: angenommen wird am PC (Serverwahl), nicht am Tresen
      hud.notify(`💻 ${d.customer} möchte eine VM mieten (${d.request.ram} GB · ${d.request.cores} Cores) – am PC in „Server-Vermietung“ annehmen`, 'info');
      sound.play('pop');
    } else if (type === 'arrived') {
      const greeter = staff.receptionist?.name;
      hud.notify(greeter ? `🛎️ ${d.customer} ist am Empfang – ${greeter} nimmt den Auftrag an` : `🛎️ ${d.customer} wartet am Empfang – am Tresen annehmen`, 'info');
      sound.play('pop');
    }
  },
});
scene.add(customers.group);
const receptionDesk = createReceptionDesk({ reception, orders, customers, collision, staff, rentals });
scene.add(receptionDesk.group);
// Empfangskraft hinter dem Tresen (falls eingestellt): begrüßt Kunden, nimmt Aufträge an, kassiert
const receptionist = createReceptionist({ staff, reception, customers });
scene.add(receptionist.group);

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
const DELIVERED = {
  table: '📦 Drucktisch geliefert – an der grünen Markierung in der Halle aufstellen',
  shelf: '📦 Neue Regalebene im Abstellraum eingebaut',
  floor: '🏗️ Zweite Etage fertig – die Treppe ist rechts hinten in der Halle',
  elevator: '🛗 Fahrstuhl eingebaut – neben der Treppe, Ruftaster rechts an der Tür',
};
upgrades.onEvent = (type, d) => {
  if (type !== 'delivered') return;
  hud.notify(DELIVERED[d.kind], 'good');
  sound.play('pop');
};

// Zweite Etage mit Treppe und Fahrstuhl (Ausbau) – baut sich selbst, sobald sie geliefert ist
const screenFade = createScreenFade();
let playerLevel = 0;  // Stockwerk der Spielfigur: 0 = Halle, 1 = zweite Etage
let groundY = 0;      // Bodenhöhe unter der Spielfigur (auf der Treppe dazwischen)
let eyeHeight = EYE_HEIGHT;
const upperFloor = createUpperFloor({ upgrades, collision, room, outdoor, onRide: rideElevator });
scene.add(upperFloor.group);

// Fahrstuhl: kurz abblenden, auf dem anderen Stockwerk vor der Tür wieder auftauchen – was man trägt, fährt mit
function rideElevator(level) {
  screenFade.run(level ? '🛗 Fahrstuhl fährt nach oben …' : '🛗 Fahrstuhl fährt nach unten …', () => {
    const exit = upperFloor.elevatorExit(level);
    playerLevel = level;
    groundY = exit.y;
    camera.position.set(exit.x, groundY + eyeHeight, exit.z);
  });
}

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
// Serverschränke in der zweiten Etage – verkabelt wird hinten am Schrank, ein Klick auf den Schrank öffnet das Schrankfenster
const serverRoom = createServerRoom({ economy, servers, climate, carry, upgrades, collision, onOpenRack: openRack });
scene.add(serverRoom.group);
servers.onEvent = (type, d) => {
  if (type === 'cables-delivered') hud.notify(`🔌 ${d.meters} m Kabel geliefert – im Vorrat`, 'good');
};
// Server-Vermietung: Vertragsende und Kündigung melden (die Ankunft am Empfang meldet createCustomers)
rentals.onEvent = (type, d) => {
  if (type === 'rental-ended') {
    hud.notify(`📄 Vertrag mit ${d.vm.customer} ist ausgelaufen – ${d.server?.type.name ?? 'Server'} hat wieder Platz`, 'info');
  } else if (type === 'rental-cancelled') {
    hud.notify(`⚠️ ${d.vm.customer} hat gekündigt – Server war zu lange offline`, 'bad');
    sound.play('warn');
  }
};
const CLIMATE_MESSAGES = {
  hot: (name) => `🌡️ ${name} wird zu heiß – Lüfter im Schrankfenster hochdrehen!`,
  cold: (name) => `❄️ ${name} wird zu kalt – Lüfter im Schrankfenster herunterdrehen!`,
  broken: (name) => `🔥 ${name} ist überhitzt und defekt – im Schrankfenster reparieren`,
  frozen: (name) => `🧊 ${name} ist eingefroren – aufwärmen lassen und im Schrankfenster neu starten`,
};
climate.onEvent = (type, d) => {
  hud.notify(CLIMATE_MESSAGES[type](d.device.type.name), 'bad');
  sound.play('warn');
};
// Ausstellungsregale an der Südwand
const displayWall = createDisplayWall({ economy, carry, collision });
scene.add(displayWall.group);
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
    } else if (type === 'respawn') {
      hud.notify('🐈 Ein neuer Kater ist zugelaufen – er heißt wieder Düsentrieb.', 'info');
      sound.play('meow');
    } else if (type === 'knock') {
      hud.notify('😼 Kater Düsentrieb hat ein fertiges Teil vom Tisch geworfen! Es liegt vor dem Drucker.', 'bad');
      sound.play('clunk');
      achievements.add('knocked');
    }
  },
});
scene.add(cat.group);

// Drucker werfen (F) – und manchmal den Kater treffen
const throwing = createThrowing({
  camera,
  economy,
  carry,
  cat,
  onEvent: (type, d) => {
    if (type === 'throw') sound.play('whoosh');
    else if (type === 'land') sound.play('clunk');
    else if (type === 'cat-hit') {
      sound.play('yowl');
      hud.notify(`😵 Volltreffer! Der ${d.printer.model.name} hat Kater Düsentrieb erwischt. Er ist jetzt im Katzenhimmel.`, 'bad');
      achievements.add('catHits');
    }
  },
});
scene.add(throwing.group);

// Büro der Azubis hinter der Ostwand: Werkbank und Zockecke, die Tür geht mit dem ersten Azubi auf
const office = createOffice({ staff, collision });
scene.add(office.group);

// Azubis laufen durch Halle und Lager und helfen mit (Aufgaben aus core/staff.js), ohne Arbeit sitzen sie im Büro
const workers = createWorkers({ economy, staff });
scene.add(workers.group);
staff.onEvent = (type, d) => {
  const who = d.worker ? `Azubi ${d.worker.name}` : 'Ein Azubi';
  if (type === 'hired' && d.receptionist) hud.notify(`💁 ${d.receptionist.name} steht jetzt am Empfang und nimmt die Kunden in Empfang`, 'good');
  else if (type === 'fired' && d.receptionist) hud.notify(`👋 ${d.receptionist.name} hat den Empfang verlassen`, 'info');
  else if (type === 'hired') hud.notify(`🧑‍🔧 Azubi ${d.worker.name} ist eingestellt und kommt durch die Lagertür`, 'good');
  else if (type === 'fired') hud.notify(`👋 Azubi ${d.worker.name} hat die Halle verlassen`, 'info');
  else if (type === 'restarted') hud.notify(`🔁 ${who} hat den Fehldruck weggeräumt und ${d.template.name} am ${d.printer.model.name} neu gestartet`, 'info');
  else if (type === 'restart-blocked') {
    hud.notify(`⚠️ ${who} konnte ${d.template.name} am ${d.printer.model.name} nicht neu starten: ${d.reason}`, 'bad');
    sound.play('warn');
    return;
  }
  sound.play('pop');
};
economy.subscribe(() => {
  workshop.sync();
  storage.sync();
});

// FPV-Steuerung: am PC Maus (Pointer Lock) und Tastatur, auf dem Tablet Touch (ui/touch-controls.js)
const controls = new PointerLockControls(camera, document.body);
// Chrome meldet bei gesperrter Maus ab und zu einzelne riesige Mausbewegungen – der Blick würde schlagartig
// herumspringen. Solche Ausreißer verwerfen, bevor PointerLockControls sie sieht (Capture-Phase am window).
const MAX_MOUSE_STEP = 400; // px pro Ereignis – echte Bewegungen liegen weit darunter
window.addEventListener('mousemove', (e) => {
  if (controls.isLocked && (Math.abs(e.movementX) > MAX_MOUSE_STEP || Math.abs(e.movementY) > MAX_MOUSE_STEP)) {
    e.stopImmediatePropagation();
  }
}, true);
const zoom = createZoom(camera, controls, document.getElementById('zoom-info'));
let device = loadDevice(); // 'pc' | 'tablet' | null – wird beim ersten Start gefragt
const isTablet = () => device === 'tablet';
const touch = createTouchControls({
  canvas: renderer.domElement,
  camera,
  onTap: (point) => interaction.clickAt(point),
  onButton: (id) => {
    if (id === 'take') liftAimedPrinter();
    else if (id === 'throw') throwCarried();
    else if (id === 'return') carry.returnToStorage();
    // wie das Mausrad: am Ausstellungsregal das nächste Teil, sonst die nächste Spule in der Hand
    else if (id === 'cycle' && !displayWall.cycle(1, interaction.current?.owner)) carry.cycle(1);
  },
  onPause: () => stopPlaying(),
});
// Läuft das Spiel gerade (Maus eingefangen bzw. Touch-Steuerung aktiv)?
const playing = () => (isTablet() ? touch.active : controls.isLocked);

function startPlaying() {
  if (!isTablet()) {
    controls.lock(); // weiter in onStarted, sobald der Browser die Maus hergibt
    return;
  }
  touch.setActive(true);
  const el = document.documentElement;
  if (!document.fullscreenElement) (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {});
  onStarted();
}

function stopPlaying() {
  if (!isTablet()) {
    controls.unlock();
    return;
  }
  if (!touch.active) return;
  touch.setActive(false);
  onStopped();
}

function onStarted() {
  title.hide();
  sound.unlock(); // Browser erlauben Ton erst nach einer Nutzeraktion
}

function onStopped() {
  if (!uiOpen()) {
    title.show(true);
    autosave.save(); // beim Pausieren gleich sichern
  }
}

const overlay = document.getElementById('start-overlay');
const title = createTitleScreen({
  overlay,
  hasSave: saveFound,
  quality,
  gpu: gpuInfo(renderer),
  device,
  suggested: suggestedDevice(),
  onDevice: (d) => {
    device = d;
    saveDevice(d);
    carry.refresh(); // Hinweise mit den passenden Tasten bzw. Knöpfen
  },
  onPlay: () => startPlaying(),
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
controls.addEventListener('lock', onStarted);
controls.addEventListener('unlock', onStopped);
// Auf dem Tablet sprechen Hinweise von Tippen und Knöpfen statt von Maus und Tasten
carry.formatText = (text) => (isTablet() ? tabletText(text) : text);

// Shop: Linksklick auf den PC öffnet ihn, Schließen kehrt ins Spiel zurück
// Live-Bild der Drucker für die PC-App
const printerCam = createPrinterCam({ renderer, scene, economy, workshop });

const shop = createShop(economy, {
  orders,
  achievements,
  staff,
  staffStatus: (id) => workers.statusOf(id),
  cam: printerCam,
  upgrades,
  servers,
  rentals, // Server-Vermietung (VM-Anfragen, Verträge)
  // Platz ist für so viele Drucker, wie der Tisch Stellplätze hat – egal ob schon aufgestellt
  // Platz ist für so viele Drucker, wie die gekauften Tische Stellplätze haben – egal ob schon aufgestellt
  freePrinterSlots: () => upgrades.printerSlots - economy.printers.length,
  freeShelfSpace: () => upgrades.shelfCapacity - economy.spoolsInStorage - carry.spools.length,
  onClose: () => {
    if (gameOver) return; // Pleite: Maus nicht wieder einfangen
    title.showResume(); // PC: nach Esc klappt das erneute Sperren der Maus nicht – dann weiter per Klick
    startPlaying();
  },
});

// Schrankfenster: wie der PC – Maus frei, beim Schließen zurück ins Spiel
const rackPanel = createRackPanel({
  economy,
  servers,
  climate,
  rentals, // VM-Auslastung je Server (core/server-rentals.js)
  onClose: () => {
    if (gameOver) return;
    title.showResume();
    startPlaying();
  },
});
function openRack(rackId) {
  rackPanel.open(rackId);
  stopPlaying();
}
// Ist gerade ein Fenster offen (PC oder Schrank)? Dann läuft die Zeit weiter und es gibt kein Pausenmenü
const uiOpen = () => shop.isOpen() || rackPanel.isOpen();

const pcInteraction = {
  hint: () => 'Linksklick: PC benutzen (Shop, Aufträge, Ausbau & Druckermenü)',
  action: () => {
    shop.open();
    stopPlaying();
  },
};
for (const part of [monitor, pc, keyboard, mouse]) part.userData.interaction = pcInteraction;
mergeStatic(computerDesk); // erst nach dem Setzen der Interaktion: Bildschirm, PC, Tastatur und Maus bleiben anklickbar

const hintEl = document.getElementById('interact-hint');
const crosshair = document.getElementById('crosshair');

// Alles, was der Klickstrahl treffen kann – Wände und Möbel verdecken, was dahinter liegt
const interaction = new Interaction({
  camera,
  distance: INTERACT_DISTANCE,
  hintEl,
  targets: [room, upperFloor.group, serverRoom.group, entrance.group, receptionDesk.group, customers.group, receptionist.group, outdoor.group, storage.group, office.group, hall.group, computerDesk, workshop.group, displayWall.group, cat.group, throwing.group, workers.group],
});

interaction.formatText = (text) => (isTablet() ? tabletText(text) : text);

document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && controls.isLocked) interaction.click();
  if (e.button === 1 && controls.isLocked) zoom.reset(); // mittlere Maustaste: zurück auf 1×
});

// E bzw. ✋: den Drucker, auf den man zielt, vom Tisch hochheben
function liftAimedPrinter() {
  if (!carry.isEmpty) return;
  const printer = interaction.current?.owner.userData.printer;
  if (printer && economy.liftPrinter(printer.id)) carry.holdPrinter(printer, { unboxed: true });
}

// Mausrad: zoomen. Zielt man auf ein Ausstellungsregal, wählt es das nächste Teil, mit mehreren Spulen in der Hand
// die Spule, die als Nächstes eingelegt wird – mit gedrückter Umschalttaste zoomt es immer.
document.addEventListener('wheel', (e) => {
  if (!controls.isLocked) return;
  const direction = Math.sign(e.deltaY);
  if (e.shiftKey) zoom.wheel(e);
  else if (displayWall.cycle(direction, interaction.current?.owner)) return;
  else if (carry.spools.length > 1) carry.cycle(direction);
  else zoom.wheel(e);
});

window.addEventListener('keydown', (e) => {
  // Esc im PC: zurück ins Spiel · nochmal Esc auf dem Hinweis „Klicken, um weiterzuspielen“: Pausenmenü
  if (e.code === 'Escape' && shop.isOpen()) shop.close();
  else if (e.code === 'Escape' && rackPanel.isOpen()) rackPanel.close();
  else if (e.code === 'Escape' && title.isResume()) title.show(true);
  if (e.code === 'KeyQ' && controls.isLocked) carry.returnToStorage();
  // E: den Drucker, auf den man zielt, vom Tisch hochheben · F: getragenen Drucker werfen
  if (e.code === 'KeyE' && !e.repeat && controls.isLocked) liftAimedPrinter();
  if (e.code === 'KeyF' && !e.repeat && controls.isLocked) throwCarried();
  if (e.code === 'KeyM' && !e.repeat && !uiOpen()) {
    sound.toggleMute();
    hud.notify(sound.muted ? '🔇 Ton aus' : '🔊 Ton an', 'info');
  }
});

const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear()); // sonst bleibt z. B. C nach einem Fensterwechsel „gedrückt“

// Werfen nur in der Halle – von der zweiten Etage fiele der Drucker durch die Decke
function throwCarried() {
  if (playerLevel) hud.notify('Von hier oben lieber nichts werfen – erst runter in die Halle', 'info');
  else throwing.throwCarried();
}

function updateMovement(dt) {
  if (!playing()) return;
  // Schleichen: nur solange C gedrückt ist (Tablet: Knopf an/aus) – Kamera gleitet weich nach unten bzw. wieder hoch
  const sneaking = isTablet() ? touch.sneak : keys.has('KeyC');
  const eye = sneaking ? SNEAK_EYE_HEIGHT : EYE_HEIGHT;
  eyeHeight += (eye - eyeHeight) * Math.min(1, CROUCH_RATE * dt);
  camera.position.y = groundY + eyeHeight;
  if (screenFade.busy) return; // im Fahrstuhl

  const forward = isTablet() ? touch.move.y : (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const right = isTablet() ? touch.move.x : (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  if (forward === 0 && right === 0) return;

  const len = Math.max(1, Math.hypot(forward, right)); // Joystick: halb gezogen = halbes Tempo
  const speed = WALK_SPEED * (sneaking ? SNEAK_SPEED : 1);
  // Nach einem Ruckler die verlorene Zeit nicht auf einmal nachlaufen – sonst springt die Figur ein Stück weiter
  const moveDt = Math.min(dt, MAX_MOVE_DT);
  // In kleinen Schritten laufen und nach jedem Schritt die Kollision auflösen: in einem großen Schritt landete der
  // Mittelpunkt mitten in einer dünnen Wand oder Tür und wurde auf der anderen Seite wieder herausgeschoben.
  const steps = Math.ceil((speed * moveDt) / MAX_STEP);
  for (let i = 0; i < steps; i++) {
    controls.moveForward((forward / len) * speed * (moveDt / steps));
    controls.moveRight((right / len) * speed * (moveDt / steps));
    collision.resolve(camera.position, PLAYER_RADIUS, playerLevel);
    // Treppe: Boden steigt mit, ab halber Höhe gilt die zweite Etage
    const foot = upperFloor.footing(camera.position.x, camera.position.z, playerLevel);
    playerLevel = foot.level;
    groundY = foot.y;
  }
  camera.position.y = groundY + eyeHeight;
}

const graphics = setupGraphics(renderer, scene, camera, quality);
// Lichtschalter neben der Lagertür – erst nach setupGraphics, das die Helligkeiten je Grafikstufe einstellt
const hallLights = createHallLights({ room, scene });
scene.add(hallLights.group);
interaction.targets.push(hallLights.group);
// Halle, Anbauten und Außenbereich nur zeichnen, wenn man hineinsehen kann
// Die Lampenschatten der Anbauten sind statisch. Ein ausgeblendeter Raum fehlt in der Schattenkarte, deshalb beim
// Einblenden neu zeichnen – aber nur, wenn sich seitdem etwas geändert hat. Bei jedem Umschauen zu zeichnen
// (jede Lampe zeichnet dafür die Szene sechsmal) ließ das Bild beim Kurvenlaufen ruckeln.
const staleShadows = new Set();
const culling = createRoomCulling(camera, {
  hall: [room, upperFloor.group, serverRoom.group, hall.group, workshop.group, computerDesk],
  storage: [storage.group],
  office: [office.group],
  entrance: [entrance.group, receptionDesk.group],
}, (name) => {
  if (staleShadows.delete(name)) graphics.refreshStaticShadows();
});

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
upgrades.subscribe(precompileShaders); // zweite Etage, Fahrstuhl
upgrades.subscribe(() => graphics.refreshStaticShadows());
economy.subscribe(() => { // z. B. neue Kartons im Lager
  graphics.refreshStaticShadows();
  for (const name of ['hall', 'storage', 'office', 'entrance']) staleShadows.add(name);
});
onPersonLoaded(precompileShaders);    // Figuren (Azubis, Kunden, Passanten) kommen nach und nach dazu

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
      headSpeed: workshop.headSpeed(p.id),
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
  stopPlaying();
  title.showGameOver({ day: gameClock.day, ...achievements.stats });
}

// Namen der Szenenbereiche für die Aufschlüsselung der Draw Calls in der Leistungsanzeige
for (const [name, object] of Object.entries({
  room, entrance: entrance.group, outdoor: outdoor.group, customers: customers.group, reception: receptionDesk.group,
  hall: hall.group, computerDesk, workshop: workshop.group, storage: storage.group, cat: cat.group,
  office: office.group, workers: workers.group,
})) object.name ||= name;
const perf = createPerfOverlay({ renderer, scene });
const frameClock = new THREE.Clock();
// Wirft ein Teil der Spielschleife, plant three.js kein nächstes Bild mehr ein – das Spiel stünde für immer still
// und ließe sich nur mit F5 retten. Deshalb läuft jeder Teil für sich abgesichert: Fehler landen (jeder einmal) in
// der Konsole, alles andere läuft weiter.
const reportedErrors = new Set();
function safely(name, run) {
  try {
    run();
  } catch (err) {
    const key = `${name}: ${err?.stack ?? err}`;
    if (reportedErrors.has(key)) return;
    reportedErrors.add(key);
    console.error(`Fehler in der Spielschleife (${name}):`, err);
    hud.notify('⚠️ Interner Fehler – Details in der Browser-Konsole (F12)', 'info');
  }
}

// Verliert der Browser die Grafikkarte (Treiber-Reset, v. a. bei integrierten GPUs), bleibt das Bild stehen –
// three.js baut alles neu auf, sobald sie wieder da ist. Damit man das vom Einfrieren unterscheiden kann: melden.
renderer.domElement.addEventListener('webglcontextlost', () => {
  console.error('WebGL-Kontext verloren – die Grafikkarte wurde vom Browser zurückgesetzt');
  hud.notify('⚠️ Grafikkarte wurde zurückgesetzt – kurz warten, sonst F5', 'info');
});
renderer.domElement.addEventListener('webglcontextrestored', () => console.info('WebGL-Kontext wieder da'));

renderer.setAnimationLoop(() => {
  perf.begin();
  const dt = Math.min(frameClock.getDelta(), 0.1);
  // Zeit, Drucke und Auftragsfristen laufen auch bei offenem PC-Fenster weiter – nur die Pause hält sie an
  const paused = !playing() && !uiOpen();
  if (!gameOver && !paused) {
    safely('Spielzeit', () => {
      const gameMinutes = dt * GAME_MINUTES_PER_SECOND;
      economy.advanceTime(gameMinutes);
      economy.advancePrints(gameMinutes);
      orders.advance(gameMinutes);
      climate.advance(gameMinutes);
      rentals.advance(gameMinutes);
      gameClock.advance(gameMinutes);
      checkBankrupt();
    });
  }
  safely('Drucker', () => workshop.animate(dt));
  safely('Serverraum', () => serverRoom.update(dt));
  safely('Ausstellungsregal', () => displayWall.update());
  safely('Licht', () => hallLights.update(dt, camera.position));
  safely('Kater', () => cat.update(dt));
  safely('Werfen', () => throwing.update(dt));
  safely('Azubis', () => workers.update(dt));
  safely('Büro', () => office.update(dt, workers.gaming()));
  safely('Eingang', () => entrance.update(dt, [camera.position, ...customers.positions()]));
  safely('Räume', () => culling.update());
  safely('Außenbereich', () => outdoor.update(dt, camera, culling.outdoorVisible()));
  safely('Passanten', () => pedestrians.update(dt, camera.position, outdoor.group.visible));
  safely('Kunden', () => customers.update(dt, outdoor.group.visible));
  safely('Empfangskraft', () => receptionist.update(dt, outdoor.group.visible));
  safely('Empfang', () => receptionDesk.update());
  safely('Halle', () => hall.update(dt));
  // Lieferungen laufen in echter Zeit, auch bei offenem PC-Fenster
  safely('Lieferungen', () => {
    economy.advanceDeliveries(dt);
    upgrades.advance(dt);
    servers.advance(dt);
  });
  safely('HUD', () => hud.update());
  safely('Geräusche', () => printerSounds(dt));
  safely('Bewegung', () => updateMovement(dt));
  safely('Zielen', () => {
    interaction.update(playing());
    if (touch.active) {
      touch.update({
        take: carry.isEmpty && !!interaction.current?.owner.userData.printer,
        throw: !!carry.printer,
        return: !carry.isEmpty,
        cycle: carry.spools.length > 1 || displayWall.cycle(0, interaction.current?.owner), // 0: nur prüfen
      });
    }
    crosshair.classList.toggle('active', !hintEl.classList.contains('hidden'));
  });
  safely('Zeichnen', () => graphics.render(dt));
  safely('Drucker-Cam', () => printerCam.update(dt));
  perf.end(dt);
});
