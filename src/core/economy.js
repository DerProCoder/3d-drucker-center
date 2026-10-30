// Wirtschaft und Besitz: Kontostand, Spielzeit mit stündlicher Abrechnung (Miete + Strom), Drucker (Standort,
// Spulen, Druckauftrag, Pannen), Filamentlager mit Feuchte, fertige Teile, Zubehör.
// Bewusst ohne Three.js, damit die Logik unabhängig vom Rendering bleibt.
import {
  FAILURES, LED_COLORS, PRINTERS, SPOOL_GRAMS, filamentById, filamentLabel, isWallFurniture, speedById, speedModesFor,
  templateById,
} from './catalog.js';
import {
  PURGE_SHARE, accentProblem, accentSlot, colorCount, colorTimeFactor, gramsPerColor, hasNozzleChanger, hasWasteBin,
  isMultiColor, isTwoColor,
  multiColorProblem, multiColorSlots, partColors, waitingFilament,
} from './two-color.js';
import { createLaserJob, isLaser, laserProblem } from './laser.js';


// Start klein: 150 €, ein A1 mini auf dem ersten Tisch und eine Rolle PLA schon eingelegt (siehe giveStarterKit)
export const START_MONEY = 150; // €
const STARTER_PRINTER = 'a1-mini';
const STARTER_FILAMENT = 'pla-weiß';
export const GAME_MINUTES_PER_SECOND = 1 / 3; // Spielzeit: 1 echte Sekunde = 20 Spielsekunden
export const RENT_PER_HOUR = 3;    // € Hallenmiete pro Spielstunde
export const IDLE_POWER_SHARE = 0.15; // Stromverbrauch im Leerlauf, Anteil vom Verbrauch beim Drucken
export const BANKRUPT_AT = -500;   // so weit lässt die Bank das Konto überziehen, danach ist Schluss
export const WET = 0.5;            // ab dieser Feuchte gilt eine Spule als feucht
export const DAMP = 0.4;           // ab dieser Feuchte steigt das Fehldruckrisiko
export const NOZZLE_POKES = 5;     // so oft muss man eine verstopfte Düse freistechen
export const NOZZLE_LIFE_HOURS = 48; // so viele Druckstunden (bei 100 %) hält eine Düse
export const NOZZLE_WORN = 0.75;   // ab diesem Verschleiß steigt das Fehldruckrisiko
export const WASTE_BIN_GRAMS = 100; // so viel Spülabfall passt in den Mülleimer (eine Düse mit AMS)
export const WASTE_EMPTY_AT = 70;   // ab so viel Gramm leeren Azubis den Eimer bzw. kann man ihn am Drucker leeren
export const WOOD_STOCK_MAX = 30;   // so viele Holzplatten passen auf die Palette im Abstellraum
export const PLATE_GAP = 5;        // mm Abstand zwischen Teilen auf der Druckplatte
export const MAX_PER_PLATE = 16;   // mehr Teile auf einmal lässt das Spiel nicht zu
const BATCH_TIME_SHARE = 0.9;      // jedes weitere Teil braucht 90 % der Zeit (Aufheizen, Kalibrieren nur einmal)

// Teile auf der Druckplatte im Raster anordnen. Gibt { max, positions } zurück: wie viele höchstens passen und
// die Mittelpunkte (mm, relativ zur Plattenmitte, x = Breite, y = Tiefe) für count Teile.
// Teile dürfen gedreht werden, wenn dann mehr draufpassen.
export function plateLayout(template, build, count = 1) {
  const grid = (w, d) => {
    const cols = Math.floor((build.x + PLATE_GAP) / (w + PLATE_GAP));
    const rows = Math.floor((build.y + PLATE_GAP) / (d + PLATE_GAP));
    return { cols, rows, w, d, max: Math.min(MAX_PER_PLATE, cols * rows) };
  };
  const a = grid(template.size.x, template.size.y);
  const b = grid(template.size.y, template.size.x);
  const g = b.max > a.max ? { ...b, rotated: true } : { ...a, rotated: false };
  const n = Math.max(0, Math.min(count, g.max));
  // Möglichst quadratisch belegen: so viele Spalten wie nötig, Reihen danach
  const square = Math.ceil(Math.sqrt(n * (g.d + PLATE_GAP) / (g.w + PLATE_GAP))) || 1;
  const cols = Math.min(g.cols, Math.max(square, Math.ceil(n / g.rows)));
  const rows = Math.ceil(n / cols);
  const positions = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols); // letzte Reihe mittig
    positions.push({
      x: (c - (inRow - 1) / 2) * (g.w + PLATE_GAP),
      y: (r - (rows - 1) / 2) * (g.d + PLATE_GAP),
    });
  }
  return { max: g.max, rotated: g.rotated, positions };
}

// Druckzeit (Spielminuten bei 100 %) und Material für count Teile auf einer Platte
export const batchMinutes = (template, count = 1) => template.minutes * (1 + BATCH_TIME_SHARE * (count - 1));
export const batchGrams = (template, count = 1) => template.grams * count;

// Feuchte (0 = trocken, 1 = klatschnass) pro Spielminute, je nachdem, wo die Spule liegt.
// 1 Spieltag = 72 echte Minuten: Am offenen Halter ist eine Spule nach etwa einem Spieltag feucht.
const MOISTURE_PER_MINUTE = {
  shelf: 1 / 4320, // offen im Regal: nach drei Spieltagen durchnässt
  dryer: -1 / 240, // im Trockenschrank: nach 4 Spielstunden wieder trocken
  open: 1 / 2880,  // offener Spulenhalter am Drucker: nach zwei Spieltagen durchnässt
  ams: 1 / 8640,   // im AMS mit Trockenmittel
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Spule: { filamentId, grams, moisture }
// Drucker:
//   location: 'shipping' (bestellt, noch unterwegs: arriveIn Sekunden) | 'storage' (Karton im Abstellraum)
//             | 'carried' (in der Hand) | 'table' (aufgestellt)
//             | 'floor' (geworfen, liegt auf dem Boden: floor = { x, z, rotY, boxed })
//   spools: Fächer für Spulen (Spule oder null) – 1 Fach oder 4 beim AMS
//   activeSlot: Fach, aus dem gedruckt wird · accentSlot: Fach der zweiten Farbe bei zweifarbigen Drucken (oder null)
//   multiSlots: im Druckermenü gewählte Fächer der Teile mehrfarbiger Drucke (Index = Teil, oder null)
//   ledColor: Farbe der LED-Leiste (nur Drucker mit ledStrip, Schlüssel aus LED_COLORS), sonst null
//   speedId: gewählte Geschwindigkeitsstufe
//   clogged / nozzlePokes: verstopfte Düse und wie oft schon gestochert wurde
//   nozzleWear: Verschleiß der Düse 0…1 – bei 1 ist sie hinüber und muss getauscht werden
//   waste: Gramm Spülabfall im Mülleimer (nur eine Düse mit AMS), bei WASTE_BIN_GRAMS ist er voll
//   sheet: eingelegte Holzplatte { woodId } (nur Laser, siehe core/laser.js) oder null
//   job: { templateId, count (Teile auf der Platte), filamentId, slot, progress 0…1, gramsUsed,
//          status: 'printing' | 'paused' | 'done' | 'failed', pauseReason?: 'filament' | 'waste' | 'power' (Stromausfall, #57), failure?: Schlüssel aus FAILURES,
//          zweifarbig zusätzlich filamentId2, slot2 und missingFilament (auf welche Spule der Drucker wartet),
//          mehrfarbig filamentIds und slots (alle Farben, [0] = filamentId/slot) und missingFilament }
//        oder null
// Fertige Teile haben eine Farbe: Schlüssel `${templateId}|${filamentId}` → Anzahl,
// zweifarbige zwei: `${templateId}|${filamentId}|${filamentId2}`, mehrfarbige alle: `${templateId}|${id1}+${id2}+…`
// Regal: Spulen mit festem Platz { filamentId, grams, moisture, shelfSlot }, damit beim Herausnehmen nichts nachrutscht
// Kartons im Abstellraum haben ebenso einen festen Platz (storageSpot)
// Einrichtung (Regale am Druckertisch): { id, type (aus FURNITURE), location, slot, storageSpot,
//   spools (Filament-Regal: Fächer mit Spule oder null), nozzles (Ersatzteilregal: Anzahl Ersatzdüsen),
//   parts (Ausstellungsregal: Fächer mit ausgestelltem Teil oder null, siehe display-shelf.js) }
//   Regale stehen auf eigenen Plätzen in den Lücken zwischen den Druckern (3 pro Drucktisch, siehe upgrades.js),
//   Ausstellungsregale an der Südwand (location 'wall').
// Lose Teile: hat der Kater vom Tisch geworfen, liegen auf dem Boden { id, templateId, filamentId, x, z, rotY }
export const DELIVERY_SECONDS = 60; // so lange (echte Sekunden) ist ein bestelltes Paket unterwegs
export const CARRY_ALL_MAX = 10;    // Entwicklermenü „Alles tragen“: so viele Kartons, Spulen bzw. Holzplatten in der Hand

export class Economy {
  constructor() {
    this.money = START_MONEY;
    this.unlimited = false;          // Entwicklermenü: unendlich Geld
    this.instantDelivery = false;    // Entwicklermenü: Pakete kommen sofort
    this.carryAll = false;           // Entwicklermenü: bis zu 10 Kartons, Spulen, Platten auf einmal tragen
    // Passt eine Liste Kartons ([{ model } | { type }]) in den Abstellraum? Setzt world/storage-room.js, das die
    // Kartongrößen kennt (core/storage-stack.js stapelt). Ohne Rückruf ist immer Platz.
    this.storageFits = null;
    // Keller-Lager (core/basement-storage.js): nimmt Lieferungen auf, wenn der Abstellraum voll ist. Ohne Keller null.
    this.overflow = null;
    this.wagesPerHour = 0;           // Lohn fürs Personal (setzt core/staff.js)
    this.pendingCosts = 0;           // aufgelaufene Kosten der laufenden Stunde (die Uhrzeit führt game-clock.js)
    // Zähler seit Spielstart bzw. Laden (nicht gespeichert): tatsächlich angefallene Stromkosten (mit Tarif) und alle
    // laufenden Kosten – der KI-Tagesverlauf (core/ai-day-log.js) zählt daraus die Differenzen
    this.powerCostTotal = 0;
    this.costTotal = 0;
    this.printers = [];
    this.shelf = [];                 // Spulen im Regal
    this.woodStock = {};             // Holzplatten im Abstellraum: Holz-ID → Anzahl
    this.finishedParts = new Map();
    this.looseParts = [];
    this.accessories = new Set();    // gekauftes Zubehör (IDs aus ACCESSORIES)
    this.furniture = [];             // Regale (siehe oben)
    this.nextFurnitureId = 1;
    this.nextPrinterId = 1;
    this.nextLooseId = 1;
    this.listeners = new Set();
    this.onEvent = null;             // (type, data) => void – für Sound, Meldungen und Erfolge
    this.extraPowerPerHour = null;   // () => Strom weiterer Geräte pro Stunde (Server, core/servers.js)
    this.powerGrid = null;           // Stromnetz (core/power-grid.js, #57): Tarif, Stromausfall – ohne: Faktor 1
    this.random = Math.random;       // austauschbar, damit sich Pannen im Test erzwingen lassen
  }

  // ---------- Laufende Kosten ----------

  // Strom: aufgestellte Drucker verbrauchen beim Drucken voll, sonst nur ein wenig
  get powerPerHour() {
    return this.printers
      .filter((p) => p.location === 'table')
      .reduce((sum, p) => sum + p.model.powerPerHour * (p.job?.status === 'printing' ? 1 : IDLE_POWER_SHARE), 0)
      + (this.extraPowerPerHour?.() ?? 0);
  }

  // Faktor für die Stromkosten gerade jetzt: Tag-/Nachttarif, bei Stromausfall 0 (core/power-grid.js, #57)
  get powerCostFactor() {
    return this.powerGrid ? this.powerGrid.costFactor : 1;
  }

  // Was der Strom gerade wirklich kostet (Verbrauch × Tarif) – powerPerHour ist der Verbrauch zum Grundpreis
  get powerCostPerHour() {
    return this.powerPerHour * this.powerCostFactor;
  }

  get costPerHour() {
    return RENT_PER_HOUR + this.powerCostPerHour + this.wagesPerHour;
  }

  // Strom-Zustand für Anzeigen (Leitstand #58): Tarif, Ausfall, Notstrom, Verbrauch und Kosten pro Stunde
  get powerStatus() {
    return {
      ...(this.powerGrid?.status() ?? { factor: 1, outage: null, backup: false }),
      powerPerHour: this.powerPerHour,
      powerCostPerHour: this.powerCostPerHour,
    };
  }

  get bankrupt() {
    return this.money < BANKRUPT_AT;
  }

  get hasDryer() {
    return this.accessories.has('dryer');
  }

  // Lässt die Spielzeit laufen: Spulen ziehen Feuchte, Miete und Strom laufen auf. from: Spielzeit zu Beginn des
  // Schritts (GameClock.minutes) – damit gilt über 6 bzw. 22 Uhr hinweg genau der Tarif der jeweiligen Minuten
  advanceTime(gameMinutes, from) {
    const factor = this.powerGrid ? this.powerGrid.costFactorOver(from ?? this.powerGrid.time, gameMinutes) : 1;
    const power = (this.powerPerHour * factor * gameMinutes) / 60;
    const costs = ((RENT_PER_HOUR + this.wagesPerHour) * gameMinutes) / 60 + power;
    this.pendingCosts += costs;
    this.powerCostTotal += power;
    this.costTotal += costs;
    this.updateMoisture(gameMinutes);
  }

  // Stromausfall (#57): laufende Drucke pausieren mit Grund 'power' (kein Fehldruck), danach laufen sie weiter.
  // Gibt zurück, ob sich ein Status geändert hat.
  syncPrinterPower() {
    const powered = !this.powerGrid || this.powerGrid.isPowered('printers');
    let changed = false;
    for (const p of this.printers) {
      const job = p.job;
      if (!powered && job?.status === 'printing') {
        job.status = 'paused';
        job.pauseReason = 'power';
        changed = true;
      } else if (powered && job?.status === 'paused' && job.pauseReason === 'power') {
        job.status = 'printing';
        delete job.pauseReason;
        changed = true;
      }
    }
    return changed;
  }

  // Zu jeder vollen Spielstunde (Meldung der Spieluhr): aufgelaufene Miete und Strom abbuchen
  payHourlyBill() {
    const amount = Math.round(this.pendingCosts * 100) / 100;
    this.pendingCosts = 0;
    if (amount <= 0) return;
    this.charge(amount);
    this.emit('bill', { amount });
  }

  // Rechnung abbuchen. Darf ins Minus gehen – dann kann man nichts mehr kaufen.
  charge(amount) {
    if (this.unlimited) return;
    this.money = Math.round((this.money - amount) * 100) / 100;
    this.notify();
  }

  updateMoisture(gameMinutes) {
    const shelfRate = this.hasDryer ? MOISTURE_PER_MINUTE.dryer : MOISTURE_PER_MINUTE.shelf;
    for (const s of this.shelf) s.moisture = clamp01(s.moisture + shelfRate * gameMinutes);
    // Das Filament-Regal am Tisch ist offen wie das Lagerregal ohne Trockenschrank. Im Keller-Lager ist es trocken:
    // dort zieht eine Spule keine Feuchtigkeit (trocken wird sie dort aber auch nicht)
    for (const f of this.furniture) {
      if (f.location === 'basement-rack') continue;
      for (const s of f.spools ?? []) if (s) s.moisture = clamp01(s.moisture + MOISTURE_PER_MINUTE.shelf * gameMinutes);
    }
    for (const p of this.printers) {
      const rate = p.spools.length > 1 ? MOISTURE_PER_MINUTE.ams : MOISTURE_PER_MINUTE.open;
      for (const s of p.spools) if (s) s.moisture = clamp01(s.moisture + rate * gameMinutes);
    }
  }

  // ---------- Besitz ----------

  get spoolsInStorage() {
    return this.shelf.length;
  }

  canAfford(amount) {
    return this.unlimited || this.money >= amount;
  }

  // Wie lange ein Paket gerade unterwegs ist (Sekunden)
  get deliverySeconds() {
    return this.instantDelivery ? 0 : DELIVERY_SECONDS;
  }

  // Bestellte Kartons (Drucker und Regale), die noch unterwegs sind
  get shipments() {
    return [...this.printers, ...this.furniture].filter((x) => x.location === 'shipping');
  }

  // Paket auf den Weg schicken: es landet erst nach deliverySeconds im Abstellraum – ist der voll, reserviert es
  // einen Platz im Keller-Lager (item.basement, core/basement-storage.js)
  ship(item) {
    item.location = 'shipping';
    item.storageSpot = null;
    item.arriveIn = this.deliverySeconds;
    delete item.basement;
    if (!this.storageRoomFits(item, item)) this.overflow?.reserve(item);
  }

  // Läuft in echter Zeit: angekommene Pakete kommen auf einen freien Platz im Abstellraum bzw. auf ihren Platz im
  // Keller-Lager
  advanceDeliveries(seconds) {
    const arrived = [];
    const basement = [];   // davon im Keller-Lager
    const room = [];       // davon im Abstellraum
    for (const item of this.shipments) {
      item.arriveIn -= seconds;
      if (item.arriveIn > 0) continue;
      const name = item.model?.name ?? item.type.name;
      if (item.basement) {
        item.location = 'basement';
        basement.push(name);
      } else {
        item.location = 'storage';
        item.storageSpot = this.freeStorageSpot();
        room.push(name);
      }
      delete item.arriveIn;
      arrived.push(name);
    }
    if (!arrived.length) return;
    this.notify();
    this.emit('delivered', { names: arrived, basement, room });
  }

  filamentStock(filamentId) {
    return this.shelf.filter((s) => s.filamentId === filamentId).length;
  }

  printersOfModel(modelId) {
    return this.printers.filter((p) => p.model.id === modelId).length;
  }

  printerById(id) {
    return this.printers.find((p) => p.id === id);
  }

  // Zieht den Betrag ab, falls genug Geld da ist. Gibt zurück, ob es geklappt hat.
  spend(amount) {
    if (!this.withdraw(amount)) return false;
    this.notify();
    return true;
  }

  earn(amount) {
    this.money += amount;
    this.notify();
  }

  // ---------- Einkauf: alles wird in den Abstellraum geliefert ----------

  // Gibt den neuen Drucker zurück oder null, wenn das Geld nicht reicht
  buyPrinter(model) {
    if (!this.roomForBox({ model }) || !this.withdraw(model.price)) return null;
    const printer = this.addPrinter(model);
    this.ship(printer);
    this.notify();
    return printer;
  }

  // Drucker ohne Bezahlen dazubekommen (Startausstattung). Landet wie gekaufte im Abstellraum.
  addPrinter(model) {
    const printer = {
      id: this.nextPrinterId++, model, location: 'storage', slot: null,
      spools: Array(model.spoolSlots).fill(null), activeSlot: 0, accentSlot: null, multiSlots: null, speedId: 'standard', job: null,
      ledColor: model.ledStrip ? LED_COLORS[0].id : null,
      clogged: false, nozzlePokes: 0, nozzleWear: 0, waste: 0, sheet: null, storageSpot: this.freeStorageSpot(),
    };
    this.printers.push(printer);
    this.notify();
    return printer;
  }

  // Startausstattung für ein neues Spiel: A1 mini auf Platz 0 des ersten Tisches, eine Rolle PLA schon eingelegt
  giveStarterKit() {
    const printer = this.addPrinter(PRINTERS.find((m) => m.id === STARTER_PRINTER));
    this.placePrinter(printer.id, 0);
    this.loadFilament(printer.id, { filamentId: filamentById(STARTER_FILAMENT).id, grams: SPOOL_GRAMS, moisture: 0 });
  }

  buyFilament(filament) {
    if (!this.withdraw(filament.price)) return false;
    this.storeSpool({ filamentId: filament.id, grams: SPOOL_GRAMS, moisture: 0 });
    this.notify();
    return true;
  }

  // ---------- Holz und Laser ----------

  woodCount(woodId) {
    return this.woodStock[woodId] ?? 0;
  }

  get woodSheets() {
    return Object.values(this.woodStock).reduce((a, b) => a + b, 0);
  }

  // Holzplatten landen als Stapel im Abstellraum
  buyWood(wood) {
    if (this.woodSheets >= WOOD_STOCK_MAX || !this.withdraw(wood.price)) return false;
    this.woodStock[wood.id] = this.woodCount(wood.id) + 1;
    this.notify();
    return true;
  }

  // Eine Platte vom Stapel nehmen (in die Hand) – gibt { woodId } oder null zurück
  takeWoodSheet(woodId) {
    if (!this.woodCount(woodId)) return null;
    this.woodStock[woodId]--;
    this.notify();
    return { woodId };
  }

  returnWoodSheet(sheet) {
    if (!sheet) return;
    this.woodStock[sheet.woodId] = this.woodCount(sheet.woodId) + 1;
    this.notify();
  }

  // Platte in den Laser legen. Gibt die verdrängte Platte zurück (oder null). Nicht, solange er lasert.
  insertSheet(printerId, sheet) {
    const p = this.printerById(printerId);
    if (!isLaser(p) || this.isBusy(p)) return sheet;
    const previous = p.sheet;
    p.sheet = { woodId: sheet.woodId };
    this.notify();
    return previous;
  }

  removeSheet(printerId) {
    const p = this.printerById(printerId);
    if (!isLaser(p) || this.isBusy(p) || !p.sheet) return null;
    const sheet = p.sheet;
    p.sheet = null;
    this.notify();
    return sheet;
  }

  // Laserauftrag starten. options: { text, motif } (siehe core/laser.js)
  startLaser(printerId, template, options = {}) {
    const p = this.printerById(printerId);
    if (!isLaser(p) || laserProblem(p, template, options)) return false;
    p.job = createLaserJob(p, template, options);
    p.sheet = null; // die Platte ist jetzt das Werkstück
    const printing = this.printers.filter((x) => x.job?.status === 'printing').length;
    this.emit('print-started', { printer: p, template, printing });
    this.notify();
    return true;
  }

  buyAccessory(accessory) {
    if (this.accessories.has(accessory.id) || !this.withdraw(accessory.price)) return false;
    this.accessories.add(accessory.id);
    this.notify();
    return true;
  }

  // ---------- Tragen, Aufstellen, Einlegen ----------

  takePrinterFromStorage(id) {
    const p = this.printerById(id);
    if (p?.location !== 'storage') return false;
    p.location = 'carried';
    p.storageSpot = null;
    this.notify();
    return true;
  }

  returnPrinterToStorage(id) {
    const p = this.printerById(id);
    if (!p) return;
    this.putAway(p);
    this.notify();
  }

  // Aufgestellten Drucker hochheben (nicht, solange er druckt). Spulen und fertige Teile bleiben drin.
  canLift(printer) {
    return printer.location === 'table' && !this.isBusy(printer);
  }

  liftPrinter(id) {
    const p = this.printerById(id);
    if (!p || !this.canLift(p)) return false;
    p.location = 'carried';
    p.slot = null;
    this.notify();
    return true;
  }

  // Geworfener Drucker bleibt dort auf dem Boden liegen, wo er gelandet ist
  dropPrinter(id, floor) {
    const p = this.printerById(id);
    if (!p) return;
    p.location = 'floor';
    p.floor = floor;
    this.notify();
  }

  takePrinterFromFloor(id) {
    const p = this.printerById(id);
    if (p?.location !== 'floor') return false;
    p.location = 'carried';
    delete p.floor;
    this.notify();
    return true;
  }

  placePrinter(id, slot) {
    const p = this.printerById(id);
    if (!p) return;
    p.location = 'table';
    p.slot = slot;
    this.notify();
  }

  // Nimmt genau die Spule von diesem Regalplatz (null, wenn dort keine liegt)
  takeSpoolFromShelf(shelfSlot) {
    const spool = this.shelf.find((s) => s.shelfSlot === shelfSlot);
    if (!spool) return null;
    this.shelf = this.shelf.filter((s) => s !== spool);
    this.notify();
    const { shelfSlot: _, ...rest } = spool;
    return rest;
  }

  returnFilamentToStorage(spool) {
    this.storeSpool(spool);
    this.notify();
  }

  activeSpool(printer) {
    return printer.spools[printer.activeSlot] ?? null;
  }

  // Ob gerade Spulen gewechselt werden dürfen: nicht während des Drucks, außer er wartet auf neues Filament
  canChangeSpools(printer) {
    return !this.isBusy(printer) || printer.job.pauseReason === 'filament';
  }

  // Fach, in das eine neue Spule käme: erstes freies, bei nur einem Fach immer dieses (Tausch). -1 = AMS voll.
  loadTarget(printer) {
    const free = printer.spools.indexOf(null);
    if (free !== -1) return free;
    return printer.spools.length === 1 ? 0 : -1;
  }

  // Fach, aus dem beim Herausnehmen die Spule kommt: das letzte belegte. -1 = alles leer.
  unloadTarget(printer) {
    return printer.spools.findLastIndex((s) => s !== null);
  }

  // Legt eine Spule ein und gibt die dadurch verdrängte zurück (oder null). Wartet der Drucker auf genau
  // dieses Filament, druckt er gleich aus dem neuen Fach weiter.
  loadFilament(printerId, spool) {
    const p = this.printerById(printerId);
    const slot = this.loadTarget(p);
    if (slot === -1) return null;
    const previous = this.takeSpool(p, slot);
    p.spools[slot] = { ...spool };
    const job = p.job;
    if (job?.pauseReason === 'filament' && spool.filamentId === waitingFilament(job)) {
      const color = job.filamentIds?.indexOf(spool.filamentId) ?? -1;
      if (color > 0) {
        job.slots[color] = slot; // eine weitere Farbe eines mehrfarbigen Drucks
      } else if (spool.filamentId === job.filamentId) {
        if (job.slots) job.slots[0] = slot;
        job.slot = slot;
        p.activeSlot = slot;
      } else {
        job.slot2 = slot; // zweite Farbe eines zweifarbigen Drucks
        p.accentSlot = slot;
      }
      job.status = 'printing';
      delete job.pauseReason;
      delete job.missingFilament;
      this.emit('print-resumed', { printer: p });
    } else if (!this.activeSpool(p) && !job) {
      p.activeSlot = slot; // leeres aktives Fach: neue Spule gleich auswählen
    }
    this.notify();
    return previous;
  }

  unloadFilament(printerId) {
    const p = this.printerById(printerId);
    const slot = this.unloadTarget(p);
    const previous = slot === -1 ? null : this.takeSpool(p, slot);
    this.notify();
    return previous;
  }

  setActiveSlot(printerId, slot) {
    const p = this.printerById(printerId);
    if (p.job) return;
    p.activeSlot = slot;
    this.notify();
  }

  // Farbwahl im Druckermenü: Teil part einer zwei- oder mehrfarbigen Vorlage aus diesem Fach drucken.
  // Hat ein anderes Teil schon dieses Fach, tauschen die beiden ihre Fächer. Teil 0 ist das gewählte Fach.
  setColorSlot(printerId, template, part, slot) {
    const p = this.printerById(printerId);
    if (p.job || !p.spools[slot]) return;
    const current = this.colorSlots(p, template);
    const other = current.indexOf(slot);
    if (other !== -1 && other !== part && current[part] >= 0) current[other] = current[part];
    current[part] = slot;
    p.activeSlot = current[0];
    if (isTwoColor(template)) p.accentSlot = current[1];
    if (isMultiColor(template)) p.multiSlots = [...current];
    this.notify();
  }

  // Farbe der LED-Leiste (H2C), geht auch während des Drucks
  setLedColor(printerId, colorId) {
    const p = this.printerById(printerId);
    if (!p.model.ledStrip) return;
    p.ledColor = colorId;
    this.notify();
  }

  // ---------- Drucken ----------

  isBusy(printer) {
    return printer.job?.status === 'printing' || printer.job?.status === 'paused';
  }

  // Grund, warum der Druck nicht starten kann, oder null
  printProblem(printer, template, count = 1) {
    if (isLaser(printer)) return laserProblem(printer, template);
    if (printer.location !== 'table') return 'Drucker ist nicht aufgestellt';
    if (this.isBusy(printer)) return 'Druckt gerade';
    if (printer.job?.status === 'done') return 'Erst das fertige Teil entnehmen';
    if (printer.job?.status === 'failed') return 'Erst den Fehldruck am Drucker wegräumen';
    if (printer.clogged) return 'Düse verstopft – freistechen oder Ersatzdüse einbauen';
    if ((printer.nozzleWear ?? 0) >= 1) return 'Düse verschlissen – Ersatzdüse einbauen';
    const spool = this.activeSpool(printer);
    if (!spool) return printer.spools.length > 1 ? 'Gewähltes AMS-Fach ist leer' : 'Kein Filament eingelegt';
    const material = filamentById(spool.filamentId).material;
    if (!template.materials.includes(material)) return `Braucht ${template.materials.join(' / ')}`;
    const { x, y, z } = template.size;
    const b = printer.model.build;
    const fitsFlat = (x <= b.x && y <= b.y) || (y <= b.x && x <= b.y);
    if (!fitsFlat || z > b.z) return 'Passt nicht in den Bauraum';
    if (count > plateLayout(template, b).max) return `Nur ${plateLayout(template, b).max} passen auf die Platte`;
    if (spool.grams <= 0) return 'Spule ist leer';
    if (hasWasteBin(printer.model) && colorCount(template) > 1 && (printer.waste ?? 0) >= WASTE_BIN_GRAMS) {
      return 'Mülleimer voll – erst leeren';
    }
    if (isTwoColor(template)) return accentProblem(printer);
    if (isMultiColor(template)) return multiColorProblem(printer, template);
    return null;
  }

  // Mülleimer hinten am Drucker leeren (Spieler oder Azubi). Wartet der Druck deshalb, geht er weiter.
  emptyWasteBin(printerId) {
    const p = this.printerById(printerId);
    if (!p || !(p.waste > 0)) return;
    p.waste = 0;
    if (p.job?.pauseReason === 'waste') {
      p.job.status = 'printing';
      delete p.job.pauseReason;
      this.emit('print-resumed', { printer: p });
    }
    this.emit('waste-emptied', { printer: p });
    this.notify();
  }

  // Fächer, aus denen ein Druck dieser Vorlage käme: [Grundfarbe, weitere Farben …]
  colorSlots(printer, template) {
    if (isMultiColor(template)) return multiColorSlots(printer, template);
    return isTwoColor(template) ? [printer.activeSlot, accentSlot(printer)] : [printer.activeSlot];
  }

  // Druckzeit dieses Druckers in Spielminuten bei 100 % – zweifarbig mit einer Düse dauert es länger
  jobMinutes(printer, template, count = 1) {
    return batchMinutes(template, count) * colorTimeFactor(printer, template);
  }

  // Filamentverbrauch dieses Druckers in Gramm (zweifarbig inkl. Spülabfall)
  jobGrams(printer, template, count = 1) {
    return gramsPerColor(printer, template, count).reduce((a, b) => a + b, 0);
  }

  // Wie viel Filament für den Druck fehlt, wenn man nichts nachlegt (AMS füllt mit gleicher Sorte nach).
  // Zwei- und mehrfarbig zählt jede Farbe für sich.
  filamentShortfall(printer, template, count = 1) {
    const need = gramsPerColor(printer, template, count);
    const slots = this.colorSlots(printer, template);
    return need.reduce((missing, grams, i) => {
      const spool = printer.spools[slots[i]];
      if (!spool) return missing + grams;
      const available = printer.spools
        .filter((s) => s?.filamentId === spool.filamentId)
        .reduce((sum, s) => sum + s.grams, 0);
      return missing + Math.max(0, grams - available);
    }, 0);
  }

  // Wahrscheinlichkeit (0…1), dass ein ganzer Druck schiefgeht – bei der aktuellen Geschwindigkeit und Spule.
  // Mehr Teile auf der Platte erhöhen das Risiko etwas, und ein Fehler ruiniert die ganze Platte.
  failureRisk(printer, template, spool = this.activeSpool(printer), count = 1) {
    if (!spool) return 0;
    const speed = speedById(printer.speedId).percent;
    const material = filamentById(spool.filamentId).material;
    let risk = 0.02;
    if (speed > 100) risk += ((speed - 100) / 66) * 0.12;        // Sport: +4,5 %, Ludicrous: +12 %
    if (material === 'ABS' && !printer.model.enclosed) risk += 0.3;
    if (material === 'TPU' && speed > 100) risk += 0.2;           // Gummi mag es langsam
    if (template.size.z > 100 && speed > 100) risk += 0.04;       // hohe Teile wackeln
    if (spool.moisture > DAMP) risk += (spool.moisture - DAMP) * 0.4; // klatschnass: +24 %
    const wear = printer.nozzleWear ?? 0;
    if (wear > NOZZLE_WORN) risk += (wear - NOZZLE_WORN) * 0.6;     // abgenutzte Düse: bis +15 %
    if (speed < 100) risk *= 0.5;
    risk *= printer.model.failureFactor ?? 1; // H2S: präziser und besser gekühlt
    risk = 1 - (1 - risk) ** (1 + 0.25 * (count - 1));
    return Math.min(0.95, risk);
  }

  startPrint(printerId, template, count = 1) {
    const p = this.printerById(printerId);
    if (isLaser(p) || this.printProblem(p, template, count)) return false; // Laser: startLaser
    const spool = this.activeSpool(p);
    p.job = {
      templateId: template.id, count, filamentId: spool.filamentId, slot: p.activeSlot,
      progress: 0, gramsUsed: 0, status: 'printing',
    };
    if (isTwoColor(template)) {
      const slot2 = accentSlot(p);
      Object.assign(p.job, { filamentId2: p.spools[slot2].filamentId, slot2 });
      p.accentSlot = slot2;
    }
    if (isMultiColor(template)) {
      const slots = multiColorSlots(p, template);
      Object.assign(p.job, { slots, filamentIds: slots.map((i) => p.spools[i].filamentId) });
    }
    const printing = this.printers.filter((x) => x.job?.status === 'printing').length;
    this.emit('print-started', { printer: p, template, printing });
    this.notify();
    return true;
  }

  setPrintSpeed(printerId, speedId) {
    const p = this.printerById(printerId);
    if (!speedModesFor(p.model).some((s) => s.id === speedId)) return; // zu schnell für diesen Drucker
    p.speedId = speedId;
    this.notify();
  }

  pausePrint(printerId) {
    const job = this.printerById(printerId).job;
    if (job?.status === 'printing') job.status = 'paused';
    this.notify();
  }

  // Wartet der Drucker auf Filament, geht es erst mit einer neuen Spule weiter
  resumePrint(printerId) {
    const job = this.printerById(printerId).job;
    if (job?.status === 'paused' && !job.pauseReason) job.status = 'printing';
    this.notify();
  }

  // Abbrechen: das verbrauchte Filament ist verloren
  cancelPrint(printerId) {
    this.printerById(printerId).job = null;
    this.notify();
  }

  collectPart(printerId) {
    const p = this.printerById(printerId);
    if (p.job?.status !== 'done') return;
    const count = p.job.pieces ?? p.job.count ?? 1; // Laser: eine Platte gibt mehrere Teile
    this.addPart(p.job.templateId, partColors(p.job), count);
    this.emit('part-collected', { printer: p, templateId: p.job.templateId, count });
    p.job = null;
    this.notify();
  }

  // Fehldruck vom Bett kratzen: das Filament ist verloren
  clearFailedPrint(printerId) {
    const p = this.printerById(printerId);
    if (p.job?.status !== 'failed') return;
    const failure = p.job.failure;
    p.job = null;
    this.emit('bed-cleared', { printer: p, failure });
    this.notify();
  }

  // Einmal mit der Nadel in die Düse stechen. Gibt zurück, ob sie danach frei ist.
  pokeNozzle(printerId) {
    const p = this.printerById(printerId);
    if (!p.clogged) return true;
    p.nozzlePokes++;
    if (p.nozzlePokes >= NOZZLE_POKES) {
      p.clogged = false;
      p.nozzlePokes = 0;
      this.emit('nozzle-cleared', { printer: p });
    } else {
      this.emit('nozzle-poke', { printer: p });
    }
    this.notify();
    return !p.clogged;
  }

  // Restliche Druckzeit in Spielminuten bei der aktuellen Geschwindigkeit
  remainingMinutes(printer) {
    const job = printer.job;
    if (!job) return 0;
    const template = templateById(job.templateId);
    return ((1 - job.progress) * this.jobMinutes(printer, template, job.count ?? 1)) / (speedById(printer.speedId).percent / 100);
  }

  // Lässt alle laufenden Drucke um gameMinutes weiterlaufen: Filament wird verbraucht, Pannen können passieren.
  // Benachrichtigt nur, wenn sich ein Status ändert, damit das Druckermenü nicht in jedem Frame neu aufgebaut wird.
  advancePrints(gameMinutes) {
    let changed = this.syncPrinterPower();
    for (const p of this.printers) {
      const job = p.job;
      if (job?.status !== 'printing') continue;
      const template = templateById(job.templateId);
      const count = job.count ?? 1;
      const minutes = this.jobMinutes(p, template, count);
      let step = Math.min((gameMinutes * speedById(p.speedId).percent / 100) / minutes, 1 - job.progress);

      // Laser: kein Filament, keine Düse, keine Pannen – nur die Zeit läuft
      if (isLaser(p)) {
        job.progress += step;
        if (job.progress >= 1 - 1e-9) {
          job.progress = 1;
          job.status = 'done';
          this.emit('print-done', { printer: p, template, count: job.pieces, speedId: p.speedId, laser: true });
          changed = true;
        }
        continue;
      }

      // Filament verbrauchen, bei zwei- und mehrfarbigen Drucken aus mehreren Fächern. Ist eine Spule leer, füllt
      // das AMS aus einem Fach mit gleicher Sorte nach, sonst wartet der Drucker auf eine neue Spule.
      // Drucke aus alten Spielständen haben ihr Filament schon beim Start bezahlt (prepaid)
      // Eine Düse mit AMS: der Spülabfall des Farbwechsels landet im Mülleimer. Ist der voll, wartet der Drucker,
      // bis ihn jemand leert.
      const purging = hasWasteBin(p.model) && colorCount(template) > 1;
      if (purging && (p.waste ?? 0) >= WASTE_BIN_GRAMS) {
        job.status = 'paused';
        job.pauseReason = 'waste';
        this.emit('waste-bin-full', { printer: p });
        changed = true;
        continue;
      }
      const spool = p.spools[job.slot];
      const perColor = gramsPerColor(p, template, count);
      let reached = 1; // Anteil des Schritts, für den das Filament gereicht hat
      jobChannels(p).forEach(({ slot, filamentId, setSlot }, i) => {
        if (job.prepaid) return;
        const s = p.spools[slot];
        const need = step * perColor[i];
        const used = Math.min(need, s?.grams ?? 0);
        if (s) s.grams -= used;
        job.gramsUsed += used;
        if (purging) p.waste = (p.waste ?? 0) + used * PURGE_SHARE;
        if (s && s.grams > 0.001) return;
        if (s) p.spools[slot] = null; // leere Spule fliegt raus
        const refill = p.spools.findIndex((x) => x?.filamentId === filamentId && x.grams > 0);
        if (refill !== -1) {
          setSlot(refill);
          this.emit('ams-refill', { printer: p, slot: refill });
        } else {
          reached = Math.min(reached, need > 0 ? used / need : 0);
          job.status = 'paused';
          job.pauseReason = 'filament';
          job.missingFilament = filamentId;
          this.emit('out-of-filament', { printer: p, filament: filamentById(filamentId) });
        }
        changed = true;
      });
      if (job.status === 'paused') step *= reached;

      this.wearNozzle(p, step * minutes);

      // Pannen: das Risiko gilt für den ganzen Druck und wird auf die Fortschrittsschritte verteilt
      const risk = this.failureRisk(p, template, spool ?? p.spools[job.slot], count);
      if (step > 0 && this.random() < 1 - (1 - risk) ** step) {
        changed = true;
        if (this.failPrint(p, template, spool ?? p.spools[job.slot])) {
          job.progress = Math.max(0.05, job.progress + step);
          continue;
        }
      }

      job.progress += step;
      if (job.progress >= 1 - 1e-9) {
        job.progress = 1;
        job.status = 'done';
        this.emit('print-done', { printer: p, template, count, speedId: p.speedId });
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  failPrint(printer, template, spool) {
    const material = filamentById(printer.job.filamentId).material;
    const moisture = spool?.moisture ?? 0;
    // Welche Panne es wird, hängt von der Ursache ab
    const weights = {
      spaghetti: 3,
      detached: template.size.z > 60 ? 2 : 0.5,
      warp: material === 'ABS' && !printer.model.enclosed ? 8 : 0.4,
      clog: 0.8 + moisture * 5 + (material === 'TPU' ? 2 : 0) + (printer.nozzleWear ?? 0) * 3,
    };
    let roll = this.random() * Object.values(weights).reduce((a, b) => a + b, 0);
    let failure = 'spaghetti';
    for (const [kind, w] of Object.entries(weights)) {
      roll -= w;
      if (roll <= 0) {
        failure = kind;
        break;
      }
    }
    // Zwei Düsen: verstopft die eine, übernimmt die andere und der Druck läuft weiter.
    // Die verstopfte muss vor dem nächsten Druck freigestochen werden.
    // Der Düsenwechsler (H2C) holt sich auch dann eine Ersatzdüse, wenn schon eine verstopft ist.
    if (failure === 'clog' && (printer.model.nozzles ?? 1) > 1 && (!printer.clogged || hasNozzleChanger(printer))) {
      printer.clogged = true;
      printer.nozzlePokes = 0;
      this.emit('nozzle-switched', { printer, twoColor: isTwoColor(template), changer: hasNozzleChanger(printer) });
      return false;
    }
    printer.job.status = 'failed';
    printer.job.failure = failure;
    if (failure === 'clog') {
      printer.clogged = true;
      printer.nozzlePokes = 0;
    }
    // KI-Kamera erkennt Spaghetti und abgelöste Teile früh: die Hälfte des Filaments bleibt auf der Spule
    let saved = 0;
    if (printer.model.aiCamera && (failure === 'spaghetti' || failure === 'detached') && spool) {
      saved = Math.min(Math.round(printer.job.gramsUsed / 2), SPOOL_GRAMS - spool.grams);
      spool.grams += saved;
      printer.job.gramsUsed -= saved;
    }
    this.emit('print-failed', { printer, template, failure, info: FAILURES[failure], saved });
    return true;
  }

  // ---------- Düsenverschleiß ----------

  // printedMinutes: gedruckte Zeit bei 100 %. Schnelle Stufen nutzen die Düse stärker ab,
  // bei zwei Düsen teilen sie sich die Arbeit.
  wearNozzle(printer, printedMinutes) {
    const before = printer.nozzleWear ?? 0;
    const speedFactor = speedById(printer.speedId).percent > 100 ? 1.3 : 1;
    const nozzles = printer.model.nozzles ?? 1;
    printer.nozzleWear = Math.min(1, before + (printedMinutes * speedFactor) / (NOZZLE_LIFE_HOURS * 60 * nozzles));
    if (before < NOZZLE_WORN && printer.nozzleWear >= NOZZLE_WORN) this.emit('nozzle-worn', { printer });
    if (before < 1 && printer.nozzleWear >= 1) this.emit('nozzle-dead', { printer });
  }

  // Ersatzdüse einbauen: neu, frei, nicht verstopft. Nicht während eines Drucks.
  replaceNozzle(printerId) {
    const p = this.printerById(printerId);
    if (!p || this.isBusy(p)) return false;
    p.nozzleWear = 0;
    p.clogged = false;
    p.nozzlePokes = 0;
    this.emit('nozzle-replaced', { printer: p });
    this.notify();
    return true;
  }

  // ---------- Einrichtung: Regale am Druckertisch ----------

  furnitureById(id) {
    return this.furniture.find((f) => f.id === id);
  }

  // Steht auf diesem Druckerplatz schon ein Drucker?
  tableSlotUsed(slot) {
    return this.printers.some((p) => p.location === 'table' && p.slot === slot);
  }

  // Steht auf diesem Regalplatz (zwischen zwei Druckern) schon ein Regal?
  rackSlotUsed(slot) {
    return this.furniture.some((f) => f.location === 'table' && f.slot === slot);
  }



  buyFurniture(type) {
    if (!this.roomForBox({ type }) || !this.withdraw(type.price)) return null;
    const item = {
      id: this.nextFurnitureId++, type, location: 'storage', slot: null, storageSpot: this.freeStorageSpot(),
      spools: type.id === 'filament-rack' ? Array(type.capacity).fill(null) : null,
      parts: type.id === 'display-shelf' ? Array(type.capacity).fill(null) : null,
      sheets: type.id === 'wood-rack' ? Array(type.capacity).fill(null) : null,
      nozzles: 0,
    };
    this.ship(item);
    this.furniture.push(item);
    this.notify();
    return item;
  }

  takeFurnitureFromStorage(id) {
    const f = this.furnitureById(id);
    if (f?.location !== 'storage') return false;
    f.location = 'carried';
    f.storageSpot = null;
    this.notify();
    return true;
  }

  returnFurnitureToStorage(id) {
    const f = this.furnitureById(id);
    if (!f) return;
    this.putAway(f);
    this.notify();
  }

  // Regal auf einen Platz stellen: zwischen die Drucker oder – Ausstellungsregal – an die Südwand
  placeFurniture(id, slot) {
    const f = this.furnitureById(id);
    const location = f && isWallFurniture(f.type) ? 'wall' : 'table';
    const used = this.furniture.some((x) => x.location === location && x.slot === slot);
    if (!f || slot < 0 || used) return;
    f.location = location;
    f.slot = slot;
    this.notify();
  }

  isFurnitureEmpty(f) {
    return !f.nozzles && !(f.spools ?? []).some(Boolean) && !(f.parts ?? []).some(Boolean) && !(f.sheets ?? []).some(Boolean);
  }

  // Leeres Regal wieder vom Tisch nehmen (z. B. um den Platz für einen Drucker frei zu machen)
  pickUpFurniture(id) {
    const f = this.furnitureById(id);
    if ((f?.location !== 'table' && f?.location !== 'wall') || !this.isFurnitureEmpty(f)) return false;
    f.location = 'carried';
    f.slot = null;
    this.notify();
    return true;
  }

  // Spule ins erste freie Fach des Filament-Regals legen. Gibt zurück, ob Platz war.
  putSpoolInRack(rackId, spool) {
    const f = this.furnitureById(rackId);
    const free = f?.spools?.indexOf(null) ?? -1;
    if (free === -1) return false;
    f.spools[free] = { ...spool };
    this.notify();
    return true;
  }

  takeSpoolFromRack(rackId, index) {
    const f = this.furnitureById(rackId);
    const spool = f?.spools?.[index];
    if (!spool) return null;
    f.spools[index] = null;
    this.notify();
    return spool;
  }

  // Holzplatte ({ woodId }) ins erste freie Fach des Holzregals stellen. Gibt zurück, ob Platz war.
  putSheetInRack(rackId, sheet) {
    const f = this.furnitureById(rackId);
    const free = f?.sheets?.indexOf(null) ?? -1;
    if (free === -1 || !sheet) return false;
    f.sheets[free] = { woodId: sheet.woodId };
    this.notify();
    return true;
  }

  takeSheetFromRack(rackId, index) {
    const f = this.furnitureById(rackId);
    const sheet = f?.sheets?.[index];
    if (!sheet) return null;
    f.sheets[index] = null;
    this.notify();
    return sheet;
  }

  // Aufgestellte Ersatzteilregale und wie viele Düsen noch hineinpassen
  get partsRacks() {
    return this.furniture.filter((f) => f.type.id === 'parts-rack' && f.location === 'table');
  }

  get partsRackSpace() {
    return this.partsRacks.reduce((sum, f) => sum + f.type.capacity - f.nozzles, 0);
  }

  get spareNozzles() {
    return this.partsRacks.reduce((sum, f) => sum + f.nozzles, 0);
  }

  // Ersatzteile werden direkt ins Ersatzteilregal geliefert
  buySparePart(part) {
    const rack = this.partsRacks.find((f) => f.nozzles < f.type.capacity);
    if (!rack || !this.withdraw(part.price)) return false;
    rack.nozzles++;
    this.notify();
    return true;
  }

  takeNozzleFromRack(rackId) {
    const f = this.furnitureById(rackId);
    if (!f?.nozzles) return false;
    f.nozzles--;
    this.notify();
    return true;
  }

  putNozzleInRack(rackId) {
    const f = this.furnitureById(rackId);
    if (!f || f.nozzles >= f.type.capacity) return false;
    f.nozzles++;
    this.notify();
    return true;
  }

  // Düse aus der Hand zurück: ins erste Ersatzteilregal mit Platz (notfalls ins erste überhaupt)
  returnNozzle() {
    const racks = this.furniture.filter((f) => f.type.id === 'parts-rack');
    const rack = racks.find((f) => f.nozzles < f.type.capacity) ?? racks[0];
    if (!rack) return false;
    rack.nozzles++;
    this.notify();
    return true;
  }

  // ---------- Fertige Teile ----------

  // colors: alle Farben des Teils [Grundfarbe, …] (siehe partColors)
  addPart(templateId, colors, count = 1) {
    const key = partKey({ templateId, filamentIds: colors });
    this.finishedParts.set(key, (this.finishedParts.get(key) ?? 0) + count);
  }

  // Ein Teil mit genau diesen Farben aus dem Inventar nehmen (z. B. fürs Ausstellungsregal)
  removePart(templateId, colors) {
    const key = partKey({ templateId, filamentIds: colors });
    const count = this.finishedParts.get(key) ?? 0;
    if (!count) return false;
    if (count === 1) this.finishedParts.delete(key);
    else this.finishedParts.set(key, count - 1);
    return true;
  }

  // Alle fertigen Teile als Liste [{ templateId, filamentId, filamentId2, count }],
  // mehrfarbige mit filamentIds (alle Farben) statt filamentId2
  partsList() {
    return [...this.finishedParts].map(([key, count]) => {
      const [templateId, filamentId, filamentId2 = null] = key.split('|');
      if (filamentId.includes('+')) {
        const filamentIds = filamentId.split('+');
        return { templateId, filamentId: filamentIds[0], filamentId2: null, filamentIds, count };
      }
      return { templateId, filamentId, filamentId2, count };
    });
  }

  // Passt ein Teil zur Bestellung? want: { material, filamentId, filamentId2 } – fehlende Angaben heißen „egal“.
  // Zweifarbig ist egal, welche der beiden Farben Grund- und welche Akzentfarbe ist.
  static partMatches(filamentId, want, filamentId2 = null) {
    if (want.material && filamentById(filamentId)?.material !== want.material) return false;
    if (!want.filamentId) return true;
    if (!want.filamentId2) return filamentId === want.filamentId;
    return (filamentId === want.filamentId && filamentId2 === want.filamentId2)
      || (filamentId === want.filamentId2 && filamentId2 === want.filamentId);
  }

  countParts(templateId, want = {}) {
    return this.partsList()
      .filter((p) => p.templateId === templateId && Economy.partMatches(p.filamentId, want, p.filamentId2))
      .reduce((sum, p) => sum + p.count, 0);
  }

  // Fertige Teile abgeben (für Kundenaufträge). Gibt zurück, ob genug da waren.
  takeParts(templateId, count, want = {}) {
    if (this.countParts(templateId, want) < count) return false;
    let missing = count;
    for (const p of this.partsList()) {
      if (!missing || p.templateId !== templateId || !Economy.partMatches(p.filamentId, want, p.filamentId2)) continue;
      const take = Math.min(missing, p.count);
      missing -= take;
      const key = partKey(p);
      if (take === p.count) this.finishedParts.delete(key);
      else this.finishedParts.set(key, p.count - take);
    }
    this.notify();
    return true;
  }

  // Der Kater wirft ein fertiges Teil vom Druckbett (bei mehreren nur eins). x/z: wo es auf dem Boden landet.
  knockPartOff(printerId, x, z) {
    const p = this.printerById(printerId);
    if (p?.job?.status !== 'done' || isLaser(p)) return false; // in den geschlossenen Laser kommt der Kater nicht
    this.looseParts.push({
      id: this.nextLooseId++, templateId: p.job.templateId, filamentId: p.job.filamentId,
      filamentId2: p.job.filamentId2 ?? null, x, z, rotY: this.random() * Math.PI * 2,
      ...(p.job.filamentIds ? { filamentIds: [...p.job.filamentIds] } : {}),
    });
    if ((p.job.count ?? 1) > 1) p.job.count--;
    else p.job = null;
    this.emit('part-knocked', { printer: p });
    this.notify();
    return true;
  }

  pickUpLoosePart(id) {
    const part = this.looseParts.find((l) => l.id === id);
    if (!part) return;
    this.looseParts = this.looseParts.filter((l) => l !== part);
    this.addPart(part.templateId, partColors(part), 1);
    this.emit('part-picked', { part });
    this.notify();
  }

  // ---------- Benachrichtigung ----------

  // Callback wird sofort und bei jeder Änderung aufgerufen. Rückgabe: Abmelde-Funktion.
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) listener(this);
  }

  emit(type, data = {}) {
    this.onEvent?.(type, data);
  }

  // ---------- intern ----------

  withdraw(amount) {
    if (!this.canAfford(amount)) return false;
    if (this.unlimited) return true;
    this.money -= amount;
    return true;
  }

  // Spule auf den ersten freien Regalplatz legen
  storeSpool({ filamentId, grams, moisture = 0 }) {
    const used = new Set(this.shelf.map((s) => s.shelfSlot));
    let shelfSlot = 0;
    while (used.has(shelfSlot)) shelfSlot++;
    this.shelf.push({ filamentId, grams, moisture, shelfSlot });
  }

  // Kartons, die im Abstellraum Platz brauchen: dort abgestellt, noch unterwegs (nicht ins Keller-Lager) oder gerade
  // in der Hand
  get boxedItems() {
    return [...this.printers, ...this.furniture]
      .filter((x) => x.location === 'storage' || x.location === 'carried' || (x.location === 'shipping' && !x.basement));
  }

  // Passt der Karton ({ model } | { type } oder ein Drucker/Möbel) noch in den Abstellraum? without: Gegenstand, der
  // schon in boxedItems steckt und nicht doppelt zählen soll
  storageRoomFits(box, without = null) {
    return !this.storageFits || this.storageFits([...this.boxedItems.filter((x) => x !== without), box]);
  }

  // Passt noch ein Karton ({ model } für Drucker, { type } für Einrichtung) dazu, ohne dass der Stapel an die Decke
  // stößt – im Abstellraum oder, wenn der voll ist, im Keller-Lager?
  roomForBox(box) {
    return this.storageRoomFits(box) || !!this.overflow?.hasRoom(box);
  }

  // Karton zurück ins Lager (Q, Gerät ausgebaut …): in den Abstellraum, ist der voll, ins Keller-Lager (wenn dort Platz ist)
  putAway(item) {
    item.slot = null;
    delete item.basement;
    if (!this.storageRoomFits(item, item) && this.overflow?.reserve(item)) {
      item.location = 'basement';
      item.storageSpot = null;
      return;
    }
    item.location = 'storage';
    item.storageSpot = this.freeStorageSpot();
  }

  // Erster freier Kartonplatz in der Lieferzone
  freeStorageSpot() {
    const used = new Set([...this.printers, ...this.furniture]
      .filter((p) => p.location === 'storage').map((p) => p.storageSpot));
    let spot = 0;
    while (used.has(spot)) spot++;
    return spot;
  }

  // Nimmt die Spule aus einem Fach. Leere Spulen werden entsorgt (Rückgabe null).
  takeSpool(printer, slot) {
    const spool = printer.spools[slot];
    printer.spools[slot] = null;
    return spool && spool.grams > 0 ? spool : null;
  }
}

// Schlüssel fertiger Teile in finishedParts – zweifarbige mit Akzentfarbe am Ende, mehrfarbige mit allen Farben
function partKey(part) {
  const colors = partColors(part);
  if (colors.length > 2) return `${part.templateId}|${colors.join('+')}`;
  return colors.length === 2 ? `${part.templateId}|${colors[0]}|${colors[1]}` : `${part.templateId}|${colors[0]}`;
}

// Farbkanäle eines laufenden Drucks: aus welchem Fach welches Filament kommt, und wie ein Nachfüllen aus einem
// anderen Fach das Fach umstellt
function jobChannels(p) {
  const job = p.job;
  if (job.slots) {
    return job.slots.map((slot, i) => ({
      slot,
      filamentId: job.filamentIds[i],
      setSlot: (s) => {
        job.slots[i] = s;
        if (i === 0) [job.slot, p.activeSlot] = [s, s];
      },
    }));
  }
  const channels = [{ slot: job.slot, filamentId: job.filamentId, setSlot: (s) => { [job.slot, p.activeSlot] = [s, s]; } }];
  if (job.filamentId2) {
    channels.push({ slot: job.slot2, filamentId: job.filamentId2, setSlot: (s) => { [job.slot2, p.accentSlot] = [s, s]; } });
  }
  return channels;
}

// Kurzbeschreibung einer Spule für Hinweise, z. B. „PLA Rot (740 g, feucht)“
export function spoolLabel(spool) {
  const wet = spool.moisture >= WET ? ', feucht' : '';
  return `${filamentLabel(filamentById(spool.filamentId))} (${Math.round(spool.grams)} g${wet})`;
}
