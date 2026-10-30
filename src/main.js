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
import { PowerGrid, NIGHT_FACTOR, DAY_FACTOR } from './core/power-grid.js';
import { euro, euroRound, meters } from './core/format.js';
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
import { createBasementStorage } from './world/basement-storage.js';
import { BasementStorage } from './core/basement-storage.js';
import { createWorkshop } from './world/workshop.js';
import { createDisplayWall } from './world/display-wall.js';
import { createHallLights } from './world/hall-lights.js';
import { Carry } from './world/carry.js';
import { createCat } from './world/cat.js';
import { createThrowing } from './world/throwing.js';
import { createWorkers } from './world/workers.js';
import { createVisitorGroup } from './world/visitors.js';
import { createOffice } from './world/office.js';
import { createEntrance } from './world/entrance.js';
import { createOutdoor } from './world/outdoor.js';
import { createPedestrians } from './world/pedestrians.js';
import { RECEPTION_SPOTS, createReceptionDesk } from './world/reception.js';
import { createCustomers } from './world/customers.js';
import { createRoomCulling } from './world/room-culling.js';
import { createUpperFloor } from './world/upper-floor.js';
import { createBasement } from './world/basement.js';
import { createServerRoom } from './world/server-room.js';
import { createRackPanel } from './ui/rack-panel.js';
import { createWorkbenchPanel } from './ui/workbench-panel.js';
import { createWorkbenchStation } from './world/workbench.js';
import { Workbench } from './core/workbench.js';
import { Servers } from './core/servers.js';
import { ServerClimate } from './core/server-climate.js';
import { ServerParts } from './core/server-parts.js';
import { Nas, storageText } from './core/nas.js';
import { StorageRentals } from './core/storage-rentals.js';
import { ClimateAutomation } from './core/climate-automation.js';
import { ServerRentals } from './core/server-rentals.js';
import { RentalAutomation } from './core/rental-automation.js';
import { Website } from './core/website.js';
import { AIService } from './core/ai-service.js';
import { createAdvisor } from './core/ai-advisor.js';
import { Visitors, partyText, starsText } from './core/visitors.js';
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
// Stromnetz (#57): Tag-/Nachttarif und Stromausfälle (die gibt es erst mit Notstrom, hasBackup kommt mit #59)
const powerGrid = new PowerGrid({ clock: gameClock });
economy.powerGrid = powerGrid; // Tarif in der Abrechnung, Drucker pausieren bei Stromausfall
const staff = new Staff(economy);
const reception = new Reception(orders);
staff.reception = reception; // Azubis packen fertige Aufträge ins Abholregal
const servers = new Servers(economy); // Serverraum in der zweiten Etage
servers.powered = () => powerGrid.isPowered('servers'); // Stromausfall: Netz und Klima im Serverraum aus
servers.attachBasement(upgrades.basementLayout); // Daten-Bunker im Keller (#52): Bunker-Plätze, Gitter, Feld-Prüfung
// Keller-Lager (#53): Kartons, wenn der Abstellraum voll ist, und trockene Filament-Regale in den Lager-Feldern
const basementStorage = new BasementStorage(economy, upgrades.basementLayout);
const climate = new ServerClimate(economy, servers); // Lüfter und Temperaturen der Schränke und Geräte
const serverParts = new ServerParts(economy, servers, climate); // Server aus Bauteilen: Ausstattung, Teilelager, Defekte
const nas = new Nas(serverParts); // NAS: Speicher, Festplatten im Schrank tauschen (#46)
const workbench = new Workbench(economy, serverParts, upgrades); // Werkbank im Serverraum: Server ablegen, Teile tauschen
const automation = new ClimateAutomation(climate, servers); // Server auf den grünen Plätzen regeln die Lüfter selbst
// VMs an Kunden vermieten – einzige Einnahmequelle der Server
const rentals = new ServerRentals(economy, servers, upgrades);
rentals.maxWaiting = 1 + RECEPTION_SPOTS.chairs.length; // höchstens so viele Wartende, wie Tresen und Stühle Platz haben
// Speicherplatz auf den NAS vermieten (#47) – setzt nas.rentedStorageOf, Speicher-Kunden zählen bei maxWaiting mit
const storageRentals = new StorageRentals(economy, servers, upgrades, rentals, nas);
const rentalAutomation = new RentalAutomation(rentals, storageRentals); // Server in der orangen Reihe vergeben VM- und Speicher-Anfragen selbst
// Eigene Website (#54): Website-Server tragen sie, Online-Anfragen kommen ohne Figur direkt in die App „Server-Vermietung“
const website = new Website({ economy, servers, rentals, storage: storageRentals, clock: gameClock });
// Eigene KI auf den KI-GPU-Servern: Stufe 1–10 je nach Anzahl online, Einnahmen über das KI-Abo.
// Aufträge, Uhr und XP braucht sie für den Tagesverlauf (Vergleich mit gestern, Prognose über Tage)
const aiService = new AIService({ economy, servers, climate, orders, clock: gameClock, progress });
// Besucher: über den Tag verteilt kleine Grüppchen ohne Führer (Eintritt, Bewertung, Bonus-XP)
const visitors = new Visitors({ economy, staff, upgrades, progress, clock: gameClock, servers, climate });
const game = { economy, orders, progress, achievements, upgrades, clock: gameClock, staff, servers, climate, rentals, rentalAutomation, visitors, aiService, serverParts, workbench, nas, storageRentals, website, basementStorage, powerGrid };
// KI-Chat (PC-App „KI“): baut die Antworten aus dem Spielstand, je nach KI-Stufe genauer
const advisor = createAdvisor({ ...game, climateAutomation: automation });
const saveFound = hasSave();
if (saveFound) {
  loadGame(game);
} else {
  economy.giveStarterKit();
}
const hud = createHud(economy, orders, progress, gameClock, powerGrid);
// Zu jeder vollen Spielstunde Miete und Strom abbuchen
gameClock.onNewHour = () => {
  economy.payHourlyBill();
  rentals.payHour(); // Miete der VMs auf Online-Servern
  storageRentals.payHour(); // Miete der Speicher-Verträge auf Online-NAS
  aiService.payHour(); // KI-Abo der KI-GPU-Server (0 €, solange keiner online ist)
};
// Neuer Tag: Tagesbilanz der Besucher und Tagesplan für den neuen Tag
gameClock.onNewDay = (day) => visitors.onNewDay(day);
const sound = createSound();
// Stromnetz (#57): Stromausfall und Rückkehr melden, Wechsel auf Nachtstrom leise ansagen
powerGrid.onEvent = (type, d) => {
  if (type === 'outage-start') {
    hud.notify(`⚡ Stromausfall! Drucker pausieren, Server sind offline – etwa ${d.minutes} Spielminuten`, 'bad');
    sound.play('outage');
  } else if (type === 'outage-end') {
    hud.notify('💡 Strom ist wieder da – Drucker und Server laufen weiter', 'good');
    sound.play('power-back');
  } else if (type === 'tariff-change') {
    hud.notify(d.tariff.id === 'night' ? `🌙 Nachtstrom: Strom kostet jetzt weniger (× ${String(NIGHT_FACTOR).replace('.', ',')})` : `☀️ Tagstrom: Strom kostet wieder mehr (× ${String(DAY_FACTOR).replace('.', ',')})`, 'info');
  }
};
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
      if (d.basement?.length) {
        hud.notify(`📦 Abstellraum voll – Lieferung liegt im Keller-Lager: ${d.basement.join(', ')}`, 'good');
        if (d.room.length) hud.notify(`📦 Lieferung angekommen: ${d.room.join(', ')} – steht im Abstellraum`, 'good');
      } else {
        hud.notify(`📦 Lieferung angekommen: ${d.names.join(', ')} – steht im Abstellraum`, 'good');
      }
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
  rentals: storageRentals.desk, // Server-Kunden (VM- und Speicher-Anfragen) kommen ebenfalls zum Empfang
  orders,
  onEvent: (type, d) => {
    if (type === 'arrived' && d.request) {
      // Server-Kunde: angenommen wird am PC (Serverwahl) oder – mit privatem Server – automatisch, nicht am Tresen
      storageRentals.desk.markArrived(d.request.id);
      const what = d.request.kind === 'storage'
        ? `${storageText(d.request.storage)} Speicher mieten`
        : `eine VM mieten (${d.request.ram} GB · ${d.request.cores} Cores)`;
      const vm = `${d.customer} möchte ${what}`;
      hud.notify(rentalAutomation.isActive()
        ? `${d.request.kind === 'storage' ? '💾' : '💻'} ${vm} – die privaten Server kümmern sich darum`
        : `${d.request.kind === 'storage' ? '💾' : '💻'} ${vm} – am PC in „Server-Vermietung“ annehmen`, 'info');
      sound.play('pop');
    } else if (type === 'arrived') {
      const greeter = staff.receptionist?.name;
      hud.notify(greeter ? `🛎️ ${d.customer} ist am Empfang – ${greeter} nimmt den Auftrag an` : `🛎️ ${d.customer} wartet am Empfang – am Tresen annehmen`, 'info');
      sound.play('pop');
    }
  },
});
scene.add(customers.group);
const receptionDesk = createReceptionDesk({ reception, orders, customers, collision, staff, rentals: storageRentals.desk });
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
  basement: '🏗️ Keller fertig – das Treppenhaus nach unten ist links hinten in der Halle (70 m)',
  basementElevator: '🛗 Keller-Fahrstuhl eingebaut – neben dem Treppenhaus, Ruftaster rechts an der Tür',
  controlRoom: '🏗️ Raum bei −10,5 m fertig – die Tür ist am dritten Podest (−10,5 m) im Kellertreppenhaus',
};
upgrades.onEvent = (type, d) => {
  if (type !== 'delivered') return;
  // Kellerausbau (#50): Meldung mit der neuen Größe
  const text = d.kind === 'basementStage' ? `⛏️ Keller ausgebaut auf ${d.size} × ${d.size} m` : DELIVERED[d.kind];
  hud.notify(text, 'good');
  sound.play('pop');
};

// Zweite Etage mit Treppe und Fahrstuhl (Ausbau) – baut sich selbst, sobald sie geliefert ist
const screenFade = createScreenFade();
let playerLevel = 0;  // Stockwerk der Spielfigur: 0 = Halle, 1 = zweite Etage, −1 = Treppenhaus, −2 = Keller,
                      // −3 = Raum bei −10,5 m (world/control-room.js)
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

// Keller 70 m unter der Halle mit Treppenhaus und eigenem Fahrstuhl (Ausbau) – baut sich selbst, sobald er geliefert
// ist. Vor setupGraphics anlegen: Seine Lichter sind von Anfang an da (Zahl der Lichter bleibt gleich).
const basement = createBasement({ upgrades, collision, room, sun, outdoor, onRide: rideBasementElevator });
scene.add(basement.group, basement.hallGroup);

// Keller-Fahrstuhl: wie oben, zwischen Halle (0), Raum bei −10,5 m (−3) und Keller (−2)
const BASEMENT_RIDE_TEXT = {
  0: '🛗 Fahrstuhl fährt nach oben in die Halle …',
  [-2]: '🛗 Fahrstuhl fährt hinunter in den Keller …',
  [-3]: '🛗 Fahrstuhl fährt zum Raum bei −10,5 m …',
};
function rideBasementElevator(level) {
  screenFade.run(BASEMENT_RIDE_TEXT[level], () => {
    const exit = basement.elevatorExit(level);
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
const serverRoom = createServerRoom({
  economy, servers, climate, carry, upgrades, collision, onOpenRack: openRack,
  nas, // NAS-Schächte vorn: Platten per Klick einsetzen und herausnehmen (#48)
  basement: { layout: upgrades.basementLayout, fields: basement.fields }, // Daten-Bunker im Keller (#52)
  onNotice: (text, tone) => { hud.notify(text, tone); sound.play('warn'); },
});
scene.add(serverRoom.group);
// Werkbank an der Südwand des Serverraums (fest da, sobald die zweite Etage steht): Klick öffnet das Werkbank-Menü
const workbenchStation = createWorkbenchStation({ economy, bench: workbench, parts: serverParts, carry, upgrades, collision, onOpen: openWorkbench });
scene.add(workbenchStation.group);
servers.onEvent = (type, d) => {
  if (type === 'cables-delivered') hud.notify(`🔌 ${d.meters} m Kabel geliefert – im Vorrat`, 'good');
  // Bunker-Feld umgestellt (#61): Kabel an seinen Internet-Kästen bzw. über seine Trassen kommen in den Vorrat
  if (type === 'cables-returned') hud.notify(`🔌 ${d.count === 1 ? '1 Kabel' : `${d.count} Kabel`} aus dem umgestellten Bunker-Feld abgezogen – ${meters(d.meters)} zurück im Vorrat`, 'info');
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
// Eigene Website (#54): live, hochgefahren, offline und neue Online-Anfragen melden
website.onEvent = (type, d) => {
  if (type === 'state-changed') {
    if (d.state === 'live') hud.notify('🌐 Deine Website ist live – Online-Anfragen kommen direkt in die App „Server-Vermietung“', 'good');
    else if (d.state === 'booting') hud.notify('🌐 Website-Server online – die Website fährt hoch …', 'info');
    else if (d.state === 'setup') hud.notify('🌐 Website ist hochgefahren – jetzt in der App „Website“ einrichten', 'info');
    else if (d.state === 'off' && d.previous === 'live') {
      hud.notify('⚠️ Website ist offline – kein Website-Server online, keine Online-Anfragen', 'bad');
      sound.play('warn');
    }
  } else if (type === 'online-request') {
    hud.notify(`🌐 Online-Anfrage von ${d.request.customer} – in der App „Server-Vermietung“`, 'info');
  }
};
// Speicher-Vermietung auf den NAS (#47): Vertragsende und Kündigung melden
storageRentals.onEvent = (type, d) => {
  if (type === 'rental-ended') {
    hud.notify(`📄 Speicher-Vertrag mit ${d.contract.customer} ist ausgelaufen – ${storageText(d.contract.storage)} auf ${d.server?.type.name ?? 'der NAS'} wieder frei`, 'info');
  } else if (type === 'rental-cancelled') {
    const why = d.diskFailure ? 'Daten waren wegen der defekten Festplatte zu lange nicht erreichbar' : 'NAS war zu lange offline';
    hud.notify(`⚠️ ${d.contract.customer} hat den Speicher gekündigt – ${why}`, 'bad');
    sound.play('warn');
  }
};
// NAS (#46): Festplatten im Schrank einsetzen und herausnehmen
const nasScrapped = new Set(); // NAS-IDs, deren defekte Platte gerade entsorgt wurde – dann meldet nur nas.onEvent
// Speicher-Verträge als Text: „1 Speicher-Vertrag“, „3 Speicher-Verträge“
const contractsText = (n) => `${n} Speicher-${n === 1 ? 'Vertrag' : 'Verträge'}`;
// Nach dem Entsorgen einer defekten Platte: Eine defekte Platte legt die NAS nicht lahm (#49) – die Meldung nennt, ob
// die NAS aus anderem Grund noch steht und ob Speicher-Verträge noch auf eine neue Platte warten
function scrappedDiskText(device, part, stranded) {
  const why = servers.workProblem(device);
  if (why) return `🗑️ Defekte ${part.name} entsorgt – Schacht frei, ${device.type.name} läuft noch nicht: ${why}`;
  if (stranded) return `🗑️ Defekte ${part.name} entsorgt – Schacht frei, ${contractsText(stranded)} offline, bis eine neue Platte drin ist`;
  return `🗑️ Defekte ${part.name} entsorgt – Schacht frei, alle Speicher-Verträge auf ${device.type.name} laufen`;
}
nas.onEvent = (type, d) => {
  if (type === 'disk-inserted') {
    const back = d.restored ? ` – ${contractsText(d.restored)} wieder online` : '';
    const still = d.stranded ? ` · ${contractsText(d.stranded)} noch offline` : '';
    hud.notify(`💽 ${d.part.name} in ${d.device.type.name} eingesetzt (Schacht ${d.bay + 1})${back}${still}`, 'good');
  } else if (type === 'disk-removed' && d.scrapped) {
    nasScrapped.add(d.device.id);
    queueMicrotask(() => nasScrapped.delete(d.device.id)); // nach 'fixed' (falls es kam) wieder vergessen
    hud.notify(scrappedDiskText(d.device, d.part, d.stranded), 'info');
  } else if (type === 'disk-removed') {
    hud.notify(`💽 ${d.part.name} herausgenommen – im Teilelager`, 'info');
  }
};
// Automatische Vergabe durch die privaten Server: vergeben, passt nirgends, gestoppt bzw. wieder aktiv
const placeText = (label) => label.replace(/^🔒 /, '');
rentalAutomation.onEvent = (type, d) => {
  const disk = d.request?.kind === 'storage'; // Speicher-Anfrage (#47) statt VM
  if (type === 'assigned') {
    const what = disk ? `${storageText(d.request.storage)} Speicher` : 'VM';
    hud.notify(`🤖 ${what} für ${d.request.customer} automatisch auf ${d.server.type.name} (${placeText(d.rackLabel)}) vergeben · +${euro.format(d.rent)} / h`, 'good');
    sound.play('pop');
  } else if (type === 'no-fit') {
    hud.notify(disk
      ? `⚠️ Automatische Vergabe: ${storageText(d.request.storage)} Speicher für ${d.request.customer} passt auf keine NAS – bitte selbst zuweisen`
      : `⚠️ Automatische Vergabe: VM für ${d.request.customer} (${d.request.ram} GB · ${d.request.cores} Cores) passt auf keinen Server – bitte selbst zuweisen`, 'bad');
    sound.play('warn');
  } else if (type === 'stopped') {
    hud.notify('⚠️ Automatische Vergabe gestoppt – kein privater Server online', 'bad');
    sound.play('warn');
  } else if (type === 'active') {
    hud.notify(`🤖 Automatische Vergabe aktiv – ${d.server.type.name} (${placeText(d.rackLabel)}) vergibt VM- und Speicher-Anfragen`, 'good');
    sound.play('pop');
  }
};
// KI: Stufenwechsel melden (das KI-Abo wird wie die Miete still gutgeschrieben, 'income')
aiService.onEvent = (type, d) => {
  // Stufe nach Start oder Laden: still, nur der Erfolg „Superintelligenz“ (Stufe 10), falls er noch fehlt
  if (type === 'level-initial') achievements.max('aiLevel', d.level);
  if (type !== 'level-changed') return;
  if (d.level > d.previous) {
    hud.notify(d.previous === 0 ? `🧠 KI ist online – Stufe ${d.level}` : `🧠 KI ist jetzt Stufe ${d.level}`, 'good');
    sound.play('pop');
    achievements.max('aiLevel', d.level); // Erfolg „Superintelligenz“ auf Stufe 10
  } else {
    hud.notify(d.level === 0 ? '⚠️ KI ist offline – kein KI-GPU-Server online' : `⚠️ KI fällt auf Stufe ${d.level} zurück – weniger KI-GPU-Server online`, 'bad');
    sound.play('warn');
  }
};
// KI ab Stufe 9: warnt von selbst (gedrosselt in core/ai-advisor.js – dieselbe Warnung höchstens alle 2 Spielstunden)
advisor.onEvent = (type, d) => {
  if (type !== 'warning') return;
  hud.notify(`🧠 KI-Warnung: ${d.text}`, 'bad');
  sound.play('warn');
};
// Besucher-Grüppchen: bei 12–15 Grüppchen am Tag nur leise Meldungen (ohne Ton), Ton nur bei 5 Sternen
visitors.onEvent = (type, d) => {
  const who = d.party ? partyText(d.party) : '';
  if (type === 'first-today') {
    hud.notify('🚶 Die ersten Besucher sind da', 'info');
  } else if (type === 'paid') {
    hud.notify(`🎟️ Eintritt: ${d.party.size} × ${euroRound.format(d.perPerson)} = ${euroRound.format(d.fee)}`, 'info');
  } else if (type === 'rated') {
    hud.notify(`⭐ ${who}: ${starsText(d.stars)}${d.xp ? ` · +${d.xp} XP` : ''}`, d.stars >= 4 ? 'good' : d.stars <= 2 ? 'bad' : 'info');
    if (d.stars === 5) {
      achievements.add('fiveStarTours');
      if (d.xp) sound.play('done'); // Ton nur, wenn es noch XP gab (Tagesdeckel)
    }
  } else if (type === 'day-summary') {
    const s = d.summary;
    const avg = s.average == null ? '' : ` · Ø ${s.average.toFixed(1).replace('.', ',')} ★`;
    hud.notify(`📊 Besucher an Tag ${s.day}: ${s.people} in ${s.parties} Grüppchen · ${euroRound.format(s.fees)}${avg}`, 'info');
  }
};
const CLIMATE_MESSAGES = {
  hot: (name) => `🌡️ ${name} wird zu heiß – Lüfter im Schrankfenster hochdrehen!`,
  cold: (name) => `❄️ ${name} wird zu kalt – Lüfter im Schrankfenster herunterdrehen!`,
  broken: (name, part) => `🔥 ${name} ist überhitzt – ${part ?? 'ein Teil'} defekt. Teil tauschen oder im Schrankfenster den Techniker rufen`,
  frozen: (name) => `🧊 ${name} ist eingefroren – aufwärmen lassen und im Schrankfenster neu starten`,
};
climate.onEvent = (type, d) => {
  // Defekte Festplatte (#49): die NAS läuft weiter, nur Speicher-Verträge, die nicht mehr passen, sind offline
  if (type === 'broken' && d.down === false) {
    const n = storageRentals.strandedOn(d.device).length;
    hud.notify(`💽 ${d.part?.name ?? 'Festplatte'} in ${d.device.type.name} defekt (überhitzt) – ${n ? `${contractsText(n)} offline` : 'NAS läuft weiter'}, Platte tauschen`, 'bad');
    sound.play('warn');
    return;
  }
  hud.notify(CLIMATE_MESSAGES[type](d.device.type.name, d.part?.name), 'bad');
  sound.play('warn');
};
// Bauteile: Lieferung ins Teilelager, Server läuft nach dem Tausch des defekten Teils wieder
serverParts.onEvent = (type, d) => {
  if (type === 'parts-delivered') hud.notify(`📦 ${d.count} ${d.count === 1 ? 'Bauteil' : 'Bauteile'} geliefert – im Teilelager`, 'good');
  else if (type === 'fixed') {
    // Kommt vor nas.onEvent 'disk-removed' (gleicher Aufruf): erst danach entscheiden, ob die NAS-Meldung schon kam
    queueMicrotask(() => {
      if (nasScrapped.delete(d.device.id)) return;
      hud.notify(`🔧 ${d.device.type.name}: defektes Teil getauscht`, 'good');
    });
  }
};
// Klima-Automatik: an, Automatik-Server fällt aus bzw. ist wieder da
const racksText = (n) => `${n} ${n === 1 ? 'Schrank' : 'Schränke'}`;
// Ein Automatik-Server mit Namen, mehrere gleichzeitig zusammengefasst
const serversText = (devices) => (devices.length === 1
  ? `Automatik-Server ${devices[0].type.name}`
  : `${devices.length} Automatik-Server (${devices.map((x) => x.type.name).join(', ')})`);
automation.onEvent = (type, d) => {
  if (type === 'active') {
    hud.notify(`🌡️ Klima-Automatik aktiv – steuert ${racksText(d.racks)}`, 'good');
    sound.play('pop');
  } else if (type === 'server-lost') {
    const rest = d.racks ? `${racksText(d.racks)} werden nicht mehr geregelt` : 'die anderen Automatik-Server übernehmen';
    hud.notify(`⚠️ ${serversText(d.devices)} offline – ${rest}`, 'bad');
    sound.play('warn');
  } else if (type === 'server-back') {
    hud.notify(`🌡️ ${serversText(d.devices)} wieder online – steuer${d.devices.length === 1 ? 't' : 'n'} ${racksText(d.racks)}`, 'good');
    sound.play('pop');
  }
};
// Ausstellungsregale an der Südwand
const displayWall = createDisplayWall({ economy, carry, collision });
scene.add(displayWall.group);
const storage = createStorageRoom({ economy, carry, collision, upgrades });
scene.add(storage.group);
// Keller-Lager (#53): Stapelzonen und Filament-Regale in den Lager-Feldern (hängt in basement.fields)
createBasementStorage({ economy, store: basementStorage, carry, collision, fields: basement.fields, layout: upgrades.basementLayout });

// Kater Düsentrieb streunt durch die Halle
const cat = createCat({
  economy,
  tableHeight: TABLE_HEIGHT,
  avoid: basement.hallObstacles, // nicht übers Kellerloch oder in den Fahrstuhlschacht
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
  obstacles: basement.hallObstacles, // Kellerloch mit Geländer und Fahrstuhlschacht: abprallen wie an einer Wand
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
// Besucher-Grüppchen als Figuren: kommen über den Garten zum Empfang und gehen allein durch Halle, Lager und
// Serverraum (melden arrived, reachedStation und finished je Grüppchen an core/visitors.js). Sie weichen dem Spieler,
// den Azubis und den Kunden aus.
const visitorGroup = createVisitorGroup({
  visitors, collision, upperFloor,
  others: () => [...customers.positions(), ...workers.positions(), ...pedestrians.group.children.map((h) => h.position)],
  onReady: () => precompileShaders(),
});
scene.add(visitorGroup.group);
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
  // Alter Spielstand vor dem Wandanschluss (#28): einmal Bescheid sagen, warum die Server jetzt offline sind
  if (servers.wanNotice) {
    servers.wanNotice = false; // wird mit dem nächsten Speichern vergessen
    hud.notify('🌐 Neu: Internet gibt es nur noch über den Anschluss an der Wand – Patchpanel oder Firewall-WAN über das Kabelgitter oben anschließen', 'info');
  }
}

function onStopped() {
  if (!uiOpen()) {
    // Pause (am PC per Esc – die Seite sieht die Taste dann nicht): angefangenes Verlegen im Serverraum abbrechen
    serverRoom.cancelPick();
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
  rentalAutomation, // automatische Vergabe durch die privaten Server: Schalter und Status in der App
  storageRentals, // Speicher-Vermietung auf den NAS (#47): Anfragen und Verträge in der App „Server-Vermietung“
  website, // eigene Website (#54): Statuszeile in der Server-Vermietung, App „Website“ (#55)
  ai: aiService, // App „KI“: Stufe, KI-GPU-Server online, KI-Abo
  serverParts, // App „Teile-Shop“: Bauteile kaufen, Teilelager, defekte Server
  advisor, // Antworten im KI-Chat (core/ai-advisor.js)
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
  automation, // Klima-Automatik: Anzeige, Schalter „Automatik an/aus“
  rentals, // VM-Auslastung je Server (core/server-rentals.js)
  ai: aiService, // KI-GPU-Server: rechnet für die KI oder warum nicht (überhitzt)
  nas, // NAS-Zeile mit Speicher und Schächten (#46/#48)
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
// Werkbank-Menü: Steckplätze des Servers auf der Werkbank, wie das Schrankfenster mit freier Maus
const workbenchPanel = createWorkbenchPanel({
  economy,
  parts: serverParts,
  bench: workbench,
  canPickUp: () => workbenchStation.pickUpProblem(),
  onPickUp: () => workbenchStation.pickUp(), // Server als Karton in die Hand
  onClose: () => {
    if (gameOver) return;
    title.showResume();
    startPlaying();
  },
});
function openWorkbench(deviceId) {
  workbenchPanel.open(deviceId);
  stopPlaying();
}
// Ist gerade ein Fenster offen (PC, Schrank oder Werkbank)? Dann läuft die Zeit weiter und es gibt kein Pausenmenü
const uiOpen = () => shop.isOpen() || rackPanel.isOpen() || workbenchPanel.isOpen();

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
  targets: [room, upperFloor.group, basement.group, basement.hallGroup, serverRoom.group, workbenchStation.group, entrance.group, receptionDesk.group, customers.group, receptionist.group, outdoor.group, storage.group, office.group, hall.group, computerDesk, workshop.group, displayWall.group, cat.group, throwing.group, workers.group, visitorGroup.group],
});

// Tablet: kein Esc – abbrechen geht dort per Tippen auf den gewählten Port oder ⏸
interaction.formatText = (text) => (isTablet() ? tabletText(text).replace(' oder Esc:', ':') : text);

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
  // Esc bricht außerdem ein angefangenes Verlegen im Serverraum ab (zusätzlich, nicht statt des Pausenmenüs)
  if (e.code === 'Escape') serverRoom.cancelPick();
  if (e.code === 'Escape' && shop.isOpen()) shop.close();
  else if (e.code === 'Escape' && rackPanel.isOpen()) rackPanel.close();
  else if (e.code === 'Escape' && workbenchPanel.isOpen()) workbenchPanel.close();
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

// Im Treppenhaus bzw. Keller: Stockwerk unter 0 oder schon auf dem obersten Treppenlauf (Stockwerk 0, Boden unter der
// Hallenebene, bis −1,75 m) – gilt für Werfen und Hallenlicht
const belowHall = () => playerLevel < 0 || (playerLevel === 0 && groundY < -0.01);

// Werfen nur in der Halle – von der zweiten Etage fiele der Drucker durch die Decke, unten in Treppenhaus und Keller
// (auch schon auf dem obersten Treppenlauf) kennt die Wurfbahn den Boden nicht
function throwCarried() {
  if (playerLevel > 0) hud.notify('Von hier oben lieber nichts werfen – erst runter in die Halle', 'info');
  else if (belowHall()) hud.notify('Hier unten lieber nichts werfen – erst hoch in die Halle', 'info');
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
    // Treppe: Boden steigt mit, ab halber Höhe gilt die zweite Etage – im Treppenhaus zum Keller entscheidet
    // basement.footing (braucht die bisherige Bodenhöhe, weil sich 20 Stockwerke dieselbe Grundfläche teilen)
    const { x, z } = camera.position;
    const foot = basement.footing(x, z, playerLevel, groundY) ?? upperFloor.footing(x, z, playerLevel);
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
const UNDERGROUND = new THREE.Vector3(99, 0, 99); // für hallLights: ein Punkt weit außerhalb der Halle
// Halle, Anbauten und Außenbereich nur zeichnen, wenn man hineinsehen kann
// Die Lampenschatten der Anbauten sind statisch. Ein ausgeblendeter Raum fehlt in der Schattenkarte, deshalb beim
// Einblenden neu zeichnen – aber nur, wenn sich seitdem etwas geändert hat. Bei jedem Umschauen zu zeichnen
// (jede Lampe zeichnet dafür die Szene sechsmal) ließ das Bild beim Kurvenlaufen ruckeln.
const staleShadows = new Set();
const culling = createRoomCulling(camera, {
  hall: [room, upperFloor.group, basement.hallGroup, serverRoom.group, workbenchStation.group, hall.group, workshop.group, computerDesk],
  storage: [storage.group],
  office: [office.group],
  entrance: [entrance.group, receptionDesk.group],
}, (name) => {
  if (staleShadows.delete(name)) graphics.refreshStaticShadows();
}, (p) => !basement.hallVisibleFrom(p)); // tief im Treppenhaus und im Keller sieht man nichts von oben

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
  office: office.group, workers: workers.group, visitors: visitorGroup.group, basement: basement.group,
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
      economy.advanceTime(gameMinutes, gameClock.minutes); // Tarif der Minuten dieses Schritts
      powerGrid.advance(gameMinutes, gameClock); // Stromausfall beginnt/endet – vor Druckern, Servern und Verträgen
      economy.advancePrints(gameMinutes);
      orders.advance(gameMinutes);
      climate.advance(gameMinutes);
      automation.advance(gameMinutes); // nach dem Klima: regelt mit den neuen Temperaturen
      rentals.advance(gameMinutes);
      storageRentals.advance(gameMinutes); // Speicher-Anfragen und -Verträge (#47)
      website.advance(gameMinutes); // eigene Website (#54): Hochfahren, Online-Anfragen, Tagesstatistik
      rentalAutomation.advance(gameMinutes); // vergibt Anfragen, deren Kunde am Empfang steht
      aiService.advance(gameMinutes); // Stufenwechsel der KI erkennen (prüft höchstens einmal je Spielminute)
      advisor.advance(gameMinutes); // KI ab Stufe 9: prüft alle 2 Spielminuten auf Warnungen
      gameClock.advance(gameMinutes);
      visitors.advance(gameMinutes); // nach der Uhr: Tagesplan und Ankünfte hängen an der Uhrzeit
      checkBankrupt();
    });
  }
  safely('Drucker', () => workshop.animate(dt));
  // Wer die zweite Etage bzw. den Keller verlässt (Treppe, Fahrstuhl), bricht ein dort angefangenes Verlegen ab
  serverRoom.leaveLevel(playerLevel);
  safely('Serverraum', () => serverRoom.update(dt, camera)); // Kamera: Detailstufe der Bunker-Schränke
  safely('Werkbank', () => workbenchStation.update(dt)); // offener Server nur, solange einer darauf liegt
  safely('Ausstellungsregal', () => displayWall.update());
  // Unter der Erde (ab dem ersten Schritt die Treppe hinunter) zählt man nicht als „in der Halle“ – das Hallenlicht
  // dunkelt dort nichts ab
  safely('Licht', () => hallLights.update(dt, belowHall() ? UNDERGROUND : camera.position, !powerGrid.isPowered('lights')));
  safely('Kater', () => cat.update(dt));
  safely('Werfen', () => throwing.update(dt));
  safely('Azubis', () => workers.update(dt));
  safely('Büro', () => office.update(dt, workers.gaming()));
  safely('Eingang', () => entrance.update(dt, [camera.position, ...customers.positions(), ...visitorGroup.positions()]));
  safely('Räume', () => culling.update());
  safely('Keller', () => basement.update(dt, camera)); // Treppenhaus nur in der Nähe zeichnen, Sonne unten aus
  safely('Besuchergruppe', () => visitorGroup.update(dt, camera, culling)); // nach den Räumen: blendet mit aus
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
    serverParts.advance(dt); // Bauteil-Pakete ins Teilelager
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
